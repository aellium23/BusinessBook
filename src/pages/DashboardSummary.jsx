import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDeals } from '../hooks/useDeals'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner, formatK } from '../components/ui'
import Gauge from '../components/Gauge'
import { MONTHS_K } from '../constants'
import { TrendingUp, Target, AlertCircle } from 'lucide-react'

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

export default function DashboardSummary() {
  const { profile, isAdmin } = useAuth()
  const { t }                = useTranslation()
  const { deals, loading }   = useDeals()
  const [budget, setBudget]  = useState([])
  const [fy25, setFy25]      = useState([])

  useEffect(() => {
    supabase.from('budget').select('*')
      .then(({ data }) => setBudget(data || []))
      .catch(e => console.warn('budget:', e?.message))
    supabase.from('fy25_actuals').select('*')
      .then(({ data }) => setFy25(data || []))
      .catch(e => console.warn('fy25:', e?.message))
  }, [])

  const cycle = useMemo(() => activeCycleNow(), [])

  // YTD month keys (FY starts in April)
  const ytdKeys = useMemo(() => MONTHS_K.slice(0, fyMonthsElapsed()), [])

  // Budget: ns_ext + ns_int per BU (YTD only)
  const budgetData = useMemo(() => {
    function bucketFor(bu, plKey) {
      const row = budget.find(r => r.bu === bu && r.cycle === cycle && r.pl_key === plKey)
      if (!row) return 0
      return sumMonthly(row, ytdKeys)
    }
    return {
      vgt_ext_ytd: bucketFor('VGT', 'ns_ext'),
      vgt_int_ytd: bucketFor('VGT', 'ns_int'),
      ect_ext_ytd: bucketFor('ECT', 'ns_ext'),
      ect_int_ytd: bucketFor('ECT', 'ns_int'),
    }
  }, [budget, cycle, ytdKeys])

  // Actuals: sum of invoiced deals' monthly columns, YTD, by BU + sales_type
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

  // Prior year (FY25) for the same months
  const priorYear = useMemo(() => {
    const result = { vgt_ext: 0, vgt_int: 0, ect_ext: 0, ect_int: 0 }
    for (const r of fy25) {
      const ytd = sumMonthly(r, ytdKeys)
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

  // Build gauge list for the role
  const showVGT = isAdmin || profile?.bu === 'VGT'
  const showECT = isAdmin || profile?.bu === 'ECT'

  const gauges = []
  if (showVGT) {
    gauges.push({
      key: 'vgt-ext', label: 'VGT · External', subLabel: 'Sales to distributors',
      value: actuals.vgt_ext, target: budgetData.vgt_ext_ytd, py: priorYear.vgt_ext,
    })
    gauges.push({
      key: 'vgt-int', label: 'VGT · Internal', subLabel: 'Intercompany (to ECT)',
      value: actuals.vgt_int, target: budgetData.vgt_int_ytd, py: priorYear.vgt_int,
    })
  }
  if (showECT) {
    gauges.push({
      key: 'ect-ext', label: 'ECT · External', subLabel: 'Sales to customers',
      value: actuals.ect_ext, target: budgetData.ect_ext_ytd, py: priorYear.ect_ext,
    })
  }
  // Consolidated Iberia only for admins
  if (isAdmin) {
    const ib_actuals = actuals.vgt_ext + actuals.ect_ext
    const ib_budget  = budgetData.vgt_ext_ytd + budgetData.ect_ext_ytd
    const ib_py      = priorYear.vgt_ext + priorYear.ect_ext
    gauges.push({
      key: 'iberia', label: 'Iberia · External', subLabel: 'VGT + ECT consolidated',
      value: ib_actuals, target: ib_budget, py: ib_py, color: '#0D2137',
    })
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Hero: Sales vs Budget YTD */}
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

      {/* Pipeline snapshot */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <TrendingUp size={12}/> VGT pipeline
            </p>
            <p className="text-2xl font-bold text-vgt mt-1">{formatK(pipeline.vgt)}</p>
            <p className="text-micro text-gray-400">open + offer + backlog</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <TrendingUp size={12}/> ECT pipeline
            </p>
            <p className="text-2xl font-bold text-ect mt-1">{formatK(pipeline.ect)}</p>
            <p className="text-micro text-gray-400">open + offer + backlog</p>
          </div>
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
