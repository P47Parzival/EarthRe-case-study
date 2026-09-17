const SLA_BENCHMARK_PCT = 99.9

function percentile(sortedValues, p) {
  const idx = (sortedValues.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedValues[lo]
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo)
}

function isSuccessStatus(statusCode) {
  return statusCode >= 200 && statusCode < 400
}

// rows: cleaned check rows { service_id, service_name, checked_at, status_code, is_valid_check, latency_ms, agent }
export function computeStats(rows) {
  const byService = new Map()
  const hourBuckets = new Map()
  let minTs = null
  let maxTs = null
  let overallAgentErrors = 0

  for (const r of rows) {
    const t = new Date(r.checked_at)
    if (!minTs || t < minTs) minTs = t
    if (!maxTs || t > maxTs) maxTs = t
    if (!r.is_valid_check) overallAgentErrors++

    if (!byService.has(r.service_id)) {
      byService.set(r.service_id, { service_name: r.service_name, rows: [] })
    }
    byService.get(r.service_id).rows.push(r)

    const hourStamp = t.toISOString().slice(0, 13) // YYYY-MM-DDTHH
    const hourKey = `${r.service_id}|${hourStamp}`
    if (!hourBuckets.has(hourKey)) {
      hourBuckets.set(hourKey, {
        service_id: r.service_id,
        hour: `${hourStamp}:00:00.000Z`,
        total: 0,
        bad: 0,
      })
    }
    const bucket = hourBuckets.get(hourKey)
    bucket.total++
    if (!r.is_valid_check || !isSuccessStatus(r.status_code)) bucket.bad++
  }

  const services = []
  let overallSuccessful = 0
  let overallValid = 0

  for (const [serviceId, { service_name, rows: serviceRows }] of byService) {
    const agentCounts = new Map()
    for (const r of serviceRows) {
      agentCounts.set(r.agent, (agentCounts.get(r.agent) || 0) + 1)
    }
    let primaryAgent = null
    let maxCount = -1
    for (const [agent, count] of agentCounts) {
      if (count > maxCount) {
        maxCount = count
        primaryAgent = agent
      }
    }

    const primaryRows = serviceRows.filter((r) => r.agent === primaryAgent)
    const validRows = primaryRows.filter((r) => r.is_valid_check)
    const successfulRows = validRows.filter((r) => isSuccessStatus(r.status_code))
    const agentErrorRows = primaryRows.filter((r) => !r.is_valid_check)

    const uptimePct = validRows.length > 0 ? (successfulRows.length / validRows.length) * 100 : null

    const sortedTimes = primaryRows.map((r) => new Date(r.checked_at).getTime()).sort((a, b) => a - b)
    const deltas = []
    for (let i = 1; i < sortedTimes.length; i++) deltas.push(sortedTimes[i] - sortedTimes[i - 1])
    deltas.sort((a, b) => a - b)
    const medianIntervalMinutes = deltas.length ? deltas[Math.floor(deltas.length / 2)] / 60000 : null

    const downtimeMinutes =
      medianIntervalMinutes != null && validRows.length > 0
        ? (validRows.length - successfulRows.length) * medianIntervalMinutes
        : null

    const latencies = validRows
      .map((r) => r.latency_ms)
      .filter((v) => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    const avgLatencyMs = latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : null
    const p95LatencyMs = latencies.length ? percentile(latencies, 0.95) : null

    overallSuccessful += successfulRows.length
    overallValid += validRows.length

    services.push({
      service_id: serviceId,
      service_name,
      primary_agent: primaryAgent,
      total_checks: primaryRows.length,
      valid_checks: validRows.length,
      successful_checks: successfulRows.length,
      agent_error_checks: agentErrorRows.length,
      uptime_pct: uptimePct,
      sla_breach: uptimePct != null ? uptimePct < SLA_BENCHMARK_PCT : null,
      downtime_minutes: downtimeMinutes,
      p95_latency_ms: p95LatencyMs,
      avg_latency_ms: avgLatencyMs,
    })
  }

  services.sort((a, b) => a.service_id.localeCompare(b.service_id))

  let worstHour = null
  for (const bucket of hourBuckets.values()) {
    if (bucket.bad === 0) continue
    const rate = bucket.bad / bucket.total
    const worstRate = worstHour ? worstHour.bad / worstHour.total : -1
    if (!worstHour || bucket.bad > worstHour.bad || (bucket.bad === worstHour.bad && rate > worstRate)) {
      worstHour = bucket
    }
  }
  const serviceNameById = new Map(services.map((s) => [s.service_id, s.service_name]))

  return {
    sla_benchmark_pct: SLA_BENCHMARK_PCT,
    observed_period: {
      start: minTs ? minTs.toISOString() : null,
      end: maxTs ? maxTs.toISOString() : null,
      days: minTs && maxTs ? Math.round(((maxTs - minTs) / 86400000) * 10) / 10 : null,
    },
    overall: {
      total_checks: rows.length,
      agent_error_checks: overallAgentErrors,
      uptime_pct: overallValid > 0 ? (overallSuccessful / overallValid) * 100 : null,
    },
    services,
    worst_hour: worstHour
      ? {
          service_id: worstHour.service_id,
          service_name: serviceNameById.get(worstHour.service_id),
          hour: worstHour.hour,
          total_checks: worstHour.total,
          bad_checks: worstHour.bad,
          error_rate_pct: (worstHour.bad / worstHour.total) * 100,
        }
      : null,
  }
}
