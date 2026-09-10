import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { useTranslation } from '../../hooks/useTranslation'
import { useProducts, fetchProductCosts } from '../../hooks/useProducts'
import { usePricing } from '../../hooks/usePricing'
import { useProductItems } from '../../hooks/useProductItems'
import FamilyItems from './FamilyItems'
import { familyEconomics, defaultItemIds } from '../../lib/familyEconomics'
import { saveDealProducts } from '../../hooks/useDealProducts'
import { resolvePrice, pricingRegionForCountry, pvpForMargin } from '../../lib/pricing'
import { recommendedCapexPvp, recommendedSlaPvp, belowFloor, lineOverTerm,
         servicesEconomics } from '../../lib/margins'
import { routeFor, applyDiscount, discountViews, internalApproval } from '../../lib/discountRouting'
import { priceAtRung } from '../../lib/discountLadder'
import { discountPlan, unjustifiedPp } from '../../lib/dealDiscounts'
import DiscountReasons, { earnedRows } from './DiscountReasons'
import { unitsNeeded, quantityFor } from '../../lib/volumeUnits'
import { toEur, rateLabel } from '../../lib/fx'
import { useFxRates } from '../../hooks/useFxRates'
import { COUNTRY_MAP, regionForCountry } from '../../constants'
import SearchableSelect from '../SearchableSelect'
import { formatK } from '../ui'
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react'

const ALL_COUNTRIES = Object.values(COUNTRY_MAP).flat().sort()

// Where each business unit actually sells. VGT is Portugal, ECT is Spain, and
// between them that is very nearly every deal — so the country starts filled in
// and the seventy-odd others sit behind a search box rather than in front of a
// rep who almost never needs them.
const HOME_COUNTRY = { VGT: 'Portugal', ECT: 'Spain' }
const NEARBY = ['Portugal', 'Spain', 'France', 'Italy', 'UK', 'Germany']

// The 90% case: a rep quoting imaging software for a hospital. These surface as
// one-tap chips; everything else in the catalogue sits behind "more".
const HEADLINE_SKUS = ['CWM-DOSE', 'CWM-VR', 'CWM-AIREP', 'SYN-PACS', 'SYN-VNA']

// Contract terms a rep actually quotes. The term drives the support side of
// every line: five years of PACS is five years of support revenue and five
// years of support cost, and quoting one year of it understates both.
const TERM_YEARS = [1, 3, 5, 7, 10]
const DEFAULT_TERM = 5

