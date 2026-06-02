import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { formatK } from '../components/ui'
import DashboardClassic from './Dashboard'
import DashboardSummary from './DashboardSummary'
import { Gauge as GaugeIcon, BarChart3 } from 'lucide-react'

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
  const [view, setView] = useState(() => {
    if (isDistributor) return 'classic'
    if (typeof window === 'undefined') return 'summary'
    return localStorage.getItem(STORAGE_KEY) || 'summary'
  })
  const [selectedBU, setSelectedBU] = useState('')

  useEffect(() => {
    if (!isDistributor) {
      try { localStorage.setItem(STORAGE_KEY, view) } catch {}
    }
  }, [view, isDistributor])

  // Distributors skip the view toggle and go directly to the dedicated dashboard
  if (isDistributor) {
    return <DashboardClassic selectedBU="" />
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('dash_title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {view === 'summary'
              ? (t('dash_summary_sub') || 'At-a-glance performance vs budget')
              : (t('dash_classic_sub') || 'Detailed monthly and year-to-date breakdown')}
          </p>
        </div>
        <div className="inline-flex rounded-control border border-gray-200 overflow-hidden" role="group" aria-label="Dashboard view">
          <button type="button"
            onClick={() => setView('summary')}
            aria-pressed={view === 'summary'}
            className={`px-3 py-1.5 text-xs flex items-center gap-1 ${
              view === 'summary' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            <GaugeIcon size={13}/> <span className="hidden sm:inline">{t('dash_view_summary') || 'Summary'}</span>
          </button>
          <button type="button"
            onClick={() => setView('classic')}
            aria-pressed={view === 'classic'}
            className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l border-gray-200 ${
              view === 'classic' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            <BarChart3 size={13}/> <span className="hidden sm:inline">{t('dash_view_classic') || 'Classic'}</span>
          </button>
        </div>
        {isAdmin && (
          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
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

      {view === 'summary' ? <DashboardSummary selectedBU={selectedBU} /> : <DashboardClassic hideHeader selectedBU={selectedBU} />}
    </div>
  )
}
