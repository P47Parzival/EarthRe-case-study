export function Spinner() {
  return (
    <div
      className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"
      aria-hidden="true"
    />
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message }) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ message, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center py-10 border border-dashed border-slate-300 rounded-lg">
      <span className="text-3xl" aria-hidden="true">
        📭
      </span>
      <p className="text-sm text-slate-500">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-sm font-medium px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
