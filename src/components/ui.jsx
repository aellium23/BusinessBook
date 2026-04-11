export function BUBadge({ bu }) {
  return bu === 'VGT'
    ? <span className="badge-vgt">VGT</span>
    : <span className="badge-ect">ECT</span>
}

export function StageBadge({ stage }) {
  const map = {
    Lead:              'badge-lead',
    Pipeline:          'badge-pipeline',
    'Offer Presented': 'inline-flex px-2 py-0.5 rounded text-xs font-bold bg-purple-200 text-purple-900',
    BackLog:           'badge-backlog',
    Invoiced:          'badge-invoiced',
    Lost:              'inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-200 text-red-900',
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

export function toEUR(val, currency, rate) {
  if (!val) return 0
  if (!currency || currency === 'EUR') return val
  return val * (parseFloat(rate) || 1)
}

export function currencySymbol(currency) {
  return currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€'
}

export function CurrencyBadge({ currency }) {
  if (!currency || currency === 'EUR') return null
  const color = currency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
  return <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${color}`}>{currency}</span>
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92dvh' }}>
        {/* Drag handle on mobile */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"/>
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900 text-base truncate pr-2">{title}</h2>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl leading-none shrink-0">
            &times;
          </button>
        </div>
        {/* Scrollable content — flex-1 para ocupar espaço disponível */}
        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1 min-h-0 overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {/* Footer — sempre visível, fora do scroll, com safe area */}
        {footer && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 shrink-0 bg-white rounded-b-3xl sm:rounded-b-2xl"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
        {/* Safe area quando não há footer */}
        {!footer && (
          <div style={{ height: 'env(safe-area-inset-bottom)' }} className="shrink-0"/>
        )}
      </div>
    </div>
  )
}
