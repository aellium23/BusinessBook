import { useState } from 'react'
import { BUBadge, StageBadge, SalesTypeBadge, ForecastBadge, formatK, CurrencyBadge } from '../ui'
import { Trash2, Pencil, ChevronDown, ChevronUp, Link, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { WEIGHTS, MONTHS, MONTHS_K } from '../../constants'

function agingDays(deal) {
  if (!['Lead','Pipeline','Offer Presented'].includes(deal.stage)) return null
  const ref = deal.stage_changed_at || deal.updated_at || deal.created_at
  if (!ref) return null
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)
}

function AgingBadge({ days }) {
  if (days === null) return null
  if (days >= 90) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
      <AlertTriangle size={10}/> {days}d
    </span>
  )
  if (days >= 45) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
      <Clock size={10}/> {days}d
    </span>
  )
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-500"><Clock size={10}/>{days}d</span>
}


// ── Deal Score: verde/amarelo/vermelho baseado em saúde do deal ──────────
function dealScore(deal) {
  let score = 100
  const now = new Date()

  // Penalizar por inactividade (sem updated_at recente)
  if (deal.updated_at) {
    const daysSince = (now - new Date(deal.updated_at)) / 86400000
    if (daysSince > 90) score -= 30
    else if (daysSince > 45) score -= 15
    else if (daysSince > 21) score -= 5
  }

  // Penalizar por stage problemático
  if (deal.stage === 'Lost') return { score: 0, color: 'gray', label: 'Lost' }
  if (deal.stage === 'Invoiced') return { score: 100, color: 'green', label: 'Closed' }

  // Penalizar por probabilidade baixa
  const prob = deal.win_probability ?? { Lead:10, Pipeline:30, 'Offer Presented':60, BackLog:80 }[deal.stage] ?? 30
  if (prob < 20) score -= 25
  else if (prob < 40) score -= 10

  // Penalizar por valor em queda (sem dados históricos, usar proxy: deal sem valor)
  if (!deal.value_total || deal.value_total === 0) score -= 20

  // Penalizar se deal muito antigo sem avançar (created_at há >6 meses e ainda em Lead/Pipeline)
  if (deal.created_at && ['Lead','Pipeline'].includes(deal.stage)) {
    const age = (now - new Date(deal.created_at)) / 86400000
    if (age > 180) score -= 25
    else if (age > 90) score -= 10
  }

  // Bónus por actividade recente, SLA, produto definido
  if (deal.is_sla) score += 5
  if (deal.product) score += 5

  score = Math.max(0, Math.min(100, score))
  if (score >= 70) return { score, color: 'green', label: 'Healthy' }
  if (score >= 40) return { score, color: 'amber', label: 'At risk' }
  return { score, color: 'red', label: 'Critical' }
}

