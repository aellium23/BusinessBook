import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { useTranslation } from '../../hooks/useTranslation'
import { formatK, Spinner } from '../ui'
import { stageFunnel, conversion } from '../../lib/stageFunnel'
import { Users, TrendingUp, FileText, Clock, CheckCircle2, ArrowRight } from 'lucide-react'

/**
 * The pipeline as five instant photographs.
 *
 * The layout is the P&L owner's own: a row of frames, one per stage, each with
 * a caption under it, and an arrow to the next. It is a funnel that reads like
 * a story rather than like a bar chart, which is the point — the same five
 * figures, in the shape people already have on the wall.
 *
 * The picture in each frame is drawn rather than photographed: a gradient and
 * the stage's own icon. No image files, no fonts fetched from anywhere, nothing
 * to go missing on a slow connection — and the stage colours are the ones the
 * rest of the app already uses, so a Lead is the same grey here as on a card.
 *
 * Tapping a frame opens the deals behind it, filtered to that stage. A figure
 * you cannot walk into is a figure you cannot act on.
 */

const FRAMES = {
  'Lead': {
    icon: Users,
    photo: 'from-sky-200 via-emerald-100 to-amber-100',
    tint: 'text-sky-700',
  },
  'Pipeline': {
    icon: TrendingUp,
    photo: 'from-emerald-200 via-sky-100 to-indigo-100',
    tint: 'text-emerald-700',
  },
  'Offer Presented': {
    icon: FileText,
    photo: 'from-indigo-200 via-purple-100 to-sky-100',
    tint: 'text-indigo-700',
  },
  'BackLog': {
    icon: Clock,
    photo: 'from-amber-200 via-orange-100 to-rose-100',
    tint: 'text-amber-700',
  },
  'Invoiced': {
    icon: CheckCircle2,
    photo: 'from-orange-200 via-rose-200 to-purple-200',
    tint: 'text-green-700',
  },
}

// The handwriting on the captions. A stack of what a laptop already has, so
// nothing is downloaded and nothing falls back to a serif on a phone.
const HAND = { fontFamily: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" }

export default function InstaxFunnel({ selectedBU = '' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { deals, loading } = useDeals()

  const { stages, lost, total } = useMemo(
    () => stageFunnel(deals, { bu: selectedBU }), [deals, selectedBU]
  )
  const frames = useMemo(() => conversion(stages), [stages])

  if (loading) return <Spinner label={t('ifn_title')}/>

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-lg text-navy" style={HAND}>{t('ifn_title')}</p>
        <p className="text-micro text-gray-400 uppercase tracking-[0.2em]">{t('ifn_sub')}</p>
      </div>

      {/* The row of frames. On a phone it becomes a column, which is the same
          story read downwards. */}
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-1">
        {frames.map((f, i) => (
          <Frame key={f.stage} f={f} last={i === frames.length - 1} t={t}
            onOpen={() => navigate(`/deals?stage=${encodeURIComponent(f.stage)}`)}/>
        ))}
      </div>

      {/* What the whole roll adds up to. */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Figure label={t('ifn_open')} value={formatK(total.openValue)}
            hint={`${total.openCount} ${t('ifn_deals')}`}/>
          <Figure label={t('ifn_weighted')} value={formatK(total.weighted)} hint={t('ifn_weighted_hint')}/>
          <Figure label={t('ifn_invoiced')} value={formatK(total.invoiced)}
            hint={`${total.invoicedCount} ${t('ifn_deals')}`} tone="text-green-700"/>
          <Figure label={t('ifn_lost')} value={formatK(lost.value)}
            hint={`${lost.count} ${t('ifn_deals')}`} tone="text-red-600"/>
        </div>
        <p className="text-micro text-gray-400 mt-2" style={HAND}>{t('ifn_footer')}</p>
      </div>
    </div>
  )
}

function Frame({ f, last, t, onOpen }) {
  const conf = FRAMES[f.stage]
  const Icon = conf.icon
  return (
    <div className="flex items-center sm:flex-1 sm:min-w-0">
      <button type="button" onClick={onOpen}
        aria-label={`${f.stage} — ${f.count}`}
        className="group flex-1 min-w-0 text-left bg-white rounded-sm border border-gray-200 shadow-md
                   hover:shadow-xl hover:-translate-y-0.5 transition-all p-2 pb-3
                   rotate-0 sm:odd:-rotate-1 sm:even:rotate-1">
        {/* The photograph. */}
        <div className={`relative rounded-sm bg-gradient-to-br ${conf.photo} h-20 sm:h-24
                         flex items-center justify-center overflow-hidden`}>
          <Icon size={28} className={`${conf.tint} opacity-70`}/>
          {f.fromPrevious !== null && (
            <span className="absolute top-1 right-1 text-micro font-bold text-white/90 bg-black/25 rounded px-1">
              {f.fromPrevious}%
            </span>
          )}
        </div>

        {/* The caption, written under it. */}
        <div className="pt-2 px-0.5">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1" style={HAND}>
            <Icon size={12} className="text-gray-400"/>
            {t(`ifn_s_${f.stage.replace(/\s+/g, '_').toLowerCase()}`)}
          </p>
          <p className="text-micro text-gray-500 uppercase tracking-wide leading-tight mt-0.5">
            {t(`ifn_c_${f.stage.replace(/\s+/g, '_').toLowerCase()}`)}
          </p>
          <p className="text-base font-bold text-navy mt-1">{formatK(f.value)}</p>
          <p className="text-micro text-gray-400">
            {f.count} {t('ifn_deals')}
            {f.stage !== 'Invoiced' && f.weighted > 0 && (
              <span className="ml-1">· {formatK(f.weighted)} {t('ifn_wtd')}</span>
            )}
          </p>
        </div>
      </button>

      {!last && (
        <ArrowRight size={16}
          className="text-gray-300 mx-1 shrink-0 rotate-90 sm:rotate-0"/>
      )}
    </div>
  )
}

function Figure({ label, value, hint, tone = 'text-navy' }) {
  return (
    <div>
      <p className="text-micro text-gray-500">{label}</p>
      <p className={`text-base font-bold ${tone}`}>{value}</p>
      <p className="text-micro text-gray-400">{hint}</p>
    </div>
  )
}
