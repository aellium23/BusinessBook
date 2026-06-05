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

// ── Distributor Dashboard ─────────────────────────────────────────────────
function DistributorDashboard() {
  const { profile, company } = useAuth()
  const { t } = useTranslation()
  const { deals: allDeals, loading } = useDeals()
  const [quota, setQuota] = useState(null)

  const companyId = profile?.company_id

  // Load distributor's sales target
  useEffect(() => {
    if (!companyId) return
    supabase.from('quotas').select('*').eq('company_id', companyId).limit(1)
      .then(({ data }) => { if (data?.length) setQuota(data[0]) })
      .catch(() => {})
  }, [companyId])

  // Filter deals for this distributor
  const myDeals = useMemo(() =>
    allDeals.filter(d => d.company_id === companyId),
    [allDeals, companyId]
  )

  // Pipeline value (Lead + Pipeline + Offer Presented + BackLog)
  const pipelineValue = useMemo(() =>
    myDeals
      .filter(d => ['Lead','Pipeline','Offer Presented','BackLog'].includes(d.stage))
      .reduce((s, d) => s + (Number(d.value_total) || 0), 0),
    [myDeals]
  )

  // Actuals: Invoiced deals, sum of monthly columns
  const ytdKeys = useMemo(() => MONTHS_K.slice(0, ((new Date().getMonth() + 1 - 4 + 12) % 12) + 1), [])
  const actuals = useMemo(() =>
    myDeals
      .filter(d => d.stage === 'Invoiced')
      .reduce((s, d) => s + ytdKeys.reduce((ms, m) => ms + (Number(d[m]) || 0), 0), 0),
    [myDeals, ytdKeys]
  )

  // Forecast: Invoiced + BackLog
  const forecast = useMemo(() =>
    myDeals
      .filter(d => ['Invoiced','BackLog'].includes(d.stage))
      .reduce((s, d) => s + ytdKeys.reduce((ms, m) => ms + (Number(d[m]) || 0), 0), 0),
    [myDeals, ytdKeys]
  )

  // Stage breakdown
  const stageCounts = useMemo(() => {
    const counts = {}
    myDeals.forEach(d => { counts[d.stage] = (counts[d.stage] || 0) + 1 })
    return counts
  }, [myDeals])

  const target = quota?.target_eur || 0
  const actPct = target > 0 ? Math.round(actuals / target * 100) : 0
  const fcPct = target > 0 ? Math.round(forecast / target * 100) : 0

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* Company header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-navy/10 text-navy flex items-center justify-center text-lg font-bold">
          {(company?.name || profile?.full_name || '?')[0]}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {company?.name || 'My Dashboard'}
          </h2>
          <p className="text-xs text-gray-400">
            FY26 YTD {company?.default_currency && company.default_currency !== 'EUR'
              ? `(${company.default_currency})`
              : ''}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-micro text-gray-500">Pipeline</p>
          <p className="text-xl font-bold text-navy mt-1">{formatK(pipelineValue)}</p>
          <p className="text-micro text-gray-400">{myDeals.filter(d => !['Invoiced','Lost'].includes(d.stage)).length} deals</p>
        </div>
        <div className="card p-4">
          <p className="text-micro text-gray-500">Invoiced YTD</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatK(actuals)}</p>
          <p className="text-micro text-gray-400">{stageCounts['Invoiced'] || 0} deals</p>
        </div>
        <div className="card p-4">
          <p className="text-micro text-gray-500">Forecast YTD</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{formatK(forecast)}</p>
          <p className="text-micro text-gray-400">Invoiced + BackLog</p>
        </div>
        <div className="card p-4">
          <p className="text-micro text-gray-500">Total Deals</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{myDeals.length}</p>
          <p className="text-micro text-gray-400">all stages</p>
        </div>
      </div>

      {/* Target vs Actuals */}
      {target > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-gray-400"/>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sales Target FY26
            </p>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">{formatK(target)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Annual target</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold" style={{ color: actPct >= 95 ? '#16A34A' : actPct >= 70 ? '#D97706' : '#DC2626' }}>
                {actPct}%
              </p>
              <p className="text-micro text-gray-400">achieved</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Actuals</span>
                <span className="font-medium">{formatK(actuals)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all bg-green-500"
                  style={{ width: `${Math.min(actPct, 100)}%` }}/>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Forecast</span>
                <span className="font-medium">{formatK(forecast)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all bg-blue-400"
                  style={{ width: `${Math.min(fcPct, 100)}%` }}/>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Gap to target: <span className="font-semibold text-gray-600">{formatK(Math.max(0, target - forecast))}</span>
            </p>
          </div>
        </div>
      )}

      {!target && (
        <div className="card p-6 text-center bg-gray-50 border-dashed">
          <Target size={24} className="mx-auto text-gray-300 mb-2"/>
          <p className="text-sm text-gray-500">No sales target set for your company yet.</p>
          <p className="text-xs text-gray-400 mt-1">Contact your account manager to set a target.</p>
        </div>
      )}

      {/* Stage breakdown */}
      {myDeals.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-3">
            <TrendingUp size={12}/> Pipeline by Stage
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost'].map(stage => {
              const count = stageCounts[stage] || 0
              const value = myDeals.filter(d => d.stage === stage).reduce((s,d) => s + (Number(d.value_total)||0), 0)
              if (count === 0) return null
              const colors = {
                Lead: 'bg-gray-50 text-gray-700',
                Pipeline: 'bg-blue-50 text-blue-700',
                'Offer Presented': 'bg-purple-50 text-purple-700',
                BackLog: 'bg-amber-50 text-amber-700',
                Invoiced: 'bg-green-50 text-green-700',
                Lost: 'bg-red-50 text-red-700',
              }
              return (
                <div key={stage} className={`rounded-lg p-2.5 ${colors[stage]}`}>
                  <p className="text-micro font-medium">{stage}</p>
                  <p className="text-sm font-bold mt-0.5">{formatK(value)}</p>
                  <p className="text-micro opacity-60">{count} deal{count !== 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
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
  // Actuals source: 'BB' = sum of invoiced deals (CRM) · 'SAP' = budget ACT cycle (official P&L)
  const [source, setSource] = useState('BB')

  useEffect(() => {
    supabase.from('budget').select('*')
      .then(({ data }) => setBudget(data || []))
      .catch(() => {})
    supabase.from('accounts').select('id, client_type')
      .then(({ data }) => {
        if (data) setAccountTypes(Object.fromEntries(data.map(a => [a.id, a.client_type])))
      }).catch(() => {})
    supabase.from('fy25_actuals').select('*')
      .then(({ data }) => setFy25(data || []))
      .catch(() => {})
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

  // SAP actuals: budget ACT cycle (ns_ext + ns_int per BU, YTD only, thousands → EUR)
  const sapActuals = useMemo(() => {
    function bucketFor(bu, plKey) {
      const row = budget.find(r => r.bu === bu && r.cycle === 'ACT' && r.pl_key === plKey)
      return row ? sumMonthly(row, ytdKeys) * K : 0
    }
    return {
      vgt_ext: bucketFor('VGT', 'ns_ext'), vgt_int: bucketFor('VGT', 'ns_int'),
      ect_ext: bucketFor('ECT', 'ns_ext'), ect_int: bucketFor('ECT', 'ns_int'),
    }
  }, [budget, ytdKeys])
  const hasSap = sapActuals.vgt_ext || sapActuals.vgt_int || sapActuals.ect_ext || sapActuals.ect_int

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

  // Pick the actual value for the active source, but always keep both for the gap line
  const val = (k) => source === 'SAP' ? sapActuals[k] : actuals[k]

  const gauges = []
  if (showVGT) {
    gauges.push({
      key: 'vgt-ext', label: 'VGT · External', subLabel: 'Sales to distributors',
      value: val('vgt_ext'), bb: actuals.vgt_ext, sap: sapActuals.vgt_ext, forecast: forecastYTD.vgt_ext,
      target: budgetData.vgt_ext_ytd, py: priorYear.vgt_ext,
    })
    gauges.push({
      key: 'vgt-int', label: 'VGT · Internal', subLabel: 'Intercompany (to ECT)',
      value: val('vgt_int'), bb: actuals.vgt_int, sap: sapActuals.vgt_int, forecast: forecastYTD.vgt_int,
      target: budgetData.vgt_int_ytd, py: priorYear.vgt_int,
    })
  }
  if (showECT) {
    gauges.push({
      key: 'ect-ext', label: 'ECT · External', subLabel: 'Sales to customers',
      value: val('ect_ext'), bb: actuals.ect_ext, sap: sapActuals.ect_ext, forecast: forecastYTD.ect_ext,
      target: budgetData.ect_ext_ytd, py: priorYear.ect_ext,
    })
  }
  if (isAdmin && showIberia) {
    const ib_bb       = actuals.vgt_ext + actuals.ect_ext
    const ib_sap      = sapActuals.vgt_ext + sapActuals.ect_ext
    const ib_forecast = forecastYTD.vgt_ext + forecastYTD.ect_ext
    const ib_budget   = budgetData.vgt_ext_ytd + budgetData.ect_ext_ytd
    const ib_py       = priorYear.vgt_ext + priorYear.ect_ext
    gauges.push({
      key: 'iberia', label: 'Iberia · External', subLabel: 'VGT + ECT consolidated',
      value: source === 'SAP' ? ib_sap : ib_bb, bb: ib_bb, sap: ib_sap,
      forecast: ib_forecast, target: ib_budget, py: ib_py,
      color: '#0D2137',
    })
  }

  if (loading) return <Spinner />

  // Distributors see a simplified dashboard focused on their own pipeline & targets
  if (profile?.role === 'distributor') {
    return <DistributorDashboard />
  }

  return (
    <div className="space-y-6">
      {/* Sales vs Budget */}
      {(
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-gray-400"/>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('dash_sales_vs_budget') || 'Sales vs Budget'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {/* Actuals source toggle: BB (CRM deals) vs SAP (official P&L) */}
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg" title="Source of the actual sales values">
              {['BB', 'SAP'].map(s => (
                <button key={s} onClick={() => setSource(s)} disabled={s === 'SAP' && !hasSap}
                  className={`text-micro font-semibold px-2 py-0.5 rounded-md transition-colors ${
                    source === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
                  } ${s === 'SAP' && !hasSap ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  {s}
                </button>
              ))}
            </div>
            <span className="text-micro text-gray-400">FY26 YTD · cycle {cycle}</span>
          </div>
        </div>
        {/* Color legend */}
        <div className="flex flex-wrap gap-3 text-micro text-gray-500 mb-3">
          <span className="flex items-center gap-1">🟢 ≥95% of target</span>
          <span className="flex items-center gap-1">🟡 70–95%</span>
          <span className="flex items-center gap-1">🔴 &lt;70%</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {gauges.map(g => {
            const gap = (g.sap || 0) - (g.bb || 0)
            return (
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
              {/* Dual-source line — surfaces deals missing in the CRM (SAP − BB gap) */}
              {hasSap && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-micro">
                  <span className={source === 'SAP' ? 'text-gray-400' : 'font-semibold text-gray-700'}>BB {formatK(g.bb || 0)}</span>
                  <span className={source === 'BB' ? 'text-gray-400' : 'font-semibold text-gray-700'}>SAP {formatK(g.sap || 0)}</span>
                  {Math.abs(gap) >= 1000 && (
                    <span className={`px-1 rounded ${gap > 0 ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}
                      title="SAP − BB: positive = sales in SAP not yet tracked as deals in the CRM">
                      {gap > 0 ? '▲' : '▼'}{formatK(Math.abs(gap))}
                    </span>
                  )}
                </div>
              )}
            </div>
          )})}
        </div>
        {gauges.some(g => g.target === 0) && (
          <p className="mt-2 text-micro text-gray-400 flex items-center gap-1">
            <AlertCircle size={10}/> Gauges with no target shown as 0% — add the budget cycle to fill them in.
          </p>
        )}
        {/* Explainer — right below the gauge grid */}
        <div className="card p-4 bg-gray-50 border-dashed mt-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">How to read this:</strong> the gauges compare actuals to the Budget for the same months (FY26 year-to-date).
            Use the <strong>BB / SAP</strong> toggle to switch the actuals source — <strong>BB</strong> sums invoiced deals from the CRM, <strong>SAP</strong> uses the official P&amp;L (budget ACT cycle).
            The BB / SAP line under each gauge shows both, and the ▲ gap flags sales booked in SAP but not yet tracked as deals in the CRM.
            Colour reflects performance against target — red &lt; 70%, amber 70–95%, green ≥ 95%.
          </p>
        </div>
      </div>
      )}

      {/* Public vs Private */}
      {(publicPrivate.total_pipe > 0 || publicPrivate.total_inv > 0) && (
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
      {(
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
      {manualFct && (
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
      {(
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
            <RefreshCw size={12}/> ARR
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">{selectedBU || 'Consolidated'} ARR</p>
              <p className="text-xl font-bold text-green-600">{formatK(selectedBU === 'VGT' ? (slaStats.byBU?.VGT || 0) : selectedBU === 'ECT' ? (slaStats.byBU?.ECT || 0) : (slaStats.byBU?.total || slaStats.activeValue))}</p>
              <p className="text-micro text-gray-400">{slaStats.active} contracts</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-micro text-gray-500">SLA Pipeline</p>
              <p className="text-xl font-bold text-gray-600">{formatK(slaStats.pipelineValue)}</p>
              <a href="/sla" className="text-micro text-blue-600 hover:underline">{t('dash_view_contracts') || 'View contracts →'}</a>
            </div>
          </div>
        </div>
      )}

      {/* Explainer moved to right below gauges section */}
    </div>
  )
}