// Products sold as a subscription price their tier per YEAR, not once. Getting
// this wrong books an annual fee as if it were a licence.
const SUBSCRIPTION_MODELS = ['subscription', 'pay_per_study', 'saas']

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
  const { settings } = useSettings()
  const { products } = useProducts()
  const { regions, countryMap, tiersByProduct, error: pricingError } = usePricing()
  const { rates } = useFxRates()

  // Everything the rep's own account already tells us is filled in up front.
  const defaultBU = ['VGT', 'ECT'].includes(profile?.bu) ? profile.bu : 'VGT'

  const [client, setClient]   = useState('')
  const [country, setCountry] = useState(HOME_COUNTRY[defaultBU] || 'Portugal')
  const [volumes, setVolumes] = useState({})   // volume key -> value
  const [picked, setPicked]   = useState([])        // product ids
  const [overrides, setOver]  = useState({})        // productId -> { cost, pvp }
  const [famSel, setFamSel]   = useState({})        // productId -> { users, itemIds }
  const [years, setYears]     = useState(DEFAULT_TERM)
  const [manDays, setManDays] = useState('')
  const [reasons, setReasons] = useState({})       // discount reason -> evidence
  const [byProduct, setByProduct] = useState(true) // per-product detail, open

  // A quote carries several volumes and they are not interchangeable. The exam
  // count is always asked; the rest appear only when something picked is priced
  // on them. See src/lib/volumeUnits.js for why this is not one field.
  const pickedProducts = useMemo(
    () => picked.map(id => products.find(p => p.id === id)).filter(Boolean),
    [picked, products]
  )
  const needed = useMemo(() => unitsNeeded(pickedProducts), [pickedProducts])
  const studies = volumes.exam || ''
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

  // What we pay for each catalogue product, read through the cost view. It is
  // the only honest source for a line's cost: `license_fee` is a SELLING price
  // (the Products screen labels it "Price per Unit / Study"), so using it as a
  // cost made the margin on any CWM line meaningless.
  const [productCosts, setProductCosts] = useState({})
  const [suppliers, setSuppliers] = useState({})

  useEffect(() => {
    supabase.from('suppliers').select('code, name, kind, request_channel')
      .then(({ data }) => setSuppliers(Object.fromEntries((data || []).map(s => [s.code, s]))))
  }, [])
  useEffect(() => {
    let alive = true
    fetchProductCosts().then(({ costs }) => { if (alive) setProductCosts(costs) })
    return () => { alive = false }
  }, [])

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

  // Pre-select each family's default SKUs, so a cost is on screen without the
  // rep having to open the price list and hunt for the base licence.
  useEffect(() => {
    setFamSel(prev => {
      let changed = false
      const next = { ...prev }
      for (const id of picked) {
        const items = itemsByProduct[id]
        if (!items?.length || next[id]) continue
        const ids = defaultItemIds(items)
        if (ids.length) { next[id] = { itemIds: ids }; changed = true }
      }
      return changed ? next : prev
    })
  }, [picked, itemsByProduct])

  // A VNA bought alongside Synapse PACS is licensed at about half the price.
  // If PACS is on this quote the answer is known; otherwise the rep is asked.
  const pacsInQuote = useMemo(
    () => picked.some(id => products.find(p => p.id === id)?.sku === 'SYN-PACS'),
    [picked, products]
  )
  const selectionFor = id => ({ bundle: pacsInQuote, ...(famSel[id] || {}) })

  // How many of the products on this quote are ours, counted from the picks
  // rather than from the priced lines — the bundle discount feeds the line
  // prices, so reading it back off them would be circular.
  const cwmNames = useMemo(
    () => pickedProducts
      .filter(p => routeFor(suppliers[p.supplier_code]).appliesTo === 'price')
      .map(p => p.name),
    [pickedProducts, suppliers]
  )
  const cwmCount = cwmNames.length

  // What this deal has earned, reason by reason. A reason with no proof
  // attached is worth nothing here, which is the whole control: since CWM funds
  // the discount, asking for one costs the person asking nothing at all.
  const plan = useMemo(
    () => discountPlan(reasons, { productCount: cwmCount, years }),
    [reasons, cwmCount, years]
  )

  // Every line has two economics in it and they are kept apart end to end.
  //
  // CAPEX is the licence, bought once, floor 35 %. The annual fee is support,
  // owed every year of the term, and carries a floor that rises with its size —
  // 60 % up to 4k of cost, 62.5 % beyond, never less than 10k a year, because a
  // support contract consumes an engineer whatever it bills. Blending the two
  // into one margin is what makes support quietly unprofitable.
  //
  // A subscription product has no licence: its tier price IS the annual fee.
  const lines = useMemo(() => {
    const qty = parseFloat(studies) || 0
    return picked.map(id => {
      const product = products.find(p => p.id === id)
      if (!product) return null

      const tiers = tiersByProduct[id]
      // Each product is priced on the volume its own price_unit names — a VR
      // line must see the radiologist count, never the exam count.
      const productQty = quantityFor(product, volumes)
      const rawListed = tiers && region && productQty
        ? resolvePrice({ product, tiers, discountPct: region.discountPct, quantity: productQty })
        : null

      // The CWM global list is published in USD and this deal is written in
      // euros. Without this the screen printed a dollar figure with a euro
      // sign — 16% high, and plausible enough to go unquestioned.
      const fx = rawListed ? toEur(rawListed.net, product.list_currency, rates) : null
      const listed = rawListed ? { ...rawListed, net: fx.value, fx } : null
      const isSub = SUBSCRIPTION_MODELS.includes(product.pricing_model)

      const fam = familyEconomics(itemsByProduct[id], famSel[id] ? selectionFor(id) : null, qty)
      const o = overrides[id] || {}

      const capexCost = o.capexCost !== undefined ? Number(o.capexCost) || 0
        : isSub ? 0
        : (fam.capex > 0 ? fam.capex : (Number(productCosts[id]) || 0))
      const annualCost = o.annualCost !== undefined ? Number(o.annualCost) || 0
        : isSub ? (fam.annual > 0 ? fam.annual : (Number(productCosts[id]) || 0))
        : fam.annual

      // A listed tier price is the sell side. For a subscription it is the
      // yearly fee; for a licensed product it is the one-off licence.
      const capexPvp = o.capexPvp !== undefined ? Number(o.capexPvp) || 0
        : isSub ? 0
        : (listed ? listed.net : recommendedCapexPvp(capexCost))
      const annualPvp = o.annualPvp !== undefined ? Number(o.annualPvp) || 0
        : isSub && listed ? listed.net
        : recommendedSlaPvp(annualCost)

      // A discount goes one of two ways and the supplier decides which. On what
      // we make it comes off the customer price and needs approving; on what we
      // buy it comes off our cost, but only once the supplier has said yes, so
      // until then it changes nothing on screen and merely marks the line.
      const routing = routeFor(suppliers[product.supplier_code])
      // On our own products the discount starts at what the reasons justify, so
      // the rep quotes the earned number by default and has to type over it to
      // give away more. Typing over it is allowed — and then reported.
      const discountPct = o.discountPct !== undefined
        ? Number(o.discountPct) || 0
        : (routing.appliesTo === 'price' ? plan.justifiedPct : 0)
      const dCapex = applyDiscount({ ...routing, pct: discountPct, cost: capexCost, pvp: capexPvp })
      const dAnnual = applyDiscount({ ...routing, pct: discountPct, cost: annualCost, pvp: annualPvp })

      // On a CWM line the control is the price, not the cost: how far below the
      // published regional list it has fallen decides who signs. Measured from
      // the price itself, because a rep can type over it and leave the discount
      // box reading zero.
      const listRef = routing.appliesTo === 'price' && listed ? listed.net : null
      const ladder = listRef
        ? internalApproval({ listPrice: listRef, quotedPrice: isSub ? dAnnual.pvp : dCapex.pvp })
        : null

      const warrantyYears = routing.route === 'external' ? 1 : 0
      const term = lineOverTerm({
        capexCost: dCapex.cost, capexPvp: dCapex.pvp,
        annualCost: dAnnual.cost, annualPvp: dAnnual.pvp,
        years, warrantyYears,
      })

      return {
        id, product, isSub,
        listNet: listed?.net ?? null,
        tierLabel: listed?.tierLabel ?? '—',
        boundBy: listed?.boundBy ?? 'tier',
        priced: Boolean(listed),
        listed,
        capexCost: dCapex.cost, capexPvp: dCapex.pvp,
        annualCost: dAnnual.cost, annualPvp: dAnnual.pvp,
        discountPct, routing, ladder,
        // Points of price given away that no reason accounts for.
        unjustifiedPp: routing.appliesTo === 'price'
          ? unjustifiedPp(discountPct, plan.justifiedPct)
          : 0,
        speculative: dCapex.speculative || dAnnual.speculative,
        // Per-SKU relief, summed. The support side counts once per contract
        // year, the licence once.
        pendingCostRelief: routing.appliesTo === 'cost'
          ? round2(fam.reliefCapex + fam.reliefAnnual * Math.max(0, years - warrantyYears))
          : 0,
        skuDiscounts: fam.discounted,
        capexBelow: belowFloor({ kind: 'capex', cost: dCapex.cost, pvp: dCapex.pvp }),
        annualBelow: belowFloor({ kind: 'sla', cost: dAnnual.cost, pvp: dAnnual.pvp }),
        costKnown: capexCost > 0 || annualCost > 0,
        ...term,
      }
    }).filter(Boolean)
  }, [picked, products, tiersByProduct, region, studies, overrides, itemsByProduct,
      famSel, productCosts, years, pacsInQuote, suppliers, volumes, rates,
      plan.justifiedPct])

  // The quote seen both ways: what we have, and what we have if the supplier
  // discounts land. The gap between them is the number worth naming.
  const views = useMemo(() => discountViews(lines), [lines])
  // Shown next to the region, because the pricing brief requires a conversion
  // to carry its rate wherever it appears.
  const fxNote = useMemo(() => {
    const l = lines.find(x => x.listed?.fx?.converted && x.listed.fx.rate !== 1)
    return l ? rateLabel(l.listed.fx.currency, l.listed.fx.rate) : null
  }, [lines])

  const services = useMemo(() => servicesEconomics({
    manDays,
    manDayCost: settings.man_day_cost,
    servicesPvp: lines.reduce((n, l) => n + l.servicesPvp, 0),
  }), [manDays, settings.man_day_cost, lines])

  // Services effort is a cost either way, so it lands on both scenarios.
  const withServices = (v) => {
    const cost = round2(v.cost + services.cost)
    const gm = round2(v.pvp - cost)
    return {
      ...v, cost, grossMargin: gm,
      marginPct: v.pvp > 0 ? Math.round((gm / v.pvp) * 1000) / 10 : 0,
    }
  }
  const granted = useMemo(() => withServices(views.ifApproved), [views, services])

  const totals = useMemo(() => {
    const v = views.actual
    const cost = round2(v.cost + services.cost)
    const gm = round2(v.pvp - cost)
    return {
      ...v,
      cost,
      grossMargin: gm,
      marginPct: v.pvp > 0 ? Math.round((gm / v.pvp) * 1000) / 10 : 0,
      capexPvp: round2(lines.reduce((n, l) => n + l.capexPvp + l.servicesPvp, 0)),
      annualPvp: round2(lines.reduce((n, l) => n + l.annualPvp, 0)),
    }
  }, [views, lines, services])

  function setField(id, key, v) {
    setOver(o => ({ ...o, [id]: { ...(o[id] || {}), [key]: parseFloat(v) || 0 } }))
  }

  /** Typing a margin sets the price that yields it, on that side of the line. */
  function setMargin(id, side, v) {
    const line = lines.find(l => l.id === id)
    if (!line) return
    const cost = side === 'capex' ? line.capexCost : line.annualCost
    const pvp = pvpForMargin(cost, v)
    if (pvp === null) return
    setField(id, side === 'capex' ? 'capexPvp' : 'annualPvp', pvp)
  }

  const marginOf = (cost, pvp) => (pvp > 0 ? Math.round(((pvp - cost) / pvp) * 1000) / 10 : 0)

  async function create() {
    if (!client.trim()) { setError(t('qd_err_client')); return }
    if (!lines.length)  { setError(t('qd_err_product')); return }
    // A discount whose reason has no proof attached is refused, not saved and
    // chased later: once the quote exists the figure is what everyone works
    // from, and the paperwork never catches up with it.
    if (plan.stop)      { setError(t('dd_stop')); return }
    setSaving(true); setError(null)

    const { data, error: e } = await supabase.from('deals').insert({
      client: client.trim(),
      bu: defaultBU,
      country,
      region: regionForCountry(country) || 'Europe',
      stage: 'Lead',
      value_total: views.actual.pvp,
      gm_pct: views.actual.marginPct,
      currency: 'EUR',
      // A rate is a snapshot. The project's rule for deals applies here: store
      // it, so a rate change tomorrow cannot silently reprice a quote sent
      // today.
      exchange_rate: lines.find(l => l.listed?.fx?.converted && l.listed.fx.rate !== 1)?.listed.fx.rate ?? null,
      company_id: profile?.company_id || null,
      created_by: profile?.id || null,
    }).select('id, client, bu, country').single()

    if (e) { setSaving(false); setError(`${t('qd_err_create')} ${e.message}`); return }

    // The evidence is kept with the deal, not just checked at the door. Renewal
    // re-tests each reason from the regional list — the tender is over, an
    // incumbent can only be displaced once — and the lighthouse discount is
    // clawed back if the reference never arrives. None of that is possible
    // against a discount stored as a bare percentage.
    const earned = earnedRows(plan)
    if (earned.length) {
      const { error: rErr } = await supabase.from('deal_discount_reasons').insert(
        earned.map(r => ({
          deal_id: data.id,
          reason: r.reason,
          pct: r.pct,
          evidence: r.evidence,
          bidder_count: r.bidders,
          created_by: profile?.id || null,
        }))
      )
      if (rErr) {
        setSaving(false)
        setError(`${t('qd_err_reasons')} ${rErr.message}`)
        return
      }
    }

    const { error: lineErr } = await saveDealProducts(data.id, lines.map(l => ({
      product_id: l.id,
      product_name: l.product.name,
      license_type: l.product.price_unit === 'study' ? 'per_volume' : 'flat',
      quantity: 1,
      volume: parseFloat(studies) || null,
      cost_price: l.cost,
      margin_pct: l.marginPct,
      unit_price: l.capexPvp || l.pvp,
      net_price: l.capexPvp || l.pvp,
      annual_fee: l.annualPvp,
      notes: l.priced ? `${regionCode} · ${l.tierLabel}` : 'cost + margin',
    })))
    // Discounts become worklist entries only now, because they hang off a deal
    // that did not exist a moment ago. A failure here must not read as a failed
    // deal — the deal is saved; the rep is told what did not get raised.
    // Nothing to raise where nobody signs. A request approved by default would
    // bury the ones that need a decision.
    // One row per SKU on the supplier side: HCUS opens a case per part number,
    // and "Synapse licence 70%" and "Oracle 20%" are two different asks.
    const external = lines.flatMap(l =>
      l.routing.appliesTo === 'cost'
        ? (l.skuDiscounts || []).map(d => ({ line: l, sku: d }))
        : [])
    const internal = lines
      .filter(l => l.routing.appliesTo === 'price' && l.ladder?.needsRequest)
      .map(l => ({ line: l, sku: null }))
    const discounted = [...external, ...internal]
    if (discounted.length) {
      const { error: reqErr } = await supabase.from('deal_discount_requests').insert(
        discounted.map(({ line: l, sku }) => ({
          deal_id: data.id,
          product_id: l.id,
          requested_by: profile?.id || null,
          requested_pct: sku ? sku.pct : (l.ladder ? l.ladder.pctOff : l.discountPct),
          approval_level: l.ladder?.level || null,
          brand: l.product.brand || null,
          supplier_code: l.product.supplier_code || null,
          route: l.routing.route,
          channel: l.routing.channel,
          status: l.routing.initialStatus,
          scope: 'both',
          value_at_risk: sku
            ? round2(sku.reliefCapex + sku.reliefAnnual * years)
            : (l.pendingCostRelief || null),
          // The request names the part number, because that is what gets typed
          // into the supplier's system.
          justification: sku
            ? `${client.trim()} · ${sku.item.supplier_sku || ''} ${sku.item.description || sku.item.name}`.trim()
            // The approver reads why before they read how much.
            : [client.trim(), l.product.name,
               earned.map(r => `${t(`dd_r_${r.reason}`)} ${r.pct}%`).join(' + ')]
                .filter(Boolean).join(' · '),
        }))
      )
      if (reqErr) {
        setSaving(false)
        setError(`${t('qd_err_discounts')} ${reqErr.message}`)
        return
      }
    }

    setSaving(false)
    if (lineErr) { setError(`${t('qd_err_lines')} ${lineErr.message}`); return }
    onCreated?.(data)
  }

  /** One figure of the summary, with how far it moves if the discounts land. */
  const Metric = ({ label, value, delta, unit = '', lowerIsBetter = false }) => {
    const moved = Math.abs(delta) >= 0.05
    const good = lowerIsBetter ? delta < 0 : delta > 0
    return (
      <div>
        <p className="text-micro text-gray-500">{label}</p>
        <p className="text-base font-bold text-amber-900 tabular-nums">{value}</p>
        {moved && (
          <p className={`text-micro tabular-nums font-semibold ${good ? 'text-green-700' : 'text-red-700'}`}>
            {delta > 0 ? '+' : '−'}{unit === 'pp'
              ? `${Math.abs(Math.round(delta * 10) / 10)} pp`
              : formatK(Math.abs(delta))}
          </p>
        )}
      </div>
    )
  }

  /** One product's economics if its pending supplier discounts all land. */
  function grantedLine(l) {
    const cost = round2(Math.max(0, l.cost - (l.pendingCostRelief || 0)))
    const gm = round2(l.pvp - cost)
    return {
      pvp: l.pvp, cost, grossMargin: gm,
      marginPct: l.pvp > 0 ? Math.round((gm / l.pvp) * 1000) / 10 : 0,
    }
  }

  /** One scenario of one product, on one line. */
  const Row = ({ label, v, tone, from }) => {
    const dGm = from ? v.grossMargin - from.grossMargin : 0
    return (
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-micro tabular-nums">
        <span className={`font-semibold uppercase tracking-wide w-20 flex-shrink-0 ${
          tone === 'amber' ? 'text-amber-800' : 'text-navy'
        }`}>{label}</span>
        <span className="text-gray-600">{t('qd_total_pvp')} <strong className="text-gray-900">{formatK(v.pvp)}</strong></span>
        <span className="text-gray-600">{t('qd_total_cost')} <strong className="text-gray-900">{formatK(v.cost)}</strong></span>
        <span className="text-gray-600">
          {t('qd_gm')} <strong className="text-green-700">{formatK(v.grossMargin)} · {v.marginPct}%</strong>
          {Math.abs(dGm) >= 0.05 && (
            <span className="ml-1 font-semibold text-green-700">+{formatK(Math.abs(dGm))}</span>
          )}
        </span>
      </div>
    )
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
      <div className="grid grid-cols-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] gap-2 items-end">
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
          <label className="label">{t('qd_term')}</label>
          <select className="select w-24" value={years}
            onChange={e => setYears(parseInt(e.target.value, 10))}>
            {TERM_YEARS.map(y => <option key={y} value={y}>{y} {t('qd_years')}</option>)}
          </select>
        </div>
        {needed.map(u => (
          <div key={u.key}>
            <label className="label">
              {t(u.labelKey)}{u.primary && <span className="text-red-500"> *</span>}
            </label>
            <input className="input w-28" type="number" min="0" inputMode="numeric"
              value={volumes[u.key] || ''} placeholder={u.placeholder}
              onChange={e => setVolumes(v => ({ ...v, [u.key]: e.target.value }))}
              style={{ fontSize: '16px' }}/>
          </div>
        ))}
      </div>

      {lines.some(l => l.listed?.fx && !l.listed.fx.converted) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('qd_fx_missing').replaceAll('{cur}',
            lines.find(l => l.listed?.fx && !l.listed.fx.converted).listed.fx.currency)}
        </p>
      )}

      {region
        ? <p className="text-micro text-gray-500">
            {t('qd_region_is')} <strong className="text-navy">{regionCode} · {region.name}</strong> — {region.discountPct}% {t('qd_region_off')}
            {fxNote && <span className="ml-1 text-gray-400">· {fxNote}</span>}
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
                bundleDefault={pacsInQuote}
                onChange={v => setFamSel(s => ({ ...s, [id]: v }))}
              />
            </div>
          )
        })}
      </div>

      {/* Why the CWM lines are discounted. Only ours: on a supplier product the
          discount comes off our cost and the supplier's own answer is the
          control, so there is nothing here for a rep to justify. */}
      {cwmCount > 0 && (
        <DiscountReasons value={reasons} onChange={setReasons} plan={plan} years={years}
          bundleProducts={cwmNames}/>
      )}

      {/* One card per product, on every screen. The table this replaced could
          not carry two sets of economics without becoming ten columns wide, and
          it was already unreadable on a phone at six. */}
      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map(l => (
            <div key={l.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-gray-800 leading-tight">{l.product.name}</p>
                <span className="text-micro text-gray-400 flex-shrink-0 text-right">
                  {!l.costKnown && <span className="text-amber-700 font-semibold mr-1">{t('qd_cost_unknown')}</span>}
                  {l.priced ? l.tierLabel : t('qd_cost_margin')}
                  {l.priced && l.boundBy !== 'tier' && (
                    <span className="ml-1 font-semibold text-amber-700">
                      {l.boundBy === 'minimum' ? t('qd_bound_min') : t('qd_bound_cap')}
                    </span>
                  )}
                </span>
              </div>

              {!l.isSub && (
                <div className="grid grid-cols-[1fr_4.2rem_1fr] gap-2 items-end">
                  <div>
                    <label className="label">{t('qd_capex_cost')}</label>
                    <input className="input text-right" type="number" min="0" value={l.capexCost}
                      onChange={e => setField(l.id, 'capexCost', e.target.value)}
                      style={{ fontSize: '16px' }}/>
                  </div>
                  <div>
                    <label className="label">{t('qd_margin_pct')}</label>
                    <input className={`input text-right ${l.capexBelow ? 'border-red-300' : 'border-green-200'}`}
                      type="number" min="0" max="99" value={marginOf(l.capexCost, l.capexPvp)}
                      onChange={e => setMargin(l.id, 'capex', e.target.value)}
                      style={{ fontSize: '16px' }}/>
                  </div>
                  <div>
                    <label className="label">{t('qd_capex_pvp')}</label>
                    <input className="input text-right font-semibold" type="number" min="0" value={l.capexPvp}
                      onChange={e => setField(l.id, 'capexPvp', e.target.value)}
                      style={{ fontSize: '16px' }}/>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[1fr_4.2rem_1fr] gap-2 items-end">
                <div>
                  <label className="label">{t('qd_annual_cost')}</label>
                  <input className="input text-right" type="number" min="0" value={l.annualCost}
                    onChange={e => setField(l.id, 'annualCost', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </div>
                <div>
                  <label className="label">{t('qd_margin_pct')}</label>
                  <input className={`input text-right ${l.annualBelow ? 'border-red-300' : 'border-green-200'}`}
                    type="number" min="0" max="99" value={marginOf(l.annualCost, l.annualPvp)}
                    onChange={e => setMargin(l.id, 'sla', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </div>
                <div>
                  <label className="label">{t('qd_annual_pvp')}</label>
                  <input className="input text-right font-semibold" type="number" min="0" value={l.annualPvp}
                    onChange={e => setField(l.id, 'annualPvp', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </div>
              </div>

              <div className="grid grid-cols-[4.2rem_1fr] gap-2 items-end">
                <div>
                  <label className="label">{t('qd_discount')}</label>
                  {l.routing.appliesTo === 'cost'
                    ? <p className="text-micro text-gray-400 py-2">{t('qd_disc_per_sku')}</p>
                    : <input className="input text-right" type="number" min="0" max="99"
                        value={l.discountPct}
                        onChange={e => setField(l.id, 'discountPct', e.target.value)}
                        style={{ fontSize: '16px' }}/>}
                </div>
                <p className="text-micro text-gray-500 pb-2">
                  {l.routing.appliesTo === 'price'
                    ? (l.ladder
                        ? <>
                            <strong className={l.ladder.overCap ? 'text-red-700' : 'text-navy'}>
                              {l.ladder.pctOfList}% {t('dl_of_list')}
                            </strong>
                            {' · '}{t(`dl_rung_${l.ladder.rung.key}`)}
                            <span className={`block ${l.ladder.overCap ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                              {t(`dl_${l.ladder.level}`)}
                            </span>
                          </>
                        : t('qd_disc_price'))
                    : <>{t('qd_disc_cost')} <strong>{l.routing.channel}</strong>
                        {l.speculative && <span className="block text-amber-700">{t('qd_disc_pending')}</span>}</>}
                </p>
              </div>

              {l.unjustifiedPp > 0 && (
                <p className="text-micro text-red-700 font-semibold">
                  {t('qd_unjustified')
                    .replace('{pp}', l.unjustifiedPp)
                    .replace('{just}', plan.justifiedPct)}
                </p>
              )}

              {(l.capexBelow || l.annualBelow) && (
                <p className="text-micro text-red-700">
                  {t('qd_below_floor')}{' '}
                  {l.capexBelow && `${t('qd_capex_pvp')} ≥ ${formatK(recommendedCapexPvp(l.capexCost))}`}
                  {l.capexBelow && l.annualBelow && ' · '}
                  {l.annualBelow && `${t('qd_annual_pvp')} ≥ ${formatK(recommendedSlaPvp(l.annualCost))}`}
                </p>
              )}

              {l.servicesPvp > 0 && (
                <div className="flex justify-between text-micro text-gray-500">
                  <span>{t('qd_services')} <span className="text-gray-400">· {t('qd_warranty_note')}</span></span>
                  <span className="tabular-nums">{formatK(l.servicesPvp)}</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100 text-xs">
                <span className="text-gray-500">
                  {years} {t('qd_years')}
                  {l.warrantyYears > 0 && (
                    <span className="text-gray-400"> · {l.billedYears} {t('qd_billed_years')}</span>
                  )}
                </span>
                <span className="flex gap-3">
                  <span className="text-green-700 font-semibold">{t('qd_gm')} {formatK(l.grossMargin)} · {l.marginPct}%</span>
                  <span className="font-bold text-gray-900">{formatK(l.pvp)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The proposal summary. The per-line table answers "what did I price?";
          this answers "what is this project worth, and what do we make on it?",
          which is the question the rep is actually asked. */}
      {lines.length > 0 && (
        <div className="border-2 border-navy/20 bg-navy/[0.04] rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-navy uppercase tracking-wide">{t('qd_summary')}</p>

          <div>
            <p className="text-micro font-semibold text-navy uppercase tracking-wide">
              {t('qd_as_quoted')}
              {views.hasPending && (
                <span className="ml-1 font-normal normal-case text-gray-500">
                  · {t('qd_as_quoted_hint')}
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <p className="text-micro text-gray-500">{t('qd_total_pvp')}</p>
              <p className="text-base font-bold text-navy tabular-nums">{formatK(totals.pvp)}</p>
            </div>
            <div>
              <p className="text-micro text-gray-500">{t('qd_total_cost')}</p>
              <p className="text-base font-semibold text-gray-700 tabular-nums">{formatK(totals.cost)}</p>
            </div>
            <div>
              <p className="text-micro text-gray-500">{t('qd_col_gm')}</p>
              <p className="text-base font-bold text-green-700 tabular-nums">{formatK(totals.grossMargin)}</p>
            </div>
            <div>
              <p className="text-micro text-gray-500">{t('qd_gm_pct')}</p>
              <p className="text-base font-bold text-green-700 tabular-nums">{totals.marginPct}%</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-gray-600 pt-1 border-t border-navy/10">
            {totals.capexPvp > 0 && (
              <span>{t('qd_one_off')}: <strong className="tabular-nums">{formatK(totals.capexPvp)}</strong></span>
            )}
            {totals.annualPvp > 0 && (
              <span>{t('qd_recurring')}: <strong className="tabular-nums">{formatK(totals.annualPvp)}</strong> {t('qd_recurring_yr')} {years}</span>
            )}
            <span>{lines.length} {t('qd_n_products')}</span>
          </div>
          {services.pvp > 0 && (
            <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-navy/10">
              <div>
                <label className="label">{t('qd_man_days')}</label>
                <input className="input w-20 text-right" type="number" min="0" step="0.5"
                  value={manDays} placeholder="0" style={{ fontSize: '16px' }}
                  onChange={e => setManDays(e.target.value)}/>
              </div>
              <p className="text-micro text-gray-600 flex-1 min-w-[10rem] pb-2">
                {t('qd_services')}: <strong className="tabular-nums">{formatK(services.pvp)}</strong>
                {services.rateKnown
                  ? <> · {services.days} × {formatK(services.rate)} = <strong className="tabular-nums">{formatK(services.cost)}</strong>
                      · <span className="text-green-700 font-semibold">{services.marginPct}%</span></>
                  : <span className="block text-amber-700">{t('qd_no_day_rate')}</span>}
                <span className="block text-gray-400">{t('qd_man_days_hint')}</span>
              </p>
            </div>
          )}

          {views.hasPending && (
            <div className="pt-2 border-t border-navy/10 space-y-1">
              <p className="text-micro font-semibold text-amber-800 uppercase tracking-wide">
                {t('qd_if_granted')}
                <span className="ml-1 font-normal normal-case text-amber-700">
                  · {t('qd_if_granted_hint')}
                </span>
              </p>
              {/* The same four figures, so each column reads straight down and
                  the difference is the thing the eye lands on. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Metric label={t('qd_total_pvp')} value={formatK(granted.pvp)}
                  delta={granted.pvp - totals.pvp}/>
                <Metric label={t('qd_total_cost')} value={formatK(granted.cost)}
                  delta={granted.cost - totals.cost} lowerIsBetter/>
                <Metric label={t('qd_col_gm')} value={formatK(granted.grossMargin)}
                  delta={granted.grossMargin - totals.grossMargin}/>
                <Metric label={t('qd_gm_pct')} value={`${granted.marginPct}%`}
                  delta={granted.marginPct - totals.marginPct} unit="pp"/>
              </div>
            </div>
          )}
          {/* The same two scenarios, product by product. With four products in
              a project the total answers "is this deal any good?" and hides
              which line is carrying it — and the line that is carrying it is
              usually the one being discounted. */}
          {lines.length > 1 && (
            <div className="pt-2 border-t border-navy/10 space-y-1.5">
              <button type="button" onClick={() => setByProduct(o => !o)}
                className="flex items-center gap-1 text-micro font-semibold text-navy uppercase tracking-wide min-h-tap">
                {byProduct ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                {t('qd_by_product')}
              </button>

              {byProduct && lines.map(l => {
                const g = grantedLine(l)
                return (
                  <div key={l.id} className="rounded-lg bg-white/70 border border-navy/10 px-2 py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 truncate">{l.product.name}</p>
                      <span className="text-micro text-gray-400 flex-shrink-0">
                        {l.years} {t('qd_years')}
                      </span>
                    </div>
                    <Row label={t('qd_as_quoted')} v={l} tone="navy"/>
                    {l.pendingCostRelief > 0 && (
                      <Row label={t('qd_if_granted_short')} v={g} tone="amber" from={l}/>
                    )}
                  </div>
                )
              })}
              {byProduct && services.pvp > 0 && (
                <p className="text-micro text-gray-400">{t('qd_by_product_services')}</p>
              )}
            </div>
          )}

          {lines.some(l => l.discountPct > 0 || l.skuDiscounts?.length) && (
            <p className="text-micro text-gray-500">{t('qd_worklist_note')}</p>
          )}
          {lines.some(l => !l.costKnown) && (
            <p className="text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              {t('qd_cost_warning')}
            </p>
          )}
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

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
