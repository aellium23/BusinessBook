import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const MONTHS = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

export function useDeals(filters = {}) {
  const { profile, isAdmin } = useAuth()
  const [deals, setDeals]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('deals').select('*').order('created_at', { ascending: false })

    if (!isAdmin && profile?.role === 'vgt') q = q.eq('bu', 'VGT')
    if (!isAdmin && profile?.role === 'ect') q = q.eq('bu', 'ECT')
    if (filters.bu)     q = q.eq('bu', filters.bu)
    if (filters.stage)  q = q.eq('stage', filters.stage)
    if (filters.region) q = q.eq('region', filters.region)
    if (filters.search) q = q.ilike('client', `%${filters.search}%`)

    const { data, error } = await q
    if (error) setError(error.message)
    else setDeals(data ?? [])
    setLoading(false)
  }, [profile, isAdmin, JSON.stringify(filters)])

  useEffect(() => { if (profile !== undefined) fetch() }, [fetch])

  const totals = deals.reduce((acc, d) => {
    const fy26 = MONTHS.reduce((s, m) => s + (d[m] || 0), 0)
    // Exclude intercompany mirrors from totals to avoid double counting
    if (d.is_intercompany_mirror) return acc
    acc.pipeline += d.stage === 'Pipeline' ? (d.value_total || 0) : 0
    acc.backlog   += d.stage === 'BackLog'  ? (d.value_total || 0) : 0
    acc.invoiced  += d.stage === 'Invoiced' ? fy26 : 0
    acc.forecast  += ['BackLog','Invoiced'].includes(d.stage) ? fy26 : 0
    return acc
  }, { pipeline: 0, backlog: 0, invoiced: 0, forecast: 0 })

  return { deals, loading, error, refetch: fetch, totals }
}

export async function upsertDeal(deal) {
  const { data, error } = await supabase
    .from('deals')
    .upsert(deal, { onConflict: 'id' })
    .select()
    .single()
  return { data, error }
}

export async function deleteDeal(id) {
  // Also delete linked mirror deal if exists
  const { data } = await supabase
    .from('deals').select('linked_deal_id').eq('id', id).single()
  if (data?.linked_deal_id) {
    await supabase.from('deals').delete().eq('id', data.linked_deal_id)
  }
  return supabase.from('deals').delete().eq('id', id)
}

// Creates ECT deal + VGT mirror intercompany deal atomically
export async function upsertDealWithIntercompany(deal, intercompanyValue, existingMirrorId) {
  const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

  // Calculate VGT mirror monthly values proportionally from ECT monthly
  const ectoTotal = MONTHS_K.reduce((s, m) => s + (deal[m] || 0), 0)
  const ratio = ectoTotal > 0 ? intercompanyValue / ectoTotal : 0
  const mirrorMonthly = Object.fromEntries(
    MONTHS_K.map(m => [m, Math.round((deal[m] || 0) * ratio * 100) / 100])
  )

  // 1. Save/update VGT mirror deal
  const mirrorDeal = {
    ...(existingMirrorId ? { id: existingMirrorId } : {}),
    bu: 'VGT',
    sales_type: 'Internal',
    stage: deal.stage,
    client: deal.client,
    region: deal.region,
    country: deal.country,
    sales_owner: deal.sales_owner,
    deal_type: deal.deal_type,
    description: `[Intercompany] ${deal.description || deal.client}`,
    value_total: intercompanyValue,
    gm_pct: 0,
    rec_month: deal.rec_month,
    rec_year: deal.rec_year,
    cs_month: deal.cs_month,
    cs_year: deal.cs_year,
    ce_month: deal.ce_month,
    ce_year: deal.ce_year,
    is_intercompany_mirror: true,
    ...mirrorMonthly,
  }

  const { data: mirror, error: mirrorErr } = await supabase
    .from('deals')
    .upsert(mirrorDeal, { onConflict: 'id' })
    .select().single()

  if (mirrorErr) return { error: mirrorErr }

  // 2. Save ECT deal with link to VGT mirror
  const ectDeal = {
    ...deal,
    intercompany_value: intercompanyValue,
    linked_deal_id: mirror.id,
    is_intercompany_mirror: false,
  }

  const { data, error } = await supabase
    .from('deals')
    .upsert(ectDeal, { onConflict: 'id' })
    .select().single()

  // 3. Update mirror to link back to ECT deal
  if (data) {
    await supabase.from('deals')
      .update({ linked_deal_id: data.id })
      .eq('id', mirror.id)
  }

  return { data, error }
}
