import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'

import DashboardClassic from './Dashboard'
import DashboardSummary from './DashboardSummary'
import ProductFunnel from '../components/dashboard/ProductFunnel'
import SalesRepFunnel from '../components/dashboard/SalesRepFunnel'
import TopClients from '../components/dashboard/TopClients'
import SalesByClient from '../components/dashboard/SalesByClient'
import InstaxFunnel from '../components/dashboard/InstaxFunnel'
import MemberDashboard from '../components/dashboard/MemberDashboard'
import { Gauge as GaugeIcon, BarChart3, Package, Users, Building2, Camera } from 'lucide-react'

const STORAGE_KEY = 'bb_dashboard_view'

/**
 * Thin wrapper that lets users flip between the two dashboard styles:
 *   - Summary : the new gauge-based, glance-able view (default)
 *   - Classic : the original dense MTD/YTD/chart-heavy view
 *
 * The choice is persisted to localStorage so each user keeps their
 * preferred mode across sessions.
 */
export default function DashboardIndex() {
  const { t } = useTranslation()
  const { profile, isAdmin } = useAuth()
  const isDistributor = profile?.role === 'distributor'

  // Distributors go straight to the Classic view which has DistributorDashboard
  // The funnel is where the day starts, so it is what opens — until somebody
  // chooses otherwise, which is then remembered.
  const [view, setView] = useState(() => {
    if (isDistributor) return 'classic'
    if (typeof window === 'undefined') return 'funnel'
    return localStorage.getItem(STORAGE_KEY) || 'funnel'
  })
  const [selectedBU, setSelectedBU] = useState('')
  const [distView, setDistView] = useState(() => {
    if (typeof window === 'undefined') return 'classic'
    return localStorage.getItem(`${STORAGE_KEY}_dist`) || 'classic'
  })

  useEffect(() => {
    if (isDistributor) {
      try { localStorage.setItem(`${STORAGE_KEY}_dist`, distView) } catch {}
    }
  }, [distView, isDistributor])

  // Non-admins are locked to their own BU across every dashboard view
  useEffect(() => {
    if (!isAdmin && profile?.bu) setSelectedBU(profile.bu)
  }, [isAdmin, profile?.bu])

  // The effective BU passed to all views (forced for non-admins)
  const effectiveBU = isAdmin ? selectedBU : (profile?.bu || '')

  useEffect(() => {
    if (!isDistributor) {
      try { localStorage.setItem(STORAGE_KEY, view) } catch {}
    }
  }, [view, isDistributor])

  // Distributors get their own dashboard, and the funnel beside it. Their
  // deals move through the same five stages ours do, and the question the
  // funnel answers — what is in the pipeline and what reached the next frame —
  // is theirs as much as it is ours. The choice is remembered like everybody
  // else's; it was not before, which is why this reads a little differently.
  if (isDistributor) {
    return (
      <div className="space-y-3">
        <div className="px-4 pt-4 flex gap-0.5 bg-transparent">
          {[
            { id: 'classic', label: t('dash_view_details') || 'Details', icon: BarChart3 },
            { id: 'funnel', label: t('dash_view_funnel') || 'Funnel', icon: Camera },
          ].map(v => {
            const Icon = v.icon
            const active = distView === v.id
            return (
              <button key={v.id} type="button" onClick={() => setDistView(v.id)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-colors ${
                  active ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                <Icon size={13}/> <span>{v.label}</span>
              </button>
            )
          })}
        </div>
        {distView === 'funnel'
          ? <div className="px-4 pb-4"><InstaxFunnel selectedBU="" /></div>
          : <DashboardClassic selectedBU="" />}
      </div>
    )
  }

  // Sales reps (member) get a personal dashboard similar to distributors
  if (profile?.role === 'member') {
    return (
      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        <div className="pt-1">
          <h1 className="text-xl font-bold text-gray-900">{t('dash_title') || 'Dashboard'}</h1>
          <p className="text-sm text-gray-400">{profile?.full_name} · {profile?.bu}</p>
        </div>
        <MemberDashboard />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header: title + BU filter */}
      <div className="flex items-start justify-between gap-2 pt-1">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{t('dash_title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5 truncate">
            {view === 'summary'
              ? (t('dash_summary_sub') || 'At-a-glance performance vs budget')
              : (t('dash_classic_sub') || 'Detailed monthly and year-to-date breakdown')}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg shrink-0">
            {['','VGT','ECT'].map(bu => (
              <button key={bu} onClick={() => setSelectedBU(bu)}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  selectedBU === bu ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}>
                {bu || 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Primary view: Summary / Details — full-width row, always visible in portrait */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 rounded-control border border-gray-200 overflow-hidden">
          {[
            { id: 'summary', label: t('dash_view_summary') || 'Summary', icon: GaugeIcon },
            { id: 'classic', label: t('dash_view_details') || 'Details', icon: BarChart3 },
          ].map((v, i) => {
            const Icon = v.icon
            const active = view === v.id
            return (
              <button key={v.id} type="button"
                onClick={() => setView(v.id)}
                aria-pressed={active}
                className={`px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  i > 0 ? 'border-l border-gray-200' : ''
                } ${active ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                <Icon size={14}/> <span>{v.label}</span>
              </button>
            )
          })}
        </div>

        {/* Secondary: breakdowns — own scrollable row */}
        <div className="flex items-center gap-1.5 text-micro text-gray-400 overflow-x-auto no-scrollbar">
          <span className="uppercase tracking-wide shrink-0">{t('dash_breakdowns') || 'By'}:</span>
          {[
            { id: 'products', label: t('dash_view_products') || 'Products', icon: Package },
            { id: 'reps',     label: t('dash_view_reps') || 'Reps',         icon: Users },
            { id: 'clients',  label: t('dash_view_clients') || 'Clients',   icon: Building2 },
            { id: 'funnel',   label: t('dash_view_funnel') || 'Funnel',     icon: Camera },
          ].map(v => {
            const Icon = v.icon
            const active = view === v.id
            return (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={active}
                className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1 transition-colors shrink-0 ${
                  active ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                <Icon size={12}/> <span>{v.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {view === 'summary' ? <DashboardSummary selectedBU={effectiveBU} />
        : view === 'products' ? <ProductFunnel selectedBU={effectiveBU} />
        : view === 'reps' ? <SalesRepFunnel selectedBU={effectiveBU} />
        : view === 'funnel' ? <InstaxFunnel selectedBU={effectiveBU} />
        : view === 'clients' ? (
          <div className="space-y-4">
            {/* What was invoiced, by client, over a period — the question the
                month-end report answers. The funnel below it answers a
                different one: what is still coming. */}
            <SalesByClient selectedBU={effectiveBU} />
            <TopClients selectedBU={effectiveBU} />
          </div>
        )
        : <DashboardClassic hideHeader selectedBU={effectiveBU} />}
    </div>
  )
}