// ── Discount status chip ───────────────────────────────────────────────────
function DiscountChip({ deal }) {
  if (!deal.discount_status) return null
  const map = {
    pending:  { cls: 'bg-purple-100 text-purple-800', text: `⏳ Pending ${deal.discount_requested ?? ''}%` },
    approved: { cls: 'bg-green-100 text-green-700',   text: `✓ ${deal.discount_approved ?? ''}% approved` },
    counter:  { cls: 'bg-amber-100 text-amber-700',   text: `↔ Counter: ${deal.discount_approved ?? ''}%` },
    rejected: { cls: 'bg-red-100 text-red-700',       text: '✗ Rejected' },
  }
  const m = map[deal.discount_status]
  if (!m) return null
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${m.cls}`}>{m.text}</span>
}

// ── Deal card ─────────────────────────────────────────────────────────────
// Compact by default; taps expand "Details" (extra badges, description,
// distribution chain, monthly breakdown). Keeps the Monthly toggle as a
// subset of the full details — one chevron, one state.
export default function DealCard({ deal, onEdit, onDelete, canEdit, canDelete, brands }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const fy26 = MONTHS_K.reduce((s, m) => s + (Number(deal[m]) || 0), 0)
  const isIC    = deal.is_intercompany_mirror
  const hasIC   = deal.intercompany_value > 0
  const score   = dealScore(deal)
  const aging   = agingDays(deal)
  // Deferred revenue detection
  const deferredInfo = (() => {
    if (deal.stage !== 'Invoiced') return null
    const now = new Date()
    const fyIdx = ((now.getMonth() + 1 - 4 + 12) % 12)
    const futureMonths = MONTHS_K.slice(fyIdx + 1).filter(m => (Number(deal[m]) || 0) > 0)
    const pastMonths = MONTHS_K.slice(0, fyIdx + 1).filter(m => (Number(deal[m]) || 0) > 0)
    if (futureMonths.length > 0 && pastMonths.length === 0) {
      const firstMonth = MONTHS[MONTHS_K.indexOf(futureMonths[0])]
      const lastMonth = MONTHS[MONTHS_K.indexOf(futureMonths[futureMonths.length - 1])]
      return { type: 'deferred', label: `Deferred | ${firstMonth}–${lastMonth}` }
    }
    if (futureMonths.length > 0 && pastMonths.length > 0) {
      return { type: 'linear', label: 'Linear' }
    }
    return null
  })()

  // Only surface the discount chip on the compact row when it's actionable
  const showDiscount = ['pending','counter'].includes(deal.discount_status)

  const scoreBorderClass = score.color === 'green' ? 'border-l-4 border-green-400' :
    score.color === 'amber' ? 'border-l-4 border-amber-400' :
    score.color === 'red'   ? 'border-l-4 border-red-400' :
    score.color === 'gray'  ? 'border-l-4 border-gray-300' : ''

  return (
    <div className={`card p-3 space-y-2 ${isIC ? 'border-l-4 border-vgt' : scoreBorderClass}`}>
      {/* Compact header — essential info only */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <BUBadge bu={deal.bu} />
            <StageBadge stage={deal.stage} />
            <ForecastBadge deal={deal} />
            {Array.isArray(brands) && brands.map(b => (
              <span key={b} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700">
                {b}
              </span>
            ))}
            {aging !== null && (aging >= 45 || open) && <AgingBadge days={aging} />}
            {isIC && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-vgt/10 text-vgt">
                <Link size={10}/> IC mirror
              </span>
            )}
            {showDiscount && <DiscountChip deal={deal} />}
            {deferredInfo && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                deferredInfo.type === 'deferred' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {deferredInfo.label}
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-gray-900 truncate">{deal.client}</p>
          <p className="text-xs text-gray-400 truncate">
            {[deal.country, deal.sales_owner].filter(Boolean).join(' · ') || ' '}
          </p>
        </div>
        <div className="text-right shrink-0 min-w-0 max-w-28">
          <div className="flex items-center justify-end gap-1">
            <CurrencyBadge currency={deal.currency}/>
            <p className="text-sm font-bold text-gray-900">
              {deal.currency && deal.currency !== 'EUR'
                ? `${deal.currency === 'USD' ? '$' : '£'}${(deal.value_total||0).toLocaleString()}`
                : formatK(deal.value_total)}
            </p>
          </div>
          <p className="text-xs text-gray-400">FY26: {formatK(fy26)}</p>
          {deal.gm_pct > 0 && (
            <p className="text-[10px] text-green-600 font-semibold">GM {(deal.gm_pct * 100).toFixed(0)}%</p>
          )}
        </div>
      </div>

      {/* Footer: expand toggle + health pill + edit/delete */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
          {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          {open ? t('deals_hide_details') : t('deals_show_details')}
        </button>
        <div className="flex items-center gap-2">
          {!isIC && (
            <div className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              score.color === 'green' ? 'bg-green-100 text-green-700' :
              score.color === 'amber' ? 'bg-amber-100 text-amber-700' :
              score.color === 'red'   ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-400'
            }`} title={`Score: ${score.score}/100`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                score.color === 'green' ? 'bg-green-500' :
                score.color === 'amber' ? 'bg-amber-500' :
                score.color === 'red'   ? 'bg-red-500' : 'bg-gray-400'
              }`}/>
              {score.label}
            </div>
          )}
          {canEdit && !isIC && (
            <>
              <button onClick={() => onEdit(deal)} className="text-gray-400 hover:text-navy min-h-tap min-w-tap p-1.5" aria-label="Edit">
                <Pencil size={14}/>
              </button>
              {canDelete && (
              <button onClick={() => onDelete(deal)} className="text-gray-400 hover:text-red-500 min-h-tap min-w-tap p-1.5" aria-label="Delete">
                <Trash2 size={14}/>
              </button>
              )}
            </>
          )}
          {isIC && (
            <span className="text-xs text-gray-400 italic">{t("deals_auto")}</span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="pt-2 border-t border-gray-100 space-y-2">
          {/* Extra badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <SalesTypeBadge type={deal.sales_type} />
            {deal.product && (
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-navy/10 text-navy">
                {deal.product}
              </span>
            )}
            {deal.win_probability != null && (
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                deal.win_probability >= 80 ? 'bg-green-100 text-green-700' :
                deal.win_probability >= 50 ? 'bg-purple-100 text-purple-700' :
                deal.win_probability >= 20 ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-500'
              }`}>{deal.win_probability}%</span>
            )}
            {deal.is_sla && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                <RefreshCw size={9}/> SLA
              </span>
            )}
            {!showDiscount && <DiscountChip deal={deal} />}
            {hasIC && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                <Link size={10}/> IC → VGT
              </span>
            )}
          </div>

          {/* Description / Lost reason */}
          {deal.description && <p className="text-xs text-gray-600 whitespace-pre-wrap">{deal.description}</p>}
          {deal.stage === 'Lost' && deal.lost_reason && (
            <p className="text-xs text-red-500">Lost: {deal.lost_reason}</p>
          )}

          {/* Equipment / studies / exams */}
          {(deal.equipment_count || deal.annual_studies || deal.annual_exams) && (
            <div className="flex items-center gap-3 flex-wrap">
              {deal.equipment_count && (
                <span className="text-micro text-gray-500">📡 {deal.equipment_count} equip.</span>
              )}
              {deal.annual_studies && (
                <span className="text-micro text-gray-500">📊 {Number(deal.annual_studies).toLocaleString()} studies/yr</span>
              )}
              {deal.annual_exams && (
                <span className="text-micro text-gray-500">📋 {Number(deal.annual_exams).toLocaleString()} exams/yr</span>
              )}
            </div>
          )}

          {/* Distribution chain */}
          {(deal.end_customer || deal.distributor || deal.hub) && (
            <div className="flex items-center gap-1 flex-wrap">
              {deal.end_customer && (
                <span className="text-micro bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded truncate max-w-32">{deal.end_customer}</span>
              )}
              {(deal.distributor || deal.hub) && <span className="text-gray-300 text-micro">→</span>}
              {deal.distributor && (
                <span className="text-micro bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded truncate max-w-32">{deal.distributor}</span>
              )}
              {deal.hub && (
                <>
                  <span className="text-gray-300 text-micro">→</span>
                  <span className="text-micro bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded truncate max-w-32">{deal.hub}</span>
                </>
              )}
            </div>
          )}

          {/* Extra value figures */}
          <div className="flex items-center gap-3 flex-wrap text-tiny">
            {deal.currency && deal.currency !== 'EUR' && deal.exchange_rate && (
              <span className="text-blue-500">≈ {formatK((deal.value_total||0) * (deal.exchange_rate||1))} EUR</span>
            )}
            <span className="text-blue-600 font-medium">
              Weighted: {formatK((deal.value_total||0) * (WEIGHTS[deal.stage]||0))}
            </span>
            {deal.end_customer_value && (
              <span className="text-gray-500">Project: {formatK(deal.end_customer_value)}</span>
            )}
            {hasIC && (
              <span className="text-amber-600 font-medium">VGT cost: {formatK(deal.intercompany_value)}</span>
            )}
          </div>

          {/* Monthly breakdown */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
            {MONTHS.map((m, i) => {
              const v = Number(deal[MONTHS_K[i]]) || 0
              return (
                <div key={m} className={`text-center rounded p-1 ${v > 0 ? (isIC ? 'bg-vgt/10' : 'bg-blue-50') : 'bg-gray-50'}`}>
                  <p className="text-[9px] text-gray-400">{m}</p>
                  <p className="text-micro font-bold text-gray-700">{v > 0 ? `${(v/1000).toFixed(1)}K` : '—'}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
