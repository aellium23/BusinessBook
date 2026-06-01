import { useState, useMemo, useEffect } from 'react'
import { useDeals, deleteDeal, upsertDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { BUBadge, StageBadge, SalesTypeBadge, ForecastBadge, Spinner, EmptyState, formatK, CurrencyBadge } from '../components/ui'
import DealForm from '../components/DealForm'
import KanbanBoard from '../components/KanbanBoard'
import { Plus, Search, Trash2, Pencil, ChevronDown, ChevronUp, Link, AlertTriangle, Clock, Download, RefreshCw, LayoutGrid, List, Globe, MapPin } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { STAGES, WEIGHTS, REGIONS, BUS, MONTHS, MONTHS_K, FORECAST_CATEGORIES, resolveForecastCategory } from '../constants'

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
function DealCard({ deal, onEdit, onDelete, canEdit, canDelete }) {
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

function exportToCSV(deals) {
  const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
  const MK = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
  const headers = ['BU','Stage','Client','Country','Region','Sales Owner','Deal Type','Is SLA','SLA Owner',
    'Value €','GM%','Win Prob%','Description',...MONTHS,'FY26 Total']
  const rows = deals.map(d => {
    const fy = MK.reduce((s,m)=>s+(Number(d[m])||0),0)
    return [
      d.bu, d.stage, d.client, d.country, d.region, d.sales_owner, d.deal_type,
      d.is_sla ? 'Yes' : 'No', d.sla_owner || '',
      d.value_total || 0, d.gm_pct ? (d.gm_pct*100).toFixed(1) : '',
      d.win_probability || '', d.description || '',
      ...MK.map(m => Number(d[m]) || 0), fy
    ]
  })
  const csvSafe = (v) => {
    if (typeof v !== 'string') return v
    let s = v.replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(csvSafe).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url
  a.download = `BusinessBook_FY26_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const PERIOD_OPTIONS = [
  { label: 'All time', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

const REGION_COLORS = {
  Europe: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: '#3B82F6' },
  MEA:    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: '#F59E0B' },
  LATAM:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', bar: '#10B981' },
  APAC:   { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: '#8B5CF6' },
  NA:     { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', bar: '#EF4444' },
}

const STAGE_COLORS = {
  Lead: '#9CA3AF', Pipeline: '#F59E0B', 'Offer Presented': '#3B82F6',
  BackLog: '#8B5CF6', Invoiced: '#10B981', Lost: '#EF4444',
}

function DealsMapView({ deals }) {
  const [selectedRegion, setSelectedRegion] = useState(null)

  const regionData = useMemo(() => {
    const map = {}
    for (const r of REGIONS) map[r] = { deals: [], countries: {}, total: 0, pipeline: 0, invoiced: 0, stages: {} }
    for (const d of deals) {
      if (d.is_intercompany_mirror) continue
      const r = d.region || 'Europe'
      if (!map[r]) map[r] = { deals: [], countries: {}, total: 0, pipeline: 0, invoiced: 0, stages: {} }
      map[r].deals.push(d)
      map[r].total += Number(d.value_total) || 0
      if (['Pipeline', 'Offer Presented'].includes(d.stage)) map[r].pipeline += Number(d.value_total) || 0
      if (d.stage === 'Invoiced') map[r].invoiced += Number(d.value_total) || 0
      map[r].stages[d.stage] = (map[r].stages[d.stage] || 0) + 1
      const c = d.country || 'Other'
      if (!map[r].countries[c]) map[r].countries[c] = { deals: 0, value: 0, pipeline: 0 }
      map[r].countries[c].deals++
      map[r].countries[c].value += Number(d.value_total) || 0
      if (['Pipeline', 'Offer Presented'].includes(d.stage)) map[r].countries[c].pipeline += Number(d.value_total) || 0
    }
    return map
  }, [deals])

  const maxTotal = Math.max(...Object.values(regionData).map(r => r.total), 1)

  return (
    <div className="space-y-3">
      {/* Region cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REGIONS.map(region => {
          const data = regionData[region]
          if (!data?.deals.length) return null
          const rc = REGION_COLORS[region] || REGION_COLORS.Europe
          const isSelected = selectedRegion === region
          return (
            <button key={region} onClick={() => setSelectedRegion(isSelected ? null : region)}
              className={`card p-4 text-left transition-all ${isSelected ? `ring-2 ring-offset-1 ${rc.border}` : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-sm font-bold ${rc.text} flex items-center gap-1.5`}>
                    <Globe size={14}/> {region}
                  </p>
                  <p className="text-[10px] text-gray-400">{data.deals.length} deals · {Object.keys(data.countries).length} countries</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatK(data.total)}</p>
                  {data.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(data.pipeline)} pipe</p>}
                </div>
              </div>

              {/* Stage distribution bar */}
              <div className="flex rounded-full h-2 overflow-hidden bg-gray-100 mb-2">
                {Object.entries(data.stages).map(([stage, count]) => (
                  <div key={stage}
                    style={{ width: `${(count / data.deals.length) * 100}%`, background: STAGE_COLORS[stage] || '#9CA3AF' }}
                    title={`${stage}: ${count}`}/>
                ))}
              </div>

              {/* Value bar */}
              <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(data.total / maxTotal) * 100}%`, background: rc.bar }}/>
              </div>
            </button>
          )
        })}
      </div>

      {/* Country detail for selected region */}
      {selectedRegion && regionData[selectedRegion] && (
        <div className="card p-4 space-y-2">
          <p className={`text-xs font-bold uppercase tracking-wide ${REGION_COLORS[selectedRegion]?.text || 'text-gray-700'} flex items-center gap-1`}>
            <MapPin size={12}/> {selectedRegion} — Country Breakdown
          </p>
          <div className="space-y-1">
            {Object.entries(regionData[selectedRegion].countries)
              .sort(([, a], [, b]) => b.value - a.value)
              .map(([country, data]) => (
                <div key={country} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{country}</p>
                    <p className="text-[10px] text-gray-400">{data.deals} deal{data.deals !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatK(data.value)}</p>
                    {data.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(data.pipeline)} pipe</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Iberia spotlight */}
      {(() => {
        const pt = regionData.Europe?.countries?.Portugal
        const es = regionData.Europe?.countries?.Spain
        if (!pt && !es) return null
        return (
          <div className="card p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-navy flex items-center gap-1">
              <MapPin size={12}/> Iberia Spotlight
            </p>
            <div className="grid grid-cols-2 gap-3">
              {pt && (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700">Portugal</p>
                  <p className="text-lg font-bold text-gray-900">{formatK(pt.value)}</p>
                  <p className="text-[10px] text-gray-400">{pt.deals} deals</p>
                  {pt.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(pt.pipeline)} pipeline</p>}
                </div>
              )}
              {es && (
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-orange-700">Spain</p>
                  <p className="text-lg font-bold text-gray-900">{formatK(es.value)}</p>
                  <p className="text-[10px] text-gray-400">{es.deals} deals</p>
                  {es.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(es.pipeline)} pipeline</p>}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function Deals() {
  const { canEdit, isAdmin, editOwnOnly, profile, perms } = useAuth()
  const canDelete = perms?.canDelete ?? false
  const canEditDeal = (deal) => {
    if (!canEdit) return false
    if (isAdmin) return true
    if (editOwnOnly) return deal?.created_by === profile?.id || deal?.sales_owner === profile?.full_name || deal?.sales_owner === profile?.sales_owner_name
    return true
  }
  const { t } = useTranslation()

  // Filtros
  const [search, setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stageF, setStageF]     = useState('')
  const [regionF, setRegionF]   = useState('')
  const [buF, setBuF]           = useState('')
  const [ownerF, setOwnerF]     = useState('')
  const [forecastF, setForecastF] = useState('') // '' | 'commit' | 'best_case' | 'upside' | 'omit'
  const [slaF, setSlaF]         = useState(false)
  const [periodF, setPeriodF]   = useState(0)   // dias; 0 = todos
  const [pageSize, setPageSize]             = useState(5)
  const [page, setPage]                     = useState(1)
  const [sortBy, setSortBy]               = useState('date_desc')
  const [invoicedMonthF, setInvoicedMonthF] = useState([])  // array of month keys
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem('bb_deals_view') || 'list'
  })

  useEffect(() => {
    try { localStorage.setItem('bb_deals_view', viewMode) } catch {}
  }, [viewMode])

  // Debounce search 300ms to avoid a network call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Modal states
  const [editDeal, setEditDeal] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const { deals: rawDeals, loading, refetch } = useDeals({
    stage:  stageF  || undefined,
    region: regionF || undefined,
    bu:     profile?.role === 'distributor' ? undefined : (buF || undefined),
    search: debouncedSearch || undefined,
  })

  // Filtros client-side adicionais
  const deals = useMemo(() => {
    let d = profile?.role === 'distributor'
      ? rawDeals.filter(x => x.company_id === profile?.company_id)
      : rawDeals
    if (slaF) d = d.filter(x => x.is_sla)
    if (ownerF) d = d.filter(x => x.sales_owner?.toLowerCase().includes(ownerF.toLowerCase()))
    if (forecastF) d = d.filter(x => resolveForecastCategory(x) === forecastF)
    if (periodF > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - periodF)
      d = d.filter(x => x.updated_at && new Date(x.updated_at) >= cutoff)
    }
    if (invoicedMonthF.length > 0) {
      d = d.filter(x => x.stage === 'Invoiced' && invoicedMonthF.some(m => (Number(x[m]) || 0) > 0))
    }
    return d
  }, [rawDeals, slaF, ownerF, forecastF, periodF, invoicedMonthF.join(','), profile])

  // Totals computed from the client-side filtered deals (not the hook's raw totals)
  const filteredTotals = useMemo(() => deals.reduce((acc, d) => {
    const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
    if (d.is_intercompany_mirror) return acc
    acc.pipeline += d.stage === 'Pipeline' ? (Number(d.value_total) || 0) : 0
    acc.backlog  += d.stage === 'BackLog'  ? fy26 : 0
    acc.invoiced += d.stage === 'Invoiced' ? fy26 : 0
    acc.forecast += ['BackLog','Invoiced'].includes(d.stage) ? fy26 : 0
    return acc
  }, { pipeline: 0, backlog: 0, invoiced: 0, forecast: 0 }), [deals])

  // Forecast roll-up (Commit / Best case / Upside) — excludes IC mirrors + Lost/Omit
  const forecastTotals = useMemo(() => {
    const result = { commit: 0, best_case: 0, upside: 0, omit: 0 }
    deals.forEach(d => {
      if (d.is_intercompany_mirror) return
      if (d.stage === 'Lost') return
      const cat = resolveForecastCategory(d)
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      const base = ['BackLog','Invoiced'].includes(d.stage) ? fy26 : (Number(d.value_total) || 0)
      const eur  = base * ((!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1))
      result[cat] = (result[cat] || 0) + eur
    })
    return result
  }, [deals])

  // Reset página quando filtros mudam
  const resetPage = () => setPage(1)
  const handleSearch = v => { setSearch(v); resetPage() }
  const handleStage  = v => { setStageF(v); resetPage() }
  const handleRegion = v => { setRegionF(v); resetPage() }
  const handleBu     = v => { setBuF(v); resetPage() }
  const handleOwner  = v => { setOwnerF(v); resetPage() }
  const handleSla    = ()  => { setSlaF(o => !o); resetPage() }
  const handlePeriod        = v => { setPeriodF(Number(v)); resetPage() }
  const handleInvoicedMonth = v => { setInvoicedMonthF(v); resetPage() }

  // Paginação
  const sortedDeals = useMemo(() => {
    const sorted = [...deals]
    sorted.sort((a, b) => {
      if (sortBy === 'value_desc') return (Number(b.value_total) || 0) - (Number(a.value_total) || 0)
      if (sortBy === 'value_asc')  return (Number(a.value_total) || 0) - (Number(b.value_total) || 0)
      if (sortBy === 'client')     return (a.client || '').localeCompare(b.client || '')
      if (sortBy === 'date_desc')  return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      if (sortBy === 'date_asc')   return new Date(a.created_at || 0) - new Date(b.created_at || 0)
      if (sortBy === 'stage')      return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
      return 0
    })
    return sorted
  }, [deals, sortBy])
  const totalPages = Math.max(1, Math.ceil(sortedDeals.length / pageSize))
  const paginated  = sortedDeals.slice((page - 1) * pageSize, page * pageSize)

  // Owners únicos para o filtro
  const owners = useMemo(() => {
    const s = new Set(rawDeals.map(d => d.sales_owner).filter(Boolean))
    return Array.from(s).sort()
  }, [rawDeals])

  // Contagem de filtros activos
  const activeFilters = [search, stageF, regionF, buF, ownerF, forecastF, slaF, periodF > 0, invoicedMonthF.length > 0].filter(Boolean).length

  // Drag-drop on the Kanban: moving a card across stages
  async function handleStageChange(dealId, newStage) {
    const deal = rawDeals.find(d => d.id === dealId)
    if (!deal) return
    const { error } = await upsertDeal({
      id: dealId,
      stage: newStage,
      stage_changed_at: new Date().toISOString(),
    })
    if (error) {
      alert(`Failed to move deal: ${error.message}`)
    }
    refetch()
  }

  async function confirmDelete() {
    await deleteDeal(confirmDel.id)
    setConfirmDel(null); refetch()
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("deals_title")}</h1>
          <p className="text-[10px] text-gray-400">New sales opportunities & one-time projects</p>
          <p className="text-sm text-gray-400">
            {deals.length} {t("deals_records")}
            {activeFilters > 0 && <span className="ml-1 text-blue-500">· {activeFilters} {t("deals_filters_active")}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* View toggle — List vs Kanban */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="View mode">
            <button type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title={t("deals_view_list")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <List size={13}/><span className="hidden sm:inline">List</span>
            </button>
            <button type="button"
              onClick={() => setViewMode('kanban')}
              aria-pressed={viewMode === 'kanban'}
              title={t("deals_view_kanban")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 border-l border-gray-200 ${
                viewMode === 'kanban' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <LayoutGrid size={13}/><span className="hidden sm:inline">Kanban</span>
            </button>
            <button type="button"
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              title="Map view"
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 border-l border-gray-200 ${
                viewMode === 'map' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <Globe size={13}/><span className="hidden sm:inline">Map</span>
            </button>
          </div>

          <select className="select text-xs w-auto" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}>
            <option value="date_desc">Newest</option>
            <option value="date_asc">Oldest</option>
            <option value="value_desc">Value ↓</option>
            <option value="value_asc">Value ↑</option>
            <option value="client">Client A→Z</option>
            <option value="stage">Stage</option>
          </select>

          <button onClick={() => exportToCSV(deals)} className="btn-secondary text-xs">
            <Download size={14}/> Export
          </button>
          <button
            onClick={() => setShowFilters(o => !o)}
            className={`btn-secondary text-xs gap-1 ${activeFilters > 0 ? 'ring-2 ring-blue-400' : ''}`}>
            <Search size={13}/>
            {t("deals_filters")}
            {activeFilters > 0 && (
              <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </button>
          {canEdit && (
            <button onClick={() => { setEditDeal(null); setFormOpen(true) }} className="btn-primary">
              <Plus size={16}/> <span className="hidden sm:inline">{t("deals_new")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search bar sempre visível */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
        <input className="input pl-8 w-full" placeholder={t("search_deals")}
          value={search} onChange={e => handleSearch(e.target.value)}/>
        {search && (
          <button onClick={() => handleSearch('')}
            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">×</button>
        )}
      </div>

      {/* Filtros avançados — colapsáveis */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

            {/* BU */}
            {isAdmin && (
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">BU</label>
                <select className="select text-xs w-full" value={buF} onChange={e => handleBu(e.target.value)}>
                  <option value="">{t("deals_all_bu")}</option>
                  {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            {/* Stage */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Stage</label>
              <select className="select text-xs w-full" value={stageF} onChange={e => handleStage(e.target.value)}>
                <option value="">{t("deals_all_stages")}</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Region */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Region</label>
              <select className="select text-xs w-full" value={regionF} onChange={e => handleRegion(e.target.value)}>
                <option value="">{t("deals_all_regions")}</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Sales Owner */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("df_owner")}</label>
              <select className="select text-xs w-full" value={ownerF} onChange={e => handleOwner(e.target.value)}>
                <option value="">{t("deals_all_owners")}</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* Forecast category */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Forecast</label>
              <select className="select text-xs w-full" value={forecastF}
                onChange={e => { setForecastF(e.target.value); resetPage() }}>
                <option value="">All forecasts</option>
                {FORECAST_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            {/* Invoiced Month */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">
                Invoiced Month
              </label>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setInvoicedMonthF([])}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${invoicedMonthF.length === 0 ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'}`}>All</button>
                <button onClick={() => {
                  const m = new Date().getMonth() + 1
                  const elapsed = ((m - 4 + 12) % 12) + 1
                  setInvoicedMonthF(MONTHS_K.slice(0, elapsed))
                }}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${invoicedMonthF.length > 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>FY YTD</button>
              </div>
              <div className="grid grid-cols-4 gap-0.5 mt-1">
                {MONTHS.map((m, i) => (
                  <button key={m} onClick={() => {
                    setInvoicedMonthF(prev => prev.includes(MONTHS_K[i]) ? prev.filter(x => x !== MONTHS_K[i]) : [...prev, MONTHS_K[i]])
                  }}
                    className={`text-[10px] px-1 py-0.5 rounded ${invoicedMonthF.includes(MONTHS_K[i]) ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                    {m}
                  </button>
                ))}
              </div>
              {invoicedMonthF.length > 0 && (
                <p className="text-[9px] text-blue-500 mt-0.5">{invoicedMonthF.length} month{invoicedMonthF.length > 1 ? 's' : ''} selected</p>
              )}
            </div>

            {/* Período */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("deals_period")}</label>
              <select className="select text-xs w-full" value={periodF} onChange={e => handlePeriod(e.target.value)}>
                {PERIOD_OPTIONS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
              </select>
            </div>

            {/* Cards por página */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("deals_per_page")}</label>
              <select className="select text-xs w-full" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); resetPage() }}>
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} {t("deals_per_page_suffix")}</option>)}
              </select>
            </div>
          </div>

          {/* Toggle SLA + Reset */}
          <div className="flex items-center justify-between">
            <button onClick={handleSla}
              className={`btn text-xs gap-1 ${slaF ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'btn-secondary'}`}>
              <RefreshCw size={11}/> SLA only
            </button>
            {activeFilters > 0 && (
              <button onClick={() => {
                setSearch(''); setStageF(''); setRegionF(''); setBuF('')
                setOwnerF(''); setForecastF(''); setSlaF(false); setPeriodF(0); setInvoicedMonthF(''); resetPage()
              }} className="text-xs text-red-500 hover:text-red-700 font-medium">
                {t("deals_clear_filters")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Forecast roll-up — Commit / Best case / Upside */}
      <div className="grid grid-cols-3 gap-2">
        {FORECAST_CATEGORIES.filter(c => c.id !== 'omit').map(c => {
          const v = forecastTotals[c.id] || 0
          const active = forecastF === c.id
          return (
            <button key={c.id} type="button"
              onClick={() => { setForecastF(active ? '' : c.id); resetPage() }}
              aria-pressed={active}
              className={`text-left rounded-xl border p-2.5 transition-colors ${
                active ? 'border-navy ring-2 ring-navy/10' : 'border-gray-200 hover:border-gray-300'
              } ${c.color.split(' ')[0]}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
              <p className="text-sm font-bold mt-0.5">{formatK(v)}</p>
            </button>
          )
        })}
      </div>

      {/* Totais */}
      <div className="flex gap-4 overflow-x-auto pb-1">
        {[
          { l:t("deals_pipeline"), v:filteredTotals.pipeline, c:'text-amber-700' },
          { l:t("deals_backlog"),  v:filteredTotals.backlog,  c:'text-blue-700'  },
          { l:t("deals_actuals"),  v:filteredTotals.invoiced, c:'text-green-700' },
          { l:t("deals_fc"),       v:filteredTotals.forecast, c:'text-vgt font-bold' },
          { l:t("deals_weighted"), v:deals.filter(d=>!d.is_intercompany_mirror).reduce((s,d)=>{
              const fy=MONTHS_K.reduce((ms,m)=>ms+(Number(d[m])||0),0)
              const baseRaw=['BackLog','Invoiced'].includes(d.stage)?fy:(Number(d.value_total)||0)
              const base=baseRaw*((!d.currency||d.currency==='EUR')?1:(Number(d.exchange_rate)||1))
              const prob=d.win_probability!=null?d.win_probability/100:(WEIGHTS[d.stage]||0)
              return s+base*prob
            },0), c:'text-purple-700 font-bold' },
        ].map(({ l, v, c }) => (
          <div key={l} className="text-center shrink-0">
            <p className="text-[10px] text-gray-400">{l}</p>
            <p className={`text-sm font-semibold ${c}`}>{formatK(v)}</p>
          </div>
        ))}
      </div>

      {/* Lista paginada ou Kanban */}
      {loading ? <Spinner /> : deals.length === 0
        ? <EmptyState icon="📋" title={t("deals_empty_title")} description={t("deals_empty_desc")}
            action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">{t("deals_add")}</button>}/>
        : viewMode === 'map'
          ? <DealsMapView deals={deals} />
        : viewMode === 'kanban'
          ? <KanbanBoard
              deals={sortedDeals}
              canEdit={canEdit}
              onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
              onDelete={setConfirmDel}
              onMove={handleStageChange}
            />
        : <>
            <div className="space-y-2">
              {paginated.map(d => (
                <DealCard key={d.id} deal={d} canEdit={canEditDeal(d)} canDelete={canDelete}
                  onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
                  onDelete={setConfirmDel}
                />
              ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">
                  {t("deals_showing")} {(page-1)*pageSize+1}–{Math.min(page*pageSize, sortedDeals.length)} {t("deals_of")} {sortedDeals.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p-1))}
                    disabled={page === 1}
                    className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
                    ←
                  </button>
                  {Array.from({length: totalPages}, (_, i) => i+1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i-1] > 1) acc.push('…')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) => p === '…'
                      ? <span key={`ellipsis-${i}`} className="text-xs text-gray-300 px-1">…</span>
                      : <button key={p} onClick={() => setPage(p)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            p === page ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-100'
                          }`}>{p}</button>
                    )
                  }
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p+1))}
                    disabled={page === totalPages}
                    className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
                    →
                  </button>
                </div>
              </div>
            )}
          </>
      }

      {formOpen && (
        <DealForm deal={editDeal}
          onClose={() => { setFormOpen(false); setEditDeal(null) }}
          onSaved={refetch} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-xs shadow-xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <h3 className="font-semibold text-gray-900 mb-2">{t("deals_delete_q")}</h3>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{confirmDel.client}</strong> will be permanently removed.
            </p>
            {confirmDel.intercompany_value > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mb-3">
                The linked VGT intercompany deal will also be deleted.
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">{t("deals_cancel")}</button>
              <button onClick={confirmDelete} className="btn-danger flex-1">{t("deals_delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
