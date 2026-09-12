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
import { channelEconomics, partnerTargetPrice, PROTECTED_MARGIN,
         CHANNEL_ROLES, NAMED_PROGRAMMES } from '../../lib/partnerMargin'
import { unitsNeeded, quantityFor } from '../../lib/volumeUnits'
import { toEur, rateLabel } from '../../lib/fx'
import { useFxRates } from '../../hooks/useFxRates'
import { COUNTRY_MAP, regionForCountry, STAGES } from '../../constants'
import { getAllowedTransitions } from '../../lib/stateMachine'
import { canPrice } from '../../lib/roles'
import { toQuoteState, fromQuoteState, rebuildFrom } from '../../lib/quoteState'
import { requestsForDeal, acceptCounter, askAgain, requestState } from '../../lib/discountRequests'
import { useCompanyScope } from '../../hooks/useCompanyScope'
import { dealLines } from '../../lib/dealLines'
import { authMapOf, authorisedProducts, authorisedCountries,
         hasAuthorisations, authKey, partnerLineCost } from '../../lib/partnerCatalogue'
import SearchableSelect from '../SearchableSelect'
import { formatK, Spinner } from '../ui'
import { X, Check, ChevronDown, ChevronRight, Paperclip } from 'lucide-react'
import AttachmentsList from '../AttachmentsList'

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
export default function QuickQuote({ deal, onCancel, onCreated, onFullForm }) {
  const { profile } = useAuth()
  const { homeId } = useCompanyScope()
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
  const [stage, setStage] = useState('Lead')
  const [discOpen, setDiscOpen] = useState({})     // line id -> discount asked
  const [servicesOn, setServicesOn] = useState(false)
  const [servicesTouched, setTouched] = useState(false)
  const [servicesPvp, setServicesPvp] = useState('')   // '' = the default price
  const [channelRole, setChannelRole] = useState('direct')
  const [roleFromCompany, setRoleFromCompany] = useState(null)  // 'company' | 'region'
  const [programme, setProgramme] = useState('')   // named programme, above cap
  /**
   * What the partner told us they will charge the hospital, when they told us.
   *
   * Empty is the normal state and the panel estimates. Filled, the estimate
   * gives way to a measurement — and only then can the protected floors be
   * checked rather than recited, because until there is a real sell price the
   * partner's margin is just the assumption read back to itself.
   */
  const [customerPrice, setCustomerPrice] = useState('')

  /**
   * Whose deal this is, and therefore how it is sold.
   *
   * "Sold through" used to be a question with five answers and a default of
   * Direct. On a deal belonging to TIMED Chile that default is wrong twice: it
   * is not direct, and while it says direct the whole partner economics panel
   * below stays hidden — so whoever approves a discount cannot see the end
   * customer price, our transfer price, or what the partner makes.
   *
   * The answer is not a property of the deal. It is a property of the
   * relationship: TIMED Chile is a Full VAR whatever they are selling this
   * week. It is read off the company and can still be overridden here, because
   * a one-off really can be direct and a rule that cannot be broken on purpose
   * gets worked around by accident.
   */
  const [dealCompany, setDealCompany] = useState(null)
  const [companyRole, setCompanyRole] = useState(null)
  useEffect(() => {
    let alive = true
    const id = deal?.company_id || (internal ? null : profile?.company_id)
    if (!id) { setDealCompany(null); return }
    supabase.from('companies').select('id, name, type, country, channel_role')
      .eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setDealCompany(data)
        setCompanyRole(data.channel_role
          || (data.type === 'distributor' ? 'full_var' : null))
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.company_id, deal?.id, internal, profile?.company_id])

  // Editing an existing deal: the inputs it was quoted from, read back exactly.
  // A deal from before those were stored is rebuilt from its product lines and
  // says so, because an approximation presented as the original is how a quote
  // that went to a customer gets quietly rewritten.
  // Where each discount ask on this deal stands. It used to live only in the
  // full form's history, two screens from where a partner works — so a
  // counter-offer arrived and nobody saw it.
  const [requests, setRequests] = useState([])
  const [askingOn, setAskingOn] = useState(null)
  const [askPct, setAskPct] = useState('')
  const [askNote, setAskNote] = useState('')
  const [rebuilt, setRebuilt] = useState(false)
  const [quoteStoreError, setQuoteStoreError] = useState(null)

  /**
   * Two things arrive after the first render, and until they do the screen was
   * telling the reader something untrue.
   *
   * A saved quote: the form drew its defaults — no products, one year, no
   * services — and a moment later snapped to what was actually quoted. Anybody
   * reading quickly saw an empty quote for a deal that has one.
   *
   * A partner's authorisations: the catalogue starts empty, and an empty
   * catalogue is what "you have no authorised products" is derived from. So
   * every partner opening the quick deal was told, briefly, that they are not
   * allowed to sell anything.
   *
   * Both start true only where there is something to wait for — a new deal has
   * no stored quote, and our own people have no authorisations to fetch — so
   * nothing waits on a request that will never be made.
   */
  const [loadingQuote, setLoadingQuote] = useState(Boolean(deal?.id))
  const [loadingAuths, setLoadingAuths] = useState(!internal)

  useEffect(() => {
    if (!deal?.id) return
    let alive = true
    setClient(deal.client || '')
    if (deal.stage) setStage(deal.stage)
    if (deal.country) setCountry(deal.country)

    requestsForDeal(deal.id).then(({ data }) => { if (alive) setRequests(data || []) })

    supabase.from('deal_quote').select('state').eq('deal_id', deal.id).maybeSingle()
      .then(async ({ data, error: qErr }) => {
        // "Nothing stored" and "cannot read what is stored" are different
        // facts, and only one of them is about this deal. Reporting the second
        // as the first tells the rep a comfortable story about their own data.
        if (qErr) {
          logger.error('Quote state unreadable', { error: qErr.message, deal: deal.id })
          if (alive) setQuoteStoreError(qErr.message)
        }
        let state = fromQuoteState(data?.state)
        if (!state) {
          const { data: rows } = await dealLines(deal.id,
            // No cost_price here: it is not on the shared view any more, and
            // dealLines joins it in from the guarded one for a reader entitled
            // to it. Asking the view for a column it no longer has is an error,
            // not a null.
            'id, product_id, volume, unit_price, net_price, annual_fee')
          state = rebuildFrom(rows || [])
        }
        if (!alive) return
        setPicked(state.picked)
        setVolumes(state.volumes)
        setOver(state.overrides)
        setFamSel(state.famSel)
        setYears(state.years)
        setManDays(state.manDays)
        setServicesOn(state.servicesOn)
        setServicesPvp(state.servicesPvp)
        setChannelRole(state.channelRole)
        setCustomerPrice(state.customerPrice ?? '')
        setProgramme(state.programme)
        if (state.country) setCountry(state.country)
        setRebuilt(Boolean(state.rebuilt) && !qErr)
        setLoadingQuote(false)
      })
      // A rejected promise never reaches .then, and a spinner nobody clears is
      // worse than the flicker it replaced.
      .catch(e => {
        if (!alive) return
        logger.error('Quote state load failed', { error: e.message, deal: deal.id })
        setQuoteStoreError(e.message)
        setLoadingQuote(false)
      })
    return () => { alive = false }
  }, [deal?.id])

  // What this partner may sell, and where. Set by an admin in Permissions →
  // Companies, one row per product per country.
  const [auths, setAuths] = useState([])
  // Whose catalogue applies. The deal's own company wins over whichever one is
  // selected in the header: opening a Peru deal while looking at Chile must
  // price it against Peru's authorisations, not against the ones the reader
  // happens to be filtered to.
  const catalogueCompany = deal?.company_id || homeId || profile?.company_id || null
  useEffect(() => {
    if (internal) return
    if (!catalogueCompany) { setLoadingAuths(false); return }
    let alive = true
    setLoadingAuths(true)
    supabase.from('company_product_authorizations')
      .select('product_id, country, price, active')
      .eq('company_id', catalogueCompany)
      .then(({ data }) => { if (alive) { setAuths(data || []); setLoadingAuths(false) } })
      .catch(() => { if (alive) setLoadingAuths(false) })
    return () => { alive = false }
  }, [internal, catalogueCompany])
  const authMap = useMemo(() => authMapOf(auths), [auths])

  // A partner sells from their own country. Picking somebody else's is not a
  // freedom they are missing — it is a deal that cannot be authorised.
  useEffect(() => {
    if (internal) return
    const countries = authorisedCountries(authMap)
    if (countries.length && !countries.includes(country)) setCountry(countries[0])
  }, [internal, authMap])

  /**
   * The catalogue this quote is written from: ours, or theirs.
   *
   * A product switched off in Products has been withdrawn from sale, and it was
   * still on offer here — the screen never filtered on it. One already on a
   * quote stays visible, because a deal that was priced with it does not lose a
   * line the day somebody retires the product.
   */
  const catalogue = useMemo(() => {
    const all = internal ? products : authorisedProducts(products, authMap, country)
    return all.filter(p => p.active !== false || picked.includes(p.id))
  }, [internal, products, authMap, country, picked])

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

  // On an existing deal the stage may only move where the state machine allows.
  // A quote screen is not the place to invent a transition the pipeline forbids.
  const stageOptions = useMemo(() => {
    if (!deal?.id) return STAGES
    // The stage it is already in belongs in the list. Without it the select's
    // value is not among its own options, and a controlled select whose value
    // matches nothing renders EMPTY — so opening a saved deal showed a blank
    // stage box and offered only the moves away from a stage it would not name.
    const allowed = getAllowedTransitions('deal', deal.stage)
    return STAGES.filter(x => x === deal.stage || allowed.includes(x))
  }, [deal?.id, deal?.stage])

  /**
   * Apply what the partner's agreement says — on a new quote, and only there.
   *
   * A saved deal is left exactly as it was quoted. That is a deliberate refusal
   * and it cost a revision to arrive at: the version before this treated a
   * stored `direct` as unanswered, on the reasoning that it was the old default
   * rather than anybody's decision. True, and still the wrong thing to do —
   * because it means opening an old deal to look at it changes the partner
   * economics on screen, and saving it for any other reason writes figures
   * nobody agreed to. History does not move because somebody opened a page.
   *
   * A saved deal whose role contradicts its partner is told so instead, below,
   * and changed by a person if a person decides to.
   */
  useEffect(() => {
    if (deal?.id || !companyRole || roleFromCompany) return
    if (channelRole !== 'direct') return
    setChannelRole(companyRole)
    setRoleFromCompany(dealCompany?.channel_role ? 'company' : 'type')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyRole, channelRole, dealCompany, deal?.id])

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

      // What this line costs the person quoting it. For us that is the transfer
      // price we pay a supplier. For a partner it is what they pay US, and that
      // is the regional price list — R1, R2, R3 — at the tier the volume
      // reaches, which is the same ladder every other price on this screen
      // comes from. An authorisation may pin a different price for one product
      // in one country, and where it does, the pinned price wins: somebody
      // agreed it deliberately.
      const authRow = internal ? null : authMap[authKey(product.id, country)]
      const partnerCost = internal ? 0 : partnerLineCost({
        product,
        pinnedUnit: authRow?.price,
        listedNet: listed?.net,
        quantity: productQty,
      })

      const capexCost = o.capexCost !== undefined ? Number(o.capexCost) || 0
        : !internal ? (isSub ? 0 : partnerCost)
        : isSub ? 0
        : (fam.capex > 0 ? fam.capex : (Number(productCosts[id]) || 0))
      const annualCost = o.annualCost !== undefined ? Number(o.annualCost) || 0
        : !internal ? (isSub ? partnerCost : 0)
        : isSub ? (fam.annual > 0 ? fam.annual : (Number(productCosts[id]) || 0))
        : fam.annual

      // A listed tier price is the sell side. For a subscription it is the
      // yearly fee; for a licensed product it is the one-off licence.
      const capexPvp = o.capexPvp !== undefined ? Number(o.capexPvp) || 0
        : isSub ? 0
        // A partner's quote opens on the margin they should be landing on —
        // the same 35% the transfer price protects on our own deals — so the
        // common case needs no arithmetic at all. It is a target, not a rule:
        // the price and the margin are both editable from either end.
        : !internal ? partnerTargetPrice(capexCost)
        : (listed ? listed.net : recommendedCapexPvp(capexCost))
      const annualPvp = o.annualPvp !== undefined ? Number(o.annualPvp) || 0
        : !internal ? partnerTargetPrice(annualCost)
        : isSub && listed ? listed.net
        : recommendedSlaPvp(annualCost)

      // A discount goes one of two ways and the supplier decides which. On what
      // we make it comes off the customer price and needs approving; on what we
      // buy it comes off our cost, but only once the supplier has said yes, so
      // until then it changes nothing on screen and merely marks the line.
      // A partner asks US for a discount, and it comes off what they pay us —
      // exactly the shape of our own supplier requests, so it uses the same
      // machinery: it is a request, it does not improve their margin until it
      // is granted, and the quote shows both readings.
      const routing = internal
        ? routeFor(suppliers[product.supplier_code])
        : { route: 'external', channel: 'VGT', initialStatus: 'to_request', appliesTo: 'cost' }
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
      const warrantyYears = internal && routing.route === 'external' && !isSub ? 1 : 0
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
        pendingCostRelief: !internal
          ? round2((capexCost + annualCost * Math.max(0, years - warrantyYears)) * discountPct / 100)
          : routing.appliesTo === 'cost'
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
      famSel, productCosts, years, pacsInQuote, suppliers, volumes, rates,
      internal, authMap, country])

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
  //
  // `netTotal` is what we are quoting, and on a channel deal that is what the
  // PARTNER pays us: R1–R4 is a transfer list. It is not the customer's price
  // and must never be labelled as one — the customer's price is the partner's
  // to set, and this screen only ever estimates it.
  const channel = useMemo(() => {
    const rows = lines.filter(l => l.routing.appliesTo === 'price' && l.listNet > 0)
    const listTotal = rows.reduce((s, l) => s + (l.isSub ? l.listNet * years : l.listNet), 0)
    const netTotal = rows.reduce((s, l) => s + (l.isSub ? l.annualPvp * years : l.capexPvp), 0)
    return {
      rows: rows.length,
      ...channelEconomics({
        listPrice: round2(listTotal), transferPrice: round2(netTotal),
        customerPrice: customerPrice === '' ? null : Number(customerPrice),
        role: channelRole, programme: programme || null,
      }),
      listTotal: round2(listTotal),
      netTotal: round2(netTotal),
    }
  }, [lines, years, channelRole, programme, customerPrice])

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
  const totals = useMemo(() => ({
    ...withServices(views.actual),
    capexPvp: round2(lines.reduce((n, l) => n + l.capexPvp + l.servicesPvp, 0)
      + (servicesOn ? services.pvp : 0)),
    annualPvp: round2(lines.reduce((n, l) => n + l.annualPvp, 0)),
  }), [views, lines, services, servicesOn, warrantyServicesPvp])

  async function reloadRequests() {
    const { data } = await requestsForDeal(deal.id)
    setRequests(data || [])
  }

  async function onAccept(req) {
    const { error: e } = await acceptCounter(req.id)
    if (e) { setError(e.message); return }
    reloadRequests()
  }

  async function onAskAgain(req) {
    const { error: e } = await askAgain(req, askPct, askNote)
    if (e) { setError(e.message); return }
    setAskingOn(null); setAskPct(''); setAskNote('')
    reloadRequests()
  }

  // Services alone are a deal: an implementation, a migration, a training week.
  const quotable = servicesOn && services.pvp > 0

  /** Whether this line has a discount on it at all, ours or the supplier's. */
  const discounted = l => (l.discountPct > 0 || (l.skuDiscounts?.length || 0) > 0)

  // A line whose discount is already set opens itself: a saved figure must
  // never sit behind a button nobody thought to press.
  const discountOpen = l => Boolean(discOpen[l.id]) || discounted(l)

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
        // The customer's side of the line, which is a partner's whole economics
        // and worth showing our own people too: what it lists at, what came off.
        list: round2(l.undiscounted.pvp),
        discountPct: l.discountPct,
      }
    })

    if (servicesOn && (services.pvp > 0 || services.cost > 0)) {
      rows.push({
        id: 'services', name: t('qd_services_short'), services: true,
        cost: round2(services.cost), pvp: round2(services.pvp),
        gm: round2(services.grossMargin), pct: services.marginPct,
        list: round2(services.pvp), discountPct: 0,
      })
    }

    const cost = round2(rows.reduce((n, r) => n + r.cost, 0))
    const pvp = round2(rows.reduce((n, r) => n + r.pvp, 0))
    const list = round2(rows.reduce((n, r) => n + (r.list || 0), 0))
    const gm = round2(pvp - cost)
    return {
      rows,
      total: {
        cost, pvp, gm, list,
        pct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
        // What the discount cost, in money rather than in percent.
        given: round2(Math.max(0, list - pvp)),
      },
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

  /**
   * The other view of the same deal.
   *
   * A quote that has not been saved has nowhere to switch TO: the full form
   * reads a deal from the database. So it is saved first — at whatever stage
   * the rep chose, Lead by default — and the form opens on it. Nothing typed is
   * lost, which is what "two views" has to mean.
   */
  async function switchToFullForm() {
    if (!deal?.id && (lines.length || quotable)) {
      const saved = await create({ then: 'form' })
      if (!saved) return
      return
    }
    onFullForm?.()
  }

  async function create({ then = 'close' } = {}) {
    try { return await createDeal({ then }) } catch (err) {
      // A throw here used to reach nobody: the click did nothing, the button
      // did not even go into its saving state, and the screen said as much as
      // it would have if the button were not wired up at all.
      logger.error('Quick deal failed', { error: err?.message })
      setSaving(false)
      setError(`${t('qd_err_create')} ${err?.message || err}`)
      return false
    }
  }

  async function createDeal({ then = 'close' } = {}) {
    if (!client.trim()) { setError(t('qd_err_client')); return false }
    // Their deals are scoped to their company, in the database and on the deal
    // list. Without one the insert is refused, and the refusal reads as a
    // permissions fault rather than as a profile with a field missing.
    if (!internal && !profile?.company_id) { setError(t('qd_err_no_company')); return false }
    // A migration or a training week with no software on it is still a deal.
    if (!lines.length && !quotable) { setError(t('qd_err_product')); return false }
    // A discount nobody explained is refused rather than saved and chased
    // later: once the quote exists the figure is what everyone works from, and
    // the explanation never catches up with it.
    const unexplained = lines.filter(l => discounted(l) && !l.discountNote)
    if (unexplained.length) {
      setError(`${t('qd_err_reason')} ${unexplained.map(l => l.product.name).join(', ')}`)
      return false
    }
    setSaving(true); setError(null)

    const fields = {
      client: client.trim(),
      bu: defaultBU,
      country,
      region: regionForCountry(country) || 'Europe',
      value_total: totals.pvp,
      // A partner quote has no margin of ours in it — the figures on their
      // screen are the customer's price. Writing a margin here would be writing
      // a number nobody computed.
      // A FRACTION, because that is what this column is: every other reader
      // multiplies it by 100 to show it. The quote works in percentages, and
      // writing one straight in stored a margin a hundred times too large —
      // silently, because nothing validates that a margin is at most 1.
      gm_pct: internal ? round4(totals.marginPct / 100) : null,
      currency: 'EUR',
      // A rate is a snapshot. The project's rule for deals applies here: store
      // it, so a rate change tomorrow cannot silently reprice a quote sent
      // today.
      exchange_rate: lines.find(l => l.listed?.fx?.converted && l.listed.fx.rate !== 1)?.listed.fx.rate ?? null,
      stage,
      ...(internal ? {} : {
        sales_type: 'External',
        sales_owner: profile?.full_name || profile?.email || null,
      }),
    }

    // Editing keeps the deal's own identity and everything the quick deal does
    // not own — stage, forecast, the monthly spread, whoever it is assigned to.
    // Only the priced part is rewritten.
    const { data, error: e } = deal?.id
      ? await supabase.from('deals').update(fields).eq('id', deal.id)
          .select('id, client, bu, country').single()
      : await supabase.from('deals').insert({
          ...fields,
          // A deal belongs to one company. Where somebody acts for several and
          // is looking at all of them, that is their home company; where they
          // have narrowed to one, it is obviously the one they are looking at.
          company_id: homeId || profile?.company_id || null,
          created_by: profile?.id || null,
        }).select('id, client, bu, country').single()

    if (e) { setSaving(false); setError(`${t('qd_err_create')} ${e.message}`); return false }

    // How it was quoted, so it opens again as it was written rather than as
    // somebody's reconstruction of it.
    const { error: qErr } = await supabase.from('deal_quote').upsert({
      deal_id: data.id,
      state: toQuoteState({
        picked, volumes, overrides, famSel, years, manDays,
        servicesOn, servicesPvp, channelRole, programme, country, customerPrice,
      }),
      version: 1,
      created_by: profile?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'deal_id' })
    if (qErr) {
      // The deal is saved either way, but silently losing how it was built is
      // exactly the failure this table exists to prevent — so it is said out
      // loud rather than left in a log nobody reads.
      logger.error('Quote state not stored', { error: qErr.message })
      setQuoteStoreError(qErr.message)
      setSaving(false)
      setError(`${t('qd_err_quote_state')} ${qErr.message}`)
      return false
    }

    // The channel side of the deal, stored rather than derived: the protected
    // margin depends on the list price and the role on the day it was quoted,
    // and both move. It lives in its own table because RLS filters rows, not
    // columns, and a distributor reads every column of their own deals —
    // including, until this moved, our transfer price. value_total stays the
    // customer price: what a deal is worth to us is a forecasting decision.
    // A partner's quote records both sides of it, because the person approving
    // their discount has to see what we make AND what they make — and their
    // margin cannot be worked out later from a price list that moves.
    if (!internal) {
      const { error: pErr } = await supabase.from('deal_channel').upsert({
        deal_id: data.id,
        partner_transfer: totals.cost,      // what they pay us
        end_customer_price: totals.pvp,     // what their customer pays
        created_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'deal_id' })
      if (pErr) logger.error('Partner economics not stored', { error: pErr.message })
    }

    // Only ours: a partner's own save, above, has already written this row with
    // the two figures it actually holds. Both running wrote the deal twice.
    if (internal && channel.applies) {
      const { error: cErr } = await supabase.from('deal_channel').upsert({
        deal_id: data.id,
        partner_role: channel.role,
        partner_programme: channel.programme,
        partner_transfer: channel.transfer,
        // Left null on purpose, both of them. Quoting a partner tells us what
        // they pay us and nothing at all about what they charge the hospital —
        // the screen shows an estimate at the protected target and says so, and
        // an estimate written into a column called `end_customer_price` stops
        // being an estimate the moment somebody reports off it.
        // Written only when somebody typed it. The panel's own estimate never
        // reaches here: an estimate in a column called `end_customer_price`
        // stops being an estimate the moment a report reads it.
        partner_margin_pct: channel.customerEstimated ? null : channel.partnerMarginPct,
        end_customer_price: channel.customerEstimated ? null : channel.customerPrice,
        cwm_given_up: channel.givenUp,
        created_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'deal_id' })
      if (cErr) { setSaving(false); setError(`${t('qd_err_channel')} ${cErr.message}`); return false }
    }

    const { error: lineErr } = await saveDealProducts(data.id, lines.map(l => ({
      product_id: l.id,
      product_name: l.product.name,
      license_type: l.product.price_unit === 'study' ? 'per_volume' : 'flat',
      quantity: 1,
      volume: parseFloat(studies) || null,
      cost_price: internal ? l.cost : null,
      // A MARKUP ON COST, as a percentage, because that is what this column
      // means to the full line editor: it recomputes unit_price as
      // cost × (1 + margin/100). The quote's own margin is gross margin on the
      // sell price, which is a different number for the same line — 35% margin
      // is a 54% markup — so writing it here made the full editor drop the
      // price the moment anybody touched the row.
      margin_pct: internal ? markupOnCost(l.cost, l.capexPvp || l.pvp) : null,
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
    // A partner's ask goes to OUR approvers. It comes off what they pay us, so
    // the quote treats it like any supplier request — but the supplier is us,
    // and it belongs in the same queue as every other discount we grant.
    // Without this it reached nobody: the cost route files against a SKU list
    // a partner cannot read, so nothing was ever raised.
    const partnerAsks = internal || deal?.id ? [] : lines
      .filter(l => l.discountPct > 0)
      .map(l => ({ line: l, sku: null, route: 'internal', status: 'pending' }))

    // Only on the first quote. Re-raising on every edit would file the same ask
    // with the supplier again and bury the ones waiting for an answer.
    const external = deal?.id ? [] : lines.flatMap(l =>
      l.routing.appliesTo === 'cost'
        ? (l.skuDiscounts || []).map(d => ({ line: l, sku: d }))
        : [])
    const forApproval = deal?.id ? [] : lines
      .filter(l => l.routing.appliesTo === 'price' && l.ladder?.needsRequest)
      .map(l => ({ line: l, sku: null }))
    // Named for what it is, not for the helper one scope up: `discounted` is a
    // predicate this function calls before this line, and a const shadowing it
    // here put that call in the temporal dead zone.
    const toRaise = [...external, ...forApproval, ...partnerAsks]
    if (toRaise.length) {
      const { error: reqErr } = await supabase.from('deal_discount_requests').insert(
        toRaise.map(({ line: l, sku, route, status }) => ({
          deal_id: data.id,
          product_id: l.id,
          requested_by: profile?.id || null,
          requested_pct: sku ? sku.pct : (l.ladder ? l.ladder.pctOff : l.discountPct),
          approval_level: l.ladder?.level || null,
          brand: l.product.brand || null,
          supplier_code: l.product.supplier_code || null,
          route: route || l.routing.route,
          channel: l.routing.channel,
          status: status || l.routing.initialStatus,
          scope: 'both',
          // What this ask is worth in money, at the percentage being asked for.
          // The approval reads it back to take exactly that off what the
          // partner pays us — and scales it if it grants less than was asked.
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
        return false
      }

      // Mark the deal as having a discount question open.
      //
      // The requests were being filed and the deal left saying nothing, so the
      // card showed no chip, the banner on Deals counted it in no bucket, and a
      // partner with a live request had no sign of it anywhere until somebody
      // answered — because the answer is what used to set this. Only rows that
      // were actually filed count: a supplier ask still sitting in the worklist
      // as `to_request` has not been put to anybody.
      const filed = toRaise.filter(r => (r.status || r.line.routing.initialStatus) === 'pending')
      if (filed.length) {
        const asked = Math.max(...filed.map(({ line: l, sku }) =>
          Number(sku ? sku.pct : (l.ladder ? l.ladder.pctOff : l.discountPct)) || 0))
        // The largest ask, not their sum: the column holds one percentage and
        // adding them together would invent a discount nobody requested.
        await supabase.from('deals')
          .update({ discount_status: 'pending', discount_requested: asked || null })
          .eq('id', data.id)
      }
    }

    setSaving(false)
    if (lineErr) { setError(`${t('qd_err_lines')} ${lineErr.message}`); return false }
    // Saved, and then either done or handed to the other view of the same deal.
    if (then === 'form') onFullForm?.(data)
    else onCreated?.(data)
    return true
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

  // Before either of the two answers is in, say nothing rather than the wrong
  // thing. This sits above the refusal below on purpose: that refusal is
  // derived from an empty catalogue, and an empty catalogue is also what "not
  // loaded yet" looks like.
  if (loadingQuote || loadingAuths) {
    return <Spinner label={t('qd_loading')}/>
  }

  // A partner with nothing authorised has nothing to quote, and saying so is
  // more use than an empty catalogue they cannot explain.
  if (!internal && !hasAuthorisations(authMap)) {
    return <p className="text-sm text-gray-700">{t('qd_no_auth')}</p>
  }

  return (
    <div className="space-y-4">
      {quoteStoreError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {t('qd_quote_store_err')} <span className="text-red-600">{quoteStoreError}</span>
        </p>
      )}

      {rebuilt && !quoteStoreError && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('qd_rebuilt')}
        </p>
      )}

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
          {/* Where the deal stands. It was only ever settable in the long form,
              which meant every deal quoted here started as a Lead and stayed
              one until somebody remembered to go and change it. */}
          <label className="label">{t('qd_stage')}</label>
          <select className="select w-32" value={stage}
            onChange={e => setStage(e.target.value)}>
            {stageOptions.map(sName => (
              <option key={sName} value={sName}>{sName}</option>
            ))}
          </select>
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
                onChange={e => { setChannelRole(e.target.value); setRoleFromCompany(null) }}>
                {CHANNEL_ROLES.map(r => (
                  <option key={r.key} value={r.key}>
                    {t(`pm_role_${r.key}`)}{r.channelPct > 0 ? ` · ${r.channelPct}%` : ''}
                  </option>
                ))}
              </select>
              {/* Where it came from, so a figure that was not chosen is not
                  mistaken for one that was. */}
              {roleFromCompany === 'company' && dealCompany && (
                <p className="text-micro text-gray-500 mt-0.5">
                  {t('pm_role_from')} {dealCompany.name}
                </p>
              )}
              {roleFromCompany === 'type' && dealCompany && (
                <p className="text-micro text-gray-500 mt-0.5">
                  {t('pm_role_from_type')} {dealCompany.name}
                </p>
              )}
              {/* A saved deal that says Direct for a partner is almost certainly
                  carrying the old default rather than a decision. Said, not
                  corrected: changing it moves what the deal is worth to both
                  sides, and that is a person's call on a deal already quoted. */}
              {deal?.id && companyRole && channelRole === 'direct' && (
                <p className="text-micro text-amber-800 mt-0.5">
                  {t('pm_role_suggest')} {dealCompany?.name}
                </p>
              )}
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
              {/* Left to right: what we get, what it cost us to get it, and
                  then — separated, in grey, and labelled as a guess — the two
                  figures that are the partner's and not ours. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-gray-100">
                <div>
                  <p className="text-micro text-gray-500">{t('pm_transfer')}</p>
                  <p className="text-sm font-bold text-navy tabular-nums">{formatK(channel.transfer)}</p>
                  <p className="text-micro text-gray-400">
                    {t('pm_our_revenue')} · {100 - channel.discountPct}% {t('dl_of_list')}
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
                {/* The customer's price is the partner's decision, so this is a
                    box and not a figure. Empty, it estimates and says so in
                    grey. Filled — because the partner told us, usually while
                    asking for a discount — the estimate gives way to a
                    measurement and the panel starts checking instead of
                    assuming. */}
                <div>
                  <p className="text-micro text-gray-500">{t('pm_customer_est')}</p>
                  {channel.customerEstimated ? (
                    <p className="text-sm font-bold text-gray-500 tabular-nums">
                      ≈ {formatK(channel.customerPrice)}
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-navy tabular-nums">
                      {formatK(channel.customerPrice)}
                    </p>
                  )}
                  <input className="input text-xs py-0.5 mt-0.5 w-full" type="number"
                    value={customerPrice} placeholder={t('pm_customer_ph')}
                    onChange={e => setCustomerPrice(e.target.value)}/>
                  <p className="text-micro text-gray-400">
                    {channel.customerEstimated ? t('pm_estimated') : t('pm_told')}
                  </p>
                </div>
                <div>
                  <p className="text-micro text-gray-500">{t('pm_partner_margin')}</p>
                  <p className={`text-sm font-bold tabular-nums ${
                    channel.customerEstimated ? 'text-gray-500'
                      : channel.underTransfer || channel.belowAbsolute ? 'text-red-700'
                      : channel.belowFloor ? 'text-amber-800' : 'text-green-700'
                  }`}>
                    {channel.customerEstimated ? '≈ ' : ''}{formatK(channel.partnerMargin)} · {channel.partnerMarginPct}%
                  </p>
                  {/* Against the agreement once there is something to measure:
                      what the role says it earns, and the floors underneath. */}
                  <p className={`text-micro ${
                    !channel.customerEstimated && (channel.underTransfer || channel.belowAbsolute)
                      ? 'text-red-700 font-semibold'
                      : !channel.customerEstimated && channel.belowFloor ? 'text-amber-700'
                      : 'text-gray-400'
                  }`}>
                    {channel.customerEstimated
                      ? (channel.programme ? t('pm_programme_rate') : t('pm_assumed_target'))
                      : channel.underTransfer ? t('pm_under_transfer')
                      : channel.belowAbsolute ? t('pm_below_absolute')
                      : channel.belowFloor ? t('pm_below_floor')
                      : channel.onRoleRate ? t('pm_on_role_rate').replace('{pct}', channel.roleRatePct)
                      : t('pm_under_role_rate').replace('{pct}', channel.roleRatePct)}
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
                  {t('pm_over_cap').replace('{pct}', channel.discountPct)}
                </p>
              )}

              {/* What the pipeline carries, said plainly, because the figure on
                  a channel deal is ours and the bigger one on the customer's
                  invoice is not. */}
              {channel.transfer > 0 && (
                <p className="text-micro text-gray-500 border-t border-gray-100 pt-1.5">
                  {t('pm_pipeline_note').replace('{transfer}', formatK(channel.transfer))}
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
                  {l.product.active === false && (
                    <span className="text-gray-400 font-semibold mr-1">{t('qd_withdrawn')}</span>
                  )}
                  {!l.costKnown && (
                    <span className="text-amber-700 font-semibold mr-1">
                      {internal ? t('qd_cost_unknown') : t('qd_no_partner_price')}
                    </span>
                  )}
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
                // Their cost is our price list to them and is not theirs to
                // type over; the customer's price is, and the margin between
                // the two is the number they are actually deciding.
                <div className="grid grid-cols-[1fr_4.2rem_1fr] gap-2 items-end">
                  <div>
                    <label className="label">{t('qd_your_cost')}</label>
                    <p className="input text-right bg-gray-50 text-gray-600 tabular-nums">
                      {formatK(l.isSub ? l.annualCost : l.capexCost)}
                    </p>
                  </div>
                  <div>
                    <label className="label">{t('qd_margin_pct')}</label>
                    <input className={`input text-right ${
                      marginOf(l.isSub ? l.annualCost : l.capexCost,
                               l.isSub ? l.annualPvp : l.capexPvp) < PROTECTED_MARGIN.target
                        ? 'border-amber-300' : 'border-green-200'
                    }`} type="number" min="0" max="99"
                      value={marginOf(l.isSub ? l.annualCost : l.capexCost,
                                      l.isSub ? l.annualPvp : l.capexPvp)}
                      style={{ fontSize: '16px' }}
                      onChange={e => setMargin(l.id, l.isSub ? 'sla' : 'capex', e.target.value)}/>
                  </div>
                  <div>
                    <label className="label">{t('qd_customer_price')}</label>
                    <input className="input text-right font-semibold" type="number" min="0"
                      value={l.isSub ? l.annualPvp : l.capexPvp} style={{ fontSize: '16px' }}
                      onChange={e => setField(l.id, l.isSub ? 'annualPvp' : 'capexPvp', e.target.value)}/>
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
                      {/* The per-SKU note belongs to OUR supplier lines, where
                          the drill-down exists to set them in. A partner has no
                          such panel — their ask is one percentage off the line —
                          so pointing them at it left the row with no way to ask
                          for anything at all. */}
                      {internal && l.routing.appliesTo === 'cost'
                        ? <p className="text-micro text-gray-400 py-2">{t('qd_disc_per_sku')}</p>
                        : <input className="input text-right" type="number" min="0" max="99"
                            value={l.discountPct}
                            onChange={e => setField(l.id, 'discountPct', e.target.value)}
                            style={{ fontSize: '16px' }}/>}
                    </div>
                    <p className="text-micro text-gray-500 pb-2">
                      {!internal
                        ? t('qd_disc_partner')
                        : l.routing.appliesTo === 'price'
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

              {/* What came back on this line. The figure alone says nothing:
                  a counter is an offer waiting for an answer, and the answer
                  belongs where the rep already is. */}
              {requests.filter(r => r.product_id === l.id).map(r => {
                const state = requestState(r)
                const tone = state === 'approved' ? 'text-green-700 bg-green-50 border-green-200'
                  : state === 'rejected' ? 'text-red-700 bg-red-50 border-red-200'
                  : state === 'counter' ? 'text-amber-800 bg-amber-50 border-amber-200'
                  : 'text-gray-600 bg-gray-50 border-gray-200'
                return (
                  <div key={r.id} className={`rounded-lg border px-2 py-1.5 text-micro space-y-1 ${tone}`}>
                    <p className="font-semibold">
                      {t(`qd_req_${state}`)}
                      {r.approved_pct != null && state !== 'pending' && ` · ${r.approved_pct}%`}
                      <span className="font-normal opacity-80"> · {t('qd_req_asked')} {r.requested_pct}%</span>
                    </p>
                    {r.response_note && <p className="font-normal opacity-90">{r.response_note}</p>}

                    {state === 'counter' && r.requested_by === profile?.id && (
                      askingOn === r.id ? (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center gap-2">
                            <input className="input text-xs py-1 w-16 text-right" type="number"
                              min="0" max="99" value={askPct} style={{ fontSize: '16px' }}
                              placeholder={String(r.requested_pct)}
                              onChange={e => setAskPct(e.target.value)}/>
                            <span>%</span>
                          </div>
                          <input className="input text-xs py-1 w-full" value={askNote}
                            style={{ fontSize: '16px' }} placeholder={t('qd_disc_why_ph')}
                            onChange={e => setAskNote(e.target.value)}/>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setAskingOn(null)}
                              className="btn-secondary text-xs flex-1">{t('qd_cancel')}</button>
                            <button type="button" onClick={() => onAskAgain(r)}
                              disabled={!askPct || !askNote.trim()}
                              className="btn-primary text-xs flex-1">{t('qd_req_send')}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 pt-0.5">
                          <button type="button" onClick={() => setAskingOn(r.id)}
                            className="btn-secondary text-xs flex-1">{t('qd_req_again')}</button>
                          <button type="button" onClick={() => onAccept(r)}
                            className="btn-primary text-xs flex-1">
                            {t('qd_req_accept')} {r.approved_pct}%
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )
              })}

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
                  <span className="text-green-700 font-semibold">{t('qd_gm')} {formatK(l.grossMargin)} · {l.marginPct}%</span>
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
                <col style={{ width: '30%' }}/>
                <col style={{ width: '19%' }}/>
                <col style={{ width: '19%' }}/>
                <col style={{ width: '19%' }}/>
                <col style={{ width: '13%' }}/>
              </colgroup>
              <thead>
                <tr className="text-micro text-gray-500 uppercase tracking-wide">
                  <th className="text-left font-semibold py-1 px-1">{t('qd_col_desc')}</th>
                  {/* "Cost" is whatever the person quoting pays: our transfer
                      price, or our price list to them. Same table, same
                      arithmetic, and each side sees only their own half. */}
                  <th className="text-right font-semibold py-1 px-1 tabular-nums">
                    {internal ? t('qd_col_cost') : t('qd_col_your_cost')}
                  </th>
                  <th className="text-right font-semibold py-1 px-1 tabular-nums">{t('qd_col_price')}</th>
                  <th className="text-right font-semibold py-1 px-1 tabular-nums">{t('qd_col_gm')}</th>
                  <th className="text-right font-semibold py-1 px-1 tabular-nums">{t('qd_gm_pct')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map(r => (
                  <tr key={r.id} className="border-t border-navy/10">
                    <td className={`text-left py-1 px-1 truncate ${
                      r.services ? 'text-gray-500 italic' : 'text-gray-800'
                    }`}>{r.name}</td>
                    <td className="text-right py-1 px-1 text-red-700 tabular-nums">
                      {r.cost > 0 ? `−${formatK(r.cost)}` : '—'}
                    </td>
                    <td className="text-right py-1 px-1 text-gray-900 tabular-nums">{formatK(r.pvp)}</td>
                    <td className="text-right py-1 px-1 text-green-700 tabular-nums">{formatK(r.gm)}</td>
                    <td className="text-right py-1 px-1 text-green-700 tabular-nums">{r.pct}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-navy/25 font-bold">
                  <td className="text-left py-1.5 px-1 text-navy uppercase text-micro tracking-wide">
                    {t('qd_total')}
                  </td>
                  <td className="text-right py-1.5 px-1 text-red-700 tabular-nums">−{formatK(table.total.cost)}</td>
                  <td className="text-right py-1.5 px-1 text-navy tabular-nums">{formatK(table.total.pvp)}</td>
                  <td className="text-right py-1.5 px-1 text-green-700 tabular-nums">{formatK(table.total.gm)}</td>
                  <td className="text-right py-1.5 px-1 text-green-700 tabular-nums">{table.total.pct}%</td>
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

      {/* Documents, on a saved deal only — there is nowhere to hang a file
          before the deal exists. Folded away, because the quick deal is meant
          to take fifteen seconds and most of them carry no paperwork; but
          reachable, because a signed order arrives while somebody is in here
          and the full form is two screens away. */}
      {deal?.id && (
        <details className="border-t border-gray-100 pt-2">
          <summary className="text-xs text-gray-500 cursor-pointer min-h-tap flex items-center gap-1.5">
            <Paperclip size={13}/> {t('qd_documents')}
          </summary>
          <div className="pt-2">
            <AttachmentsList entityType="deal" entityId={deal.id} canEdit/>
          </div>
        </details>
      )}

      {onFullForm && (
        <button type="button" onClick={switchToFullForm} disabled={saving}
          className="text-xs text-gray-500 underline underline-offset-2 min-h-tap">
          {/* On an existing deal this is the other view of the same thing. On a
              new one it saves first, because opening an empty form and throwing
              away what was typed is not a switch, it is a loss. */}
          {deal?.id ? t('qd_full_detail')
            : lines.length || quotable ? t('qd_full_form_save') : t('qd_full_form')}
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
          {saving ? t('qd_creating')
            : `${deal?.id ? t('qd_save') : t('qd_create')} · ${formatK(totals.pvp)}`}
        </button>
      </div>
      {!lines.length && !quotable && (
        <p className="text-micro text-gray-500 text-right">{t('qd_need_product')}</p>
      )}
    </div>
  )
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

/** A fraction, to four places — enough for a margin read back as a percentage. */
function round4(n) { return Math.round((n + Number.EPSILON) * 10000) / 10000 }

/**
 * The markup on cost that produces this price, as a percentage.
 *
 * Not the same number as the margin on the price, and the difference is not
 * small: a line costing 65 and sold at 100 carries a 35% margin and a 53.8%
 * markup. `deal_products.margin_pct` is the markup, because the full line
 * editor multiplies cost by (1 + margin/100) to get back to the price.
 *
 * Null where cost is unknown: a markup computed from a cost of zero is
 * infinite, and the column would rather say nothing than say that.
 */
function markupOnCost(cost, price) {
  const c = Number(cost) || 0
  const p = Number(price) || 0
  if (c <= 0 || p <= 0) return null
  return Math.round(((p / c) - 1) * 1000) / 10
}
