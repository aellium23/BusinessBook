import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
  available_currencies: ['EUR', 'USD', 'GBP'],
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [settingsId, setSettingsId] = useState(null)

  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1).single()
      .then(({ data }) => {
        if (data) {
          setSettings({ ...DEFAULTS, ...(data.config || {}) })
          setSettingsId(data.id)
        }
      })
      .catch(() => {})
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
