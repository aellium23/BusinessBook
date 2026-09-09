import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

// Every column of `products` except `transfer_price`.
//
// SELECT on that one column is revoked, so a wildcard fails for everyone — and
// Supabase runs every signed-in user as the same Postgres role, so "everyone"
// includes admins. That is why this list exists and why insert/update below
// name it too: PostgREST returns the changed row, and returning it with `*`
// would ask for the column we just took away.
export const PRODUCT_COLUMNS =
  'id, category, sku, name, description, license_fee, annual_fee, brand, ' +
  'pricing_model, bu, active, distributor_visible, sort_order, ' +
  'allowed_license_types, allowed_pricing_models, ' +
  'price_basis, price_unit, min_annual_commitment, site_cap_annual, ' +
  'list_currency, supplier_code, created_at, updated_at'

export function useProducts(filters = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('products').select(PRODUCT_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (filters.category) q = q.eq('category', filters.category)
    if (filters.bu)       q = q.eq('bu', filters.bu)
    if (filters.active !== undefined) q = q.eq('active', filters.active)
    if (filters.search) {
      const safe = String(filters.search).replace(/[%_\\]/g, m => `\\${m}`)
      q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`)
    }
    const { data, error: e } = await q

    // Surface the failure instead of swallowing it: an empty catalogue and a
    // failed request look identical to the user otherwise.
    if (e) {
      logger.error('Failed to load products', { error: e.message, filters })
      setError(e.message)
    } else {
      setProducts(data || [])
      setError(null)
    }
    setLoading(false)
  }, [filters.category, filters.bu, filters.active, filters.search])

  useEffect(() => { fetch() }, [fetch])

  return { products, loading, error, refetch: fetch }
}

export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products').insert(product).select(PRODUCT_COLUMNS).single()
  return { data, error }
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products').update(updates).eq('id', id).select(PRODUCT_COLUMNS).single()
  return { data, error }
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error }
}

/**
 * What we pay for each product, for the people allowed to know.
 *
 * Read through `products_cost`, a view that runs as its owner and gates itself
 * on the caller's profile role, because the column privilege it reads has been
 * taken away from the role the browser connects as. A member quoting a deal
 * gets an empty map here and sees no cost on the Products screen.
 */
export async function fetchProductCosts() {
  const { data, error } = await supabase
    .from('products_cost').select('id, transfer_price')
  if (error) {
    logger.error('Failed to load product costs', { error: error.message })
    return { costs: {}, error }
  }
  return {
    costs: Object.fromEntries((data || []).map(r => [r.id, Number(r.transfer_price)])),
    error: null,
  }
}

/**
 * Writing the cost is a separate call from saving the product, and stays that
 * way: UPDATE on the column is still granted, but the changed row must not be
 * returned, since reading it back is exactly what is forbidden.
 */
export async function updateProductCost(id, transferPrice) {
  const value = transferPrice === '' || transferPrice === null || transferPrice === undefined
    ? null
    : Number(transferPrice)
  const { error } = await supabase
    .from('products').update({ transfer_price: value }).eq('id', id)
  return { error }
}
