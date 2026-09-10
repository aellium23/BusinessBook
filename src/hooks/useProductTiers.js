import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

/**
 * The volume ladder behind one product, and the ability to change it.
 *
 * Until now a price list only moved by someone writing SQL, which meant every
 * correction went through a round trip and the person who knew the right number
 * was never the person who could enter it. An admin edits the ladder here.
 *
 * Rows are ordered by `sort_order` and that order is the ladder: band one is
 * the cheapest volume, and the resolver walks them looking for the band a
 * quantity falls in. Reordering therefore changes pricing, which is why moving
 * a row rewrites the whole sequence rather than swapping two values.
 */
export function useProductTiers(productId) {
  const [tiers, setTiers]   = useState([])
  const [loading, setLoad]  = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    if (!productId) { setTiers([]); return }
    setLoad(true)
    const { data, error: e } = await supabase.from('product_price_tiers')
      .select('id, product_id, tier_label, tier_from, tier_to, global_list_price, sort_order')
      .eq('product_id', productId)
      .order('sort_order')
    if (e) { logger.error('Failed to load price tiers', { error: e.message, productId }); setError(e.message) }
    else { setTiers(data || []); setError(null) }
    setLoad(false)
  }, [productId])

  useEffect(() => { load() }, [load])

  return { tiers, loading, error, refetch: load }
}

/**
 * Replace a product's whole ladder in one go.
 *
 * Deliberately not a per-row save. A ladder is only meaningful as a set — a
 * band whose floor no longer meets the ceiling below it leaves a volume that
 * prices at nothing — so it is written as a set and `sort_order` is renumbered
 * from the array, making the order on screen the order that is stored.
 */
export async function saveProductTiers(productId, rows) {
  if (!productId) return { error: new Error('No product') }

  const clean = (rows || [])
    .filter(r => r.tier_label?.trim() || r.global_list_price !== '')
    .map((r, i) => ({
      product_id: productId,
      tier_label: (r.tier_label || '').trim() || `Band ${i + 1}`,
      tier_from: numOrNull(r.tier_from),
      tier_to: numOrNull(r.tier_to),
      global_list_price: numOrNull(r.global_list_price) ?? 0,
      sort_order: i + 1,
    }))

  // Replace rather than merge: a row the admin deleted has to disappear, and
  // matching survivors by id would leave it behind.
  const { error: delErr } = await supabase
    .from('product_price_tiers').delete().eq('product_id', productId)
  if (delErr) {
    logger.error('Failed to clear price tiers', { error: delErr.message, productId })
    return { error: delErr }
  }
  if (!clean.length) return { error: null }

  const { error } = await supabase.from('product_price_tiers').insert(clean)
  if (error) logger.error('Failed to save price tiers', { error: error.message, productId })
  return { error }
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
