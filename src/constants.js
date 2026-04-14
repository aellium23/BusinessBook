// ── Shared domain constants ─────────────────────────────────────────────
// Centralised to avoid duplication across pages/components.

export const STAGES = ['Lead', 'Pipeline', 'Offer Presented', 'BackLog', 'Invoiced', 'Lost']

// Default weights used for weighted forecast when a deal has no explicit win_probability
export const WEIGHTS = {
  Lead:              0.10,
  Pipeline:          0.30,
  'Offer Presented': 0.60,
  BackLog:           0.80,
  Invoiced:          1.00,
  Lost:              0,
}

export const REGIONS = ['Europe', 'MEA', 'LATAM', 'APAC', 'NA']
export const BUS     = ['VGT', 'ECT']

// Fiscal-year month ordering (Apr → Mar)
export const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
export const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

// Product families (used for sub-targets on quotas)
export const PRODUCTS = [
  'CWM Dose',
  'AI Reporting',
  'Command Center',
  'Others',
]

// ── Forecast categories (Salesforce-style commit/best-case/upside) ─────────
// Used to roll up deals into forecast buckets regardless of stage.
export const FORECAST_CATEGORIES = [
  { id: 'commit',    label: 'Commit',    short: 'C',  color: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500' },
  { id: 'best_case', label: 'Best case', short: 'BC', color: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  { id: 'upside',    label: 'Upside',    short: 'U',  color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  { id: 'omit',      label: 'Omit',      short: '—',  color: 'bg-gray-100 text-gray-500 border-gray-200',     dot: 'bg-gray-400' },
]

// When forecast_category is null, infer from stage (same logic as the SQL backfill).
export function defaultForecastFromStage(stage) {
  switch (stage) {
    case 'BackLog':
    case 'Invoiced':        return 'commit'
    case 'Offer Presented': return 'best_case'
    case 'Pipeline':        return 'upside'
    case 'Lead':
    case 'Lost':            return 'omit'
    default:                return 'upside'
  }
}

export function resolveForecastCategory(deal) {
  return deal?.forecast_category || defaultForecastFromStage(deal?.stage)
}

// Safely parse JSON, returning a fallback instead of throwing
export function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return fallback }
}
