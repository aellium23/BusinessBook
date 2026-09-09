import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useProducts } from '../../hooks/useProducts'
import { usePricing } from '../../hooks/usePricing'
import { saveDealProducts } from '../../hooks/useDealProducts'
import { resolvePrice, pricingRegionForCountry, lineEconomics, pvpForMargin, quoteTotals } from '../../lib/pricing'
import { COUNTRY_MAP, regionForCountry } from '../../constants'
import SearchableSelect from '../SearchableSelect'
import { formatK } from '../ui'
import { X, Check } from 'lucide-react'

const ALL_COUNTRIES = Object.values(COUNTRY_MAP).flat().sort()

// The 90% case: a rep quoting imaging software for a hospital. These surface as
// one-tap chips; everything else in the catalogue sits behind "more".
const HEADLINE_SKUS = ['SYN-PACS', 'CWM-RISBI', 'CWM-DOSE']

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
export default function QuickQuote({ onCancel, onCreated }) {
  const { profile } = useAuth()
  const { products } = useProducts()
  const { regions, countryMap, tiersByProduct, error: pricingError } = usePricing()

  const defaultBU = ['VGT', 'ECT'].includes(profile?.bu) ? profile.bu : 'VGT'
  const [client, setClient]   = useState('')
  const [country, setCountry] = useState('Portugal')
  const [studies, setStudies] = useState('')
  const [picked, setPicked]   = useState([])        // product ids
  const [overrides, setOver]  = useState({})        // productId -> { cost, pvp }
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [clients, setClients] = useState([])

  useEffect(() => {
    supabase.from('deals').select('client')
      .then(({ data, error: e }) => {
        if (e) { setError('Could not load the client list — you can still type a new name.'); return }
        setClients([...new Set((data || []).map(d => d.client).filter(Boolean))].sort())
      })
      .catch(() => setError('Could not load the client list — you can still type a new name.'))
  }, [])

  const regionCode = pricingRegionForCountry(countryMap, country)
  const region = regionCode ? regions[regionCode] : null

  const priced = useMemo(() => products.filter(p => tiersByProduct[p.id]), [products, tiersByProduct])
  const headline = useMemo(
    () => HEADLINE_SKUS.map(sku => priced.find(p => p.sku === sku)).filter(Boolean),
    [priced]
  )
  const rest = useMemo(
    () => priced.filter(p => !HEADLINE_SKUS.includes(p.sku)),
    [priced]
  )

  // One volume figure selects the tier on every picked product at once.
  const lines = useMemo(() => {
    const qty = parseFloat(studies) || 0
    if (!region || !qty) return []
    return picked.map(id => {
      const product = products.find(p => p.id === id)
      const tiers = tiersByProduct[id]
      if (!product || !tiers) return null
      const r = resolvePrice({ product, tiers, discountPct: region.discountPct, quantity: qty })
      if (!r) return null
      const o = overrides[id] || {}
      const cost = o.cost !== undefined ? o.cost : (Number(product.license_fee) || 0)
      const pvp = o.pvp !== undefined ? o.pvp : r.net
      return { id, product, listNet: r.net, tierLabel: r.tierLabel, boundBy: r.boundBy, ...lineEconomics(cost, pvp) }
    }).filter(Boolean)
  }, [picked, products, tiersByProduct, region, studies, overrides])

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
    if (!client.trim()) { setError('Pick or type a client first.'); return }
    if (!lines.length)  { setError('Add at least one product with a study volume.'); return }
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

    if (e) { setSaving(false); setError(`Could not create the deal: ${e.message}`); return }

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
      notes: `${regionCode} · ${l.tierLabel}`,
    })))
    setSaving(false)
    if (lineErr) { setError(`Deal created, but the product lines failed: ${lineErr.message}`); return }
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
          {error || 'Could not load the price list — list prices are unavailable.'}
        </p>
      )}

      {/* The three inputs that drive everything. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <label className="label">Client <span className="text-red-500">*</span></label>
          <SearchableSelect
            value={client} onChange={setClient}
            options={clients.map(c => ({ value: c, label: c }))}
            placeholder="Search or type a new client…"
            emptyLabel="— Client"
            onCreateNew={q => q && setClient(q)}
            createLabel="New client"
          />
        </div>
        <div>
          <label className="label">Country <span className="text-red-500">*</span></label>
          <select className="select" value={country} onChange={e => setCountry(e.target.value)}>
            {ALL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Studies / year <span className="text-red-500">*</span></label>
          <input className="input w-36" type="number" min="0" inputMode="numeric"
            value={studies} onChange={e => setStudies(e.target.value)}
            placeholder="45000" style={{ fontSize: '16px' }}/>
        </div>
      </div>

      {region
        ? <p className="text-micro text-gray-500">
            Pricing region <strong className="text-navy">{regionCode} · {region.name}</strong> — {region.discountPct}% off global list
          </p>
        : <p className="text-micro text-amber-700">
            {country} has no pricing region mapped, so list prices cannot be shown.
          </p>}

      {/* Products */}
      <div className="space-y-2">
        <label className="label">Products</label>
        <div className="flex flex-wrap gap-1.5">
          {headline.map(p => <Chip key={p.id} p={p}/>)}
          {!showAll && rest.length > 0 && (
            <button type="button" onClick={() => setShowAll(true)}
              className="min-h-tap px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
              + {rest.length} more
            </button>
          )}
          {showAll && rest.map(p => <Chip key={p.id} p={p}/>)}
        </div>
      </div>

      {/* Economics */}
      {lines.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Product</th>
                <th className="text-left px-3 py-2 font-semibold">Tier</th>
                <th className="text-right px-2 py-2 font-semibold w-24">Cost</th>
                <th className="text-right px-2 py-2 font-semibold w-20">Margin</th>
                <th className="text-right px-2 py-2 font-semibold w-24">GM €</th>
                <th className="text-right px-3 py-2 font-semibold w-24">Sell</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{l.product.name}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {l.tierLabel}
                    {l.boundBy !== 'tier' && (
                      <span className="ml-1 text-micro font-semibold text-amber-700">
                        {l.boundBy === 'minimum' ? 'min' : 'cap'}
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
                <td className="px-3 py-2 text-navy" colSpan={2}>Total</td>
                <td className="px-2 py-2 text-right text-navy">{formatK(totals.cost)}</td>
                <td className="px-2 py-2 text-right text-navy">{totals.marginPct}%</td>
                <td className="px-2 py-2 text-right text-green-700">{formatK(totals.grossMargin)}</td>
                <td className="px-3 py-2 text-right text-navy">{formatK(totals.pvp)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button type="button" onClick={create} disabled={saving || !lines.length}
          className="btn-primary flex-1">
          {saving ? 'Creating…' : `Create deal · ${formatK(totals.pvp)}`}
        </button>
      </div>
    </div>
  )
}
