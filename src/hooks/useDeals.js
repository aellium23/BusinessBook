import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { MONTHS_K } from '../constants'

export function useDeals(filters = {}) {
  const { profile, isAdmin } = useAuth()
  const [deals, setDeals]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Stable key for filter changes — avoids `JSON.stringify` as a dep (lint + perf)
  const filterKey = useMemo(
    () => [filters.bu, filters.stage, filters.region, filters.search].join('|'),
    [filters.bu, filters.stage, filters.region, filters.search]
  )

  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('deals').select('*').order('created_at', { ascending: false })

    // Filtros por role
    if (!isAdmin) {
      if (profile?.role === 'distributor' && profile?.company_id) {
        q = q.eq('company_id', profile.company_id)
      } else if (profile?.bu === 'VGT') {
        q = q.eq('bu', 'VGT')
      } else if (profile?.bu === 'ECT') {
        q = q.eq('bu', 'ECT')
      }
    }
    if (filters.bu)     q = q.eq('bu', filters.bu)
    if (filters.stage)  q = q.eq('stage', filters.stage)
    if (filters.region) q = q.eq('region', filters.region)
    if (filters.search) {
      // Sanitise `%` and `_` before passing into ilike to avoid unintended wildcards
      const safe = String(filters.search).replace(/[%_\\]/g, m => `\\${m}`)
      q = q.or(
        `client.ilike.%${safe}%,description.ilike.%${safe}%,sales_owner.ilike.%${safe}%,country.ilike.%${safe}%`
      )
    }

    const { data, error } = await q
    if (!mounted.current) return
    if (error) setError(error.message)
    else { setDeals(data ?? []); setError(null) }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.company_id, profile?.bu, isAdmin, filterKey])

  useEffect(() => {
    // Aguardar profile carregar antes de fazer o fetch
    if (profile !== undefined && profile !== null) {
      fetch().catch(e => {
        if (mounted.current) { setError(e.message); setLoading(false) }
      })
    }
    // fetch identity changes with profile + filterKey, so this re-runs on both
  }, [fetch, profile])

  const totals = useMemo(() => deals.reduce((acc, d) => {
    const fy26 = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
    // Exclude intercompany mirrors from totals to avoid double counting
    if (d.is_intercompany_mirror) return acc
    acc.pipeline += d.stage === 'Pipeline' ? (d.value_total || 0) : 0
    acc.backlog   += d.stage === 'BackLog'  ? (d.value_total || 0) : 0
    acc.invoiced  += d.stage === 'Invoiced' ? fy26 : 0
    acc.forecast  += ['BackLog','Invoiced'].includes(d.stage) ? fy26 : 0
    return acc
  }, { pipeline: 0, backlog: 0, invoiced: 0, forecast: 0 }), [deals])

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
