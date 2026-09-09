import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

/**
 * Loads the CWM FY26 price list: the four pricing regions, the country map,
 * and every product's tiers. The whole set is small (four regions, ~60
 * countries, ~35 tiers) so it is fetched once and priced against in the
 * browser — see src/lib/pricing.js for the resolver, which mirrors the
 * cwm_price() SQL function.
 *
 * `error` is exposed rather than swallowed: a failed load must not look like
 * "this product has no price list", which is indistinguishable from a product
 * that is genuinely still on the legacy model.
 */
export function usePricing() {
  const [regions, setRegions]       = useState({})   // 'R2' -> { discountPct, name }
  const [countryMap, setCountryMap] = useState({})   // 'Portugal' -> 'R2'
  const [tiersByProduct, setTiers]  = useState({})   // productId -> tier[]
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => {
    let alive = true

    Promise.all([
      supabase.from('pricing_regions').select('code, name, discount_pct'),
      supabase.from('pricing_region_countries').select('country, region_code'),
      supabase.from('product_price_tiers')
        .select('product_id, tier_label, tier_from, tier_to, global_list_price, sort_order')
        .order('sort_order'),
    ])
      .then(([r, c, t]) => {
        if (!alive) return
        const failure = r.error || c.error || t.error
        if (failure) {
          logger.error('Failed to load CWM price list', { error: failure.message })
          setError(failure.message)
          setLoading(false)
          return
        }

        setRegions(Object.fromEntries(
          (r.data || []).map(x => [x.code, { discountPct: Number(x.discount_pct), name: x.name }])
        ))
        setCountryMap(Object.fromEntries(
          (c.data || []).map(x => [x.country, x.region_code])
        ))
        const byProduct = {}
        for (const row of t.data || []) {
          ;(byProduct[row.product_id] ||= []).push(row)
        }
        setTiers(byProduct)
        setError(null)
        setLoading(false)
      })
      .catch(e => {
        if (!alive) return
        logger.error('CWM price list fetch threw', { error: e.message })
        setError(e.message)
        setLoading(false)
      })

    return () => { alive = false }
  }, [])

  return { regions, countryMap, tiersByProduct, loading, error }
}
