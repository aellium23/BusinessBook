import { useMemo, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatK } from '../ui'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { useTranslation } from '../../hooks/useTranslation'

// ── Dashboard do Distribuidor ─────────────────────────────────────────────────
export default function DistributorDashboard({ deals, profile }) {
  const { t } = useTranslation()
  const [quotaTarget, setQuotaTarget] = useState(0)

  // Carregar o target do distribuidor
  useEffect(() => {
    if (profile?.company_id) {
      supabase.from('quotas')
        .select('target_eur')
        .eq('company_id', profile.company_id)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0 && data[0].target_eur) setQuotaTarget(Number(data[0].target_eur))
        })
        .catch(() => {})
    }
  }, [profile])

  const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

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
    const pipeVal  = pipeline.reduce((s, d) => s + (Number(d.value_total) || 0) * rate(d), 0)

    // Clientes únicos
    const clients = [...new Set(active.map(d => d.client).filter(Boolean))]

    // Wins este ano
    const winRate = active.filter(d => ['Invoiced','BackLog','Lost'].includes(d.stage)).length > 0
      ? Math.round(invoiced.length / active.filter(d => ['Invoiced','BackLog','Lost','Pipeline'].includes(d.stage)).length * 100)
      : 0

    // Top produto
    const products = {}
    active.forEach(d => { if (d.product) products[d.product] = (products[d.product]||0) + 1 })
    const topProduct = Object.entries(products).sort((a,b)=>b[1]-a[1])[0]?.[0]

    return { actuals, fc, pipeVal, clients, winRate, topProduct,
             invoicedCount: invoiced.length, backlogCount: backlog.length,
             pipelineCount: pipeline.length, lostCount: lost.length,
             totalDeals: active.length }
  }, [deals])

  const quotaPct = quotaTarget > 0 ? Math.min(Math.round(stats.actuals / quotaTarget * 100), 100) : 0
  const fcPct    = quotaTarget > 0 ? Math.min(Math.round(stats.fc / quotaTarget * 100), 100) : 0

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

  const companyName = profile?.full_name?.split(' ')?.[0] || 'Distribuidor'

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('dist_dash_subtitle')}</p>
      </div>

      {/* KPI Cards principais */}
      <div className="grid grid-cols-2 gap-3">

        {/* Actuals vs Target */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t('dist_actuals_target')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatK(stats.actuals)}</p>
              <p className="text-sm text-gray-400">{t('dist_of_target')} {formatK(quotaTarget)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">{t('dash_forecast')}</p>
              <p className="text-lg font-bold text-navy">{formatK(stats.fc)}</p>
              <p className="text-xs text-gray-400">{fcPct}% do target</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-gray-400">
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
          <p className="text-xs text-gray-500 mt-0.5">{stats.pipelineCount} deals ativos</p>
        </div>

        {/* Clientes */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Clientes</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.clients.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('dist_active_clients')}</p>
        </div>
      </div>

      {/* Funil de deals */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">{t('dist_deal_status')}</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Invoiced', count: stats.invoicedCount, color: '#1D9E75', bg: '#F0FDF9' },
            { label: 'BackLog',  count: stats.backlogCount,  color: '#185FA5', bg: '#E6F1FB' },
            { label: 'Pipeline', count: stats.pipelineCount, color: '#B45309', bg: '#FEF3C7' },
            { label: 'Lost',     count: stats.lostCount,     color: '#6B7280', bg: '#F3F4F6' },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className="text-center rounded-lg p-2.5" style={{ background: bg }}>
              <p className="text-lg font-bold" style={{ color }}>{count}</p>
              <p className="text-[10px] font-medium" style={{ color }}>{label}</p>
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
            {quotaTarget > 0 && (
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
