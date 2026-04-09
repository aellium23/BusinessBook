import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── useFxRates ────────────────────────────────────────────────────────────────
// Loads global FX rates from the fx_rates table.
// Returns { rates, loading, refetch }
// rates = { USD: 0.92, GBP: 1.17 }  (rate_to_eur values)
//
// KEY RULE: These rates are applied to NEW deals at creation time.
// Each deal stores its own exchange_rate snapshot — changing the global
// rate never retroactively affects existing deals.
// ─────────────────────────────────────────────────────────────────────────────

export function useFxRates() {
  const [rates, setRates]     = useState({})
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('fx_rates').select('currency, rate_to_eur')
    if (data) {
      const map = {}
      data.forEach(r => { map[r.currency] = parseFloat(r.rate_to_eur) })
      setRates(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // getRateForCurrency: returns the EUR rate for a given currency
  // (1 for EUR, 0 fallback if not found to make the issue visible)
  function getRate(currency) {
    if (!currency || currency === 'EUR') return 1
    return rates[currency] ?? null
  }

  return { rates, loading, refetch: fetch, getRate }
}

// ── updateFxRate ──────────────────────────────────────────────────────────────
// Updates a single rate in the database (admin only).
// Returns { error }
// ─────────────────────────────────────────────────────────────────────────────
export async function updateFxRate(currency, rateToEur) {
  const { error } = await supabase
    .from('fx_rates')
    .upsert(
      { currency, rate_to_eur: rateToEur, updated_at: new Date().toISOString() },
      { onConflict: 'currency' }
    )
  return { error }
}
