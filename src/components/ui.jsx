export function BUBadge({ bu }) {
  return bu === 'VGT'
    ? <span className="badge-vgt">VGT</span>
    : <span className="badge-ect">ECT</span>
}

export function StageBadge({ stage }) {
  const map = {
    Lead:     'badge-lead',
    Pipeline: 'badge-pipeline',
    BackLog:  'badge-backlog',
    Invoiced: 'badge-invoiced',
  }
  return <span className={map[stage] || 'inline-flex px-2 py-0.5 rounded text-xs font-bold bg-gray-200 text-gray-700'}>{stage}</span>
}

export function SalesTypeBadge({ type }) {
  return type === 'Internal'
    ? <span className="badge-int">Int</span>
    : <span className="badge-ext">Ext</span>
}

export function KpiCard({ label, value, sub, color = 'gray' }) {
  const colors = {
    teal:  'border-t-2 border-vgt',
    coral: 'border-t-2 border-ect',
    blue:  'border-t-2 border-blue-500',
    green: 'border-t-2 border-green-500',
    gray:  '',
  }
  return (
    <div className={`card p-4 ${colors[color]}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-medium text-gray-600">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function formatK(n) {
  if (n === null || n === undefined) return '—'
  const k = n / 1000
  return k >= 1000
    ? `€${(k/1000).toFixed(1)}M`
    : `€${k.toFixed(1)}K`
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 shrink-0 bg-white">{footer}</div>}
      </div>
    </div>
  )
}
