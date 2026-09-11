import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { useTranslation } from '../../hooks/useTranslation'
import { formatK, Spinner } from '../ui'
import { stageFunnel, conversion } from '../../lib/stageFunnel'
import { Users, TrendingUp, FileText, Clock, CheckCircle2, ArrowRight,
         Layers, BarChart3, ClipboardCheck, AlertTriangle } from 'lucide-react'

/**
 * The pipeline as five instant photographs.
 *
 * The layout is the P&L owner's own, and so are the pictures: they live in
 * `public/instax/` and are read by name. A missing file is not a broken page —
 * the frame falls back to a drawn gradient in the stage's own colour — because
 * the figures are the point and they must survive a photograph nobody uploaded.
 *
 * The background is the desk WITHOUT the frames on it. The frames are drawn
 * live over it: their figures change every day, and a number baked into a
 * picture is a number that goes stale the moment it is taken.
 *
 * Tapping a frame opens the deals behind it, filtered to that stage. A figure
 * you cannot walk into is a figure you cannot act on.
 */

const FRAMES = {
  'Lead': {
    icon: Users, photo: 'lead',
    gradient: 'from-sky-200 via-emerald-100 to-amber-100', tint: 'text-sky-700',
  },
  'Pipeline': {
    icon: TrendingUp, photo: 'pipeline',
    gradient: 'from-emerald-200 via-sky-100 to-indigo-100', tint: 'text-emerald-700',
  },
  'Offer Presented': {
    icon: FileText, photo: 'offer',
    gradient: 'from-indigo-200 via-purple-100 to-sky-100', tint: 'text-indigo-700',
  },
  'BackLog': {
    icon: Clock, photo: 'backlog',
    gradient: 'from-amber-200 via-orange-100 to-rose-100', tint: 'text-amber-700',
  },
  'Invoiced': {
    icon: CheckCircle2, photo: 'invoiced',
    gradient: 'from-orange-200 via-rose-200 to-purple-200', tint: 'text-green-700',
  },
}

