import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const MONTHS = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

export function useDeals(filters = {}) {
  const { profile, isAdmin } = useAuth()
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('deals').select('*').order('created_at', { ascending: false })

    // Row-level: non-admin users only see their BU
    if (!isAdmin && profile?.role === 'vgt') q = q.eq('bu', 'VGT')
    if (!isAdmin && profile?.role === 'ect') q = q.eq('bu', 'ECT')

    if (filters.bu)    q = q.eq('bu', filters.bu)
    if (filters.stage) q = q.eq('stage', filters.stage)
    if (filters.region)q = q.eq('region', filters.region)
    if (filters.search)q = q.ilike('client', `%${filters.search}%`)

    const { data, error } = await q
    if (error) setError(error.message)
    else setDeals(data ?? [])
    setLoading(false)
  }, [profile, isAdmin, JSON.stringify(filters)])

  useEffect(() => { if (profile !== undefined) fetch() }, [fetch])

  // Computed totals
  const totals = deals.reduce((acc, d) => {
    const fy26 = MONTHS.reduce((s, m) => s + (d[m] || 0), 0)
    acc.pipeline  += d.stage === 'Pipeline' ? (d.value_total || 0) : 0
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
  return supabase.from('deals').delete().eq('id', id)
}
