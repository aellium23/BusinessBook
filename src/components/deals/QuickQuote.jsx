import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../hooks/useTranslation'
import { useProducts } from '../../hooks/useProducts'
import { usePricing } from '../../hooks/usePricing'
import { useProductItems } from '../../hooks/useProductItems'
import FamilyItems, { familyCost } from './FamilyItems'
import { saveDealProducts } from '../../hooks/useDealProducts'
import { resolvePrice, pricingRegionForCountry, lineEconomics, pvpForMargin, quoteTotals } from '../../lib/pricing'
import { COUNTRY_MAP, regionForCountry } from '../../constants'
import SearchableSelect from '../SearchableSelect'
import { formatK } from '../ui'
import { X, Check } from 'lucide-react'

const ALL_COUNTRIES = Object.values(COUNTRY_MAP).flat().sort()

// Where each business unit actually sells. VGT is Portugal, ECT is Spain, and
// between them that is very nearly every deal — so the country starts filled in
// and the seventy-odd others sit behind a search box rather than in front of a
// rep who almost never needs them.
const HOME_COUNTRY = { VGT: 'Portugal', ECT: 'Spain' }
const NEARBY = ['Portugal', 'Spain', 'France', 'Italy', 'UK', 'Germany']

// The 90% case: a rep quoting imaging software for a hospital. These surface as
// one-tap chips; everything else in the catalogue sits behind "more".
const HEADLINE_SKUS = ['SYN-PACS', 'CWM-RISBI', 'CWM-DOSE']

// Where a product has no published list price, the sell price starts at cost
// carried to this margin. It is the middle of the standard band the HCUS price
// list itself quotes (15 / 20 / 25 / 30 %), and the rep overrides it per line.
const DEFAULT_MARGIN_PCT = 25

/**
 * Create a deal and price it in one screen.
 *
 * Three inputs drive everything: the client (which gives the country, which
 * gives the pricing region), the annual study volume (which selects the tier on
 * every product at once), and the products. Cost, margin and sell price then
 * fall out, and the rep adjusts margin per line.
 *
 * Margin is gross margin on the sell price — the definition used by deals.gm_pct
 * and the Budget's Gross Margin line — not a markup on cost.
 */
