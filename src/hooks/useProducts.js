import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

export function useProducts(filters = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    // Columns are listed explicitly, never select('*'): `transfer_price` is
    // what we pay the manufacturer, and SELECT on it is revoked for everyone
    // below manager — a wildcard here would fail for them, and would have
    // shipped our cost to a distributor's browser.
    let q = supabase.from('products').select(
      'id, category, sku, name, description, license_fee, annual_fee, brand, ' +
      'pricing_model, bu, active, distributor_visible, sort_order, ' +
      'allowed_license_types, allowed_pricing_models, ' +
      'price_basis, price_unit, min_annual_commitment, site_cap_annual, ' +
      'list_currency, supplier_code, created_at, updated_at'
    )
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
    .from('products').insert(product).select().single()
  return { data, error }
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products').update(updates).eq('id', id).select().single()
  return { data, error }
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error }
}
