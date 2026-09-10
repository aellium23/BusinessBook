import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
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
         servicesEconomics, recommendedServicesPvp,
         SERVICES_TARGET_MARGIN_PCT } from '../../lib/margins'
import { routeFor, applyDiscount, discountViews, internalApproval } from '../../lib/discountRouting'
import { priceAtRung } from '../../lib/discountLadder'
import { partnerEconomics, CHANNEL_ROLES, NAMED_PROGRAMMES } from '../../lib/partnerMargin'
import { unitsNeeded, quantityFor } from '../../lib/volumeUnits'
import { toEur, rateLabel } from '../../lib/fx'
import { useFxRates } from '../../hooks/useFxRates'
import { COUNTRY_MAP, regionForCountry } from '../../constants'
import { canPrice } from '../../lib/roles'
import { authMapOf, authorisedProducts, authorisedCountries,
         hasAuthorisations } from '../../lib/partnerCatalogue'
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

// What a day of our own implementation effort costs, until Settings says
// otherwise. A services line with no rate reads as pure margin, which is the
// same trap as a licence with no cost — better a stated company figure the rep
// can see and the P&L owner can change.
const DEFAULT_MAN_DAY_COST = 450



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

  // Two modes, one screen. Internal is our own sales: cost, margin, channel
  // economics, the whole pricing surface. A partner gets the same three inputs
  // and the same speed, over their own authorised catalogue at their own
  // prices, with nothing of our cost anywhere on it.
  const internal = canPrice(profile?.role)

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
  const [view, setView] = useState('quoted')       // which reading is on screen
  const [discOpen, setDiscOpen] = useState({})     // line id -> discount asked
  const [servicesOn, setServicesOn] = useState(false)
  const [servicesTouched, setTouched] = useState(false)
  const [servicesPvp, setServicesPvp] = useState('')   // '' = the default price
  const [channelRole, setChannelRole] = useState('direct')
  const [programme, setProgramme] = useState('')   // named programme, above cap

  // What this partner may sell, and where. Set by an admin in Permissions →
  // Companies, one row per product per country.
  const [auths, setAuths] = useState([])
  useEffect(() => {
    if (internal || !profile?.company_id) return
    supabase.from('company_product_authorizations')
      .select('product_id, country, price, active')
      .eq('company_id', profile.company_id)
      .then(({ data }) => setAuths(data || []))
  }, [internal, profile?.company_id])
  const authMap = useMemo(() => authMapOf(auths), [auths])

  // A partner sells from their own country. Picking somebody else's is not a
  // freedom they are missing — it is a deal that cannot be authorised.
  useEffect(() => {
    if (internal) return
    const countries = authorisedCountries(authMap)
    if (countries.length && !countries.includes(country)) setCountry(countries[0])
  }, [internal, authMap])

  // The catalogue this quote is written from: ours, or theirs.
  const catalogue = useMemo(
    () => (internal ? products : authorisedProducts(products, authMap, country)),
    [internal, products, authMap, country]
  )

  // A quote carries several volumes and they are not interchangeable. The exam
  // count is always asked; the rest appear only when something picked is priced
  // on them. See src/lib/volumeUnits.js for why this is not one field.
  const pickedProducts = useMemo(
    () => picked.map(id => catalogue.find(p => p.id === id)).filter(Boolean),
    [picked, catalogue]
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
    // A partner sells where they are authorised. Anywhere else is a deal that
    // cannot be authorised, not a freedom they are missing.
    if (!internal) {
      return authorisedCountries(authMap).map(c => ({ value: c, label: c }))
    }
    const home = HOME_COUNTRY[defaultBU]
    const top = [home, ...NEARBY.filter(c => c !== home)].filter(Boolean)
    return [
      ...top.map(c => ({ value: c, label: c })),
      ...ALL_COUNTRIES.filter(c => !top.includes(c)).map(c => ({ value: c, label: c })),
    ]
  }, [defaultBU, internal, authMap])

  // Latin America is sold through the partner, never direct. The role itself is
  // the partner's own — a Full VAR and a Reseller earn different rates — so the
  // screen asks rather than assuming one, and says why it is asking.
  const salesRegion = regionForCountry(country)
  const partnerTerritory = salesRegion === 'LATAM'

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
    if (!internal) return
    supabase.from('suppliers').select('code, name, kind, request_channel')
      .then(({ data }) => setSuppliers(Object.fromEntries((data || []).map(s => [s.code, s]))))
  }, [])
  useEffect(() => {
    if (!internal) return
    let alive = true
    fetchProductCosts().then(({ costs }) => { if (alive) setProductCosts(costs) })
    return () => { alive = false }
  }, [internal])

  const headline = useMemo(
    () => (internal
      ? HEADLINE_SKUS.map(sku => catalogue.find(p => p.sku === sku)).filter(Boolean)
      // A partner's list is short enough to be the whole of it: four products
      // behind a "+ 2 more" would be a fold for nothing.
      : catalogue),
    [internal, catalogue]
  )
  // Expanding "more" used to dump the whole catalogue as one unbroken run of
  // chips. Grouped by category it reads as a handful of short lists.
  const restGroups = useMemo(() => {
    const by = new Map()
    for (const p of catalogue) {
      if (!internal || HEADLINE_SKUS.includes(p.sku)) continue
      const key = p.category || 'Other'
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(p)
    }
    return [...by.entries()]
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => a.category.localeCompare(b.category))
  }, [catalogue, internal])
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
    () => picked.some(id => catalogue.find(p => p.id === id)?.sku === 'SYN-PACS'),
    [picked, catalogue]
  )
  const selectionFor = id => ({ bundle: pacsInQuote, ...(famSel[id] || {}) })

  // How many of the products on this quote are ours, counted from the picks
  // rather than from the priced lines — the bundle discount feeds the line
  // prices, so reading it back off them would be circular.

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
      const product = catalogue.find(p => p.id === id)
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
      const discountPct = Number(o.discountPct) || 0
      // Why the discount was given, in the rep's own words. One box, because a
      // discount nobody can explain in a sentence is one nobody should give.
      const discountNote = String(o.discountNote || '').trim()
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

      // A licence bought from a supplier carries a year of warranty: no annual
      // fee in year one, and the first year of SLA is sold to the customer all
      // the same. A subscription has no licence and no warranty year — its tier
      // price IS the annual fee, and there is no first year to include.
      const warrantyYears = routing.route === 'external' && !isSub ? 1 : 0
      const term = lineOverTerm({
        capexCost: dCapex.cost, capexPvp: dCapex.pvp,
        annualCost: dAnnual.cost, annualPvp: dAnnual.pvp,
        years, warrantyYears,
      })
      // The same line before anybody discounted it, so the quote can show what
      // the concession actually cost rather than only where it landed.
      const undiscounted = lineOverTerm({
        capexCost, capexPvp, annualCost, annualPvp, years, warrantyYears,
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
        discountPct, discountNote, routing, ladder,
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
        undiscounted,
        ...term,
      }
    }).filter(Boolean)
  }, [picked, catalogue, tiersByProduct, region, studies, overrides, itemsByProduct,
      famSel, productCosts, years, pacsInQuote, suppliers, volumes, rates])

  // The quote seen both ways: what we have, and what we have if the supplier
  // discounts land. The gap between them is the number worth naming.
  const views = useMemo(() => discountViews(lines), [lines])
  // Shown next to the region, because the pricing brief requires a conversion
  // to carry its rate wherever it appears.
  const fxNote = useMemo(() => {
    const l = lines.find(x => x.listed?.fx?.converted && x.listed.fx.rate !== 1)
    return l ? rateLabel(l.listed.fx.currency, l.listed.fx.rate) : null
  }, [lines])

  // The partner side of the same quote.
  //
  // Measured on the products that have a published regional list — ours — and
  // over the whole term, because a five-year subscription discounted once is
  // five years of concession. A licence's support fee has no list price of its
  // own and stays out of both sides rather than being counted on one.
  const channel = useMemo(() => {
    const rows = lines.filter(l => l.routing.appliesTo === 'price' && l.listNet > 0)
    const listTotal = rows.reduce((s, l) => s + (l.isSub ? l.listNet * years : l.listNet), 0)
    const netTotal = rows.reduce((s, l) => s + (l.isSub ? l.annualPvp * years : l.capexPvp), 0)
    return {
      rows: rows.length,
      ...partnerEconomics({
        listPrice: round2(listTotal), netPrice: round2(netTotal),
        role: channelRole, programme: programme || null,
      }),
      listTotal: round2(listTotal),
      netTotal: round2(netTotal),
    }
  }, [lines, years, channelRole, programme])

  /**
   * Implementation services, as a line of its own.
   *
   * The rep picks it like a product and types the effort in man-days, which is
   * the thing they can actually estimate. The cost follows from the company day
   * rate; the price starts at the 70 % services target, because our own people
   * are the whole cost and the customer is buying a project that goes live.
   *
   * Where the deal carries a warranty year, the customer is already paying one
   * year of the support fee as implementation — so the default price is
   * whichever of the two is larger. Taking the smaller would either give away
   * the warranty year or quote the effort under target, and neither is a
   * decision anybody made on purpose.
   */
  const warrantyServicesPvp = useMemo(
    () => round2(lines.reduce((n, l) => n + l.servicesPvp, 0)), [lines])

  const dayRateIsDefault = !(Number(settings.man_day_cost) > 0)
  const manDayCost = dayRateIsDefault ? DEFAULT_MAN_DAY_COST : Number(settings.man_day_cost)

  // Switched on by the deals that cannot go without it: where a warranty year
  // replaces the first year's SLA, quoting no services leaves a year of our own
  // team unpaid. Everywhere else implementation is a judgement about the project
  // as a whole, so the rep picks the chip — and once they have touched it, it
  // stays where they put it.
  useEffect(() => {
    if (!servicesTouched && warrantyServicesPvp > 0) setServicesOn(true)
  }, [warrantyServicesPvp, servicesTouched])

  const services = useMemo(() => {
    const effort = servicesEconomics({ manDays, manDayCost })
    const target = recommendedServicesPvp(effort.cost)
    // Priced off the effort, full stop. A figure that appears before anybody has
    // estimated anything is a figure nobody owns.
    const pvp = servicesPvp !== '' && servicesPvp !== undefined
      ? Number(servicesPvp) || 0
      : target
    const gm = round2(pvp - effort.cost)
    return {
      ...effort,
      pvp,
      target,
      grossMargin: gm,
      marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
      belowTarget: pvp > 0 && effort.cost > 0 && pvp < target - 0.005,
      warrantyPvp: warrantyServicesPvp,
    }
  }, [manDays, manDayCost, servicesPvp, warrantyServicesPvp])

  // Two different things, and both are billed.
  //
  // The first year of SLA is inside the product line already: on a licence the
  // supplier charges us nothing in year one and the customer pays for the year
  // regardless, which is the warranty year paying for itself.
  //
  // Implementation services are the project — migration, interfaces, training,
  // going live — and they apply whether the deal is a subscription or a licence
  // plus fee. So they are added, never substituted.
  const withServices = (v) => {
    const cost = round2(v.cost + services.cost)
    const pvp = round2(v.pvp + (servicesOn ? services.pvp : 0))
    const gm = round2(pvp - cost)
    return {
      ...v, cost, pvp, grossMargin: gm,
      marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
    }
  }
  const granted = useMemo(() => withServices(views.ifApproved),
    [views, services, servicesOn, warrantyServicesPvp])

  const totals = useMemo(() => ({
    ...withServices(views.actual),
    capexPvp: round2(lines.reduce((n, l) => n + l.capexPvp + l.servicesPvp, 0)
      + (servicesOn ? services.pvp : 0)),
    annualPvp: round2(lines.reduce((n, l) => n + l.annualPvp, 0)),
  }), [views, lines, services, servicesOn, warrantyServicesPvp])

  // Services alone are a deal: an implementation, a migration, a training week.
  const quotable = servicesOn && services.pvp > 0

  // A line whose discount is already set opens itself: a saved figure must
  // never sit behind a button nobody thought to press.
  const discountOpen = l => Boolean(discOpen[l.id]) || discounted(l)

  /** Whether this line has a discount on it at all, ours or the supplier's. */
  const discounted = l => (l.discountPct > 0 || (l.skuDiscounts?.length || 0) > 0)

  /** The discount note is prose, not a number, and must not be parsed as one. */
  function setNote(id, v) {
    setOver(o => ({ ...o, [id]: { ...(o[id] || {}), discountNote: v } }))
  }

  /**
   * The readings of this quote that exist, in the order the button cycles.
   *
   * Only the ones that mean something: there is no "before the discount" view
   * on a quote nobody discounted, and no "if the supplier says yes" view when
   * nothing has been asked of a supplier. A switch with one stop is not a
   * switch, and the button hides itself.
   */
  const viewModes = useMemo(() => {
    const modes = ['quoted']
    if (lines.some(l => l.discountPct > 0)) modes.push('list')
    if (views.hasPending) modes.push('granted')
    return modes
  }, [lines, views.hasPending])

  const mode = viewModes.includes(view) ? view : 'quoted'
  const nextMode = viewModes[(viewModes.indexOf(mode) + 1) % viewModes.length]

  /**
   * The proposal, line by line, in whichever reading is on screen.
   *
   * Implementation services get one row of their own. The revenue for them sits
   * on whichever line carries the warranty year, and the cost is estimated once
   * for the whole project — so splitting it across products would be arithmetic
   * nobody asked for. Consolidated, the rows still add up to the total, which is
   * the only property this table has to keep.
   */
  const table = useMemo(() => {
    const rows = lines.map(l => {
      const base = mode === 'list' ? l.undiscounted : l
      const relief = mode === 'granted' ? (l.pendingCostRelief || 0) : 0
      const cost = round2(Math.max(0, base.cost - relief))
      const pvp = round2(base.pvp)
      const gm = round2(pvp - cost)
      return {
        id: l.id, name: l.product.name, cost, pvp, gm,
        pct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
      }
    })

    if (servicesOn && (services.pvp > 0 || services.cost > 0)) {
      rows.push({
        id: 'services', name: t('qd_services_short'), services: true,
        cost: round2(services.cost), pvp: round2(services.pvp),
        gm: round2(services.grossMargin), pct: services.marginPct,
      })
    }

    const cost = round2(rows.reduce((n, r) => n + r.cost, 0))
    const pvp = round2(rows.reduce((n, r) => n + r.pvp, 0))
    const gm = round2(pvp - cost)
    return {
      rows,
      total: { cost, pvp, gm, pct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0 },
    }
  }, [lines, mode, services, servicesOn, t])

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
    try { await createDeal() } catch (err) {
      // A throw here used to reach nobody: the click did nothing, the button
      // did not even go into its saving state, and the screen said as much as
      // it would have if the button were not wired up at all.
      logger.error('Quick deal failed', { error: err?.message })
      setSaving(false)
      setError(`${t('qd_err_create')} ${err?.message || err}`)
    }
  }

  async function createDeal() {
    if (!client.trim()) { setError(t('qd_err_client')); return }
    // A migration or a training week with no software on it is still a deal.
    if (!lines.length && !quotable) { setError(t('qd_err_product')); return }
    // A discount nobody explained is refused rather than saved and chased
    // later: once the quote exists the figure is what everyone works from, and
    // the explanation never catches up with it.
    const unexplained = lines.filter(l => discounted(l) && !l.discountNote)
    if (unexplained.length) {
      setError(`${t('qd_err_reason')} ${unexplained.map(l => l.product.name).join(', ')}`)
      return
    }
    setSaving(true); setError(null)

    const { data, error: e } = await supabase.from('deals').insert({
      client: client.trim(),
      bu: defaultBU,
      country,
      region: regionForCountry(country) || 'Europe',
      stage: 'Lead',
      value_total: totals.pvp,
      // A partner quote has no margin of ours in it — the figures on their
      // screen are the customer's price. Writing a margin here would be writing
      // a number nobody computed.
      gm_pct: internal ? totals.marginPct : null,
      currency: 'EUR',
      // A rate is a snapshot. The project's rule for deals applies here: store
      // it, so a rate change tomorrow cannot silently reprice a quote sent
      // today.
      exchange_rate: lines.find(l => l.listed?.fx?.converted && l.listed.fx.rate !== 1)?.listed.fx.rate ?? null,
      company_id: profile?.company_id || null,
      created_by: profile?.id || null,
      ...(internal ? {} : {
        sales_type: 'External',
        sales_owner: profile?.full_name || profile?.email || null,
      }),
    }).select('id, client, bu, country').single()

    if (e) { setSaving(false); setError(`${t('qd_err_create')} ${e.message}`); return }

    // The channel side of the deal, stored rather than derived: the protected
    // margin depends on the list price and the role on the day it was quoted,
    // and both move. It lives in its own table because RLS filters rows, not
    // columns, and a distributor reads every column of their own deals —
    // including, until this moved, our transfer price. value_total stays the
    // customer price: what a deal is worth to us is a forecasting decision.
    if (channel.applies) {
      const { error: cErr } = await supabase.from('deal_channel').insert({
        deal_id: data.id,
        partner_role: channel.role,
        partner_programme: channel.programme,
        partner_transfer: channel.transfer,
        partner_margin_pct: channel.partnerMarginPct,
        cwm_given_up: channel.givenUp,
        end_customer_price: channel.netTotal,
        created_by: profile?.id || null,
      })
      if (cErr) { setSaving(false); setError(`${t('qd_err_channel')} ${cErr.message}`); return }
    }

    const { error: lineErr } = await saveDealProducts(data.id, lines.map(l => ({
      product_id: l.id,
      product_name: l.product.name,
      license_type: l.product.price_unit === 'study' ? 'per_volume' : 'flat',
      quantity: 1,
      volume: parseFloat(studies) || null,
      cost_price: internal ? l.cost : null,
      margin_pct: internal ? l.marginPct : null,
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
    const forApproval = lines
      .filter(l => l.routing.appliesTo === 'price' && l.ladder?.needsRequest)
      .map(l => ({ line: l, sku: null }))
    // Named for what it is, not for the helper one scope up: `discounted` is a
    // predicate this function calls before this line, and a const shadowing it
    // here put that call in the temporal dead zone.
    const toRaise = [...external, ...forApproval]
    if (toRaise.length) {
      const { error: reqErr } = await supabase.from('deal_discount_requests').insert(
        toRaise.map(({ line: l, sku }) => ({
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
          // Whoever reads this — an approver here, or a case handler at the
          // supplier — reads why before they read how much.
          justification: [
            client.trim(),
            sku ? `${sku.item.supplier_sku || ''} ${sku.item.description || sku.item.name}`.trim()
                : l.product.name,
            l.discountNote,
          ].filter(Boolean).join(' · '),
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

  // A partner with nothing authorised has nothing to quote, and saying so is
  // more use than an empty catalogue they cannot explain.
  if (!internal && !hasAuthorisations(authMap)) {
    return <p className="text-sm text-gray-700">{t('qd_no_auth')}</p>
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
          {internal && (<>
          {/* Services sit with the favourites because they are on most deals
              and were previously reachable only as a side effect of a warranty
              year — which meant a PACS-less project could not quote them. */}
          <button type="button" onClick={() => { setTouched(true); setServicesOn(v => !v) }}
            className={`min-h-tap px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              servicesOn ? 'border-navy bg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>
            {servicesOn && <Check size={11} className="inline mr-1 -mt-0.5"/>}{t('qd_services_short')}
          </button>
          </>)}
          {internal && !showAll && restCount > 0 && (
            <button type="button" onClick={() => setShowAll(true)}
              className="min-h-tap px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
              + {restCount} {t('qd_more')}
            </button>
          )}
        </div>

        {internal && showAll && (
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
        {internal && picked.map(id => {
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

      {/* Who sells this, and what protecting their margin costs us.
          Only where there is a published list to measure a concession against. */}
      {internal && channel.rows > 0 && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="label">{t('pm_sold_through')}</label>
              <select className={`select w-44 ${partnerTerritory && channelRole === 'direct' ? 'border-amber-300' : ''}`}
                value={channelRole}
                onChange={e => setChannelRole(e.target.value)}>
                {CHANNEL_ROLES.map(r => (
                  <option key={r.key} value={r.key}>
                    {t(`pm_role_${r.key}`)}{r.channelPct > 0 ? ` · ${r.channelPct}%` : ''}
                  </option>
                ))}
              </select>
            </div>
            {/* Above the cap the deal is already an exception, and the two named
                programmes carry their own negotiated transfer prices. */}
            {channel.applies && channel.overCap && (
              <div>
                <label className="label">{t('pm_programme')}</label>
                <select className="select w-44" value={programme}
                  onChange={e => setProgramme(e.target.value)}>
                  <option value="">{t('pm_programme_none')}</option>
                  {NAMED_PROGRAMMES.map(p => (
                    <option key={p.key} value={p.key}>{t(`pm_prog_${p.key}`)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {partnerTerritory && channelRole === 'direct' && (
            <p className="text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              {t('pm_latam_partner')}
            </p>
          )}
          {partnerTerritory && (
            <p className="text-micro text-gray-500">{t('pm_latam_arr')}</p>
          )}

          {channel.applies && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-gray-100">
                <div>
                  <p className="text-micro text-gray-500">{t('pm_customer_pays')}</p>
                  <p className="text-sm font-bold text-navy tabular-nums">{formatK(channel.netTotal)}</p>
                  <p className="text-micro text-gray-400">{100 - channel.discountPct}% {t('dl_of_list')}</p>
                </div>
                <div>
                  <p className="text-micro text-gray-500">{t('pm_transfer')}</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums">{formatK(channel.transfer)}</p>
                  <p className="text-micro text-gray-400">{t('pm_our_revenue')}</p>
                </div>
                <div>
                  <p className="text-micro text-gray-500">{t('pm_partner_margin')}</p>
                  <p className={`text-sm font-bold tabular-nums ${
                    channel.belowFloor ? 'text-red-700'
                      : channel.atFloor ? 'text-amber-800' : 'text-green-700'
                  }`}>
                    {formatK(channel.partnerMargin)} · {channel.partnerMarginPct}%
                  </p>
                  {/* Against policy, not against nothing: 35 is where a partner
                      should land, and 20 is the most a discount may cost them. */}
                  <p className={`text-micro ${
                    channel.belowFloor ? 'text-red-700 font-semibold'
                      : channel.atFloor ? 'text-amber-700' : 'text-gray-400'
                  }`}>
                    {channel.programme ? t('pm_programme_rate')
                      : channel.belowFloor ? t('pm_below_floor')
                      : channel.roleUnderFloor ? t('pm_role_rate')
                      : channel.atFloor ? t('pm_at_floor')
                      : t('pm_on_target')}
                  </p>
                </div>
                <div>
                  <p className="text-micro text-gray-500">{t('pm_given_up')}</p>
                  <p className={`text-sm font-bold tabular-nums ${channel.givenUp > 0 ? 'text-amber-800' : 'text-gray-400'}`}>
                    {formatK(channel.givenUp)}
                  </p>
                  <p className="text-micro text-gray-400">
                    {t('pm_at_list')} {formatK(channel.cwmRevenueAtList)}
                  </p>
                </div>
              </div>

              <p className="text-micro text-gray-500">{t('pm_why')}</p>

              {/* The easy thing at renewal is to open last year's quote, and
                  doing that turns one concession into the price forever. */}
              {channel.role === 'renewal' && (
                <p className="text-micro text-navy bg-navy/5 border border-navy/10 rounded-lg px-2 py-1.5">
                  {t('pm_renewal_note')}
                </p>
              )}

              {channel.overCap && !channel.programme && (
                <p className="text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  {t('pm_over_cap').replace('{pct}', channel.protectedPct)}
                </p>
              )}

              {/* The pipeline still carries the customer price. Changing what a
                  deal is worth to us is not a display decision — it re-runs the
                  forecast — so the difference is named and left for a decision. */}
              {channel.transfer > 0 && (
                <p className="text-micro text-gray-500 border-t border-gray-100 pt-1.5">
                  {t('pm_pipeline_note')
                    .replace('{value}', formatK(totals.pvp))
                    .replace('{transfer}', formatK(channel.transfer))}
                </p>
              )}
            </>
          )}
        </div>
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
                  {internal && !l.costKnown && <span className="text-amber-700 font-semibold mr-1">{t('qd_cost_unknown')}</span>}
                  {l.priced ? l.tierLabel : t('qd_cost_margin')}
                  {l.priced && l.boundBy !== 'tier' && (
                    <span className="ml-1 font-semibold text-amber-700">
                      {l.boundBy === 'minimum' ? t('qd_bound_min') : t('qd_bound_cap')}
                    </span>
                  )}
                </span>
              </div>

              {internal && !l.isSub && (
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

              {internal ? (
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
              ) : (
                // A partner prices what the customer pays, and nothing else.
                <div className="grid grid-cols-2 gap-2 items-end">
                  {!l.isSub && (
                    <div>
                      <label className="label">{t('qd_capex_pvp')}</label>
                      <input className="input text-right font-semibold" type="number" min="0"
                        value={l.capexPvp} style={{ fontSize: '16px' }}
                        onChange={e => setField(l.id, 'capexPvp', e.target.value)}/>
                    </div>
                  )}
                  <div>
                    <label className="label">{t('qd_annual_pvp')}</label>
                    <input className="input text-right font-semibold" type="number" min="0"
                      value={l.annualPvp} style={{ fontSize: '16px' }}
                      onChange={e => setField(l.id, 'annualPvp', e.target.value)}/>
                  </div>
                </div>
              )}

              {/* The discount is opt-in. Most quotes do not carry one, and a
                  percentage box with a reason box under it, on every line, was
                  three fields of nothing on the way to the price. */}
              {!discountOpen(l) ? (
                <button type="button" onClick={() => setDiscOpen(o => ({ ...o, [l.id]: true }))}
                  className="text-micro font-semibold text-navy underline underline-offset-2 min-h-tap">
                  + {t('qd_disc_ask')}
                </button>
              ) : (
                <div className="space-y-1.5 pt-1 border-t border-gray-100">
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

                  {/* Three lines, because one line taught people to write "price"
                      where an approver needs the incumbent, the figure and the date. */}
                  {discounted(l) && (
                    <div>
                      <label className="label">{t('qd_disc_why')}</label>
                      <textarea rows={3}
                        className={`input text-xs w-full leading-snug ${l.discountNote ? '' : 'border-amber-300'}`}
                        style={{ fontSize: '16px' }} value={(overrides[l.id]?.discountNote) || ''}
                        placeholder={t('qd_disc_why_ph')}
                        onChange={e => setNote(l.id, e.target.value)}/>
                      {!l.discountNote && (
                        <p className="text-micro text-amber-700">{t('qd_disc_why_hint')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {internal && (l.capexBelow || l.annualBelow) && (
                <p className="text-micro text-red-700">
                  {t('qd_below_floor')}{' '}
                  {l.capexBelow && `${t('qd_capex_pvp')} ≥ ${formatK(recommendedCapexPvp(l.capexCost))}`}
                  {l.capexBelow && l.annualBelow && ' · '}
                  {l.annualBelow && `${t('qd_annual_pvp')} ≥ ${formatK(recommendedSlaPvp(l.annualCost))}`}
                </p>
              )}

              {l.servicesPvp > 0 && (
                <p className="text-micro text-gray-400">{t('qd_warranty_note')}</p>
              )}

              <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100 text-xs">
                <span className="text-gray-500">
                  {years} {t('qd_years')}
                  {l.warrantyYears > 0 && (
                    <span className="text-gray-400"> · {l.billedYears} {t('qd_billed_years')}</span>
                  )}
                </span>
                <span className="flex gap-3">
                  {internal && (
                    <span className="text-green-700 font-semibold">{t('qd_gm')} {formatK(l.grossMargin)} · {l.marginPct}%</span>
                  )}
                  <span className="font-bold text-gray-900">{formatK(l.pvp)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Implementation services, priced like everything else on this screen:
          effort in, cost from the day rate, margin, price. */}
      {internal && servicesOn && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-800">{t('qd_services')}</p>
            <span className="text-micro text-gray-400 text-right">
              {formatK(manDayCost)}{t('qd_per_day')}
              {dayRateIsDefault && <span className="text-amber-700"> · {t('qd_day_rate_default_short')}</span>}
            </span>
          </div>

          <div className="grid grid-cols-[1fr_4.2rem_1fr] gap-2 items-end">
            <div>
              <label className="label">{t('qd_man_days')}</label>
              <input className="input text-right" type="number" min="0" step="0.5"
                value={manDays} placeholder="0" style={{ fontSize: '16px' }}
                onChange={e => setManDays(e.target.value)}/>
            </div>
            <div>
              <label className="label">{t('qd_margin_pct')}</label>
              <input className={`input text-right ${services.belowTarget ? 'border-red-300' : 'border-green-200'}`}
                type="number" min="0" max="99" value={services.marginPct}
                style={{ fontSize: '16px' }}
                onChange={e => {
                  const p = pvpForMargin(services.cost, e.target.value)
                  if (p !== null) setServicesPvp(String(p))
                }}/>
            </div>
            <div>
              <label className="label">{t('qd_services_pvp')}</label>
              <input className="input text-right font-semibold" type="number" min="0"
                value={services.pvp} style={{ fontSize: '16px' }}
                onChange={e => setServicesPvp(e.target.value)}/>
            </div>
          </div>

          <p className="text-micro text-gray-500">
            {services.days} × {formatK(services.rate)} = <strong className="tabular-nums">{formatK(services.cost)}</strong>

            {services.belowTarget && (
              <span className="block text-red-700 font-semibold">
                {t('qd_services_below').replace('{pct}', SERVICES_TARGET_MARGIN_PCT).replace('{pvp}', formatK(services.target))}
              </span>
            )}
            <span className="block text-gray-400">{t('qd_man_days_hint')}</span>
          </p>
        </div>
      )}

      {/* The proposal summary. The per-line table answers "what did I price?";
          this answers "what is this project worth, and what do we make on it?",
          which is the question the rep is actually asked. */}
      {(lines.length > 0 || quotable) && (
        <div className="border-2 border-navy/20 bg-navy/[0.04] rounded-xl p-3 space-y-2">
          {/* The proposal as a table: a row per product, services consolidated
              into one, and a total that is the sum of the rows. Cost is shown
              negative because that is what it does to the money. */}
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className={`text-xs font-bold uppercase tracking-wide ${
              mode === 'granted' ? 'text-amber-800' : 'text-navy'
            }`}>
              {/* Calling it the discounted view when nothing is discounted
                  would be the sort of small lie that costs trust in the rest. */}
              {mode === 'quoted' && !viewModes.includes('list')
                ? t('qd_view_quoted')
                : mode === 'quoted' ? t('qd_view_discounted') : t(`qd_view_${mode}`)}
            </p>
            <p className="text-micro text-gray-500">
              {t('qd_contract_duration')} ({years}{t('qd_years_short')})
            </p>
          </div>

          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              {/* The description column is given a share rather than left to
                  size itself off the longest product name, which is what pushed
                  the figures into two lines on a phone. */}
              <colgroup>
                {internal ? <>
                  <col style={{ width: '30%' }}/>
                  <col style={{ width: '19%' }}/>
                  <col style={{ width: '19%' }}/>
                  <col style={{ width: '19%' }}/>
                  <col style={{ width: '13%' }}/>
                </> : <>
                  <col style={{ width: '60%' }}/>
                  <col style={{ width: '40%' }}/>
                </>}
              </colgroup>
              <thead>
                <tr className="text-micro text-gray-500 uppercase tracking-wide">
                  <th className="text-left font-semibold py-1 px-1">{t('qd_col_desc')}</th>
                  {internal && <th className="text-right font-semibold py-1 px-1">{t('qd_col_cost')}</th>}
                  <th className="text-right font-semibold py-1 px-1">{t('qd_col_price')}</th>
                  {internal && <th className="text-right font-semibold py-1 px-1">{t('qd_col_gm')}</th>}
                  {internal && <th className="text-right font-semibold py-1 px-1">{t('qd_gm_pct')}</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map(r => (
                  <tr key={r.id} className="border-t border-navy/10">
                    <td className={`text-left py-1 px-1 truncate ${
                      r.services ? 'text-gray-500 italic' : 'text-gray-800'
                    }`}>{r.name}</td>
                    {internal && (
                      <td className="text-right py-1 px-1 text-red-700">
                        {r.cost > 0 ? `−${formatK(r.cost)}` : '—'}
                      </td>
                    )}
                    <td className="text-right py-1 px-1 text-gray-900">{formatK(r.pvp)}</td>
                    {internal && <td className="text-right py-1 px-1 text-green-700">{formatK(r.gm)}</td>}
                    {internal && <td className="text-right py-1 px-1 text-green-700">{r.pct}%</td>}
                  </tr>
                ))}
                <tr className="border-t-2 border-navy/25 font-bold">
                  <td className="text-left py-1.5 px-1 text-navy uppercase text-micro tracking-wide">
                    {t('qd_total')}
                  </td>
                  {internal && <td className="text-right py-1.5 px-1 text-red-700">−{formatK(table.total.cost)}</td>}
                  <td className="text-right py-1.5 px-1 text-navy">{formatK(table.total.pvp)}</td>
                  {internal && <td className="text-right py-1.5 px-1 text-green-700">{formatK(table.total.gm)}</td>}
                  {internal && <td className="text-right py-1.5 px-1 text-green-700">{table.total.pct}%</td>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Discreet, and it names what you get rather than naming a mode. */}
          {viewModes.length > 1 && (
            <button type="button" onClick={() => setView(nextMode)}
              className="text-micro font-semibold text-navy underline underline-offset-2 min-h-tap">
              {t(`qd_view_to_${nextMode}`)}
            </button>
          )}
          {mode === 'granted' && (
            <p className="text-micro text-amber-700">{t('qd_view_granted_hint')}</p>
          )}
          {mode === 'list' && (
            <p className="text-micro text-gray-500">{t('qd_view_list_hint')}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-gray-600 pt-1 border-t border-navy/10">
            {totals.capexPvp > 0 && (
              <span>{t('qd_one_off')}: <strong className="tabular-nums">{formatK(totals.capexPvp)}</strong></span>
            )}
            {totals.annualPvp > 0 && (
              <span>{t('qd_recurring')}: <strong className="tabular-nums">{formatK(totals.annualPvp)}</strong> {t('qd_recurring_yr')} {years}</span>
            )}
            <span>{lines.length} {t('qd_n_products')}</span>
          </div>

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

      {/* The same message as the top of the form, repeated where the button
          is. A refusal shown above the fold reads exactly like a dead button,
          which is what it looked like on a phone. */}
      {error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">{t('qd_cancel')}</button>
        <button type="button" onClick={create} disabled={saving || (!lines.length && !quotable)}
          className="btn-primary flex-1">
          {saving ? t('qd_creating') : `${t('qd_create')} · ${formatK(totals.pvp)}`}
        </button>
      </div>
      {!lines.length && !quotable && (
        <p className="text-micro text-gray-500 text-right">{t('qd_need_product')}</p>
      )}
    </div>
  )
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
