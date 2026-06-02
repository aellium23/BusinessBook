import { useTranslation } from '../../hooks/useTranslation'

const FY26_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const ALL_MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function calcSLARecognition({ startDay, startMonth, startYear, endDay, endMonth, endYear, billingMonth, billingYear, annualValue, currency, exchangeRate }) {
  if (!startMonth || !startYear || !endMonth || !endYear || !billingMonth || !billingYear || !annualValue) return null

  const startDate = new Date(`${startYear}-${String(ALL_MONTHS.indexOf(startMonth)+1).padStart(2,'0')}-${String(startDay||1).padStart(2,'0')}`)
  const endDate   = new Date(`${endYear}-${String(ALL_MONTHS.indexOf(endMonth)+1).padStart(2,'0')}-${String(endDay||28).padStart(2,'0')}`)
  const billDate  = new Date(`${billingYear}-${String(ALL_MONTHS.indexOf(billingMonth)+1).padStart(2,'0')}-01`)

  // Total contract duration in days
  const totalDays = (endDate - startDate) / 86400000 + 1
  if (totalDays <= 0) return null

  // Daily rate
  const rate = parseFloat(exchangeRate) || 1
  const valueEUR = parseFloat(annualValue) * (currency === 'EUR' ? 1 : rate)
  const dailyRate = valueEUR / totalDays

  // FY26 months: Apr 2026 → Mar 2027
  const fy26Start = new Date('2026-04-01')
  const fy26End   = new Date('2027-03-31')

  const recognition = {}
  FY26_MONTHS.forEach((m, i) => {
    const yr = i < 9 ? 2026 : 2027  // Apr-Dec=2026, Jan-Mar=2027
    const mNum = ALL_MONTHS.indexOf(m) + 1
    const monthStart = new Date(`${yr}-${String(mNum).padStart(2,'0')}-01`)
    const monthEnd   = new Date(yr, mNum, 0) // last day of month
    recognition[m] = { days: 0, value: 0, type: 'none' }

    // Is this month within contract period?
    if (monthEnd < startDate || monthStart > endDate) return

    // Days of contract within this month
    const overlapStart = monthStart < startDate ? startDate : monthStart
    const overlapEnd   = monthEnd > endDate ? endDate : monthEnd
    const days = Math.max(0, (overlapEnd - overlapStart) / 86400000 + 1)
    recognition[m].days = days
    recognition[m].rawValue = dailyRate * days
  })

  // Apply billing logic: on billing month, catch up all previous months
  const billMonthIdx = FY26_MONTHS.indexOf(billingMonth)
  if (billMonthIdx < 0) return null

  let catchupTotal = 0
  FY26_MONTHS.forEach((m, i) => {
    if (i < billMonthIdx) {
      catchupTotal += recognition[m].rawValue || 0
      recognition[m].value = 0
      recognition[m].type = 'deferred'
    }
  })

  // Billing month = catchup + own month
  const billM = FY26_MONTHS[billMonthIdx]
  recognition[billM].value = catchupTotal + (recognition[billM].rawValue || 0)
  recognition[billM].type = 'billing'

  // Remaining months after billing = normal
  FY26_MONTHS.forEach((m, i) => {
    if (i > billMonthIdx) {
      recognition[m].value = recognition[m].rawValue || 0
      recognition[m].type = recognition[m].days > 0 ? 'normal' : 'none'
    }
  })

  const totalRecognized = FY26_MONTHS.reduce((s,m) => s + recognition[m].value, 0)
  return { recognition, totalRecognized, totalDays, dailyRate, valueEUR }
}

export default function RevenueRecognitionPanel({ form }) {
  const { t } = useTranslation()

  if (!form.is_sla || !form.sla_billing_month || !form.sla_billing_year ||
      !form.sla_annual_value || !form.cs_month || !form.cs_year ||
      !form.ce_month || !form.ce_year) return null

  const result = calcSLARecognition({
    startDay: parseInt(form.cs_day)||1,
    startMonth: form.cs_month, startYear: parseInt(form.cs_year),
    endDay: parseInt(form.ce_day)||31,
    endMonth: form.ce_month, endYear: parseInt(form.ce_year),
    billingMonth: form.sla_billing_month,
    billingYear: parseInt(form.sla_billing_year),
    annualValue: form.sla_annual_value,
    currency: form.currency, exchangeRate: form.exchange_rate,
  })
  if (!result) return null

  const catchupMonths = FY26_MONTHS.indexOf(form.sla_billing_month)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Revenue recognition · FY26</p>
        <span className="text-xs font-bold text-blue-700">
          Total €{Math.round(result.totalRecognized).toLocaleString()}
        </span>
      </div>
      {/* 12 month grid - 2 rows of 6 */}
      <div className="grid grid-cols-6 gap-1.5">
        {FY26_MONTHS.map(m => {
          const r = result.recognition[m]
          const v = Math.round(r?.value || 0)
          const tp = r?.type || 'none'
          return (
            <div key={m} className={`rounded-lg p-2 text-center ${
              tp==='billing'  ? 'bg-blue-600 text-white' :
              tp==='normal'   ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              tp==='deferred' ? 'bg-gray-50 text-gray-400 border border-gray-100' :
                                 'bg-white text-gray-200 border border-gray-100'
            }`}>
              <div className="text-[10px] font-semibold">{m}</div>
              <div className={`text-[11px] font-bold mt-0.5 ${tp==='billing'?'text-white':''}`}>
                {v>0 ? `€${v>=1000?Math.round(v/100)/10+'K':v}` : '—'}
              </div>
              {tp==='billing' && <div className="text-[8px] opacity-75 mt-0.5">BILL</div>}
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block"/> Billing (catchup {catchupMonths}m)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-100 inline-block"/>{t("df_linear")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-50 border border-gray-100 inline-block"/>{t("df_deferred")}</span>
      </div>
    </div>
  )
}
