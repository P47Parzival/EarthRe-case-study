import { useState } from 'react'

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
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-8">
      <div className="w-full max-w-xl bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-800">SLA Monitoring — Upload</h1>
        <p className="text-sm text-slate-500">
          Upload a health-check CSV (columns: service_id, service_name, timestamp,
          status_code, latency, latency_unit, agent, region).
        </p>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 border border-slate-300 rounded p-2"
        />

        <button
          onClick={handleUpload}
          disabled={!file || status === 'uploading'}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          {status === 'uploading' ? 'Uploading…' : 'Upload'}
        </button>

        {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}

        {status === 'done' && summary && (
          <div className="border border-slate-200 rounded p-4 bg-slate-50 text-sm text-slate-700 space-y-1">
            <p className="font-medium text-slate-800">Upload summary</p>
            <p>Rows in file: {summary.total_rows_in}</p>
            <p>Rows cleaned/inserted: {summary.rows_cleaned}</p>
            <p>Duplicates removed: {summary.duplicates_removed}</p>
            <p>Invalid/sentinel status rows: {summary.invalid_status_rows}</p>
            <p>Latency nulls: {summary.latency_nulls}</p>
            <p>Negative latencies excluded: {summary.negative_latencies_excluded}</p>
            <p>Invalid timestamps excluded: {summary.invalid_timestamps_excluded}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default UploadScreen