// The handwriting. A stack of what a laptop already has, so nothing is fetched
// and nothing falls back to a serif on a phone.
const HAND = { fontFamily: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" }
const EXTENSIONS = ['jpg', 'png', 'webp']

/**
 * An image that tries the extensions in turn and gives up quietly.
 *
 * Three files may exist for one name across the team's uploads; rather than
 * make anybody rename anything, the frame asks for each in turn and stops
 * caring after the last.
 */
function Photo({ name, alt, className, fallback }) {
  const [attempt, setAttempt] = useState(0)
  if (attempt >= EXTENSIONS.length) return fallback
  return (
    <img src={`/instax/${name}.${EXTENSIONS[attempt]}`} alt={alt}
      className={className} loading="lazy"
      onError={() => setAttempt(a => a + 1)}/>
  )
}

export default function InstaxFunnel({ selectedBU = '' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { deals, loading } = useDeals()

  const { stages, lost, total } = useMemo(
    () => stageFunnel(deals, { bu: selectedBU }), [deals, selectedBU]
  )
  const frames = useMemo(() => conversion(stages), [stages])

  if (loading) return <Spinner label={t('ifn_title')}/>

  // Paper underneath, so the page reads the same before anybody has uploaded a
  // photograph and after.
  return (
    <div className="relative rounded-2xl overflow-hidden bg-[#f6f1e8]">
      {/* The desk, behind everything, dimmed just enough that a figure written
          over it stays readable on a phone in daylight. */}
      <Photo name="desk" alt="" fallback={null}
        className="absolute inset-0 w-full h-full object-cover"/>
      <div className="absolute inset-0 bg-white/20"/>

      <div className="relative p-4 sm:p-6 space-y-5">
        <header className="space-y-1">
          <p className="text-2xl sm:text-3xl text-gray-900 leading-tight" style={HAND}>
            {t('ifn_title')} <span className="text-rose-400">♥</span>
          </p>
          <p className="text-micro sm:text-xs text-gray-500 uppercase tracking-[0.25em]">
            {t('ifn_sub')}
          </p>
        </header>

        {/* The row of frames. On a phone it becomes a column: the same story
            read downwards. */}
        <div className="flex flex-col sm:flex-row sm:items-stretch gap-3 sm:gap-1">
          {frames.map((f, i) => (
            <Frame key={f.stage} f={f} last={i === frames.length - 1} t={t}
              onOpen={() => navigate(`/deals?stage=${encodeURIComponent(f.stage)}`)}/>
          ))}
        </div>

        {/* The strip along the bottom: what the whole roll adds up to. */}
        <div className="bg-[#fdfaf3]/95 border border-amber-100/80 rounded-xl shadow-sm px-3 py-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:divide-x sm:divide-amber-100">
            <Figure icon={Layers} label={t('ifn_open')} value={formatK(total.openValue)}
              hint={`${total.openCount} ${t('ifn_deals')}`}/>
            <Figure icon={BarChart3} label={t('ifn_weighted')} value={formatK(total.weighted)}
              hint={t('ifn_weighted_hint')} pad/>
            <Figure icon={ClipboardCheck} label={t('ifn_invoiced')} value={formatK(total.invoiced)}
              hint={`${total.invoicedCount} ${t('ifn_deals')}`} tone="text-green-700" pad/>
            <Figure icon={AlertTriangle} label={t('ifn_lost')} value={formatK(lost.value)}
              hint={`${lost.count} ${t('ifn_deals')}`} tone="text-red-600" pad/>
          </div>
          <p className="text-xs text-gray-500 mt-2" style={HAND}>
            {t('ifn_footer')} <span className="text-rose-300">♥</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Frame({ f, last, t, onOpen }) {
  const conf = FRAMES[f.stage]
  const Icon = conf.icon
  const key = f.stage.replace(/\s+/g, '_').toLowerCase()

  return (
    <div className="flex items-center sm:flex-1 sm:min-w-0">
      <button type="button" onClick={onOpen}
        aria-label={`${f.stage} — ${formatK(f.value)}, ${f.count}`}
        className="group flex-1 min-w-0 text-left bg-white rounded-[3px] shadow-lg ring-1 ring-black/5
                   hover:shadow-2xl hover:-translate-y-1 transition-all duration-200
                   p-2 pb-3 sm:odd:-rotate-1 sm:even:rotate-1 hover:rotate-0">
        <div className={`relative overflow-hidden bg-gradient-to-br ${conf.gradient}
                         aspect-square sm:aspect-[4/5]`}>
          <Photo name={conf.photo} alt={f.stage}
            className="absolute inset-0 w-full h-full object-cover"
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon size={32} className={`${conf.tint} opacity-60`}/>
              </div>
            }/>
          {/* The share of the stage before that reached this one, on a strip of
              tape in the corner. */}
          {f.fromPrevious !== null && (
            <span className="absolute top-2 right-0 translate-x-1 rotate-3 bg-white/85 backdrop-blur-[1px]
                             text-micro font-bold text-gray-700 px-1.5 py-0.5 shadow-sm">
              {f.fromPrevious}%
            </span>
          )}
        </div>

        <div className="pt-2 px-1">
          <p className="text-base text-gray-900 flex items-center gap-1.5" style={HAND}>
            <Icon size={14} className="text-gray-500"/>
            {t(`ifn_s_${key}`)}
          </p>
          <p className="text-micro text-gray-500 uppercase tracking-wide leading-tight mt-0.5">
            {t(`ifn_c_${key}`)}
          </p>
          <p className="text-xl font-bold text-gray-900 mt-1.5">{formatK(f.value)}</p>
          <p className="text-micro text-gray-400">
            {f.count} {t('ifn_deals')}
            {f.stage !== 'Invoiced' && f.weighted > 0 && (
              <span> · {formatK(f.weighted)} {t('ifn_wtd')}</span>
            )}
          </p>
        </div>
      </button>

      {!last && (
        <ArrowRight size={18}
          className="text-gray-500/70 mx-1 shrink-0 rotate-90 sm:rotate-0 drop-shadow-sm"/>
      )}
    </div>
  )
}

function Figure({ icon: Icon, label, value, hint, tone = 'text-gray-900', pad }) {
  return (
    <div className={`flex items-start gap-2 ${pad ? 'sm:pl-3' : ''}`}>
      <Icon size={16} className="text-gray-400 mt-0.5 shrink-0"/>
      <div className="min-w-0">
        <p className="text-micro text-gray-500">{label}</p>
        <p className={`text-lg font-bold leading-tight ${tone}`}>{value}</p>
        <p className="text-micro text-gray-400 leading-tight">{hint}</p>
      </div>
    </div>
  )
}
