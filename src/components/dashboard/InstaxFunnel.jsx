import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { ownedBy } from '../../lib/dealOwner'
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

/**
 * The tape across the top corner of a picture, carrying the conversion.
 *
 * Measured off the scene's own, which is 76 by 41 and tilted about seven
 * degrees anticlockwise — a good deal taller than it looks, and the reason a
 * first attempt left the painted "620%" legible underneath the drawn one. The
 * tape is translucent, so the badge is drawn a few pixels proud all round: one
 * that only just covers it leaves a mint rim.
 *
 * Every figure here is in hundredths of the PICTURE's width, not the scene's,
 * so the same badge covers the same painted tape whether the picture is 239
 * pixels wide on a desk or 96 on a phone. The phone showed why this matters: at
 * a fixed size the badge shrank out of the way and the painted 620% — a number
 * from the day the scene was made — read as today's conversion.
 */
const TAPE = { rise: 2.4, tilt: -6, size: 8.7, padY: 5.7, padX: 4.0 }

const FRAMES = {
  'Lead': { icon: Users, x0: 73, x1: 339,
    tint: 'from-sky-200 to-emerald-100', tape: '#e8e2d6' },
  'Pipeline': { icon: TrendingUp, x0: 360, x1: 633,
    tint: 'from-emerald-200 to-sky-100', tape: '#d3e4e0' },
  'Offer Presented': { icon: FileText, x0: 650, x1: 900,
    tint: 'from-indigo-200 to-sky-100', tape: '#f2dfe0' },
  'BackLog': { icon: Clock, x0: 919, x1: 1168,
    tint: 'from-amber-200 to-rose-100', tape: '#e8e2d6' },
  'Invoiced': { icon: CheckCircle2, x0: 1189, x1: 1434,
    tint: 'from-orange-200 to-rose-200', tape: '#f5dfe2' },
}

/**
 * The consolidated totals, as a length of 35mm film.
 *
 * The strip in the scene is a piece of paper lying on a desk, photographed from
 * slightly above, so it is not a rectangle: 169px tall at the near end and
 * 130px at the far one. A rotated box misses the corners and lets a cream edge
 * of the printed one peek out, which reads as a printing fault — so what is
 * drawn is clipped to the quadrilateral the paper actually occupies, measured
 * off the file and then let out six pixels all round so nothing survives
 * underneath.
 *
 * The film is not painted black. A negative is translucent: the desk it lies on
 * is still there, dimmed and warmed. So the base is the wood from the band just
 * above the strip — real grain, at its real colours — with the emulsion laid
 * over it, and a heavy black block at the foot of a warm page is exactly what
 * that avoids.
 */
const STRIP = { x: 136, y: 734, w: 1197, h: 182 }
const WOOD = { x: 136, y: 720, w: 1197, h: 14 }   // the desk, just above the strip

/** The emulsion over that wood, and the amber it lets through. */
const EMULSION = 'linear-gradient(101deg, rgba(46,32,22,.90) 0%, rgba(31,21,14,.93) 40%, ' +
                 'rgba(24,16,11,.94) 74%, rgba(18,12,8,.95) 100%)'
const BACKLIGHT = 'radial-gradient(120% 180% at 30% 120%, rgba(217,150,63,.20), transparent 60%)'
const FILM_HOLE = '#7d5330'      // the desk, seen through a sprocket hole
const FILM_EDGE = '#d9963f'      // the amber of Fujifilm edge print

/** A 35mm perforation, and how often it repeats. */
const PERF = { pitch: 34, w: 15, h: 11, inset: 6 }

/** Where the four totals sit along the strip. */
const COLUMNS = [
  { x0: 148, x1: 430, pad: 46 },
  { x0: 430, x1: 879, pad: 22 },
  { x0: 879, x1: 1096, pad: 28 },
  { x0: 1096, x1: 1325, pad: 60 },
]
/**
 * The bands down the film, as offsets from whichever edge owns them.
 *
 * They are offsets rather than percentages because the far end of the strip is
 * 122px tall against 169px at the near end: a band set at a percentage is a
 * different band at each end, and the exposure numbers end up printed across
 * the totals. The budget at the narrow end is what fixes the type sizes — top
 * perforations and edge print take 30, the bottom perforations 17, and what is
 * left is 75 for a label, a number and a line under it.
 */
const BAND = { edgePrint: 19, content: 32, bottomPerf: 17 }

