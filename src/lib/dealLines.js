import { supabase } from './supabase'

/**
 * A deal's product lines, with what they cost us where the reader may see it.
 *
 * Cost is coming out of the shared view. `deal_products` is readable by any
 * authenticated account, columns and all, so `deal_products_v`'s masking of
 * cost_price and margin_pct is a convenience rather than a control — a partner
 * with a browser console reads our cost on every line of their own deals.
 *
 * Closing that means revoking the columns, and the revoke would break
 * `deal_products_v` for admins too, because that view is `security_invoker` and
 * reads the base table as whoever called it. So cost moves to a view of its
 * own, guarded by a profile check rather than by RLS, and this function joins
 * the two back together.
 *
 * It tolerates the cost view not existing. That is on purpose: it makes the
 * order of the migration and the deploy irrelevant, and a deploy that has to
 * land in the same minute as a migration is a deploy that will one day not.
 * Where the cost view is missing, the columns still on `deal_products_v` are
 * used — which is exactly the old behaviour, and exactly what phase 2 removes.
 */
export async function dealLines(dealId, columns = '*') {
  const { data, error } = await supabase
    .from('deal_products_v').select(columns)
    .eq('deal_id', dealId).order('created_at')
  if (error || !data) return { data: null, error }

  const { data: costs, error: costErr } = await supabase
    .from('deal_products_cost').select('id, cost_price, margin_pct')
    .eq('deal_id', dealId)

  // No cost view yet, or nothing visible through it — either because the
  // reader is not entitled to cost, or because the migration has not run.
  // Neither is an error, and neither should lose the lines.
  if (costErr || !costs?.length) return { data, error: null }

  const byId = Object.fromEntries(costs.map(c => [c.id, c]))
  return {
    data: data.map(l => {
      const c = byId[l.id]
      // The cost view wins where it has something to say; nothing is written
      // over with a null, so a line the reader cannot price keeps whatever the
      // shared view gave it rather than losing it.
      return c ? { ...l, cost_price: c.cost_price, margin_pct: c.margin_pct } : l
    }),
    error: null,
  }
}
