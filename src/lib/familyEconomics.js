// What a family selection costs, and which price applies.
//
// Pure, and deliberately not inside the component that renders it: the quote
// screen needs the same arithmetic, and a test should be able to reach it
// without dragging in i18n and the browser.

import { cheapestCcuCombination, packageLines } from './ccu'
import { itemCost } from './itemPricing'

/**
 * What a family selection costs, split the way it is sold, and what a supplier
 * discount would take off it.
 *
 * `capex` is bought once — the licence, the packages, the hardware. `annual` is
 * the support fee, owed every year the contract runs. They carry different
 * margin floors and land in different places in the forecast, so they are never
 * added together here.
 *
 * Discounts are held PER SKU, not per family, because HCUS does not negotiate a
 * family. Synapse licensing moves 50 to 80 per cent; the Oracle licence behind
 * it moves 20 at most. One percentage across a PACS quote would be wrong on
 * both halves at once — optimistic on the Oracle line and leaving money on the
 * table on the Synapse one — and it is a single Salesforce case per SKU anyway.
 *
 * The relief is reported separately from the cost and never subtracted from it,
 * because a discount asked for is not a discount granted.
 */
export function familyEconomics(items, selection, studies) {
  const empty = { capex: 0, annual: 0, reliefCapex: 0, reliefAnnual: 0, discounted: [] }
  if (!items?.length || !selection) return empty

  const resolve = i => resolveVariant(items, i, selection.bundle)
  const discounts = selection.discounts || {}
  const priced = []

  const lines = packageLines(items)
  const line = lines.find(l => l.key === selection.line) || (lines.length === 1 ? lines[0] : null)
  const combo = line
    ? cheapestCcuCombination(line.packages, parseFloat(selection.users) || 0)
    : null
  for (const l of combo?.lines || []) {
    priced.push({
      item: l,
      cost: round2(l.cost * l.quantity),
      annualSupport: round2((Number(l.annual_support) || 0) * l.quantity),
    })
  }

  for (const id of selection.itemIds || []) {
    const raw = items.find(i => i.id === id)
    if (!raw) continue
    const item = resolve(raw)
    // The discount is keyed on what the rep picked, not on the variant it
    // resolved to — unticking the bundle box must not lose the percentage.
    priced.push({ item, keyId: id, ...itemCost(item, { studies, quantity: 1 }) })
  }

  const discounted = []
  let capex = 0, annual = 0, reliefCapex = 0, reliefAnnual = 0
  for (const p of priced) {
    capex += p.cost
    annual += p.annualSupport
    const pct = clampPct(discounts[p.keyId ?? p.item.id])
    if (pct > 0) {
      const rc = p.cost * (pct / 100)
      const ra = p.annualSupport * (pct / 100)
      reliefCapex += rc
      reliefAnnual += ra
      discounted.push({ item: p.item, pct, reliefCapex: round2(rc), reliefAnnual: round2(ra) })
    }
  }

  return {
    capex: round2(capex),
    annual: round2(annual),
    reliefCapex: round2(reliefCapex),
    reliefAnnual: round2(reliefAnnual),
    discounted,
  }
}

/** Nonsense percentages are clamped rather than allowed to invert a price. */
function clampPct(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

/**
 * What the supplier will normally go to on this SKU.
 *
 * Guidance, not a rule: HCUS decides, and the ceiling is there so a rep asking
 * 70 per cent on an Oracle licence learns it before filing the case rather than
 * after it comes back refused.
 */
export function discountCeiling(item) {
  const n = Number(item?.max_discount_pct)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The SKUs a family quotes by default, so a cost appears without hunting. */
export function defaultItemIds(items) {
  return (items || []).filter(i => i.is_default).map(i => i.id)
}

/**
 * Swap an item for its conditional price where one applies.
 *
 * The VNA licence costs 4,168.75 alone and 2,084.95 alongside Synapse PACS —
 * one product at two prices, depending on a fact about the site. The rep picks
 * the licence; whether the cheaper price applies is answered once, by the
 * checkbox, rather than by remembering which of two near-identical SKUs to
 * choose.
 */
export function resolveVariant(items, item, bundle) {
  if (!item?.variant_group) return item
  const want = bundle ? 'bundle' : 'standalone'
  if (item.variant === want) return item
  return (items || []).find(i => i.variant_group === item.variant_group && i.variant === want) || item
}

/** Whether this family has a price that depends on Synapse PACS being present. */
export function hasBundleVariant(items) {
  return (items || []).some(i => i.variant === 'bundle')
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
