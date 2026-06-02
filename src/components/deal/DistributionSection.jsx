import SearchableSelect from '../SearchableSelect'
import { formatK } from '../ui'
import { DISTRIBUTION_PATHS, computeMargins } from '../../constants'

// ── MarginsPanel — live calculation of margin per level ──────────────────
function MarginsPanel({ form, t }) {
  const m = computeMargins({
    distribution_path:  form.distribution_path,
    value_total:        parseFloat(form.value_total) || 0,
    vgt_cost:           parseFloat(form.vgt_cost) || 0,
    distributor_price:  parseFloat(form.distributor_price) || 0,
    end_customer_price: parseFloat(form.end_customer_price) || 0,
  })
  if (!m) return null
  const rows = [
    { label: 'VGT', value: m.vgt, color: 'bg-vgt/10 text-vgt' },
    ...(m.hub         ? [{ label: 'Hub',         value: m.hub,         color: 'bg-purple-100 text-purple-700' }] : []),
    ...(m.distributor ? [{ label: 'Distributor', value: m.distributor, color: 'bg-amber-100 text-amber-700'   }] : []),
  ]
  const hasValues = rows.some(r => r.value && (r.value.abs !== 0 || r.value.pct !== 0))
  if (!hasValues) return null
  return (
    <div className="bg-white border border-gray-100 rounded-control p-3">
      <p className="text-micro font-semibold text-gray-700 uppercase tracking-wide mb-2">
        {t("df_margin_per_level")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rows.map(r => (
          <div key={r.label} className={`rounded-control px-3 py-2 ${r.color}`}>
            <p className="text-micro font-semibold uppercase tracking-wide opacity-70">{r.label}</p>
            <p className="text-sm font-bold mt-0.5">{formatK(r.value.abs)}</p>
            <p className="text-micro opacity-70">{r.value.pct.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DistributionSection({ form, set, distributors, hubs, t }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-card p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {t("df_distribution_margins")}
        </p>
        <p className="text-micro text-gray-400 mt-0.5">
          {t("df_distribution_hint")}
        </p>
      </div>

      {/* Path selector */}
      <div className="flex gap-2">
        {DISTRIBUTION_PATHS.map(p => {
          const active = form.distribution_path === p.id
          return (
            <button key={p.id} type="button"
              onClick={() => {
                set('distribution_path', p.id)
                if (p.id === 'direct') { set('hub_id', null) }
              }}
              className={`flex-1 text-left rounded-control border p-3 transition-colors ${
                active
                  ? 'border-navy bg-white ring-2 ring-navy/10'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <p className="text-xs font-bold text-gray-900">{p.label}</p>
              <p className="text-micro text-gray-500 mt-0.5">{p.hint}</p>
            </button>
          )
        })}
      </div>

      {form.distribution_path && (
        <>
          {/* Distributor + Hub selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t("df_distributor")}</label>
              <SearchableSelect
                value={form.distributor_id || ''}
                onChange={v => set('distributor_id', v || null)}
                options={distributors
                  .filter(d => !form.country || !d.country || d.country.toLowerCase() === form.country.toLowerCase())
                  .map(d => ({ value: d.id, label: d.name, hint: d.country }))}
                placeholder={t("df_distributor_search")}
                emptyLabel={t("df_distributor_none")}
              />
            </div>
            {form.distribution_path === 'hub_mediated' && (
              <div>
                <label className="label">{t("df_hub")}</label>
                <SearchableSelect
                  value={form.hub_id || ''}
                  onChange={v => set('hub_id', v || null)}
                  options={hubs.map(h => ({ value: h.id, label: h.name, hint: h.region }))}
                  placeholder={t("df_hub_search")}
                  emptyLabel={t("df_hub_none")}
                />
              </div>
            )}
          </div>

          {/* End customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t("df_end_customer")}</label>
              <input className="input" value={form.end_customer}
                onChange={e => set('end_customer', e.target.value)}
                placeholder={t("df_end_customer_hint")}/>
            </div>
            <div>
              <label className="label">{t("df_ec_value")}</label>
              <input className="input" type="number" value={form.end_customer_value}
                onChange={e => set('end_customer_value', e.target.value)}
                placeholder={t("df_ec_value_hint")}/>
            </div>
          </div>

          {/* Price levels */}
          <div className="bg-white border border-gray-100 rounded-control p-3 space-y-3">
            <p className="text-micro font-semibold text-gray-700 uppercase tracking-wide">
              {t("df_prices_title")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">{t("df_vgt_cost")}</label>
                <input className="input" type="number" value={form.vgt_cost}
                  onChange={e => set('vgt_cost', e.target.value)}
                  placeholder="0"/>
              </div>
              <div>
                <label className="label">
                  {form.distribution_path === 'hub_mediated' ? t("df_price_vgt_hub") : t("df_price_vgt_distributor")}
                </label>
                <input className="input" type="number" value={form.value_total}
                  onChange={e => set('value_total', e.target.value)}
                  placeholder="0"/>
              </div>
              {form.distribution_path === 'hub_mediated' && (
                <div>
                  <label className="label">{t("df_price_hub_distributor")}</label>
                  <input className="input" type="number" value={form.distributor_price}
                    onChange={e => set('distributor_price', e.target.value)}
                    placeholder="0"/>
                </div>
              )}
              <div>
                <label className="label">{t("df_price_distributor_client")}</label>
                <input className="input" type="number" value={form.end_customer_price}
                  onChange={e => set('end_customer_price', e.target.value)}
                  placeholder="0"/>
              </div>
            </div>
          </div>

          {/* Live margins */}
          <MarginsPanel form={form} t={t}/>
        </>
      )}
    </div>
  )
}