export default function QuickQuote({ onCancel, onCreated, onFullForm }) {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const { products } = useProducts()
  const { regions, countryMap, tiersByProduct, error: pricingError } = usePricing()

  // Everything the rep's own account already tells us is filled in up front.
  const defaultBU = ['VGT', 'ECT'].includes(profile?.bu) ? profile.bu : 'VGT'

  const [client, setClient]   = useState('')
  const [country, setCountry] = useState(HOME_COUNTRY[defaultBU] || 'Portugal')
  const [studies, setStudies] = useState('')
  const [picked, setPicked]   = useState([])        // product ids
  const [overrides, setOver]  = useState({})        // productId -> { cost, pvp }
  const [famSel, setFamSel]   = useState({})        // productId -> { users, itemIds }
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [clients, setClients] = useState([])

  useEffect(() => {
    supabase.from('deals').select('client')
      .then(({ data, error: e }) => {
        if (e) { setError(t('qd_err_clients')); return }
        setClients([...new Set((data || []).map(d => d.client).filter(Boolean))].sort())
      })
      .catch(() => setError(t('qd_err_clients')))
  }, [])

  // The BU's own market first, then its neighbours, then the rest alphabetically.
  const countryOptions = useMemo(() => {
    const home = HOME_COUNTRY[defaultBU]
    const top = [home, ...NEARBY.filter(c => c !== home)].filter(Boolean)
    return [
      ...top.map(c => ({ value: c, label: c })),
      ...ALL_COUNTRIES.filter(c => !top.includes(c)).map(c => ({ value: c, label: c })),
    ]
  }, [defaultBU])

  const regionCode = pricingRegionForCountry(countryMap, country)
  const region = regionCode ? regions[regionCode] : null

  // The supplier SKUs under whichever families are on the quote.
  const { itemsByProduct } = useProductItems(picked)

  const headline = useMemo(
    () => HEADLINE_SKUS.map(sku => products.find(p => p.sku === sku)).filter(Boolean),
    [products]
  )
  // Expanding "more" used to dump the whole catalogue as one unbroken run of
  // chips. Grouped by category it reads as a handful of short lists.
  const restGroups = useMemo(() => {
    const by = new Map()
    for (const p of products) {
      if (HEADLINE_SKUS.includes(p.sku)) continue
      const key = p.category || 'Other'
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(p)
    }
    return [...by.entries()]
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => a.category.localeCompare(b.category))
  }, [products])
  const restCount = useMemo(
    () => restGroups.reduce((n, g) => n + g.items.length, 0),
    [restGroups]
  )

  // One volume figure selects the tier on every picked product at once.
  //
  // Only the CWM products have a published price list. Everything bought in —
  // Synapse PACS, VNA, the partner AI — has a cost and no list price at all, so
  // its sell price is the cost carried up to a target margin, which is exactly
  // the number the rep is here to set. Both kinds have to be quotable in the
  // same screen or the 90% case (PACS + RIS + Dose) cannot be quoted.
  const lines = useMemo(() => {
    const qty = parseFloat(studies) || 0
    return picked.map(id => {
      const product = products.find(p => p.id === id)
      if (!product) return null

      const tiers = tiersByProduct[id]
      const listed = tiers && region && qty
        ? resolvePrice({ product, tiers, discountPct: region.discountPct, quantity: qty })
        : null

      const o = overrides[id] || {}
      // What the supplier price list says this selection costs beats the single
      // figure on the catalogue row: the rep has picked actual SKUs, so use the
      // sum of them and fall back to license_fee only when nothing is picked.
      const fromItems = familyCost(itemsByProduct[id], famSel[id], qty)
      const cost = o.cost !== undefined ? o.cost
        : fromItems > 0 ? fromItems
        : (Number(product.license_fee) || 0)
      const pvp = o.pvp !== undefined ? o.pvp
        : listed ? listed.net
        : pvpForMargin(cost, DEFAULT_MARGIN_PCT) ?? 0

      return {
        id, product,
        listNet: listed?.net ?? null,
        tierLabel: listed?.tierLabel ?? '—',
        boundBy: listed?.boundBy ?? 'tier',
        priced: Boolean(listed),
        ...lineEconomics(cost, pvp),
      }
    }).filter(Boolean)
  }, [picked, products, tiersByProduct, region, studies, overrides, itemsByProduct, famSel])

  const totals = quoteTotals(lines)

  function setCost(id, v) {
    setOver(o => ({ ...o, [id]: { ...(o[id] || {}), cost: parseFloat(v) || 0 } }))
  }
  function setMargin(id, v) {
    const line = lines.find(l => l.id === id)
    if (!line) return
    const pvp = pvpForMargin(line.cost, v)
    if (pvp === null) return
    setOver(o => ({ ...o, [id]: { ...(o[id] || {}), pvp } }))
  }

  async function create() {
    if (!client.trim()) { setError(t('qd_err_client')); return }
    if (!lines.length)  { setError(t('qd_err_product')); return }
    setSaving(true); setError(null)

    const { data, error: e } = await supabase.from('deals').insert({
      client: client.trim(),
      bu: defaultBU,
      country,
      region: regionForCountry(country) || 'Europe',
      stage: 'Lead',
      value_total: totals.pvp,
      gm_pct: totals.marginPct,
      company_id: profile?.company_id || null,
      created_by: profile?.id || null,
    }).select('id, client, bu, country').single()

    if (e) { setSaving(false); setError(`${t('qd_err_create')} ${e.message}`); return }

    const { error: lineErr } = await saveDealProducts(data.id, lines.map(l => ({
      product_id: l.id,
      product_name: l.product.name,
      license_type: l.product.price_unit === 'study' ? 'per_volume' : 'flat',
      quantity: 1,
      volume: parseFloat(studies) || null,
      cost_price: l.cost,
      margin_pct: l.marginPct,
      unit_price: l.pvp,
      net_price: l.pvp,
      annual_fee: l.pvp,
      notes: l.priced ? `${regionCode} · ${l.tierLabel}` : 'cost + margin',
    })))
    setSaving(false)
    if (lineErr) { setError(`${t('qd_err_lines')} ${lineErr.message}`); return }
    onCreated?.(data)
  }

  const Chip = ({ p }) => {
    const on = picked.includes(p.id)
    return (
      <button type="button"
        onClick={() => setPicked(s => on ? s.filter(x => x !== p.id) : [...s, p.id])}
        className={`min-h-tap px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          on ? 'border-navy bg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}>
        {on && <Check size={11} className="inline mr-1 -mt-0.5"/>}{p.name}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {(error || pricingError) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {error || t('qd_err_prices')}
        </p>
      )}

      {/* The three inputs that drive everything. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <label className="label">{t('qd_client')} <span className="text-red-500">*</span></label>
          <SearchableSelect
            value={client} onChange={setClient}
            options={clients.map(c => ({ value: c, label: c }))}
            placeholder={t('qd_client_ph')}
            emptyLabel={t('qd_client_empty')}
            onCreateNew={q => q && setClient(q)}
            createLabel={t('qd_client_new')}
          />
        </div>
        <div>
          <label className="label">{t('qd_country')} <span className="text-red-500">*</span></label>
          <SearchableSelect
            value={country} onChange={setCountry}
            options={countryOptions}
            placeholder={t('qd_country_ph')}
            emptyLabel={t('qd_country_empty')}
          />
        </div>
        <div>
          <label className="label">{t('qd_studies')} <span className="text-red-500">*</span></label>
          <input className="input w-36" type="number" min="0" inputMode="numeric"
            value={studies} onChange={e => setStudies(e.target.value)}
            placeholder="45000" style={{ fontSize: '16px' }}/>
        </div>
      </div>

      {region
        ? <p className="text-micro text-gray-500">
            {t('qd_region_is')} <strong className="text-navy">{regionCode} · {region.name}</strong> — {region.discountPct}% {t('qd_region_off')}
          </p>
        : <p className="text-micro text-amber-700">
            {country} {t('qd_no_region')}
          </p>}

      {/* Products */}
      <div className="space-y-2">
        <label className="label">{t('qd_products')}</label>
        <div className="flex flex-wrap gap-1.5">
          {headline.map(p => <Chip key={p.id} p={p}/>)}
          {!showAll && restCount > 0 && (
            <button type="button" onClick={() => setShowAll(true)}
              className="min-h-tap px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
              + {restCount} {t('qd_more')}
            </button>
          )}
        </div>

        {showAll && (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {restGroups.map(g => (
              <div key={g.category}>
                <p className="text-micro font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  {g.category}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map(p => <Chip key={p.id} p={p}/>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Families that carry a supplier price list open a drill-down: which
            SKUs, at what cost. Families without one are quoted from the
            catalogue row alone and show nothing here. */}
        {picked.map(id => {
          const items = itemsByProduct[id]
          if (!items?.length) return null
          const product = products.find(p => p.id === id)
          return (
            <div key={id} className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-700">{product?.name}</p>
              <FamilyItems
                items={items}
                studies={parseFloat(studies) || 0}
                value={famSel[id] || {}}
                onChange={v => setFamSel(s => ({ ...s, [id]: v }))}
              />
            </div>
          )
        })}
      </div>

      {/* Economics */}
      {/* On a phone the six-column table is unreadable — the sell price and the
          margin, the two numbers the rep is here for, fall off the right edge.
          Below `sm` each line becomes a card instead; the table returns on any
          screen wide enough to hold it. */}
      {lines.length > 0 && (
        <div className="sm:hidden space-y-2">
          {lines.map(l => (
            <div key={l.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-gray-800 leading-tight">{l.product.name}</p>
                <span className="text-micro text-gray-400 flex-shrink-0">
                  {l.priced ? l.tierLabel : t('qd_cost_margin')}
                  {l.priced && l.boundBy !== 'tier' && (
                    <span className="ml-1 font-semibold text-amber-700">
                      {l.boundBy === 'minimum' ? t('qd_bound_min') : t('qd_bound_cap')}
                    </span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">{t('qd_cost_eur')}</label>
                  <input className="input text-right" type="number" min="0"
                    value={l.cost} onChange={e => setCost(l.id, e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </div>
                <div>
                  <label className="label">{t('qd_margin_pct')}</label>
                  <input className="input text-right border-green-200" type="number" min="0" max="99"
                    value={l.marginPct} onChange={e => setMargin(l.id, e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </div>
              </div>
              <div className="flex justify-between items-baseline pt-1 border-t border-gray-100">
                <span className="text-xs text-green-700 font-semibold">{t('qd_gm')} {formatK(l.grossMargin)}</span>
                <span className="text-sm font-bold text-gray-900">{formatK(l.pvp)}</span>
              </div>
            </div>
          ))}
          <div className="border-2 border-navy/20 bg-navy/[0.04] rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-xs text-navy">
              <span>{t('qd_col_cost')}</span><span className="tabular-nums font-semibold">{formatK(totals.cost)}</span>
            </div>
            <div className="flex justify-between text-xs text-green-700">
              <span>{t('qd_gross_margin')} · {totals.marginPct}%</span>
              <span className="tabular-nums font-semibold">{formatK(totals.grossMargin)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-navy/15">
              <span className="text-xs font-semibold text-navy">{t('qd_sell')}</span>
              <span className="text-base font-bold text-navy tabular-nums">{formatK(totals.pvp)}</span>
            </div>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="hidden sm:block border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">{t('qd_col_product')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('qd_col_tier')}</th>
                <th className="text-right px-2 py-2 font-semibold w-24">{t('qd_col_cost')}</th>
                <th className="text-right px-2 py-2 font-semibold w-20">{t('qd_col_margin')}</th>
                <th className="text-right px-2 py-2 font-semibold w-24">{t('qd_col_gm')}</th>
                <th className="text-right px-3 py-2 font-semibold w-24">{t('qd_col_sell')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{l.product.name}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {l.priced ? l.tierLabel : <span className="text-gray-400">cost + margin</span>}
                    {l.priced && l.boundBy !== 'tier' && (
                      <span className="ml-1 text-micro font-semibold text-amber-700">
                        {l.boundBy === 'minimum' ? t('qd_bound_min') : t('qd_bound_cap')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input className="input text-xs py-1 text-right w-full" type="number" min="0"
                      value={l.cost} onChange={e => setCost(l.id, e.target.value)}
                      style={{ fontSize: '16px' }}/>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input className="input text-xs py-1 text-right w-full border-green-200" type="number" min="0" max="99"
                      value={l.marginPct} onChange={e => setMargin(l.id, e.target.value)}
                      style={{ fontSize: '16px' }}/>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-green-700">{formatK(l.grossMargin)}</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">{formatK(l.pvp)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-navy/20 bg-navy/[0.04] font-bold">
                <td className="px-3 py-2 text-navy" colSpan={2}>{t('qd_total')}</td>
                <td className="px-2 py-2 text-right text-navy">{formatK(totals.cost)}</td>
                <td className="px-2 py-2 text-right text-navy">{totals.marginPct}%</td>
                <td className="px-2 py-2 text-right text-green-700">{formatK(totals.grossMargin)}</td>
                <td className="px-3 py-2 text-right text-navy">{formatK(totals.pvp)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {onFullForm && (
        <button type="button" onClick={onFullForm}
          className="text-xs text-gray-500 underline underline-offset-2 min-h-tap">
          {t('qd_full_form')}
        </button>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">{t('qd_cancel')}</button>
        <button type="button" onClick={create} disabled={saving || !lines.length}
          className="btn-primary flex-1">
          {saving ? t('qd_creating') : `${t('qd_create')} · ${formatK(totals.pvp)}`}
        </button>
      </div>
    </div>
  )
}
