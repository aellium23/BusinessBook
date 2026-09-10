import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

/**
 * The supplier price-list SKUs sitting under a catalogue product.
 *
 * The catalogue holds families — one "Synapse 3D" entry, not eighty — and this
 * is the drill-down: packages, à-la-carte modules, upgrades and services, each
 * with what we pay for it. Loaded per picked product rather than all at once,
 * because a quote touches two or three families out of thirteen.
 *
 * RLS lets admin, manager and member read this; a viewer or a distributor gets
 * no rows at all, which is the intended outcome — the table is a cost list.
 */
export function useProductItems(productIds) {
  const [itemsByProduct, setItems] = useState({})
  const [loading, setLoading]      = useState(false)
  const [error, setError]          = useState(null)

  // Keyed on the id set so a re-render with the same picks does not refetch.
  const key = (productIds || []).filter(Boolean).sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!ids.length) { setItems({}); setError(null); return }

    let alive = true
    setLoading(true)

    supabase.from('product_items')
      .select('id, product_id, family_code, supplier_sku, name, description, section, ' +
              'kind, unit, ccu, tier_from, tier_to, transfer_price, annual_support, is_default, ' +
              'max_discount_pct, variant_group, variant, ' +
              'support_sku, remark, sort_order')
      .in('product_id', ids)
      .eq('active', true)
      .order('sort_order')
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) {
          logger.error('Failed to load product items', { error: e.message, ids })
          setError(e.message)
        } else {
          const by = {}
          for (const row of data || []) (by[row.product_id] ||= []).push(row)
          setItems(by)
          setError(null)
        }
        setLoading(false)
      })

    return () => { alive = false }
  }, [key])

  return { itemsByProduct, loading, error }
}
