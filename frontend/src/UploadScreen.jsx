import { useState } from 'react'
import { Spinner } from './ui.jsx'

function SummaryStat({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function UploadScreen({ onUploaded }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | done | error
  const [summary, setSummary] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleUpload() {
    if (!file) return
    setStatus('uploading')
    setErrorMsg('')
    try {
      const text = await file.text()
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setSummary(json.summary)
      setStatus('done')
      onUploaded?.()
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="flex items-start justify-center p-6 sm:p-10">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Upload health-check CSV</h1>
          <p className="text-sm text-slate-500 mt-1">
            Columns expected: service_id, service_name, timestamp, status_code, latency,
            latency_unit, agent, region.
          </p>
        </div>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 border border-slate-300 rounded-md p-2 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm hover:file:bg-slate-200"
        />

        <button
          onClick={handleUpload}
          disabled={!file || status === 'uploading'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          {status === 'uploading' && <Spinner />}
          {status === 'uploading' ? 'Uploading…' : 'Upload'}
        </button>

        {status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            <span aria-hidden="true">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {status === 'done' && summary && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <span aria-hidden="true">✅</span>
              <span>Upload processed successfully</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <SummaryStat label="Rows in file" value={summary.total_rows_in} />
              <SummaryStat label="Rows inserted" value={summary.rows_cleaned} />
              <SummaryStat label="Duplicates removed" value={summary.duplicates_removed} />
              <SummaryStat label="Invalid status rows" value={summary.invalid_status_rows} />
              <SummaryStat label="Latency nulls" value={summary.latency_nulls} />
              <SummaryStat label="Negative latencies" value={summary.negative_latencies_excluded} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UploadScreen
