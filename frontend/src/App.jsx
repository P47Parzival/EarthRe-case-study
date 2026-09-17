import { useState } from 'react'
import UploadScreen from './UploadScreen.jsx'
import Dashboard from './Dashboard.jsx'

function App() {
  const [tab, setTab] = useState('upload') // upload | dashboard

  return (
    <div>
      <nav className="bg-white border-b border-slate-200 px-6 py-3 flex gap-4">
        <button
          onClick={() => setTab('upload')}
          className={`text-sm font-medium px-3 py-1.5 rounded ${
            tab === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Upload
        </button>
        <button
          onClick={() => setTab('dashboard')}
          className={`text-sm font-medium px-3 py-1.5 rounded ${
            tab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Dashboard
        </button>
      </nav>

      {tab === 'upload' && <UploadScreen onUploaded={() => setTab('dashboard')} />}
      {tab === 'dashboard' && <Dashboard />}
    </div>
  )
}

export default App
