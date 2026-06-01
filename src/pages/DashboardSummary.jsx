import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDeals } from '../hooks/useDeals'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner, formatK } from '../components/ui'
import Gauge from '../components/Gauge'
import { MONTHS_K } from '../constants'
import { TrendingUp, Target, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

function CollapsibleSection({ id, title, icon, children, defaultOpen = true }) {
  const key = `bb_dash_${id}`
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === '1' } catch { return defaultOpen }
  })
  const toggle = useCallback(() => {
    setOpen(o => { const n = !o; try { localStorage.setItem(key, n ? '1' : '0') } catch {}; return n })
  }, [key])
  return (
    <div>
      <button onClick={toggle} className="w-full flex items-center justify-between py-1 group">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
          {icon} {title}
        </p>
        {open ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

// ── Active cycle helper ────────────────────────────────────────────────────
function activeCycleNow() {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 'BUD'
  if (m >= 7)           return 'EST1'
  return 'EST2'
}

// FY26 starts in April. This returns how many of the 12 months have elapsed,
// so we can compare YTD actuals against YTD budget instead of full-year.
function fyMonthsElapsed() {
  const now = new Date()
  const m   = now.getMonth() + 1 // 1..12
  // Apr is month 1 of FY; Dec = 9; Mar = 12
  return ((m - 4 + 12) % 12) + 1
}

// Sum a deal's monthly columns across an array of month keys
function sumMonthly(row, monthKeys) {
  return monthKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0)
}

export default function DashboardSummary({ selectedBU = '' }) {
  const { profile, isAdmin } = useAuth()
  const { t }                = useTranslation()
  const { deals: allDeals, loading } = useDeals()
  const deals = useMemo(() => selectedBU ? allDeals.filter(d => d.bu === selectedBU) : allDeals, [allDeals, selectedBU])
  const [budget, setBudget]  = useState([])
  const [accountTypes, setAccountTypes] = useState({})
  const [fy25, setFy25]      = useState([])
  const [slaStats, setSlaStats] = useState({ active: 0, activeValue: 0, pipelineValue: 0, revenueByFY: {}, byBU: {} })
  const [manualFct, setManualFct] = useState(null)
  const [customizing, setCustomizing] = useState(false)
  const DEFAULT_SECTIONS = ['gauges','public_private','pipeline','fct','recurring','fy_projection']
  const [sectionOrder, setSectionOrder] = useState(() => {
    try { const v = localStorage.getItem('bb_dash_sections'); return v ? JSON.parse(v) : DEFAULT_SECTIONS } catch { return DEFAULT_SECTIONS }
  })
  const [hiddenSections, setHiddenSections] = useState(() => {
    try { const v = localStorage.getItem('bb_dash_hidden'); return v ? JSON.parse(v) : [] } catch { return [] }
  })
  function moveSection(id, dir) {
    setSectionOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const arr = [...prev]; [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      try { localStorage.setItem('bb_dash_sections', JSON.stringify(arr)) } catch {}
      return arr
    })
  }
  function toggleSection(id) {
    setHiddenSections(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      try { localStorage.setItem('bb_dash_hidden', JSON.stringify(next)) } catch {}
      return next
    })
  }
  const SECTION_LABELS = { gauges:'Sales vs Budget', public_private:'Public vs Private', pipeline:'Pipeline', fct:'Manual FCT', recurring:'Recurring Business', fy_projection:'FY Projection' }

  useEffect(() => {
    supabase.from('budget').select('*')
      .then(({ data }) => setBudget(data || []))
      .catch(e => console.warn('budget:', e?.message))
    supabase.from('accounts').select('id, client_type')
      .then(({ data }) => {
        if (data) setAccountTypes(Object.fromEntries(data.map(a => [a.id, a.client_type])))
      }).catch(() => {})
    supabase.from('fy25_actuals').select('*')
      .then(({ data }) => setFy25(data || []))
      .catch(e => console.warn('fy25:', e?.message))
    supabase.from('slas').select('status, annual_value, revenue_by_fy, bu, product')
      .then(({ data }) => {
        if (!data || !Array.isArray(data)) return
        try {
        const active = data.filter(s => ['warranty','active','pending_renewal'].includes(s.status))
        const pipeline = data.filter(s => s.status === 'pipeline')
        const revenueByFY = {}
        const byBU = { VGT: 0, ECT: 0, CWM: 0, total: 0 }
        for (const s of data) {
          if (s.status === 'cancelled') continue
          const val = Number(s.annual_value) || 0
          if (['warranty','active','pending_renewal'].includes(s.status)) {
            const bu = (s.bu || 'VGT').toUpperCase()
            if (bu === 'VGT') byBU.VGT += val
            if (bu === 'ECT') byBU.ECT += val
            const prod = (s.product || '').toLowerCase()
            if (prod.includes('cwm') || prod.includes('ris') || prod.includes('connectivity') || prod.includes('dose')) byBU.CWM += val
            byBU.total += val
          }
          const rev = s.revenue_by_fy || {}
          for (const [fy, v] of Object.entries(rev)) {
            revenueByFY[fy] = (revenueByFY[fy] || 0) + v
          }
        }
        setSlaStats({
          active: active.length,
          activeValue: active.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
          pipelineValue: pipeline.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
          revenueByFY, byBU,
        })
        } catch {}
      }).catch(() => {})
    supabase.from('forecast_snapshots').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error || !data?.length) return
        const latest = {}
        for (const s of data) {
          const k = `${s.cycle}-${s.bu}-${s.pl_key}`
          if (!latest[k]) latest[k] = s
        }
        const K = 1000
        const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
        const fctTotal = Object.values(latest).reduce((s, r) =>
          s + MONTHS_K.reduce((ms, m) => ms + (r[m] || 0), 0) * K, 0)
        const cycle = data[0]?.cycle
        const date = data[0]?.created_at
        if (fctTotal > 0) setManualFct({ total: fctTotal, cycle, date })
      }).catch(() => {})
  }, [])

  const cycle = useMemo(() => activeCycleNow(), [])

  // YTD month keys (FY starts in April)
  const ytdKeys = useMemo(() => MONTHS_K.slice(0, fyMonthsElapsed()), [])

  // Budget: ns_ext + ns_int per BU (YTD only).
  // NB: the budget + fy25_actuals tables store values in THOUSANDS of EUR
  // (legacy format — see Dashboard.jsx where every budget/PY read is
  // multiplied by 1000 before display). Deal monthly columns store raw EUR.
  const K = 1000
  const budgetData = useMemo(() => {
    function bucketFor(bu, plKey) {
      const row = budget.find(r => r.bu === bu && r.cycle === cycle && r.pl_key === plKey)
      if (!row) return 0
      return sumMonthly(row, ytdKeys) * K
    }
    return {
      vgt_ext_ytd: bucketFor('VGT', 'ns_ext'),
      vgt_int_ytd: bucketFor('VGT', 'ns_int'),
      ect_ext_ytd: bucketFor('ECT', 'ns_ext'),
      ect_int_ytd: bucketFor('ECT', 'ns_int'),
    }
  }, [budget, cycle, ytdKeys])

  // Actuals: sum of invoiced deals' monthly columns, YTD, by BU + sales_type (raw EUR)
  const actuals = useMemo(() => {
    const result = { vgt_ext: 0, vgt_int: 0, ect_ext: 0, ect_int: 0 }
    for (const d of deals) {
      if (d.stage !== 'Invoiced') continue
      if (d.is_intercompany_mirror) continue
      const ytd = sumMonthly(d, ytdKeys)
      const key = `${String(d.bu || '').toLowerCase()}_${String(d.sales_type || 'External').toLowerCase() === 'internal' ? 'int' : 'ext'}`
      if (key in result) result[key] += ytd
    }
    return result
  }, [deals, ytdKeys])

  // Forecast YTD: Invoiced + BackLog deals for the same elapsed months
  const forecastYTD = useMemo(() => {
    const result = { vgt_ext: 0, vgt_int: 0, ect_ext: 0, ect_int: 0 }
    for (const d of deals) {
      if (!['Invoiced', 'BackLog'].includes(d.stage)) continue
      if (d.is_intercompany_mirror) continue
      const ytd = sumMonthly(d, ytdKeys)
      const key = `${String(d.bu || '').toLowerCase()}_${String(d.sales_type || 'External').toLowerCase() === 'internal' ? 'int' : 'ext'}`
      if (key in result) result[key] += ytd
    }
    return result
  }, [deals, ytdKeys])

  // Prior year (FY25) for the same months — also stored in thousands
  const priorYear = useMemo(() => {
    const result = { vgt_ext: 0, vgt_int: 0, ect_ext: 0, ect_int: 0 }
    for (const r of fy25) {
      const ytd = sumMonthly(r, ytdKeys) * K
      const key = `${String(r.bu || '').toLowerCase()}_${String(r.sales_type || 'External').toLowerCase() === 'internal' ? 'int' : 'ext'}`
      if (key in result) result[key] += ytd
    }
    return result
  }, [fy25, ytdKeys])

  // Pipeline + forecast (all currently open / coming)
  const pipeline = useMemo(() => {
    const out = { vgt: 0, ect: 0 }
    for (const d of deals) {
      if (d.is_intercompany_mirror) continue
      if (!['Lead','Pipeline','Offer Presented','BackLog'].includes(d.stage)) continue
      const key = String(d.bu || '').toLowerCase()
      if (key in out) out[key] += Number(d.value_total) || 0
    }
    return out
  }, [deals])

  const publicPrivate = useMemo(() => {
    const r = { pub_pipe: 0, priv_pipe: 0, pub_inv: 0, priv_inv: 0, unlinked: 0 }
    for (const d of deals) {
      if (d.is_intercompany_mirror) continue
      const type = d.account_id ? (accountTypes[d.account_id] || 'unlinked') : 'unlinked'
      const val = Number(d.value_total) || 0
      const inv = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      if (['Pipeline','Offer Presented','BackLog'].includes(d.stage)) {
        if (type === 'public') r.pub_pipe += val
        else if (type === 'private') r.priv_pipe += val
        else r.unlinked += val
      }
      if (d.stage === 'Invoiced') {
        if (type === 'public') r.pub_inv += inv
        else if (type === 'private') r.priv_inv += inv
      }
    }
    r.total_pipe = r.pub_pipe + r.priv_pipe
    r.total_inv = r.pub_inv + r.priv_inv
    return r
  }, [deals, accountTypes])

  // Build gauge list for the role + BU filter
  const showVGT = (isAdmin || profile?.bu === 'VGT') && (!selectedBU || selectedBU === 'VGT')
  const showECT = (isAdmin || profile?.bu === 'ECT') && (!selectedBU || selectedBU === 'ECT')
  const showIberia = !selectedBU

  const gauges = []
  if (showVGT) {
    gauges.push({
      key: 'vgt-ext', label: 'VGT · External', subLabel: 'Sales to distributors',
      value: actuals.vgt_ext, forecast: forecastYTD.vgt_ext,
      target: budgetData.vgt_ext_ytd, py: priorYear.vgt_ext,
    })
    gauges.push({
      key: 'vgt-int', label: 'VGT · Internal', subLabel: 'Intercompany (to ECT)',
      value: actuals.vgt_int, forecast: forecastYTD.vgt_int,
      target: budgetData.vgt_int_ytd, py: priorYear.vgt_int,
    })
  }
  if (showECT) {
    gauges.push({
      key: 'ect-ext', label: 'ECT · External', subLabel: 'Sales to customers',
      value: actuals.ect_ext, forecast: forecastYTD.ect_ext,
      target: budgetData.ect_ext_ytd, py: priorYear.ect_ext,
    })
  }
  if (isAdmin && showIberia) {
    const ib_actuals  = actuals.vgt_ext + actuals.ect_ext
    const ib_forecast = forecastYTD.vgt_ext + forecastYTD.ect_ext
    const ib_budget   = budgetData.vgt_ext_ytd + budgetData.ect_ext_ytd
    const ib_py       = priorYear.vgt_ext + priorYear.ect_ext
    gauges.push({
      key: 'iberia', label: 'Iberia · External', subLabel: 'VGT + ECT consolidated',
      value: ib_actuals, forecast: ib_forecast, target: ib_budget, py: ib_py,
      color: '#0D2137',
    })
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Customize button */}
      <div className="flex justify-end">
        <button onClick={() => setCustomizing(c => !c)}
          className={`text-xs px-2.5 py-1 rounded-lg border ${customizing ? 'bg-navy text-white border-navy' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          {customizing ? 'Done' : 'Customize'}
        </button>
      </div>

      {customizing && (
        <div className="card p-3 space-y-1">
          <p className="text-xs font-semibold text-gray-500 mb-2">Reorder & toggle sections</p>
          {sectionOrder.map((id, idx) => (
            <div key={id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveSection(id, -1)} disabled={idx === 0}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronUp size={12}/></button>
                <button onClick={() => moveSection(id, 1)} disabled={idx === sectionOrder.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronDown size={12}/></button>
              </div>
              <span className="text-xs text-gray-700 flex-1">{SECTION_LABELS[id] || id}</span>
              <button onClick={() => toggleSection(id)}
                className={`text-xs px-2 py-0.5 rounded ${hiddenSections.includes(id) ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                {hiddenSections.includes(id) ? 'Hidden' : 'Visible'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sales vs Budget */}
      {!hiddenSections.includes('gauges') && (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-gray-400"/>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('dash_sales_vs_budget') || 'Sales vs Budget'}
          </p>
          <span className="ml-auto text-micro text-gray-400">
            FY26 YTD · cycle {cycle}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {gauges.map(g => (
            <div key={g.key} className="card p-4">
              <Gauge
                label={g.label}
                subLabel={g.subLabel}
                value={g.value}
                forecast={g.forecast}
                target={g.target}
                py={g.py}
                color={g.color}
                size="md"
              />
            </div>
          ))}
        </div>
        {gauges.some(g => g.target === 0) && (
          <p className="mt-2 text-micro text-gray-400 flex items-center gap-1">
            <AlertCircle size={10}/> Gauges with no target shown as 0% — add the budget cycle to fill them in.
          </p>
        )}
      </div>
      )}

      {/* Public vs Private */}
      {!hiddenSections.includes('public_private') && (publicPrivate.total_pipe > 0 || publicPrivate.total_inv > 0) && (
        <CollapsibleSection id="pub_priv" title="Public vs Private" icon={<Target size={12}/>}>
        <div className="card p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-micro text-gray-500">Public Pipeline</p>
              <p className="text-lg font-bold text-blue-700">{formatK(publicPrivate.pub_pipe)}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-2 text-center">
              <p className="text-micro text-gray-500">Private Pipeline</p>
              <p className="text-lg font-bold text-purple-700">{formatK(publicPrivate.priv_pipe)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-micro text-gray-500">Public Invoiced</p>
              <p className="text-lg font-bold text-blue-700">{formatK(publicPrivate.pub_inv)}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-2 text-center">
              <p className="text-micro text-gray-500">Private Invoiced</p>
              <p className="text-lg font-bold text-purple-700">{formatK(publicPrivate.priv_inv)}</p>
            </div>
          </div>
          {publicPrivate.total_pipe > 0 && (
            <div className="mt-2 flex rounded-full h-2 overflow-hidden bg-gray-100">
              <div style={{ width: `${(publicPrivate.pub_pipe / publicPrivate.total_pipe) * 100}%` }} className="bg-blue-500 h-full"/>
              <div style={{ width: `${(publicPrivate.priv_pipe / publicPrivate.total_pipe) * 100}%` }} className="bg-purple-500 h-full"/>
            </div>
          )}
          {publicPrivate.unlinked > 0 && (
            <p className="text-micro text-amber-500 mt-1">{formatK(publicPrivate.unlinked)} unlinked to accounts</p>
          )}
        </div>
        </CollapsibleSection>
      )}

      {/* Pipeline snapshot */}
      {!hiddenSections.includes('pipeline') && (
        <div className={`grid gap-3 ${showVGT && showECT ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {showVGT && (
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <TrendingUp size={12}/> VGT pipeline
            </p>
            <p className="text-2xl font-bold text-vgt mt-1">{formatK(pipeline.vgt)}</p>
            <p className="text-micro text-gray-400">open + offer + backlog</p>
          </div>
          )}
          {showECT && (
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <TrendingUp size={12}/> ECT pipeline
            </p>
            <p className="text-2xl font-bold text-ect mt-1">{formatK(pipeline.ect)}</p>
            <p className="text-micro text-gray-400">open + offer + backlog</p>
          </div>
          )}
        </div>
      )}

      {/* Manual FCT vs Auto */}
      {!hiddenSections.includes('fct') && manualFct && (
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-2">
            Manual FCT vs Auto Forecast
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">Manual FCT ({manualFct.cycle})</p>
              <p className="text-xl font-bold text-blue-700">{formatK(manualFct.total)}</p>
              <p className="text-micro text-gray-400">
                {manualFct.date ? new Date(manualFct.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) : ''}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">Auto Forecast</p>
              <p className="text-xl font-bold text-gray-700">{formatK(pipeline.vgt + pipeline.ect)}</p>
              <p className="text-micro text-gray-400">from deals pipeline</p>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Revenue */}
      {!hiddenSections.includes('recurring') && (
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
            <RefreshCw size={12}/> Recurring Business (SLA)
          </p>
          <div className={`grid gap-3 ${!selectedBU ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">{selectedBU || 'Consolidated'} ARR</p>
              <p className="text-xl font-bold text-green-600">{formatK(selectedBU === 'VGT' ? (slaStats.byBU?.VGT || 0) : selectedBU === 'ECT' ? (slaStats.byBU?.ECT || 0) : (slaStats.byBU?.total || slaStats.activeValue))}</p>
              <p className="text-micro text-gray-400">{slaStats.active} contracts</p>
            </div>
            {showVGT && !selectedBU && (
            <div className="bg-teal-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">VGT</p>
              <p className="text-lg font-bold text-vgt">{formatK(slaStats.byBU?.VGT || 0)}</p>
              <p className="text-micro text-gray-400">recurring/yr</p>
            </div>
            )}
            {showECT && !selectedBU && (
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">ECT</p>
              <p className="text-lg font-bold text-ect">{formatK(slaStats.byBU?.ECT || 0)}</p>
              <p className="text-micro text-gray-400">recurring/yr</p>
            </div>
            )}
            {!selectedBU && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">CWM</p>
              <p className="text-lg font-bold text-blue-600">{formatK(slaStats.byBU?.CWM || 0)}</p>
              <p className="text-micro text-gray-400">cross-market</p>
            </div>
            )}
          </div>
          {slaStats.pipelineValue > 0 && (
            <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-between">
              <p className="text-micro text-gray-500">SLA Pipeline</p>
              <p className="text-sm font-bold text-gray-600">{formatK(slaStats.pipelineValue)}</p>
            </div>
          )}
          {Object.keys(slaStats.revenueByFY).length > 0 && (
            <div>
              <p className="text-micro text-gray-400 mb-1">Projected by Fiscal Year</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {['FY26','FY27','FY28','FY29','FY30','FY31'].map(fy => (
                  <div key={fy} className={`text-center rounded p-1.5 ${slaStats.revenueByFY[fy] ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className="text-[9px] text-gray-400 font-medium">{fy}</p>
                    <p className="text-xs font-bold text-gray-700">{slaStats.revenueByFY[fy] ? formatK(slaStats.revenueByFY[fy]) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simple explainer */}
      <div className="card p-4 bg-gray-50 border-dashed">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">How to read this:</strong> the gauges compare Invoiced actuals to the Budget for the same months (FY26 year-to-date).
          Colour reflects performance against target — red &lt; 70%, amber 70–95%, green ≥ 95%.
          The pill below each gauge is the delta versus the same period last year.
          Switch to the Classic view any time using the toggle in the header.
        </p>
      </div>
    </div>
  )
}
