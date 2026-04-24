import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDealProducts(dealId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!dealId) { setItems([]); setLoading(false); return }
    const { data } = await supabase
      .from('deal_products')
      .select('*, product:product_id(id, name, sku, category, license_fee, annual_fee, pricing_model)')
      .eq('deal_id', dealId)
      .order('created_at')
    setItems(data || [])
    setLoading(false)
  }, [dealId])

  useEffect(() => { fetch() }, [fetch])

  return { items, loading, refetch: fetch }
}

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
