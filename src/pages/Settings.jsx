import { useState, useEffect } from 'react'
import { useFxRates, updateFxRate } from '../hooks/useFxRates'
import { useAuth } from '../hooks/useAuth'
import { TrendingUp, Save, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸', regions: 'MEA, LATAM' },
  { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧', regions: 'UK' },
]

export default function Settings() {
  const { isAdmin } = useAuth()
  const { t } = useTranslation()
  const { rates, loading, refetch } = useFxRates()

  const [localRates, setLocalRates] = useState({})
  const [saving, setSaving]         = useState({})
  const [saved, setSaved]           = useState({})
  const [errors, setErrors]         = useState({})

  // Sync local state when rates load
  useEffect(() => {
    if (!loading && Object.keys(rates).length > 0) {
      setLocalRates(prev => {
        const next = { ...prev }
        CURRENCIES.forEach(c => {
          if (!(c.code in prev)) next[c.code] = rates[c.code] ?? ''
        })
        return next
      })
    }
  }, [rates, loading])

  async function handleSave(currency) {
    const val = parseFloat(localRates[currency])
    if (isNaN(val) || val <= 0) {
      setErrors(e => ({ ...e, [currency]: 'Invalid rate' }))
      return
    }
    setErrors(e => ({ ...e, [currency]: null }))
    setSaving(s => ({ ...s, [currency]: true }))
    const { error } = await updateFxRate(currency, val)
    setSaving(s => ({ ...s, [currency]: false }))
    if (error) {
      setErrors(e => ({ ...e, [currency]: error.message }))
    } else {
      setSaved(s => ({ ...s, [currency]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [currency]: false })), 2500)
      refetch()
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          FX Rates
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Global exchange rates used when creating new deals.
        </p>
      </div>

      {/* Important notice */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 space-y-1">
          <p className="font-semibold">{t('settings_rate_note')}</p>
          <p className="text-amber-700">
            Each deal locks in the exchange rate at the time of creation.
            Updating rates here will not change existing deal cards — only new deals
            will use the updated rate.
          </p>
        </div>
      </div>

      {/* Rate cards */}
      <div className="space-y-3">
        {CURRENCIES.map(({ code, label, symbol, flag, regions }) => {
          const current  = rates[code]
          const local    = localRates[code] ?? ''
          const changed  = parseFloat(local) !== current
          const isSaving = saving[code]
          const isSaved  = saved[code]
          const err      = errors[code]

          return (
            <div key={code} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">

                {/* Currency info */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{flag}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{symbol} {code}</p>
                    <p className="text-xs text-gray-500">{label} · used in {regions}</p>
                  </div>
                </div>

                {/* Rate input */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 mb-1">1 {code} =</p>
                    <div className="flex items-center gap-1.5">
                      {isAdmin ? (
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          className="input w-24 text-center text-sm font-mono"
                          value={local}
                          onChange={e => {
                            setLocalRates(r => ({ ...r, [code]: e.target.value }))
                            setErrors(er => ({ ...er, [code]: null }))
                          }}
                          onKeyDown={e => e.key === 'Enter' && handleSave(code)}
                        />
                      ) : (
                        <span className="text-sm font-mono font-semibold w-24 text-center">
                          {current?.toFixed(4) ?? '—'}
                        </span>
                      )}
                      <span className="text-sm text-gray-500 font-medium">EUR</span>
                    </div>
                    {err && (
                      <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} /> {err}
                      </p>
                    )}
                  </div>

                  {/* Save button (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={() => handleSave(code)}
                      disabled={isSaving || !changed}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                        isSaved
                          ? 'bg-green-100 text-green-600'
                          : changed
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      title={isSaved ? 'Saved!' : 'Save rate'}
                    >
                      {isSaving ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : isSaved ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* EUR equivalent preview */}
              {local && !isNaN(parseFloat(local)) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
                  <span>100 {code} = <strong className="text-gray-700">€{(100 * parseFloat(local)).toFixed(2)}</strong></span>
                  <span>1,000 {code} = <strong className="text-gray-700">€{(1000 * parseFloat(local)).toFixed(2)}</strong></span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isAdmin && (
        <p className="text-xs text-gray-400 text-center">
          Contact your admin to update FX rates.
        </p>
      )}

    </div>
  )
}
