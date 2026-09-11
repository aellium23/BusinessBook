import { supabase } from '../lib/supabase'
import { numOrNull } from '../lib/numbers'
import { reconcileLines } from '../lib/reconcileLines'

// NOTE: reads of deal_products go through the `deal_products_v` view, which
// masks cost_price / margin_pct for anyone who is not admin or manager (see
// DealForm). SELECT on those two columns is revoked on the base table, so a
// `select('*')` here would fail — and would have shipped costs to a
// distributor's browser. Writes still target the base table, where RLS applies.

/** One incoming line, in the shape the table takes. */
const rowFrom = (dealId, l) => ({
  deal_id:       dealId,
  product_id:    l.product_id || null,
  product_name:  l.product_name,
  license_type:  l.license_type || 'flat',
  quantity:      parseInt(l.quantity) || 1,
  volume:        parseInt(l.volume) || null,
  package_size:  parseInt(l.package_size) || null,
  // Unknown stays unknown. The database refuses these two from anybody who
  // cannot read them back (deal_products_cost_guard), so what arrives here
  // from a partner is discarded either way — but a client that sends a zero
  // it does not mean is a client that will eventually send it somewhere
  // without a trigger behind it.
  cost_price:    numOrNull(l.cost_price),
  margin_pct:    numOrNull(l.margin_pct),
  unit_price:    parseFloat(l.unit_price) || 0,
  discount_pct:  parseFloat(l.discount_pct) || 0,
  net_price:     parseFloat(l.net_price) || 0,
  annual_fee:    parseFloat(l.annual_fee) || 0,
  notes:         l.notes || null,
})

/**
 * Save a deal's lines without throwing away what the saver cannot see.
 *
 * This used to delete every line and reinsert. For our own people that is
 * harmless — they write the cost back on the way in. For a partner it destroyed
 * it: cost is forced to null on INSERT for anybody who may not read it
 * (SEC-04), so a partner opening a deal WE quoted and pressing save wiped our
 * cost off every line. Not by writing over it, which the guard stops. By
 * deleting the row that held it.
 *
 * The same guard, on UPDATE, puts the old cost back. So updating in place keeps
 * it, whoever saves, with nobody needing permission to read it — and the only
 * thing that had to change was the delete. Matching is in
 * `src/lib/reconcileLines.js`, where it can be tested.
 *
 * Deletes go last: a failed update must not leave the deal short of lines.
 */
export async function saveDealProducts(dealId, lines) {
  const incoming = lines || []

  const { data: existing, error: readErr } = await supabase
    .from('deal_products_v').select('id, product_id').eq('deal_id', dealId)
  // Cannot see what is there? Then do not guess at it, and do not wipe it.
  if (readErr) return { error: readErr }

  const { updates, inserts, deleteIds } = reconcileLines(existing || [], incoming)

  for (const { id, row } of updates) {
    const { error } = await supabase.from('deal_products')
      .update(rowFrom(dealId, row)).eq('id', id)
    if (error) return { error }
  }

  if (inserts.length) {
    const { error } = await supabase.from('deal_products')
      .insert(inserts.map(l => rowFrom(dealId, l)))
    if (error) return { error }
  }

  if (deleteIds.length) {
    const { error } = await supabase.from('deal_products').delete().in('id', deleteIds)
    if (error) return { error }
  }

  return { error: null }
}
