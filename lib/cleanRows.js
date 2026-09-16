import { createHash } from 'node:crypto'

const EPOCH_SECONDS_RE = /^\d{9,10}$/
const SECONDS_UNITS = new Set(['s', 'sec', 'secs', 'second', 'seconds'])
const MS_UNITS = new Set(['ms', 'millis', 'millisecond', 'milliseconds'])

function normalizeTimestamp(raw) {
  const trimmed = String(raw ?? '').trim()
  if (EPOCH_SECONDS_RE.test(trimmed)) {
    const date = new Date(Number(trimmed) * 1000)
    return { date, format: 'epoch_seconds' }
  }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    return { date: null, format: 'invalid' }
  }
  return { date, format: trimmed.endsWith('Z') ? 'iso_utc' : 'iso_offset' }
}

function normalizeLatency(rawLatency, rawUnit) {
  const trimmedLatency = String(rawLatency ?? '').trim()
  if (trimmedLatency === '') {
    return { value: null, issue: 'null' }
  }
  const num = Number(trimmedLatency)
  if (Number.isNaN(num)) {
    return { value: null, issue: 'non_numeric' }
  }

  const unit = String(rawUnit ?? '').trim().toLowerCase()
  let ms = num
  let issue = null
  if (SECONDS_UNITS.has(unit)) {
    ms = num * 1000
  } else if (!MS_UNITS.has(unit)) {
    issue = 'unknown_unit' // assume ms, but flag for visibility
  }

  if (ms < 0) {
    return { value: null, issue: 'negative' }
  }
  return { value: ms, issue }
}

function isStandardHttpStatus(code) {
  return Number.isInteger(code) && code >= 100 && code <= 599
}

function hashRow(row) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex')
}

export function cleanRows(rows) {
  const summary = {
    total_rows_in: rows.length,
    duplicates_removed: 0,
    conflicting_duplicates: 0,
    timestamps_by_format: { iso_utc: 0, iso_offset: 0, epoch_seconds: 0 },
    invalid_timestamps_excluded: 0,
    latency_nulls: 0,
    negative_latencies_excluded: 0,
    non_numeric_latencies_excluded: 0,
    unknown_latency_units: 0,
    invalid_status_rows: 0,
    rows_excluded: 0,
    rows_cleaned: 0,
  }

  const seen = new Map()
  const cleaned = []

  for (const raw of rows) {
    const { date, format } = normalizeTimestamp(raw.timestamp)
    if (!date) {
      summary.invalid_timestamps_excluded++
      summary.rows_excluded++
      continue
    }
    summary.timestamps_by_format[format]++

    const statusCode = Number(raw.status_code)
    const isValidCheck = isStandardHttpStatus(statusCode) && statusCode !== 999
    if (!isValidCheck) summary.invalid_status_rows++

    const { value: latencyMs, issue } = normalizeLatency(raw.latency, raw.latency_unit)
    if (issue === 'null') summary.latency_nulls++
    else if (issue === 'negative') summary.negative_latencies_excluded++
    else if (issue === 'non_numeric') summary.non_numeric_latencies_excluded++
    else if (issue === 'unknown_unit') summary.unknown_latency_units++

    const checkedAt = date.toISOString()
    const dedupKey = `${raw.service_id}|${checkedAt}|${raw.agent}`

    const cleanedRow = {
      service_id: raw.service_id,
      service_name: raw.service_name,
      checked_at: checkedAt,
      status_code: statusCode,
      is_valid_check: isValidCheck,
      latency_ms: latencyMs,
      agent: raw.agent,
      region: raw.region,
      raw_row_hash: hashRow(raw),
    }

    const existing = seen.get(dedupKey)
    if (existing) {
      summary.duplicates_removed++
      summary.rows_excluded++
      if (existing.status_code !== statusCode || existing.latency_ms !== latencyMs) {
        summary.conflicting_duplicates++
      }
      continue
    }
    seen.set(dedupKey, cleanedRow)
    cleaned.push(cleanedRow)
  }

  summary.rows_cleaned = cleaned.length
  return { cleanedRows: cleaned, summary }
}
