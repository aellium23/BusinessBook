import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProducts(filters = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('products').select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (filters.category) q = q.eq('category', filters.category)
    if (filters.bu)       q = q.eq('bu', filters.bu)
    if (filters.active !== undefined) q = q.eq('active', filters.active)
    if (filters.search) {
      const safe = String(filters.search).replace(/[%_\\]/g, m => `\\${m}`)
      q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`)
    }
    const { data, error } = await q

    setProducts(data || [])
    setLoading(false)
  }, [filters.category, filters.bu, filters.active, filters.search])

  useEffect(() => { fetch() }, [fetch])

  return { products, loading, refetch: fetch }
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
