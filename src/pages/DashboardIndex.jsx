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
import ViewPicker from '../components/dashboard/ViewPicker'
import { Gauge as GaugeIcon, BarChart3, Package, Users, Building2, Camera } from 'lucide-react'

const STORAGE_KEY = 'bb_dashboard_view'

/**
 * The funnel is the front door, and it opens every time the app does.
 *
 * It was already the default — and only until somebody clicked another view
 * once, because the choice went to `localStorage` and stayed there forever.
 * "Default" that survives exactly one click is not a default; it is the first
 * thing you ever saw.
 *
 * So the choice now lives in `sessionStorage`. Opening the app lands on the
 * funnel, whatever you were looking at yesterday; moving to Deals and back
 * keeps you where you were, because losing your place on every navigation is a
 * different kind of annoying.
 *
 * The old localStorage keys are cleared on the way past, so a preference saved
 * months ago does not sit there outliving the rule that replaced it.
 */
const DEFAULT_VIEW = 'funnel'

/**
 * As vistas de cada perfil, numa lista só.
 *
 * O funil primeiro em todos, porque é a porta de entrada. A ordem a seguir é a
 * de quem lê: primeiro o retrato geral, depois os cortes.
 */
function viewsFor({ t, role }) {
  const funnel = { id: 'funnel', label: t('dash_view_funnel'), icon: Camera }
  if (role === 'distributor') return [
    funnel,
    { id: 'classic', label: t('dash_view_details'), icon: BarChart3 },
  ]
  if (role === 'member') return [
    funnel,
    { id: 'mine', label: t('dash_view_mine'), icon: GaugeIcon },
  ]
  return [
    funnel,
    { id: 'summary',  label: t('dash_view_summary'), icon: GaugeIcon },
    { id: 'classic',  label: t('dash_view_details'), icon: BarChart3 },
    { id: 'products', label: t('dash_view_products'), icon: Package },
    { id: 'reps',     label: t('dash_view_reps'), icon: Users },
    { id: 'clients',  label: t('dash_view_clients'), icon: Building2 },
  ]
}

/** O subtítulo de cada vista. Havia um if/else para duas, e seis vistas. */
const SUBTITLE_KEY = {
  funnel:   'dash_funnel_sub',
  summary:  'dash_summary_sub',
  classic:  'dash_classic_sub',
  products: 'dash_products_sub',
  reps:     'dash_reps_sub',
  clients:  'dash_clients_sub',
  mine:     'dash_mine_sub',
}

function openingView(key) {
  if (typeof window === 'undefined') return DEFAULT_VIEW
  try {
    localStorage.removeItem(key)
    return sessionStorage.getItem(key) || DEFAULT_VIEW
  } catch { return DEFAULT_VIEW }   // private window
}

function rememberView(key, value) {
  try { sessionStorage.setItem(key, value) } catch { /* private window */ }
}

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

  // The same front door for everybody: the funnel, every time the app opens.
  const [view, setView] = useState(() => openingView(STORAGE_KEY))
  const [selectedBU, setSelectedBU] = useState('')
  const [distView, setDistView] = useState(() => openingView(`${STORAGE_KEY}_dist`))
  const [memberView, setMemberView] = useState(() => openingView(`${STORAGE_KEY}_member`))

  useEffect(() => {
    if (isDistributor) rememberView(`${STORAGE_KEY}_dist`, distView)
  }, [distView, isDistributor])

  // Non-admins are locked to their own BU across every dashboard view
  useEffect(() => {
    if (!isAdmin && profile?.bu) setSelectedBU(profile.bu)
  }, [isAdmin, profile?.bu])

  // The effective BU passed to all views (forced for non-admins)
  const effectiveBU = isAdmin ? selectedBU : (profile?.bu || '')

  useEffect(() => {
    if (!isDistributor) rememberView(STORAGE_KEY, view)
  }, [view, isDistributor])

  useEffect(() => {
    if (profile?.role === 'member') rememberView(`${STORAGE_KEY}_member`, memberView)
  }, [memberView, profile?.role])

  // Distributors get their own dashboard, and the funnel beside it. Their
  // deals move through the same five stages ours do, and the question the
  // funnel answers — what is in the pipeline and what reached the next frame —
  // is theirs as much as it is ours. The choice is remembered like everybody
  // else's; it was not before, which is why this reads a little differently.
  if (isDistributor) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <ViewPicker label={t('dash_title')} value={distView} onChange={setDistView}
          options={viewsFor({ t, role: 'distributor' })} />
        {distView === 'funnel'
          ? <InstaxFunnel selectedBU="" owner={profile} />
          : <DashboardClassic selectedBU="" />}
      </div>
    )
  }

  // Sales reps get a personal dashboard, and now the funnel beside it — they
  // were the one role that could not reach it at all, which made "the funnel is
  // the front door" untrue for the people who live in the pipeline all day.
  if (profile?.role === 'member') {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="pt-1">
          <h1 className="text-xl font-bold text-gray-900">{t('dash_title')}</h1>
          <p className="text-sm text-gray-400">{profile?.full_name} · {profile?.bu}</p>
        </div>
        <ViewPicker label={t('dash_title')} value={memberView} onChange={setMemberView}
          options={viewsFor({ t, role: 'member' })} />
        {/* O funil de um comercial é a carteira dele. É um filtro de vista, não
            uma permissão: o que fica de fora continua a contar no orçamento, nas
            vendas por cliente e na reconciliação com o SAP. */}
        {memberView === 'funnel'
          ? <InstaxFunnel selectedBU={profile?.bu || ''} owner={profile} />
          : <MemberDashboard />}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header: title + BU filter */}
      <div className="flex items-start justify-between gap-2 pt-1">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{t('dash_title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5 truncate">
            {t(SUBTITLE_KEY[view] || 'dash_subtitle')}
          </p>
        </div>
        {/* Quem pode escolher, escolhe. Quem não pode, é informado — o selector
            desaparecia por inteiro para quem não é admin, e o ecrã nunca lhe
            dizia que estava a ver só a BU dele. Os números eram verdadeiros e a
            pergunta "isto é tudo?" ficava sem resposta. */}
        {isAdmin ? (
          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg shrink-0">
            {['','VGT','ECT'].map(bu => (
              <button key={bu} onClick={() => setSelectedBU(bu)}
                className={`px-2.5 py-1 rounded text-xs font-semibold min-h-tap ${
                  selectedBU === bu ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}>
                {bu || t('dash_bu_all')}
              </button>
            ))}
          </div>
        ) : effectiveBU ? (
          <span className="shrink-0 px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600">
            {effectiveBU}
          </span>
        ) : null}
      </div>

      <ViewPicker label={t('dash_title')} value={view} onChange={setView}
        options={viewsFor({ t, role: 'admin' })} />

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
