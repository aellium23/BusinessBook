// What a family selection costs, and which price applies.
//
// Pure, and deliberately not inside the component that renders it: the quote
// screen needs the same arithmetic, and a test should be able to reach it
// without dragging in i18n and the browser.

import { cheapestCcuCombination, packageLines } from './ccu'
import { itemCost } from './itemPricing'

/**
 * What a family selection costs, split the way it is sold.
 *
 * `capex` is bought once — the licence, the packages, the hardware. `annual` is
 * the support fee, owed every year the contract runs. They carry different
 * margin floors and land in different places in the forecast, so they are never
 * added together here.
 */
export function familyEconomics(items, selection, studies) {
  const empty = { capex: 0, annual: 0 }
  if (!items?.length || !selection) return empty
  const resolve = i => resolveVariant(items, i, selection.bundle)
  const lines = packageLines(items)
  const line = lines.find(l => l.key === selection.line) || (lines.length === 1 ? lines[0] : null)
  const combo = line
    ? cheapestCcuCombination(line.packages, parseFloat(selection.users) || 0)
    : null
  const manual = (selection.itemIds || [])
    .map(id => items.find(i => i.id === id))
    .filter(Boolean)
    .map(resolve)
    .map(i => itemCost(i, { studies, quantity: 1 }))
  return {
    capex: round2((combo?.cost || 0) + manual.reduce((s, l) => s + l.cost, 0)),
    annual: round2((combo?.annualSupport || 0) + manual.reduce((s, l) => s + l.annualSupport, 0)),
  }
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
