import { useEffect, useState } from 'react'
import { LoadingState, ErrorState, EmptyState } from './ui.jsx'

const PAGE_SIZE = 50

function formatTimestamp(iso) {
  return new Date(iso).toUTCString().replace(' GMT', ' UTC')
}

function StatusBadge({ statusCode, isValidCheck }) {
  if (!isValidCheck) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700">
        {statusCode} (agent error)
      </span>
    )
  }
  const isSuccess = statusCode >= 200 && statusCode < 400
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {statusCode}
    </span>
  )
}

function LogsSection() {
  const [mode, setMode] = useState('range') // 'single' | 'range'
  const [singleDate, setSingleDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [page, setPage] = useState(1)
  const [sortAsc, setSortAsc] = useState(false)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading') // loading | done | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const params = new URLSearchParams()
        if (mode === 'single' && singleDate) {
          params.set('date', singleDate)
        } else if (mode === 'range' && rangeStart && rangeEnd) {
          params.set('start', rangeStart)
          params.set('end', rangeEnd)
        }
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))
        params.set('order', sortAsc ? 'asc' : 'desc')

        const res = await fetch(`/api/logs?${params.toString()}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load logs')
        if (!cancelled) {
          setRows(json.rows)
          setTotal(json.total)
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
  }, [mode, singleDate, rangeStart, rangeEnd, page, sortAsc])

  function handleModeChange(next) {
    setMode(next)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Logs</h2>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => handleModeChange('single')}
            className={`text-sm px-3 py-1.5 rounded ${
              mode === 'single' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Single date
          </button>
          <button
            onClick={() => handleModeChange('range')}
            className={`text-sm px-3 py-1.5 rounded ${
              mode === 'range' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Date range
          </button>
        </div>

        {mode === 'single' ? (
          <label className="text-sm text-slate-600">
            Date
            <input
              type="date"
              value={singleDate}
              onChange={(e) => {
                setSingleDate(e.target.value)
                setPage(1)
              }}
              className="block border border-slate-300 rounded px-2 py-1 mt-1"
            />
          </label>
        ) : (
          <>
            <label className="text-sm text-slate-600">
              From
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => {
                  setRangeStart(e.target.value)
                  setPage(1)
                }}
                className="block border border-slate-300 rounded px-2 py-1 mt-1"
              />
            </label>
            <label className="text-sm text-slate-600">
              To
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => {
                  setRangeEnd(e.target.value)
                  setPage(1)
                }}
                className="block border border-slate-300 rounded px-2 py-1 mt-1"
              />
            </label>
          </>
        )}
      </div>

      {status === 'loading' && <LoadingState label="Loading logs…" />}
      {status === 'error' && <ErrorState message={errorMsg} />}

      {status === 'done' && rows.length === 0 && (
        <EmptyState message="No logs match this filter. Try a different date or range." />
      )}

      {status === 'done' && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">
                    <button
                      onClick={() => {
                        setSortAsc((v) => !v)
                        setPage(1)
                      }}
                      className="flex items-center gap-1 font-medium hover:text-slate-800"
                      title="Toggle sort direction"
                    >
                      Timestamp (UTC) <span>{sortAsc ? '▲ oldest first' : '▼ newest first'}</span>
                    </button>
                  </th>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Latency</th>
                  <th className="py-2 pr-4">Agent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.service_id}-${r.checked_at}-${r.agent}-${i}`}
                    className={`border-b border-slate-100 hover:bg-slate-100 transition-colors ${
                      i % 2 === 1 ? 'bg-slate-50' : ''
                    }`}
                  >
                    <td className="py-2 pr-4 text-slate-600">{formatTimestamp(r.checked_at)}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800">{r.service_name}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge statusCode={r.status_code} isValidCheck={r.is_valid_check} />
                    </td>
                    <td className="py-2 pr-4">{r.latency_ms == null ? '—' : `${Math.round(r.latency_ms)} ms`}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default LogsSection