/**
 * The handwritten line runs along the film rather than across it. The bottom
 * edge falls 39px over the strip's length, so a level line would dive into the
 * perforations before it finished the sentence; set at the edge's own angle it
 * stays where the scene puts it. It only reaches as far as the film is tall
 * enough to hold it, which is about where the scene stops it too.
 */
const FOOTER = { x: 212, y: 866, tilt: -1.2 }

/**
 * The strip's own edges, as a y for a given x, each already let out six pixels
 * past the paper it covers.
 *
 * The top is very nearly level. The bottom is not, and it is not straight
 * either: it falls gently for most of its length and then drops five times as
 * fast over the last two hundred pixels, where the paper curls away from the
 * camera. A single straight line was tried and a cream sliver of the printed
 * strip showed under the middle of the film for its whole width — fourteen
 * pixels of it at the worst point — so the fall is taken in two pieces, which
 * is what the file says it does.
 *
 * The perforations and the frames are placed against these rather than at a
 * percentage of the height: the far end is sixty pixels shorter than the near
 * one, and a band set at a percentage walks off the film before it gets there.
 */
const topEdgeAt = x => 738 + 0.00595 * (x - 148)
const bottomEdgeAt = x => (x <= 1040 ? 910 - 0.0205 * (x - 260) : 894 - 0.105 * (x - 1040))
const RIGHT_TOP = 1333
const RIGHT_BOTTOM = 1312   // the far end leans back as it goes down

/** The film's outline, walked from the measurements rather than hand-written. */
function stripOutline() {
  const pts = [[STRIP.x, topEdgeAt(STRIP.x)], [RIGHT_TOP, topEdgeAt(RIGHT_TOP)]]
  for (const x of [RIGHT_BOTTOM, 1100, 1040, 800, 500, STRIP.x]) {
    pts.push([x, bottomEdgeAt(x)])
  }
  return pts
}

// The handwriting, shipped with the app (see index.css). The stack behind it is
// only there for the instant before the file lands.
const HAND = { fontFamily: "'BB Hand', 'Segoe Script', 'Bradley Hand', cursive" }

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

/**
 * The share of the stage before that reached this one, on the strip of tape the
 * scene sticks across the picture's top corner.
 *
 * Drawn over the picture but not inside it: the tape in the scene overhangs the
 * print, and a badge clipped to the print leaves the painted tape showing round
 * itself. Its parent is the picture's own box, which is what makes it a
 * container query and what makes one badge serve both layouts.
 */
function TapeBadge({ f, conf }) {
  if (f.fromPrevious === null) return null
  return (
    <span className="absolute right-0 text-gray-800 font-bold shadow-sm"
      style={{
        top: `${-TAPE.rise}cqw`, transform: `rotate(${TAPE.tilt}deg)`,
        background: conf.tape, lineHeight: 1,
        fontSize: `${TAPE.size}cqw`, padding: `${TAPE.padY}cqw ${TAPE.padX}cqw`,
      }}>
      {f.fromPrevious}%
    </span>
  )
}

/** The picture inside one frame, cut from the scene. */
function framePhoto(conf) {
  const x = conf.x0 + PHOTO_INSET
  const w = (conf.x1 - PHOTO_INSET) - x
  return crop(x, PHOTO_TOP, w, PHOTO_BOTTOM - PHOTO_TOP)
}

/**
 * @param owner  quando dado, o funil mostra a carteira desta pessoa e não a da
 *               empresa. É um FILTRO de vista pessoal, não uma permissão: o que
 *               fica de fora continua a contar em todo o lado onde se reporta.
 */
