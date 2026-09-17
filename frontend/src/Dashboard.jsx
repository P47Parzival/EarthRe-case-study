import { useEffect, useState } from 'react'
import LogsSection from './LogsSection.jsx'
import { ChevronIcon, LoadingState, ErrorState, EmptyState } from './ui.jsx'

function formatPct(value) {
  return value == null ? '—' : `${value.toFixed(2)}%`
}

function formatMs(value) {
  return value == null ? '—' : `${Math.round(value)} ms`
}

function formatDuration(minutes) {
  if (minutes == null) return '—'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatHour(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toUTCString().replace(':00 GMT', ':00 UTC')
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function Dashboard({ onGoToUpload }) {
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState('loading') // loading | done | error
  const [errorMsg, setErrorMsg] = useState('')
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const res = await fetch('/api/stats')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load stats')
        if (!cancelled) {
          setStats(json)
          setStatus('done')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message)
          setStatus('error')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
          aria-expanded={expanded}
        >
          <h2 className="text-lg font-semibold text-slate-800">Stats overview</h2>
          <span className="flex items-center gap-1 text-sm text-slate-500">
            {expanded ? 'Collapse' : 'Expand'}
            <ChevronIcon open={expanded} />
          </span>
        </button>

        {expanded && (
          <div className="px-6 pb-6 space-y-6">
            {status === 'loading' && <LoadingState label="Loading stats…" />}
            {status === 'error' && <ErrorState message={errorMsg} />}

            {status === 'done' && stats && stats.services.length === 0 && (
              <EmptyState
                message="No data yet, upload a CSV to see stats here."
                actionLabel="Go to Upload"
                onAction={onGoToUpload}
              />
            )}

            {status === 'done' && stats && stats.services.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard label="Overall uptime" value={formatPct(stats.overall.uptime_pct)} />
                  <SummaryCard
                    label="Observed period"
                    value={`${stats.observed_period.days} days`}
                    sub={`${new Date(stats.observed_period.start).toUTCString().slice(0, 16)} to ${new Date(
                      stats.observed_period.end
                    )
                      .toUTCString()
                      .slice(0, 16)}`}
                  />
                  <SummaryCard label="Total checks" value={stats.overall.total_checks.toLocaleString()} />
                  <SummaryCard
                    label="Agent-error checks"
                    value={stats.overall.agent_error_checks.toLocaleString()}
                    sub="status 999 / non-standard, excluded from SLA math"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Service</th>
                        <th className="py-2 pr-4">Primary agent</th>
                        <th className="py-2 pr-4">Uptime</th>
                        <th className="py-2 pr-4">SLA (99.9%)</th>
                        <th className="py-2 pr-4">Downtime</th>
                        <th className="py-2 pr-4">p95 latency</th>
                        <th className="py-2 pr-4">Avg latency</th>
                        <th className="py-2 pr-4">Agent errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.services.map((s, i) => (
                        <tr
                          key={s.service_id}
                          className={`border-b border-slate-100 hover:bg-slate-100 transition-colors ${i % 2 === 1 ? 'bg-slate-50' : ''
                            }`}
                        >
                          <td className="py-2 pr-4 font-medium text-slate-800">{s.service_name}</td>
                          <td className="py-2 pr-4 text-slate-600">{s.primary_agent}</td>
                          <td className="py-2 pr-4">{formatPct(s.uptime_pct)}</td>
                          <td className="py-2 pr-4">
                            {s.sla_breach === null ? (
                              '—'
                            ) : s.sla_breach ? (
                              <span className="inline-flex items-center gap-1 text-red-700">🔴 Breached</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-green-700">🟢 Met</span>
                            )}
                          </td>
                          <td className="py-2 pr-4">{formatDuration(s.downtime_minutes)}</td>
                          <td className="py-2 pr-4">{formatMs(s.p95_latency_ms)}</td>
                          <td className="py-2 pr-4">{formatMs(s.avg_latency_ms)}</td>
                          <td className="py-2 pr-4">{s.agent_error_checks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {stats.worst_hour && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-sm">
                    <p className="font-medium text-amber-900">Worst hour</p>
                    <p className="text-amber-800 mt-1">
                      {stats.worst_hour.service_name}: {formatHour(stats.worst_hour.hour)}: {' '}
                      {stats.worst_hour.error_rate_pct.toFixed(0)}% error rate ({stats.worst_hour.bad_checks}/
                      {stats.worst_hour.total_checks} checks failed)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <LogsSection />
    </div>
  )
}

export default Dashboard
