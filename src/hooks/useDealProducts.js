import { supabase } from '../lib/supabase'

// NOTE: reads of deal_products go through the `deal_products_v` view, which
// masks cost_price / margin_pct for anyone who is not admin or manager (see
// DealForm). SELECT on those two columns is revoked on the base table, so a
// `select('*')` here would fail — and would have shipped costs to a
// distributor's browser. Writes still target the base table, where RLS applies.

export async function saveDealProducts(dealId, lines) {
  await supabase.from('deal_products').delete().eq('deal_id', dealId)
  if (!lines.length) return { error: null }
  const rows = lines.map(l => ({
    deal_id:       dealId,
    product_id:    l.product_id || null,
    product_name:  l.product_name,
    license_type:  l.license_type || 'flat',
    quantity:      parseInt(l.quantity) || 1,
    volume:        parseInt(l.volume) || null,
    package_size:  parseInt(l.package_size) || null,
    cost_price:    parseFloat(l.cost_price) || 0,
    margin_pct:    parseFloat(l.margin_pct) || 0,
    unit_price:    parseFloat(l.unit_price) || 0,
    discount_pct:  parseFloat(l.discount_pct) || 0,
    net_price:     parseFloat(l.net_price) || 0,
    annual_fee:    parseFloat(l.annual_fee) || 0,
    notes:         l.notes || null,
  }))
  const { error } = await supabase.from('deal_products').insert(rows)
  return { error }
}
