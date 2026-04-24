import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { projectSlaRevenue } from '../constants'

export function useSlas(filters = {}) {
  const { profile, isAdmin } = useAuth()
  const [slas, setSlas]       = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    let q = supabase.from('slas').select('*, deal:deal_id(id, client, bu, value_total, stage)')
      .order('updated_at', { ascending: false })
    if (filters.bu)     q = q.eq('bu', filters.bu)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.search) {
      const s = `%${filters.search}%`
      q = q.or(`client.ilike.${s},sla_owner.ilike.${s},description.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) console.warn('useSlas:', error.message)
    setSlas(data || [])
    setLoading(false)
  }, [profile?.id, profile?.role, profile?.bu, isAdmin,
      filters.bu, filters.status, filters.search])

  useEffect(() => { fetch() }, [fetch])

  return { slas, loading, refetch: fetch }
}

export async function createSla(sla) {
  const { data, error } = await supabase
    .from('slas').insert(sla).select().single()
  return { data, error }
}

export async function updateSla(id, updates) {
  const { data, error } = await supabase
    .from('slas').update(updates).eq('id', id).select().single()
  return { data, error }
}

export async function deleteSla(id) {
  const { error } = await supabase.from('slas').delete().eq('id', id)
  return { error }
}

export async function createSlaFromDeal(deal, overrides = {}) {
  const warrantyMonths = overrides.warranty_months || 36
  let warrantyEnd = null
  let slaStart = null
  if (deal.ce_month && deal.ce_year) {
    const MONTHS_MAP = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 }
    const ceDate = new Date(parseInt(deal.ce_year), MONTHS_MAP[deal.ce_month] || 0, parseInt(deal.ce_day) || 28)
    warrantyEnd = new Date(ceDate)
    warrantyEnd.setMonth(warrantyEnd.getMonth() + warrantyMonths)
    slaStart = new Date(warrantyEnd)
    slaStart.setDate(slaStart.getDate() + 1)
  }

  const annualValue = parseFloat(overrides.annual_value || deal.sla_annual_value) || 0
  const revenue = slaStart ? projectSlaRevenue(annualValue, slaStart, null) : {}

  const sla = {
    deal_id:           deal.id,
    bu:                deal.bu,
    client:            deal.client,
    description:       overrides.description || deal.description || null,
    sla_type:          overrides.sla_type || deal.sla_type || null,
    status:            'pipeline',
    sla_owner:         overrides.sla_owner || deal.sla_owner || null,
    deal_owner:        deal.sales_owner || null,
    annual_value:      annualValue,
    currency:          deal.currency || 'EUR',
    exchange_rate:     deal.exchange_rate || 1,
    warranty_months:   warrantyMonths,
    warranty_end_date: warrantyEnd?.toISOString().split('T')[0] || null,
    start_date:        slaStart?.toISOString().split('T')[0] || null,
    revenue_by_fy:     revenue,
    account_id:        deal.account_id || null,
    country:           deal.country || null,
    region:            deal.region || null,
    product:           deal.product || null,
  }
  return createSla(sla)
}
