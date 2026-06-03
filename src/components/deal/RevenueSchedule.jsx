import { useMemo } from 'react'
import { getFiscalYear } from '../../constants'

// ── Multi-year revenue recognition schedule ──────────────────────────────
// For "Financed Project" deals: we collect the full value upfront (bank
// financing) but recognise it across several fiscal years. Example LPCC NRC:
// FY1 €936,200 then €237,700 in FY2–FY5.
//
// Stored on the deal as `revenue_by_fy` — a JSON object { FY26: 936200, … }.
// The list of fiscal years is derived from the contract start/end dates.
export default function RevenueSchedule({ contractStart, contractEnd, valueTotal, schedule, onChange, currency = 'EUR', t }) {
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€'

  // Fiscal years spanned by the contract period (Apr→Mar fiscal calendar).
  const fyList = useMemo(() => {
    if (!contractStart) return []
    const start = new Date(contractStart)
    const end = contractEnd ? new Date(contractEnd) : new Date(start.getFullYear() + 4, start.getMonth(), start.getDate())
    if (isNaN(start) || isNaN(end) || end < start) return []
    const years = []
    let cursor = new Date(start)
    let guard = 0
    while (cursor <= end && guard < 12) {
      const fy = getFiscalYear(cursor)
      if (!years.includes(fy)) years.push(fy)
      cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate())
      guard++
    }
    return years
  }, [contractStart, contractEnd])

  const map = schedule && typeof schedule === 'object' ? schedule : {}
  const total = fyList.reduce((s, fy) => s + (Number(map[fy]) || 0), 0)
  const target = Number(valueTotal) || 0
  const diff = target - total

  function setFy(fy, raw) {
    const next = { ...map }
    const n = parseFloat(raw)
    if (!raw || isNaN(n)) delete next[fy]
    else next[fy] = Math.round(n)
    onChange(next)
  }

  function splitEvenly() {
    if (fyList.length === 0 || target <= 0) return
    const per = Math.round(target / fyList.length)
    const next = {}
    fyList.forEach((fy, i) => {
      next[fy] = i === fyList.length - 1 ? target - per * (fyList.length - 1) : per
    })
    onChange(next)
  }

  if (!contractStart) {
    return (
      <p className="text-micro text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        {t ? t('df_rev_schedule_need_dates') : 'Set the contract start/end dates to build the revenue schedule.'}
      </p>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {t ? t('df_rev_schedule') : 'Revenue schedule (deferral)'}
        </p>
        <button type="button" onClick={splitEvenly}
          className="text-micro font-semibold text-navy hover:underline">
          {t ? t('df_rev_split_even') : 'Split evenly'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fyList.map(fy => (
          <div key={fy}>
            <label className="text-micro text-gray-400">{fy} {sym}</label>
            <input className="input text-xs py-1" type="number" min="0"
              value={map[fy] ?? ''}
              onChange={e => setFy(fy, e.target.value)}
              placeholder="0"/>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-micro pt-1 border-t border-gray-100">
        <span className="text-gray-500">
          {t ? t('df_rev_total') : 'Scheduled total'}: <strong className="text-gray-800">{sym}{total.toLocaleString('pt-PT')}</strong>
        </span>
        {target > 0 && (
          <span className={diff === 0 ? 'text-green-600' : 'text-amber-600'}>
            {diff === 0
              ? (t ? t('df_rev_matches') : 'matches deal value')
              : `${diff > 0 ? '+' : ''}${sym}${(-diff).toLocaleString('pt-PT')} ${t ? t('df_rev_vs_value') : 'vs deal value'}`}
          </span>
        )}
      </div>
    </div>
  )
}
