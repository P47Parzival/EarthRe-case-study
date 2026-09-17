import { useState } from 'react'
import UploadScreen from './UploadScreen.jsx'
import Dashboard from './Dashboard.jsx'

function App() {
  const [tab, setTab] = useState('upload') // upload | dashboard

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-6">
        <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">SLA Monitoring</span>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('upload')}
            className={`text-sm font-medium px-3 py-1.5 rounded transition-colors ${
              tab === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => setTab('dashboard')}
            className={`text-sm font-medium px-3 py-1.5 rounded transition-colors ${
              tab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Dashboard
          </button>
        </div>
      </nav>

      {tab === 'upload' && <UploadScreen onUploaded={() => setTab('dashboard')} />}
      {tab === 'dashboard' && <Dashboard onGoToUpload={() => setTab('upload')} />}
    </div>
  )
}

export default App
