import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { logger } from '../lib/logger'
import { regionForCountry } from '../constants'

export function useQuotations(filters = {}) {
  const { profile, isAdmin } = useAuth()
  const [quotations, setQuotations] = useState([])
  const [loading, setLoading]       = useState(true)

  const fetch = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    let q = supabase.from('quotations')
      .select('*, items:quotation_items(*), sla:sla_id(id, client, product, estimated_annual_studies, actual_production)')
      .order('created_at', { ascending: false })
    if (filters.bu)     q = q.eq('bu', filters.bu)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.search) {
      const s = String(filters.search).replace(/[%_\\]/g, m => `\\${m}`)
      q = q.or(`client.ilike.%${s}%,description.ilike.%${s}%`)
    }
    if (profile?.role === 'distributor' && profile?.company_id) {
      q = q.eq('company_id', profile.company_id)
    } else if (!isAdmin && profile?.bu) {
      q = q.eq('bu', profile.bu)
    }
    const { data, error } = await q
    if (error) logger.error('Failed to fetch quotations', { error: error.message })
    setQuotations(data || [])
    setLoading(false)
  }, [profile?.id, profile?.role, profile?.bu, profile?.company_id, isAdmin,
      filters.bu, filters.status, filters.search])

  useEffect(() => { fetch() }, [fetch])
  return { quotations, loading, refetch: fetch }
}

export async function createQuotation(payload) {
  const { items, ...header } = payload
  const { data, error } = await supabase.from('quotations').insert(header).select().single()
  if (error) { logger.error('Failed to create quotation', { error: error.message }); return { data: null, error } }
  if (items?.length && data?.id) {
    const rows = items.map(it => ({ ...it, quotation_id: data.id }))
    await supabase.from('quotation_items').insert(rows)
  }
  return { data, error: null }
}

export async function updateQuotation(id, updates) {
  const { data, error } = await supabase.from('quotations').update(updates).eq('id', id).select().single()
  if (error) logger.error('Failed to update quotation', { error: error.message, id })
  return { data, error }
}

export async function deleteQuotation(id) {
  const { error } = await supabase.from('quotations').delete().eq('id', id)
  if (error) logger.error('Failed to delete quotation', { error: error.message, id })
  return { error }
}

export async function convertQuotationToDeal(quotation) {
  const items = quotation.items || []
  const totalValue = items.reduce((s, it) => s + (Number(it.total_price) || 0), 0) || Number(quotation.total_value) || 0

  const deal = {
    bu:            quotation.bu || 'VGT',
    client:        quotation.client,
    description:   `Quotation #${quotation.quotation_number || quotation.id?.slice(0, 8)} — ${quotation.context_type || 'new_business'}`,
    stage:         'Pipeline',
    value_total:   totalValue,
    currency:      quotation.currency || 'EUR',
    business_model: quotation.context_type === 'license_compliance' ? 'subscription' : null,
    sales_owner:   quotation.created_by_name || null,
    country:       quotation.country || null,
    region:        quotation.region || (quotation.country ? regionForCountry(quotation.country) : null) || null,
    company_id:    quotation.company_id || null,
    sales_type:    'External',
    created_by:    quotation.created_by || null,
  }

  const { data: dealData, error } = await supabase.from('deals').insert(deal).select().single()
  if (error) { logger.error('convertQuotationToDeal failed', { error: error.message }); return { error } }

  if (items.length > 0 && dealData?.id) {
    const dealProducts = items.map(it => ({
      deal_id:      dealData.id,
      product_id:   it.product_id || null,
      product_name: it.product_name,
      license_type: 'flat',
      quantity:     Number(it.quantity) || 1,
      cost_price:   Number(it.unit_price) || 0,
      unit_price:   Number(it.unit_price) || 0,
      net_price:    Number(it.total_price) || 0,
    }))
    const { error: prodErr } = await supabase.from('deal_products').insert(dealProducts)
    if (prodErr) logger.error('convertQuotationToDeal: products insert failed', { error: prodErr.message, dealId: dealData.id })
  }

  await supabase.from('quotations').update({
    status: 'converted',
    deal_id: dealData.id,
  }).eq('id', quotation.id)

  return { data: dealData, error: null }
}
