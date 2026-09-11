import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const SettingsContext = createContext({})

const DEFAULTS = {
  company_name: 'Business Book',
  company_subtitle: 'Powered by AI',
  primary_color: '#0D2137',
  logo_url: null,
  fy_start_month: 4,
  business_units: [
    { id: 'VGT', label: 'VGT · Portugal', color: '#1D9E75' },
    { id: 'ECT', label: 'ECT · Spain', color: '#D85A30' },
  ],
  budget_cycles: ['BUD', 'EST1', 'EST2'],
  default_currency: 'EUR',
  // Our internal cost of one person for one day. Null rather than a guessed
  // figure: a quote that costs effort at an invented rate reports a margin
  // nobody can defend.
  man_day_cost: null,
  available_currencies: ['EUR', 'USD', 'GBP'],
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [settingsId, setSettingsId] = useState(null)

  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1).single()
      // No banner: this has no screen of its own. What protects the money here
      // is DEFAULTS — `man_day_cost` is null rather than a plausible day rate,
      // so a quote built while these are missing says it has no rate instead of
      // inventing one. The failure is still logged rather than vanishing.
      .then(({ data, error }) => {
        if (error) { logger.error('Settings not loaded', { error: error.message }); return }
        if (data) {
          setSettings({ ...DEFAULTS, ...(data.config || {}) })
          setSettingsId(data.id)
        }
      })
      .catch(e => logger.error('Settings not loaded', { error: e?.message || String(e) }))
  }, [])

  async function updateSettings(updates) {
    const newConfig = { ...settings, ...updates }
    setSettings(newConfig)
    if (settingsId) {
      await supabase.from('app_settings')
        .update({ config: newConfig, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    } else {
      const { data } = await supabase.from('app_settings')
        .insert({ config: newConfig })
        .select('id').single()
      if (data) setSettingsId(data.id)
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
