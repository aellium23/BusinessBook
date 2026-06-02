import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { formatK, Spinner } from '../ui'
import { MONTHS_K, WEIGHTS } from '../../constants'
import { Target, TrendingUp, ChevronRight } from 'lucide-react'

function ProgressRing({ pct, color, size = 72 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.min(Math.max(pct, 0) / 100, 1) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    </svg>
  )
}

export default function MemberDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { deals: allDeals, loading: dealsLoading } = useDeals()
  const [quota, setQuota] = useState(null)
  const [overlays, setOverlays] = useState([])
  const [overlayLines, setOverlayLines] = useState([])
  const [loading, setLoading] = useState(true)

  const myName = profile?.sales_owner_name || profile?.full_name || ''
  const myBU = profile?.bu || 'VGT'

  // Load quota + overlay rules
  useEffect(() => {
    if (!myName) return
    Promise.all([
      supabase.from('quotas').select('*').eq('bu', myBU).eq('sales_owner', myName).limit(1),
      supabase.from('sales_overlays').select('*').eq('bu', myBU).eq('target_owner', myName)
        .eq('active', true).eq('fiscal_year', 2026),
    ]).then(([qRes, oRes]) => {
      setQuota(qRes.data?.[0] || null)
      setOverlays(oRes.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [myName, myBU])

  // Load deal_products for overlay matching (need product names per deal)
  useEffect(() => {
    if (overlays.length === 0) { setOverlayLines([]); return }
    const sourceOwners = [...new Set(overlays.map(o => o.source_owner))]
    const overlayDeals = allDeals.filter(d => sourceOwners.includes(d.sales_owner) && d.bu === myBU)
    if (overlayDeals.length === 0) { setOverlayLines([]); return }
    const ids = overlayDeals.map(d => d.id)
    supabase.from('deal_products').select('deal_id, product_name, product:product_id(name)')
      .in('deal_id', ids)
      .then(({ data }) => setOverlayLines(data || []))
      .catch(() => {})
  }, [overlays, allDeals, myBU])

  // My own deals
  const myDeals = useMemo(() =>
    allDeals.filter(d => d.sales_owner === myName && !d.is_intercompany_mirror),
  [allDeals, myName])

  // Overlay credit deals (other reps' deals that credit to me, by product match)
  const overlayDeals = useMemo(() => {
    if (overlays.length === 0) return []
    const result = []
    for (const ov of overlays) {
      const prods = Array.isArray(ov.products) ? ov.products.map(p => p.toLowerCase()) : []
      const sourceDealIds = allDeals
        .filter(d => d.sales_owner === ov.source_owner && d.bu === myBU && !d.is_intercompany_mirror)
        .map(d => d.id)
      for (const did of sourceDealIds) {
        if (prods.length === 0) {
          // All products → full deal credited
          const deal = allDeals.find(d => d.id === did)
          if (deal) result.push({ deal, sharePct: ov.share_pct, source: ov.source_owner })
        } else {
          // Only deals containing matching products
          const dealProds = overlayLines.filter(l => l.deal_id === did)
          const hasMatch = dealProds.some(l => {
            const pName = (l.product?.name || l.product_name || '').toLowerCase()
            return prods.some(p => pName.includes(p))
          })
          if (hasMatch) {
            const deal = allDeals.find(d => d.id === did)
            if (deal) result.push({ deal, sharePct: ov.share_pct, source: ov.source_owner })
          }
        }
      }
    }
    return result
  }, [allDeals, overlays, overlayLines, myBU])

  // Compute stats
  const stats = useMemo(() => {
    const compute = (deals) => {
      let pipeline = 0, backlog = 0, invoiced = 0
      for (const d of deals) {
        const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
        const val = fy26 || Number(d.value_total) || 0
        if (['Lead', 'Pipeline', 'Offer Presented'].includes(d.stage)) pipeline += val
        else if (d.stage === 'BackLog') backlog += val
        else if (d.stage === 'Invoiced') invoiced += val
      }
      return { pipeline, backlog, invoiced, forecast: backlog + invoiced }
    }
    const own = compute(myDeals)
    // Add overlay credits
    let ovPipeline = 0, ovBacklog = 0, ovInvoiced = 0
    for (const { deal, sharePct } of overlayDeals) {
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(deal[m]) || 0), 0)
      const val = (fy26 || Number(deal.value_total) || 0) * (sharePct / 100)
      if (['Lead', 'Pipeline', 'Offer Presented'].includes(deal.stage)) ovPipeline += val
      else if (deal.stage === 'BackLog') ovBacklog += val
      else if (deal.stage === 'Invoiced') ovInvoiced += val
    }
    return {
      pipeline: own.pipeline + ovPipeline,
      backlog: own.backlog + ovBacklog,
      invoiced: own.invoiced + ovInvoiced,
      forecast: own.backlog + own.invoiced + ovBacklog + ovInvoiced,
      ownDeals: myDeals.length,
      overlayDeals: overlayDeals.length,
    }
  }, [myDeals, overlayDeals])

  const target = Number(quota?.target_eur) || 0
  const actPct = target > 0 ? Math.round(stats.invoiced / target * 100) : 0
  const fcPct  = target > 0 ? Math.round(stats.forecast / target * 100) : 0
  const COLOR = myBU === 'ECT' ? '#D85A30' : '#1D9E75'

  if (dealsLoading || loading) return <Spinner/>

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Target card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">FY26 Target</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {target > 0 ? formatK(target) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{myName} · {myBU}</p>
          </div>
          {target > 0 && <ProgressRing pct={actPct} color={COLOR} size={72}/>}
        </div>

        {target > 0 && (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-600">Invoiced</span>
                <span className="font-bold" style={{color: COLOR}}>{formatK(stats.invoiced)} · {actPct}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{width: `${Math.min(actPct,100)}%`, background: COLOR}}/>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-600">Forecast (BL + Inv)</span>
                <span className="font-bold text-blue-600">{formatK(stats.forecast)} · {fcPct}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{width: `${Math.min(fcPct,100)}%`}}/>
              </div>
            </div>
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Gap to target: <span className="font-semibold text-gray-600">{formatK(Math.max(0, target - stats.forecast))}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => navigate('/deals')} className="bg-amber-50 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">
          <p className="text-[10px] text-amber-600 font-semibold uppercase">Pipeline</p>
          <p className="text-lg font-bold text-amber-800">{formatK(stats.pipeline)}</p>
        </button>
        <button onClick={() => navigate('/deals')} className="bg-purple-50 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">
          <p className="text-[10px] text-purple-600 font-semibold uppercase">BackLog</p>
          <p className="text-lg font-bold text-purple-800">{formatK(stats.backlog)}</p>
        </button>
        <button onClick={() => navigate('/deals')} className="bg-green-50 rounded-xl p-3 text-center hover:shadow-sm transition-shadow">
          <p className="text-[10px] text-green-600 font-semibold uppercase">Invoiced</p>
          <p className="text-lg font-bold text-green-800">{formatK(stats.invoiced)}</p>
        </button>
      </div>

      {/* Overlay credits */}
      {overlayDeals.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-700">
            <TrendingUp size={12} className="inline mr-1"/> Overlay credits: {overlayDeals.length} deal{overlayDeals.length > 1 ? 's' : ''}
          </p>
          <p className="text-[10px] text-blue-600">
            {[...new Set(overlayDeals.map(o => o.source))].join(', ')} deals
            credited to your numbers (product overlay).
          </p>
        </div>
      )}

      {/* Quick deal list */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase">
          Your deals ({stats.ownDeals})
        </p>
        {myDeals.slice(0, 8).map(d => {
          const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
          const val = fy26 || Number(d.value_total) || 0
          return (
            <button key={d.id} onClick={() => navigate(`/deals?client=${encodeURIComponent(d.client)}`)}
              className="w-full text-left flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-navy transition-colors">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{d.client}</p>
                <p className="text-[10px] text-gray-400">{d.stage} · {d.country}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-bold text-gray-800">{formatK(val)}</span>
                <ChevronRight size={12} className="text-gray-300"/>
              </div>
            </button>
          )
        })}
        {myDeals.length > 8 && (
          <button onClick={() => navigate('/deals')} className="text-xs text-blue-600 hover:text-blue-800 w-full text-center py-1">
            View all {myDeals.length} deals →
          </button>
        )}
      </div>
    </div>
  )
}
