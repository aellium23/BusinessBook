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

// ── Contact / stakeholder roles (DMU map) ──────────────────────────────────
export const CONTACT_ROLES = [
  { id: 'decision_maker', label: 'Decision maker', icon: '👑', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'champion',       label: 'Champion',       icon: '🤝', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'influencer',     label: 'Influencer',     icon: '💡', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'user',           label: 'End user',       icon: '👤', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { id: 'blocker',        label: 'Blocker',        icon: '🚧', color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'other',          label: 'Other',          icon: '•',  color: 'bg-gray-50 text-gray-500 border-gray-200' },
]

export function contactRole(id) {
  return CONTACT_ROLES.find(r => r.id === id) || CONTACT_ROLES[CONTACT_ROLES.length - 1]
}

// ── Distribution paths ──────────────────────────────────────────────────────
// Direct:       VGT → Distributor → Client        (e.g. CWM Dose)
// Hub-mediated: VGT → Hub → Distributor → Client  (e.g. CWM RiS via HCUS)
export const DISTRIBUTION_PATHS = [
  { id: 'direct',       label: 'Direct',        hint: 'VGT → Distributor → Client' },
  { id: 'hub_mediated', label: 'Hub-mediated',  hint: 'VGT → Hub → Distributor → Client' },
]

/**
 * Compute the margin at every level of the distribution chain.
 * Returns { vgt, hub, distributor, total_chain } in absolute terms + pct.
 *
 * Values expected (numbers or null):
 *   value_total         — what VGT invoices (to hub OR distributor)
 *   vgt_cost            — what it costs VGT to produce
 *   distributor_price   — hub_mediated: price hub → distributor
 *   end_customer_price  — what distributor charges client
 *   distribution_path   — 'direct' | 'hub_mediated'
 */
export function computeMargins(deal) {
  if (!deal) return null
  const path     = deal.distribution_path || 'direct'
  const cost     = Number(deal.vgt_cost) || 0
  const vgtInv   = Number(deal.value_total) || 0
  const dPrice   = Number(deal.distributor_price) || 0
  const ecPrice  = Number(deal.end_customer_price) || 0

  // VGT margin is always value_total - cost
  const vgt = { abs: vgtInv - cost, pct: vgtInv > 0 ? ((vgtInv - cost) / vgtInv) * 100 : 0 }

  let hub = null
  let distributor = null

  if (path === 'hub_mediated') {
    // VGT invoices hub at value_total, hub resells to distributor at distributor_price
    if (dPrice > 0) {
      hub = { abs: dPrice - vgtInv, pct: dPrice > 0 ? ((dPrice - vgtInv) / dPrice) * 100 : 0 }
    }
    if (ecPrice > 0 && dPrice > 0) {
      distributor = { abs: ecPrice - dPrice, pct: ecPrice > 0 ? ((ecPrice - dPrice) / ecPrice) * 100 : 0 }
    }
  } else {
    // Direct: VGT invoices distributor at value_total, distributor resells at end_customer_price
    if (ecPrice > 0) {
      distributor = { abs: ecPrice - vgtInv, pct: ecPrice > 0 ? ((ecPrice - vgtInv) / ecPrice) * 100 : 0 }
    }
  }

  return { path, vgt, hub, distributor }
}

// Safely parse JSON, returning a fallback instead of throwing
export function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return fallback }
}