export default function InstaxFunnel({ selectedBU = '', owner = null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { deals, loading } = useDeals()

  // O âmbito primeiro — a BU — e só depois o dono, para a contagem do que ficou
  // de fora ser sobre o que esta pessoa poderia ver e não sobre a casa toda.
  const inScope = useMemo(
    () => (deals || []).filter(d => !d.is_intercompany_mirror && (!selectedBU || d.bu === selectedBU)),
    [deals, selectedBU])
  const mine = useMemo(() => (owner ? ownedBy(inScope, owner) : null), [inScope, owner])
  const shown = mine ? mine.deals : inScope

  const { stages, lost, total } = useMemo(
    () => stageFunnel(shown, { bu: selectedBU }), [shown, selectedBU]
  )
  const frames = useMemo(() => conversion(stages), [stages])

  const open = stage => navigate(`/deals?stage=${encodeURIComponent(stage)}`)

  if (loading) return <Spinner label={t('ifn_title')}/>

  /**
   * The four exposures. Each one opens what it counts, so a total on the film
   * is a way into the deals behind it and not only a number to read: the open
   * pipeline is every stage that has not been invoiced, and the weighted
   * forecast belongs to Forecast, where the weighting is explained.
   */
  const figures = [
    { icon: Layers, label: t('ifn_open'), value: formatK(total.openValue),
      hint: `${total.openCount} ${t('ifn_deals')}`, exposure: '01A', to: '/deals?open=1' },
    { icon: BarChart3, label: t('ifn_weighted'), value: formatK(total.weighted),
      hint: t('ifn_weighted_hint'), exposure: '02A', to: '/forecast' },
    { icon: ClipboardCheck, label: t('ifn_invoiced'), value: formatK(total.invoiced),
      hint: `${total.invoicedCount} ${t('ifn_deals')}`, exposure: '03A',
      to: '/deals?stage=Invoiced', tone: 'text-green-700', film: '#7fd39b' },
    { icon: AlertTriangle, label: t('ifn_lost'), value: formatK(lost.value),
      hint: `${lost.count} ${t('ifn_deals')}`, exposure: '04A',
      to: '/deals?stage=Lost', tone: 'text-red-600', film: '#e9857c' },
  ]

  return (
    <>
      {/* Um funil vazio lê-se como "não tens pipeline". Quando a razão é que
          nada tem o teu nome, isso é outra coisa, e o ecrã tem de o dizer —
          BR-062 aplicado a um filtro em vez de a uma leitura falhada.
          Aparece só quando há mesmo alguma coisa escondida. */}
      {mine && mine.hidden > 0 && (
        <p className="text-micro text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          {t('ifn_mine_only').replace('{n}', mine.hidden)}
          {mine.unassigned > 0 && ' ' + t('ifn_unassigned').replace('{n}', mine.unassigned)}
        </p>
      )}

      {/* The scene, at its own proportions, from a tablet upwards. Below that
          it would be five thumbnails of unreadable type, so the phone gets the
          list underneath instead — same pictures, same figures, stacked. */}
      <div className="hidden md:block relative w-full rounded-2xl overflow-hidden shadow-sm
                      bg-[#f6f1e8] bg-cover bg-center"
        style={{ aspectRatio: `${ART_W} / ${ART_H}`, backgroundImage: `url(${ART})`,
                 containerType: 'inline-size' }}>
        {frames.map(f => <SceneFrame key={f.stage} f={f} t={t} onOpen={() => open(f.stage)}/>)}
        <SceneFilm figures={figures} t={t} onOpen={to => navigate(to)}/>
      </div>

      <div className="md:hidden space-y-3">
        <PhoneHeader t={t}/>
        {frames.map(f => <PhoneFrame key={f.stage} f={f} t={t} onOpen={() => open(f.stage)}/>)}
        <PhoneFilm figures={figures} t={t} onOpen={to => navigate(to)}/>
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

      <div className="absolute"
        style={{
          left: pct(PHOTO_INSET + OVERHANG, box.w),
          right: pct(PHOTO_INSET + OVERHANG, box.w),
          top: pct(PHOTO_TOP - box.y, box.h),
          height: pct(PHOTO_BOTTOM - PHOTO_TOP, box.h),
          containerType: 'inline-size',
        }}>
        <span className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${conf.tint}`}
          style={framePhoto(conf)}/>
        <TapeBadge f={f} conf={conf}/>
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

function SceneFilm({ figures, t, onOpen }) {
  // Everything inside is placed against the strip's own box, so the sums read
  // as what they are: this total sits where that total is printed.
  const inX = v => pct(v - STRIP.x, STRIP.w)
  const inY = v => pct(v - STRIP.y, STRIP.h)

  // The perforations, walked along the film's two real edges.
  const perfs = []
  for (let x = STRIP.x + 10; x < STRIP.x + STRIP.w - PERF.w; x += PERF.pitch) {
    const mid = x + PERF.w / 2
    perfs.push({ x, y: topEdgeAt(mid) + PERF.inset })
    perfs.push({ x, y: bottomEdgeAt(mid) - PERF.inset - PERF.h })
  }

  return (
    <div className="absolute"
      style={{
        left: pct(STRIP.x, ART_W), width: pct(STRIP.w, ART_W),
        top: pct(STRIP.y, ART_H), height: pct(STRIP.h, ART_H),
        clipPath: `polygon(${stripOutline().map(([x, y]) =>
          `${inX(x)} ${inY(y)}`).join(', ')})`,
        ...crop(WOOD.x, WOOD.y, WOOD.w, WOOD.h),
      }}>

      {/* The emulsion over the wood, and the warmth a negative gives back to
          whatever is behind it. */}
      <div className="absolute inset-0" style={{ backgroundImage: EMULSION }}/>
      <div className="absolute inset-0" style={{ backgroundImage: BACKLIGHT }}/>

      {perfs.map((p, i) => (
        <span key={i} className="absolute"
          style={{
            left: inX(p.x), top: inY(p.y),
            width: pct(PERF.w, STRIP.w), height: pct(PERF.h, STRIP.h),
            background: FILM_HOLE, borderRadius: '0.18cqw',
            boxShadow: 'inset 0 0.08cqw 0.16cqw rgba(0,0,0,.55)',
          }}/>
      ))}

      {figures.map((fig, i) => {
        const c = COLUMNS[i]
        const light = fig.film || '#f0e2cd'
        return (
          <button key={fig.label} type="button" onClick={() => onOpen(fig.to)}
            aria-label={`${fig.label} — ${fig.value}, ${fig.hint}`}
            className="absolute text-left group focus:outline-none"
            style={{ left: inX(c.x0), width: pct(c.x1 - c.x0, STRIP.w),
                     top: inY(topEdgeAt(c.x0) + PERF.inset + PERF.h),
                     height: pct(bottomEdgeAt(c.x1) - topEdgeAt(c.x0)
                                 - PERF.inset - PERF.h - BAND.bottomPerf, STRIP.h) }}>

            {/* Light through the negative, the way a frame looks when it is
                lifted onto a light table. */}
            <span className="absolute inset-0 opacity-0 group-hover:opacity-100
                             group-focus-visible:opacity-100 transition-opacity duration-200"
              style={{ background: 'radial-gradient(90% 120% at 50% 50%,' +
                                   ' rgba(217,150,63,.28), transparent 72%)' }}/>

            {/* The line between one exposure and the next. */}
            {i > 0 && (
              <span className="absolute left-0 top-0 bottom-0"
                style={{ width: '0.1cqw', background: 'rgba(240,226,205,.22)' }}/>
            )}

            <span className="absolute flex items-start"
              style={{ left: pct(c.pad, c.x1 - c.x0), right: 0,
                       top: pct(BAND.edgePrint, frameHeight(c)), gap: '0.8cqw' }}>
              <fig.icon style={{ width: '2.2cqw', height: '2.2cqw', marginTop: '0.35cqw',
                                 color: light }} className="shrink-0" strokeWidth={1.5}/>
              <span className="min-w-0 block">
                <span className="block uppercase leading-none"
                  style={{ fontSize: '0.9cqw', letterSpacing: '0.12em', color: 'rgba(240,226,205,.72)' }}>
                  {fig.label}
                </span>
                <span className="block font-bold leading-none"
                  style={{ fontSize: '2.3cqw', marginTop: '0.55cqw', color: light,
                           textShadow: '0 0 0.45em rgba(217,150,63,.40)' }}>
                  {fig.value}
                </span>
                <span className="block leading-none whitespace-nowrap"
                  style={{ fontSize: '0.85cqw', marginTop: '0.6cqw', color: 'rgba(240,226,205,.60)' }}>
                  {fig.hint}
                </span>
              </span>
            </span>
          </button>
        )
      })}

      {/* Edge print, in the amber every roll of this film is marked with. The
          numbers are exposure numbers, and they belong to the frames they sit
          under. */}
      {figures.map((fig, i) => (
        <span key={`e${i}`} className="absolute uppercase whitespace-nowrap"
          style={{ left: inX(COLUMNS[i].x0 + 8),
                   top: inY(topEdgeAt(COLUMNS[i].x0) + PERF.inset + PERF.h + 2),
                   fontSize: '0.62cqw', letterSpacing: '0.18em', color: FILM_EDGE, opacity: 0.8 }}>
          {i === 0 ? 'FUJIFILM · SALES 2026' : `FRAME ${String(i + 1).padStart(2, '0')}`}
        </span>
      ))}
      {figures.map((fig, i) => (
        <span key={`n${i}`} className="absolute"
          style={{ left: inX(COLUMNS[i].x0 + 8),
                   top: inY(bottomEdgeAt(COLUMNS[i].x0) - BAND.bottomPerf - 12),
                   fontSize: '0.62cqw', letterSpacing: '0.18em', color: FILM_EDGE, opacity: 0.7 }}>
          {fig.exposure}
        </span>
      ))}

      {/* The line from the scene, kept where the scene keeps it: on the film,
          at the near end, running along the edge rather than across it. */}
      <p className="absolute leading-none whitespace-nowrap origin-left"
        style={{ ...HAND, left: inX(FOOTER.x), top: inY(FOOTER.y),
                 transform: `rotate(${FOOTER.tilt}deg)`,
                 fontSize: '1.3cqw', color: 'rgba(240,226,205,.78)' }}>
        {t('ifn_footer')} <span style={{ fontFamily: 'system-ui', color: '#e9857c' }}>♥</span>
      </p>
    </div>
  )
}

/** How tall one exposure is — the film between the two rows of perforations. */
function frameHeight(c) {
  return bottomEdgeAt(c.x1) - topEdgeAt(c.x0) - PERF.inset - PERF.h - BAND.bottomPerf
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
      className="min-h-tap w-full text-left bg-[#fbf7f0] rounded-[3px] shadow-md ring-1 ring-black/5
                 p-2 pb-3 flex gap-3 items-center">
      <div className="w-28 shrink-0 relative"
        style={{ aspectRatio: `${w} / ${PHOTO_BOTTOM - PHOTO_TOP}`,
                 containerType: 'inline-size' }}>
        <span className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${conf.tint}`}
          style={framePhoto(conf)}/>
        <TapeBadge f={f} conf={conf}/>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base text-gray-900 flex items-center gap-1.5" style={HAND}>
          <Icon size={14} className="text-gray-600"/>
          {t(`ifn_s_${key}`)}
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

/**
 * The same four totals, on the same film, held the other way up.
 *
 * A phone cannot take four exposures across, so the strip runs vertically and
 * the perforations run down the two sides. The base is a gradient rather than a
 * crop of the desk: the scene's film lies on that desk and borrows its grain,
 * this one lies on a list and has nothing to borrow, and a fourteen-pixel band
 * of wood stretched over a panel this tall bands into stripes.
 *
 * Every frame opens what it counts, the same as on the desk. A total you cannot
 * walk into is a total you cannot check.
 */
function PhoneFilm({ figures, t, onOpen }) {
  return (
    <div className="relative rounded-lg overflow-hidden shadow-sm"
      style={{ background: 'linear-gradient(160deg,#3a2a1d,#241812 58%,#1b120d)' }}>
      <div className="absolute inset-0" style={{ backgroundImage: BACKLIGHT }}/>
      {['left-0', 'right-0'].map(side => (
        <div key={side} className={`absolute ${side} top-0 bottom-0`}
          style={{
            width: 13,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 9px,` +
                             ` ${FILM_HOLE} 9px 23px)`,
            backgroundPosition: '0 6px',
          }}/>
      ))}

      <div className="relative px-5 pt-2 pb-3">
        <p className="uppercase" style={{ fontSize: 8, letterSpacing: '0.18em',
                                          color: FILM_EDGE, opacity: 0.8 }}>
          FUJIFILM · SALES 2026
        </p>
        <div className="grid grid-cols-2 gap-x-3 mt-1.5">
          {figures.map((fig, i) => (
            <button key={fig.label} type="button" onClick={() => onOpen(fig.to)}
              aria-label={`${fig.label} — ${fig.value}, ${fig.hint}`}
              className={`text-left flex items-start gap-2 py-2 active:opacity-70
                          ${i % 2 ? 'pl-3 border-l' : ''} ${i > 1 ? 'border-t' : ''}`}
              style={{ borderColor: 'rgba(240,226,205,.18)' }}>
              <fig.icon size={15} className="shrink-0 mt-0.5"
                style={{ color: fig.film || '#f0e2cd' }} strokeWidth={1.5}/>
              <span className="min-w-0 block">
                <span className="block uppercase leading-none"
                  style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(240,226,205,.72)' }}>
                  {fig.label}
                </span>
                <span className="block font-bold leading-none mt-1"
                  style={{ fontSize: 20, color: fig.film || '#f0e2cd' }}>{fig.value}</span>
                <span className="block leading-tight mt-1"
                  style={{ fontSize: 9, color: 'rgba(240,226,205,.6)' }}>{fig.hint}</span>
              </span>
              <span className="ml-auto self-end" style={{ fontSize: 8, letterSpacing: '0.16em',
                                                          color: FILM_EDGE, opacity: 0.65 }}>
                {fig.exposure}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 leading-tight"
          style={{ ...HAND, fontSize: 13, color: 'rgba(240,226,205,.78)' }}>
          {t('ifn_footer')} <span style={{ fontFamily: 'system-ui', color: '#e9857c' }}>♥</span>
        </p>
      </div>
    </div>
  )
}
