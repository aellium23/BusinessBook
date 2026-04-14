import { useMemo } from 'react'
import { formatK } from './ui'

/**
 * Gauge — semicircular "fuel gauge" for Actuals vs Budget.
 *
 * Props:
 *   value    : number (actuals so far)
 *   target   : number (budget for the period)
 *   label    : short title above the gauge (e.g. "VGT External")
 *   subLabel : optional qualifier below the label
 *   color    : accent colour for the fill; defaults to navy
 *   py       : optional prior-year value for the delta pill
 *   size     : 'sm' | 'md' | 'lg'  (default 'md')
 *   unit     : 'K€' (default via formatK) — optional override
 */
export default function Gauge({
  value = 0,
  target = 0,
  label,
  subLabel,
  color = '#0D2137',
  py,
  size = 'md',
  showCenter = true,
}) {
  const pct = target > 0 ? Math.min(Math.max((value / target) * 100, 0), 140) : 0
  // Cap visual fill at 100% but keep the actual figure for display
  const visualPct = Math.min(pct, 100)

  // Geometry
  const dimensions = size === 'sm' ? { w: 140, r: 52, stroke: 12, font: 'text-xl' }
                   : size === 'lg' ? { w: 220, r: 88, stroke: 20, font: 'text-3xl' }
                                   : { w: 180, r: 72, stroke: 16, font: 'text-2xl' }
  const { w, r, stroke, font } = dimensions
  const h = w / 2 + stroke
  const cx = w / 2
  const cy = w / 2
  // Semicircle arc path (180° → 0°)
  const arcStart = { x: cx - r, y: cy }
  const arcEnd   = { x: cx + r, y: cy }
  const arcLen   = Math.PI * r   // length of semicircle
  const dashOn   = arcLen * (visualPct / 100)
  const dashOff  = arcLen - dashOn

  // Colour by performance: red < 70%, amber 70-95%, green ≥ 95% of target,
  // when the user hasn't overridden `color`.
  const perfColor = pct >= 95 ? '#16A34A'    // green
                  : pct >= 70 ? '#D97706'    // amber
                  :             '#DC2626'    // red
  const fill = color === '#0D2137' ? perfColor : color

  // Delta vs prior year
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
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dashOn} ${dashOff}`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />

        {/* Center value */}
        {showCenter && (
          <>
            <text
              x={cx} y={cy - 6}
              textAnchor="middle"
              className={`${font} font-bold`}
              fill={fill}>
              {Math.round(pct)}%
            </text>
            <text
              x={cx} y={cy + 14}
              textAnchor="middle"
              className="text-micro"
              fill="#9CA3AF">
              of target
            </text>
          </>
        )}
      </svg>

      {/* Value row */}
      <div className="flex items-center justify-center gap-2 text-center -mt-1">
        <span className="text-sm font-bold text-gray-900">{formatK(value)}</span>
        <span className="text-gray-300">/</span>
        <span className="text-xs text-gray-500">{formatK(target)}</span>
      </div>

      {/* Prior-year delta */}
      {delta !== null && (
        <span className={`mt-1 inline-flex items-center gap-0.5 text-micro font-semibold px-1.5 py-0.5 rounded ${
          delta >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs PY
        </span>
      )}
    </div>
  )
}
