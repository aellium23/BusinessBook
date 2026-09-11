import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { useTranslation } from '../../hooks/useTranslation'
import { formatK, Spinner } from '../ui'
import { stageFunnel, conversion } from '../../lib/stageFunnel'
import { Users, TrendingUp, FileText, Clock, CheckCircle2,
         Layers, BarChart3, ClipboardCheck, AlertTriangle } from 'lucide-react'

/**
 * The pipeline as five instant photographs.
 *
 * The page is the P&L owner's own artwork, used as the artwork and not as a
 * suggestion: `public/instax/desk.png` is the scene — the camera, the plants,
 * the handwritten notes, the film box, the pen — and the five frames sit where
 * his five sit, at the pixel.
 *
 * What is drawn live is only what changes: the stage names, the money, the
 * counts, the conversion on its strip of tape, the summary banner. Those are
 * laid over the frames in the picture, which is why every box below is a
 * measurement of the original rather than a taste. A number baked into a
 * photograph is a number that goes stale the moment it is taken.
 *
 * The photograph inside each frame is cut from that same file at display time
 * — a background-position crop, no second copy of anything — so the pictures
 * on screen are literally his.
 *
 * Tapping a frame opens the deals behind it, filtered to that stage. A figure
 * you cannot walk into is a figure you cannot act on.
 */

/** The artwork, and its natural size — every box below is in its pixels. */
const ART = '/instax/desk.png'
const ART_W = 1536
const ART_H = 1024

/**
 * The five frames, measured off the artwork.
 *
 * `x0`/`x1` are the white card's edges; the card runs from CARD_TOP to
 * CARD_BOTTOM. `PHOTO_*` is the picture inside it. They are not all the same
 * width because the scene has perspective, and matching it is the difference
 * between a page that looks photographed and one that looks pasted.
 */
const CARD_TOP = 288
const CARD_BOTTOM = 718
const PHOTO_TOP = 317
const PHOTO_BOTTOM = 530
const PHOTO_INSET = 17          // the white border down each side of a frame

/**
 * A frame is drawn five pixels proud of the one in the photograph on every
 * side. The measurement is of the white card; the card in the picture also has
 * a soft shadow and an anti-aliased edge, and without the overhang a pale line
 * of the original shows along each side. Verified against a render rather than
 * reasoned about: the seam was there at zero and gone at five.
 */
const OVERHANG = 5

const FRAMES = {
  'Lead':            { icon: Users,        x0: 73,   x1: 339,  tint: 'from-sky-200 to-emerald-100' },
  'Pipeline':        { icon: TrendingUp,   x0: 360,  x1: 633,  tint: 'from-emerald-200 to-sky-100' },
  'Offer Presented': { icon: FileText,     x0: 650,  x1: 900,  tint: 'from-indigo-200 to-sky-100' },
  'BackLog':         { icon: Clock,        x0: 919,  x1: 1168, tint: 'from-amber-200 to-rose-100' },
  'Invoiced':        { icon: CheckCircle2, x0: 1189, x1: 1434, tint: 'from-orange-200 to-rose-200' },
}

/** The summary banner, drawn a little larger than the one in the picture so it
 *  covers it completely rather than leaving a cream edge showing. */
const BANNER = { left: 6.6, top: 70.0, width: 81.5, height: 17.8, tilt: 1.8 }

