const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

export default function DealMonthlyGrid({ form, set, t }) {
  return (
    <div>
      <p className="label mb-2">{t("df_monthly_recognition")}</p>
      {form.go_live_month && (() => {
        const glIdx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(form.go_live_month)
        const fyIdx = (glIdx - 3 + 12) % 12
        const hasRevenueBeforeGL = MONTHS_K.slice(0, fyIdx).some(m => form[m] > 0)
        return hasRevenueBeforeGL ? (
          <p className="text-micro text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
            ⚠ Revenue recognized before Go-Live ({form.go_live_month} {form.go_live_year}) — verify with finance
          </p>
        ) : null
      })()}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {MONTHS.map((m, i) => (
          <div key={m}>
            <label className="text-micro text-gray-400">{m}</label>
            <input className="input py-1 text-xs" type="number"
              value={form[MONTHS_K[i]] || ''} onChange={e => set(MONTHS_K[i], e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
    </div>
  )
}
