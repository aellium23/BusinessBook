import { useMemo } from 'react'
import { formatK } from './ui'

/**
 * Gauge — semicircular "fuel gauge" for Actuals vs Budget, with optional
 * forecast pointer layered on top of the track.
 *
 * Props:
 *   value     : number (actuals so far — filled arc)
 *   forecast  : number (optional — where we expect to land; renders as a tick on the track)
 *   target    : number (budget for the period)
 *   label     : short title above the gauge
 *   subLabel  : optional qualifier below the label
 *   color     : accent colour for the fill; defaults to performance-coloured
 *   py        : optional prior-year value for the delta pill
 *   size      : 'sm' | 'md' | 'lg'  (default 'md')
 */
export default function Gauge({
  value = 0,
  forecast,
  target = 0,
  label,
  subLabel,
  color = '#0D2137',
  py,
  size = 'md',
  showCenter = true,
}) {
  const pct   = target > 0 ? Math.max((value / target) * 100, 0) : 0
  const pctFC = (target > 0 && forecast != null)
    ? Math.max((forecast / target) * 100, 0)
    : null

  const visualPct   = Math.min(pct, 100)
  const visualPctFC = pctFC != null ? Math.min(pctFC, 100) : null

  const dimensions = size === 'sm' ? { w: 140, r: 52, stroke: 12, font: 'text-xl'   }
                   : size === 'lg' ? { w: 220, r: 88, stroke: 20, font: 'text-3xl'  }
                                   : { w: 180, r: 72, stroke: 16, font: 'text-2xl'  }
  const { w, r, stroke, font } = dimensions
  const h  = w / 2 + stroke + 14
  const cx = w / 2
  const cy = w / 2
  const arcStart = { x: cx - r, y: cy }
  const arcEnd   = { x: cx + r, y: cy }
  const arcLen   = Math.PI * r
  const dashOn   = arcLen * (visualPct / 100)
  const dashOff  = arcLen - dashOn

  const perfColor = pct >= 95 ? '#16A34A' : pct >= 70 ? '#D97706' : '#DC2626'
  const fill = color === '#0D2137' ? perfColor : color

  // Forecast pointer position (angle 180° at left, 0° at right)
  let fcPoint = null
  if (visualPctFC != null) {
    const ratio = visualPctFC / 100
    const angle = Math.PI * (1 - ratio)
    fcPoint = {
      x:   cx + r * Math.cos(angle),
      y:   cy - r * Math.sin(angle),
      tx1: cx + (r - stroke * 0.9) * Math.cos(angle),
      ty1: cy - (r - stroke * 0.9) * Math.sin(angle),
      tx2: cx + (r + stroke * 0.9) * Math.cos(angle),
      ty2: cy - (r + stroke * 0.9) * Math.sin(angle),
    }
  }

  const delta = py > 0 ? ((value - py) / py) * 100 : null

  return (
    <div className="flex flex-col items-center">
      {(label || subLabel) && (
        <div className="text-center mb-2">
          {label && <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</p>}
          {subLabel && <p className="text-micro text-gray-400 mt-0.5">{subLabel}</p>}
        </div>
      )}

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {/* Track */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none" stroke="#E5E7EB"
          strokeWidth={stroke} strokeLinecap="round"
        />
        {/* Filled arc (actuals) */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none" stroke={fill}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dashOn} ${dashOff}`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
        {/* Forecast pointer */}
        {fcPoint && (
          <g>
            <line x1={fcPoint.tx1} y1={fcPoint.ty1} x2={fcPoint.tx2} y2={fcPoint.ty2}
              stroke="#1E40AF" strokeWidth={3} strokeLinecap="round"/>
            <circle cx={fcPoint.x} cy={fcPoint.y} r={4}
              fill="#fff" stroke="#1E40AF" strokeWidth={2}/>
          </g>
        )}
        {/* Center value */}
        {showCenter && (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" className={`${font} font-bold`} fill={fill}>
              {Math.round(pct)}%
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" className="text-micro" fill="#9CA3AF">
              actuals
            </text>
          </>
        )}
      </svg>

      <div className="flex items-center justify-center gap-2 text-center -mt-1">
        <div className="text-center">
          <span className="text-sm font-bold text-gray-900">{formatK(value)}</span>
          <p className="text-micro text-gray-400 leading-tight">Actuals</p>
        </div>
        <span className="text-gray-300">/</span>
        <div className="text-center">
          <span className="text-xs text-gray-500">{formatK(target)}</span>
          <p className="text-micro text-gray-400 leading-tight">Budget</p>
        </div>
      </div>

      {pctFC != null && (
        <div className="flex items-center justify-center gap-1 mt-1 text-micro">
          <span className="text-blue-700 font-bold">◆</span>
          <span className="text-gray-500">Forecast: <strong className="text-blue-700">{formatK(forecast)}</strong></span>
          <span className="text-gray-400">· {Math.round(pctFC)}%</span>
        </div>
      )}

      {delta !== null && isFinite(delta) && (
        <span className={`mt-1 inline-flex items-center gap-0.5 text-micro font-semibold px-1.5 py-0.5 rounded ${
          delta >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs PY
        </span>
      )}
    </div>
  )
}