// The handwriting. A stack of what a laptop already has, so nothing is fetched
// and nothing falls back to a serif on a phone.
const HAND = { fontFamily: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" }

const pct = (v, of) => `${(v / of) * 100}%`

/**
 * The crop that shows one region of the artwork inside a box of its own size.
 *
 * The percentage form of background-position measures the *offset* against the
 * slack — image minus box — which is why the divisor is not the image width.
 * Getting that wrong shifts every picture by a few percent, and a few percent
 * is a horizon cut in half.
 */
function crop(x, y, w, h) {
  return {
    backgroundImage: `url(${ART})`,
    backgroundSize: `${(ART_W / w) * 100}% ${(ART_H / h) * 100}%`,
    backgroundPosition: `${(x / (ART_W - w)) * 100}% ${(y / (ART_H - h)) * 100}%`,
  }
}

/** The white card as drawn: the measured frame plus its overhang. */
function cardBox(conf) {
  const x = conf.x0 - OVERHANG
  return { x, w: (conf.x1 + OVERHANG) - x, y: CARD_TOP, h: CARD_BOTTOM - CARD_TOP }
}

/** The picture inside one frame, cut from the scene. */
function framePhoto(conf) {
  const x = conf.x0 + PHOTO_INSET
  const w = (conf.x1 - PHOTO_INSET) - x
  return crop(x, PHOTO_TOP, w, PHOTO_BOTTOM - PHOTO_TOP)
}

export default function InstaxFunnel({ selectedBU = '' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { deals, loading } = useDeals()

  const { stages, lost, total } = useMemo(
    () => stageFunnel(deals, { bu: selectedBU }), [deals, selectedBU]
  )
  const frames = useMemo(() => conversion(stages), [stages])

  const open = stage => navigate(`/deals?stage=${encodeURIComponent(stage)}`)

  if (loading) return <Spinner label={t('ifn_title')}/>

  const figures = [
    { icon: Layers, label: t('ifn_open'), value: formatK(total.openValue),
      hint: `${total.openCount} ${t('ifn_deals')}` },
    { icon: BarChart3, label: t('ifn_weighted'), value: formatK(total.weighted),
      hint: t('ifn_weighted_hint') },
    { icon: ClipboardCheck, label: t('ifn_invoiced'), value: formatK(total.invoiced),
      hint: `${total.invoicedCount} ${t('ifn_deals')}`, tone: 'text-green-700' },
    { icon: AlertTriangle, label: t('ifn_lost'), value: formatK(lost.value),
      hint: `${lost.count} ${t('ifn_deals')}`, tone: 'text-red-600' },
  ]

  return (
    <>
      {/* The scene, at its own proportions, from a tablet upwards. Below that
          it would be five thumbnails of unreadable type, so the phone gets the
          list underneath instead — same pictures, same figures, stacked. */}
      <div className="hidden md:block relative w-full rounded-2xl overflow-hidden shadow-sm
                      bg-[#f6f1e8] bg-cover bg-center"
        style={{ aspectRatio: `${ART_W} / ${ART_H}`, backgroundImage: `url(${ART})`,
                 containerType: 'inline-size' }}>
        {frames.map(f => <SceneFrame key={f.stage} f={f} t={t} onOpen={() => open(f.stage)}/>)}
        <SceneBanner figures={figures} t={t}/>
      </div>

      <div className="md:hidden space-y-3">
        <PhoneHeader t={t}/>
        {frames.map(f => <PhoneFrame key={f.stage} f={f} t={t} onOpen={() => open(f.stage)}/>)}
        <PhoneBanner figures={figures} t={t}/>
      </div>
    </>
  )
}

/* ── the scene ─────────────────────────────────────────────────────────────
   Type is sized in cqw — hundredths of the scene's own width — so the page is
   the same page at 1600px and at 800px rather than one that degrades. */

function SceneFrame({ f, t, onOpen }) {
  const conf = FRAMES[f.stage]
  const Icon = conf.icon
  const key = f.stage.replace(/\s+/g, '_').toLowerCase()
  const box = cardBox(conf)

  return (
    <button type="button" onClick={onOpen}
      aria-label={`${f.stage} — ${formatK(f.value)}, ${f.count} ${t('ifn_deals')}`}
      className="absolute text-left bg-[#fbf7f0] shadow-md ring-1 ring-black/5
                 hover:-translate-y-1 hover:shadow-xl transition-transform duration-200
                 focus:outline-none focus:ring-2 focus:ring-green-600"
      style={{
        left: pct(box.x, ART_W), width: pct(box.w, ART_W),
        top: pct(box.y, ART_H), height: pct(box.h, ART_H),
      }}>

      <div className={`absolute overflow-hidden bg-gradient-to-br ${conf.tint}`}
        style={{
          left: pct(PHOTO_INSET + OVERHANG, box.w),
          right: pct(PHOTO_INSET + OVERHANG, box.w),
          top: pct(PHOTO_TOP - box.y, box.h),
          height: pct(PHOTO_BOTTOM - PHOTO_TOP, box.h),
          ...framePhoto(conf),
        }}>
        {/* The share of the stage before that reached this one, on a strip of
            tape in the corner — where his artwork puts it. */}
        {f.fromPrevious !== null && (
          <span className="absolute top-[4%] right-0 translate-x-[6%] rotate-2
                           bg-[#f1eee6] text-gray-800 font-bold shadow-sm"
            style={{ fontSize: '1.25cqw', padding: '0.35cqw 0.7cqw' }}>
            {f.fromPrevious}%
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0"
        style={{ top: pct(PHOTO_BOTTOM - box.y + 8, box.h), padding: '0 6.5%' }}>
        <p className="flex items-center gap-[0.5cqw] text-gray-900 leading-none"
          style={{ ...HAND, fontSize: '2cqw' }}>
          <Icon style={{ width: '1.6cqw', height: '1.6cqw' }} className="shrink-0 text-gray-700"/>
          {t(`ifn_s_${key}`)}
        </p>
        <p className="text-gray-600 uppercase tracking-wide leading-tight"
          style={{ fontSize: '0.95cqw', marginTop: '0.7cqw' }}>
          {t(`ifn_c_${key}`)}
        </p>
        <p className="font-bold text-gray-900 leading-none"
          style={{ fontSize: '2.7cqw', marginTop: '1.1cqw' }}>
          {formatK(f.value)}
        </p>
        <p className="text-gray-500 leading-tight"
          style={{ fontSize: '0.95cqw', marginTop: '0.6cqw' }}>
          {f.count} {t('ifn_deals')}
          {f.stage !== 'Invoiced' && f.weighted > 0 && (
            <span> · {formatK(f.weighted)} {t('ifn_wtd')}</span>
          )}
        </p>
      </div>
    </button>
  )
}

function SceneBanner({ figures, t }) {
  return (
    <div className="absolute bg-[#f7f3e8] shadow-md ring-1 ring-black/5"
      style={{
        left: `${BANNER.left}%`, top: `${BANNER.top}%`,
        width: `${BANNER.width}%`, height: `${BANNER.height}%`,
        transform: `rotate(${BANNER.tilt}deg)`,
      }}>
      <div className="h-full flex flex-col justify-center" style={{ padding: '0 2.5cqw' }}>
        <div className="flex items-start" style={{ gap: '2cqw' }}>
          {figures.map((fig, i) => (
            <div key={fig.label}
              className={`flex-1 flex items-start ${i > 0 ? 'border-l border-gray-300' : ''}`}
              style={{ gap: '0.8cqw', paddingLeft: i > 0 ? '2cqw' : 0 }}>
              <fig.icon style={{ width: '1.9cqw', height: '1.9cqw', marginTop: '0.3cqw' }}
                className="shrink-0 text-gray-500"/>
              <div className="min-w-0">
                <p className="text-gray-600 leading-none" style={{ fontSize: '1cqw' }}>{fig.label}</p>
                <p className={`font-bold leading-none ${fig.tone || 'text-gray-900'}`}
                  style={{ fontSize: '2.2cqw', marginTop: '0.5cqw' }}>{fig.value}</p>
                <p className="text-gray-500 leading-tight"
                  style={{ fontSize: '0.85cqw', marginTop: '0.5cqw' }}>{fig.hint}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-gray-600" style={{ ...HAND, fontSize: '1.05cqw', marginTop: '1.2cqw' }}>
          {t('ifn_footer')} <span className="text-rose-300">♥</span>
        </p>
      </div>
    </div>
  )
}

/* ── the phone ─────────────────────────────────────────────────────────────
   The same roll, read downwards. The pictures are still cut from the scene. */

function PhoneHeader({ t }) {
  return (
    <div className="rounded-xl overflow-hidden bg-[#f6f1e8] shadow-sm">
      {/* The top of the scene: the logo, the camera, the notes pinned behind it. */}
      <div className="w-full" style={{ aspectRatio: '1536 / 290', ...crop(0, 0, ART_W, 290) }}/>
      <div className="px-3 py-2">
        <p className="text-lg text-gray-900 leading-tight" style={HAND}>
          {t('ifn_title')} <span className="text-rose-400">♥</span>
        </p>
        <p className="text-micro text-gray-500 uppercase tracking-[0.25em]">{t('ifn_sub')}</p>
      </div>
    </div>
  )
}

function PhoneFrame({ f, t, onOpen }) {
  const conf = FRAMES[f.stage]
  const Icon = conf.icon
  const key = f.stage.replace(/\s+/g, '_').toLowerCase()
  const w = (conf.x1 - PHOTO_INSET) - (conf.x0 + PHOTO_INSET)

  return (
    <button type="button" onClick={onOpen}
      aria-label={`${f.stage} — ${formatK(f.value)}, ${f.count} ${t('ifn_deals')}`}
      className="w-full text-left bg-[#fbf7f0] rounded-[3px] shadow-md ring-1 ring-black/5
                 p-2 pb-3 flex gap-3 items-center">
      <div className={`w-24 shrink-0 bg-gradient-to-br ${conf.tint}`}
        style={{ aspectRatio: `${w} / ${PHOTO_BOTTOM - PHOTO_TOP}`, ...framePhoto(conf) }}/>
      <div className="min-w-0 flex-1">
        <p className="text-base text-gray-900 flex items-center gap-1.5" style={HAND}>
          <Icon size={14} className="text-gray-600"/>
          {t(`ifn_s_${key}`)}
          {f.fromPrevious !== null && (
            <span className="ml-auto bg-[#f4f1ea] text-micro font-bold text-gray-700
                             px-1.5 py-0.5 shadow-sm rotate-2">{f.fromPrevious}%</span>
          )}
        </p>
        <p className="text-micro text-gray-500 uppercase tracking-wide leading-tight mt-0.5">
          {t(`ifn_c_${key}`)}
        </p>
        <p className="text-xl font-bold text-gray-900 mt-1">{formatK(f.value)}</p>
        <p className="text-micro text-gray-400">
          {f.count} {t('ifn_deals')}
          {f.stage !== 'Invoiced' && f.weighted > 0 && (
            <span> · {formatK(f.weighted)} {t('ifn_wtd')}</span>
          )}
        </p>
      </div>
    </button>
  )
}

function PhoneBanner({ figures, t }) {
  return (
    <div className="bg-[#f7f3e8] border border-amber-100 rounded-xl shadow-sm px-3 py-2.5">
      <div className="grid grid-cols-2 gap-3">
        {figures.map(fig => (
          <div key={fig.label} className="flex items-start gap-2">
            <fig.icon size={16} className="text-gray-400 mt-0.5 shrink-0"/>
            <div className="min-w-0">
              <p className="text-micro text-gray-500">{fig.label}</p>
              <p className={`text-lg font-bold leading-tight ${fig.tone || 'text-gray-900'}`}>
                {fig.value}
              </p>
              <p className="text-micro text-gray-400 leading-tight">{fig.hint}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2" style={HAND}>
        {t('ifn_footer')} <span className="text-rose-300">♥</span>
      </p>
    </div>
  )
}
