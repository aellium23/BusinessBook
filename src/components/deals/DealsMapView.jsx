import { useState, useMemo } from 'react'
import { formatK } from '../ui'
import { Globe, MapPin } from 'lucide-react'
import { REGIONS } from '../../constants'

const REGION_COLORS = {
  Europe: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: '#3B82F6' },
  MEA:    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: '#F59E0B' },
  LATAM:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', bar: '#10B981' },
  APAC:   { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: '#8B5CF6' },
  NA:     { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', bar: '#EF4444' },
}

const STAGE_COLORS = {
  Lead: '#9CA3AF', Pipeline: '#F59E0B', 'Offer Presented': '#3B82F6',
  BackLog: '#8B5CF6', Invoiced: '#10B981', Lost: '#EF4444',
}

export default function DealsMapView({ deals }) {
  const [selectedRegion, setSelectedRegion] = useState(null)

  const regionData = useMemo(() => {
    const map = {}
    for (const r of REGIONS) map[r] = { deals: [], countries: {}, total: 0, pipeline: 0, invoiced: 0, stages: {} }
    for (const d of deals) {
      if (d.is_intercompany_mirror) continue
      const r = d.region || 'Europe'
      if (!map[r]) map[r] = { deals: [], countries: {}, total: 0, pipeline: 0, invoiced: 0, stages: {} }
      map[r].deals.push(d)
      map[r].total += Number(d.value_total) || 0
      if (['Pipeline', 'Offer Presented'].includes(d.stage)) map[r].pipeline += Number(d.value_total) || 0
      if (d.stage === 'Invoiced') map[r].invoiced += Number(d.value_total) || 0
      map[r].stages[d.stage] = (map[r].stages[d.stage] || 0) + 1
      const c = d.country || 'Other'
      if (!map[r].countries[c]) map[r].countries[c] = { deals: 0, value: 0, pipeline: 0 }
      map[r].countries[c].deals++
      map[r].countries[c].value += Number(d.value_total) || 0
      if (['Pipeline', 'Offer Presented'].includes(d.stage)) map[r].countries[c].pipeline += Number(d.value_total) || 0
    }
    return map
  }, [deals])

  const maxTotal = Math.max(...Object.values(regionData).map(r => r.total), 1)

  return (
    <div className="space-y-3">
      {/* Region cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REGIONS.map(region => {
          const data = regionData[region]
          if (!data?.deals.length) return null
          const rc = REGION_COLORS[region] || REGION_COLORS.Europe
          const isSelected = selectedRegion === region
          return (
            <button key={region} onClick={() => setSelectedRegion(isSelected ? null : region)}
              className={`card p-4 text-left transition-all ${isSelected ? `ring-2 ring-offset-1 ${rc.border}` : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-sm font-bold ${rc.text} flex items-center gap-1.5`}>
                    <Globe size={14}/> {region}
                  </p>
                  <p className="text-[10px] text-gray-400">{data.deals.length} deals · {Object.keys(data.countries).length} countries</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatK(data.total)}</p>
                  {data.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(data.pipeline)} pipe</p>}
                </div>
              </div>

              {/* Stage distribution bar */}
              <div className="flex rounded-full h-2 overflow-hidden bg-gray-100 mb-2">
                {Object.entries(data.stages).map(([stage, count]) => (
                  <div key={stage}
                    style={{ width: `${(count / data.deals.length) * 100}%`, background: STAGE_COLORS[stage] || '#9CA3AF' }}
                    title={`${stage}: ${count}`}/>
                ))}
              </div>

              {/* Value bar */}
              <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(data.total / maxTotal) * 100}%`, background: rc.bar }}/>
              </div>
            </button>
          )
        })}
      </div>

      {/* Country detail for selected region */}
      {selectedRegion && regionData[selectedRegion] && (
        <div className="card p-4 space-y-2">
          <p className={`text-xs font-bold uppercase tracking-wide ${REGION_COLORS[selectedRegion]?.text || 'text-gray-700'} flex items-center gap-1`}>
            <MapPin size={12}/> {selectedRegion} — Country Breakdown
          </p>
          <div className="space-y-1">
            {Object.entries(regionData[selectedRegion].countries)
              .sort(([, a], [, b]) => b.value - a.value)
              .map(([country, data]) => (
                <div key={country} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{country}</p>
                    <p className="text-[10px] text-gray-400">{data.deals} deal{data.deals !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatK(data.value)}</p>
                    {data.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(data.pipeline)} pipe</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Iberia spotlight */}
      {(() => {
        const pt = regionData.Europe?.countries?.Portugal
        const es = regionData.Europe?.countries?.Spain
        if (!pt && !es) return null
        return (
          <div className="card p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-navy flex items-center gap-1">
              <MapPin size={12}/> Iberia Spotlight
            </p>
            <div className="grid grid-cols-2 gap-3">
              {pt && (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700">Portugal</p>
                  <p className="text-lg font-bold text-gray-900">{formatK(pt.value)}</p>
                  <p className="text-[10px] text-gray-400">{pt.deals} deals</p>
                  {pt.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(pt.pipeline)} pipeline</p>}
                </div>
              )}
              {es && (
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-orange-700">Spain</p>
                  <p className="text-lg font-bold text-gray-900">{formatK(es.value)}</p>
                  <p className="text-[10px] text-gray-400">{es.deals} deals</p>
                  {es.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(es.pipeline)} pipeline</p>}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
