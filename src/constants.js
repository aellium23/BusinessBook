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

// Safely parse JSON, returning a fallback instead of throwing
export function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return fallback }
}
