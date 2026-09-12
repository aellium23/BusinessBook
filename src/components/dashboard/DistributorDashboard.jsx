import { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatK } from '../ui'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { useTranslation } from '../../hooks/useTranslation'
import { useLoadFailures, LoadFailureBanner } from '../../hooks/useLoadFailures'
import { MONTHS_K } from '../../constants'
import { openRequestsFor } from '../../lib/discountRequests'
import { ArrowLeftRight, Hourglass, ChevronRight } from 'lucide-react'

// ── Dashboard do Distribuidor ─────────────────────────────────────────────────
export default function DistributorDashboard({ deals, profile }) {
  const { t } = useTranslation()
  // A target that fails to load leaves the gauge at nothing, which a partner
  // reads as "no target has been set for me".
  const { failed, load, fail } = useLoadFailures()
  const navigate = useNavigate()
  // null = nobody has set one; a number = the target. Not the same thing.
  const [quotaTarget, setQuotaTarget] = useState(null)
  const [requests, setRequests] = useState([])

  // Discounts still in flight. Until now a counter-offer only appeared inside
  // one deal's full card, which is the one place a distributor does not look on
  // the way in: the answer to a question they asked waited for them to go and
  // find it.
  useEffect(() => {
    let alive = true
    if (!profile?.id) return
    openRequestsFor(profile.id).then(({ data }) => { if (alive) setRequests(data || []) })
    return () => { alive = false }
  }, [profile?.id])

  // The two directions are kept apart on purpose. A counter-offer is the
  // distributor's move; a pending request is ours. Counting them together says
  // four things are outstanding when only one of them can be acted on.
  const mine = useMemo(() => requests.filter(r => r.status === 'counter'), [requests])
  const ours = useMemo(() => requests.filter(r => r.status === 'pending'), [requests])

  // The target, newest year first. It used to take whichever row came back
  // first, which is a coin toss once there is more than one year of them.
  //
  // `null` and `0` are kept apart on purpose: no row at all means nobody has
  // set a target, and saying "0" for that reads as a target of zero — which the
  // gauge below would then report as gloriously exceeded.
  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('quotas')
      .select('target_eur, fiscal_year')
      .eq('company_id', profile.company_id)
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .then(load(t('lf_quota'), data => {
        const row = data?.[0]
        setQuotaTarget(row && row.target_eur != null ? Number(row.target_eur) : null)
      }))
      .catch(fail(t('lf_quota')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // Agregados dos deals deste distribuidor
  const stats = useMemo(() => {
    const active = deals.filter(d => !d.is_intercompany_mirror)
    const rate = d => (!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1)
    const fyVal = d => {
      const raw = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      return ((raw === 0 && Number(d.value_total) > 0) ? Number(d.value_total) : raw) * rate(d)
    }

    const invoiced = active.filter(d => d.stage === 'Invoiced')
    const backlog  = active.filter(d => d.stage === 'BackLog')
    const pipeline = active.filter(d => !['Invoiced','BackLog','Lost','Cancelled'].includes(d.stage))
    const lost     = active.filter(d => d.stage === 'Lost')

    const actuals  = invoiced.reduce((s, d) => s + fyVal(d), 0)
    const fc       = [...invoiced, ...backlog].reduce((s, d) => s + fyVal(d), 0)
    // Valued the same way as every other screen: the monthly columns, falling
    // back to the total only where there is no monthly spread. This read
    // value_total alone, so a deal with a schedule was worth one figure here
    // and another in Deals, and neither said which was wrong.
    const pipeVal  = pipeline.reduce((s, d) => s + fyVal(d), 0)

    // Clientes únicos
    const clients = [...new Set(active.map(d => d.client).filter(Boolean))]

    // Top produto
    const products = {}
    active.forEach(d => { if (d.product) products[d.product] = (products[d.product]||0) + 1 })
    const topProduct = Object.entries(products).sort((a,b)=>b[1]-a[1])[0]?.[0]

    return { actuals, fc, pipeVal, clients, topProduct,
             invoicedCount: invoiced.length, backlogCount: backlog.length,
             pipelineCount: pipeline.length, lostCount: lost.length,
             totalDeals: active.length }
  }, [deals])

  const hasTarget = quotaTarget != null && quotaTarget > 0
  const quotaPct = hasTarget ? Math.min(Math.round(stats.actuals / quotaTarget * 100), 100) : 0
  const fcPct    = hasTarget ? Math.min(Math.round(stats.fc / quotaTarget * 100), 100) : 0

  // Dados mensais para o gráfico
  const monthlyData = useMemo(() => {
    return MONTHS_K.map((m, i) => {
      const actuals = deals
        .filter(d => d.stage === 'Invoiced' && !d.is_intercompany_mirror)
        .reduce((s, d) => {
          const rate = (!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1)
          return s + (Number(d[m]) || 0) * rate / 1000
        }, 0)
      return {
        month: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'][i],
        actuals: Math.round(actuals * 10) / 10,
        target: quotaTarget > 0 ? Math.round(quotaTarget / 12 / 1000 * 10) / 10 : 0,
      }
    })
  }, [deals, quotaTarget])

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">

      <LoadFailureBanner failed={failed} t={t} />

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('dist_dash_subtitle')}</p>
      </div>

      {/* What is waiting, and on whom. Silent when there is nothing open. */}
      {mine.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
            <ArrowLeftRight size={14}/>
            {mine.length === 1
              ? t('dist_counter_one')
              : `${mine.length} ${t('dist_counter_many')}`}
          </p>
          <p className="text-micro text-amber-700 mt-0.5">{t('dist_counter_hint')}</p>
          <div className="mt-2 space-y-1">
            {mine.slice(0, 3).map(r => (
              <button key={r.id} type="button"
                onClick={() => navigate(`/deals?deal=${r.deal_id}`)}
                className="w-full flex items-center gap-2 text-left bg-white border border-amber-200
                           rounded-lg px-2.5 py-1.5 hover:bg-amber-50">
                <span className="min-w-0 flex-1 truncate text-xs text-gray-800">
                  {r.deals?.client || t('dist_no_client')}
                </span>
                <span className="text-micro text-gray-500 shrink-0">
                  {t('dist_asked')} {Number(r.requested_pct)}%
                </span>
                <span className="text-xs font-bold text-amber-800 shrink-0">
                  → {Number(r.approved_pct)}%
                </span>
                <ChevronRight size={14} className="text-amber-400 shrink-0"/>
              </button>
            ))}
            {mine.length > 3 && (
              <button type="button" onClick={() => navigate('/approvals')}
                className="text-micro text-amber-800 underline">
                {t('dist_see_all')}
              </button>
            )}
          </div>
        </div>
      )}

      {ours.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50
                        border border-gray-200 rounded-lg px-3 py-2">
          <Hourglass size={14} className="text-gray-400 shrink-0"/>
          <span className="min-w-0">
            {ours.length === 1
              ? t('dist_pending_one')
              : `${ours.length} ${t('dist_pending_many')}`}
          </span>
          <button type="button" onClick={() => navigate('/approvals')}
            className="ml-auto text-micro underline shrink-0">{t('dist_see_all')}</button>
        </div>
      )}

      {/* KPI Cards principais */}
      <div className="grid grid-cols-2 gap-3">

        {/* Actuals vs Target */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t('dist_actuals_target')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatK(stats.actuals)}</p>
              <p className="text-sm text-gray-400">
                {hasTarget
                  ? `${t('dist_of_target')} ${formatK(quotaTarget)}`
                  : t('dist_no_target')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">{t('dash_forecast')}</p>
              <p className="text-lg font-bold text-navy">{formatK(stats.fc)}</p>
              {hasTarget && <p className="text-xs text-gray-400">{fcPct}% {t('dist_of_target')}</p>}
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-micro text-gray-400">
              <span>Actuals ({quotaPct}%)</span>
              <span>Forecast ({fcPct}%)</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="h-full rounded-full bg-green-400 transition-all"
                style={{width: `${fcPct}%`}}/>
              <div className="h-full rounded-full bg-green-600 absolute top-0 left-0 transition-all"
                style={{width: `${quotaPct}%`}}/>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('dist_pipeline')}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatK(stats.pipeVal)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{stats.pipelineCount} {t('dist_active_deals')}</p>
        </div>

        {/* Clientes */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('dist_clients')}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.clients.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('dist_active_clients')}</p>
        </div>
      </div>

      {/* Funil de deals */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">{t('dist_deal_status')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Invoiced', count: stats.invoicedCount, color: '#1D9E75', bg: '#F0FDF9' },
            { label: 'BackLog',  count: stats.backlogCount,  color: '#185FA5', bg: '#E6F1FB' },
            { label: 'Pipeline', count: stats.pipelineCount, color: '#B45309', bg: '#FEF3C7' },
            { label: 'Lost',     count: stats.lostCount,     color: '#6B7280', bg: '#F3F4F6' },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className="text-center rounded-lg p-2.5" style={{ background: bg }}>
              <p className="text-lg font-bold" style={{ color }}>{count}</p>
              <p className="text-micro font-medium" style={{ color }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico mensal */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">{t('dist_monthly')}</p>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={monthlyData} margin={{top:5,right:5,bottom:0,left:0}}>
            <XAxis dataKey="month" tick={{fontSize:10}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false} width={30}/>
            <Tooltip formatter={(v) => [`${v}K€`]} contentStyle={{fontSize:11,borderRadius:8}}/>
            <Bar dataKey="actuals" fill="#1D9E75" radius={[3,3,0,0]} name="Actuals"/>
            {hasTarget && (
              <Line dataKey="target" stroke="#185FA5" strokeWidth={1.5}
                strokeDasharray="4 2" dot={false} name="Target"/>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Top produto */}
      {stats.topProduct && (
        <div className="bg-navy/5 rounded-xl border border-navy/10 p-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-navy rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">★</span>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t('dist_top_product')}</p>
            <p className="text-sm font-bold text-gray-900">{stats.topProduct}</p>
          </div>
        </div>
      )}

    </div>
  )
}
