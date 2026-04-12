import { useState, useEffect } from 'react'
import { useFxRates, updateFxRate } from '../hooks/useFxRates'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { TrendingUp, Save, RefreshCw, AlertCircle, CheckCircle2, Info, Users, Plus, Trash2, Edit3, Check, X } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸', regions: 'MEA, LATAM' },
  { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧', regions: 'UK' },
]


// ── Sales Owners management ──────────────────────────────────────────────────
function SalesOwnersSection() {
  const [owners, setOwners]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName]   = useState('')
  const [editBu, setEditBu]       = useState('VGT')
  const [adding, setAdding]       = useState(false)
  const [newName, setNewName]     = useState('')
  const [newBu, setNewBu]         = useState('VGT')
  const [saving, setSaving]       = useState(false)

  async function load() {
    const { data } = await supabase.from('sales_owners').select('*').order('bu').order('name')
    setOwners(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    await supabase.from('sales_owners').insert({ name: newName.trim(), bu: newBu, active: true })
    setNewName(''); setAdding(false); setSaving(false)
    load()
  }

  async function handleEdit(id) {
    if (!editName.trim()) return
    setSaving(true)
    await supabase.from('sales_owners').update({ name: editName.trim(), bu: editBu }).eq('id', id)
    setEditingId(null); setSaving(false)
    load()
  }

  async function handleToggle(owner) {
    await supabase.from('sales_owners').update({ active: !owner.active }).eq('id', owner.id)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Remove this sales owner? This will unlink any users associated.')) return
    await supabase.from('sales_owners').delete().eq('id', id)
    load()
  }

  function startEdit(owner) {
    setEditingId(owner.id)
    setEditName(owner.name)
    setEditBu(owner.bu)
  }

  const vgtOwners = owners.filter(o => o.bu === 'VGT' || o.bu === 'ALL')
  const ectOwners = owners.filter(o => o.bu === 'ECT' || o.bu === 'ALL')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Users size={18} className="text-navy" />
            Sales Owners
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Master list of commercial team members. Link to user accounts in the Users page.
          </p>
        </div>
        <button onClick={() => setAdding(o => !o)}
          className="btn-primary text-xs gap-1">
          <Plus size={13}/> Add
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">New Sales Owner</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              className="input sm:col-span-2"
              placeholder="Full name (e.g. Paulo Cunha)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            <select className="select" value={newBu} onChange={e => setNewBu(e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
              <option value="ALL">ALL</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs flex-1">Cancel</button>
            <button onClick={handleAdd} disabled={!newName.trim() || saving}
              className="btn-primary text-xs flex-1">
              {saving ? 'Saving…' : 'Add Sales Owner'}
            </button>
          </div>
        </div>
      )}

      {/* Two columns: VGT + ECT */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{ label: 'VGT · Portugal', list: vgtOwners, color: '#1D9E75' },
            { label: 'ECT · Spain',    list: ectOwners, color: '#D85A30' }].map(({ label, list, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }}/>
                <p className="text-xs font-bold text-gray-700">{label}</p>
                <span className="ml-auto text-xs text-gray-400">{list.filter(o => o.active).length} active</span>
              </div>
              <div className="divide-y divide-gray-50">
                {list.length === 0 && (
                  <p className="px-4 py-3 text-xs text-gray-400 italic">No owners yet</p>
                )}
                {list.map(owner => (
                  <div key={owner.id} className={`px-4 py-2.5 flex items-center gap-3 ${!owner.active ? 'opacity-40' : ''}`}>
                    {editingId === owner.id ? (
                      // Inline edit
                      <div className="flex-1 flex items-center gap-2">
                        <input className="input text-sm flex-1 py-1"
                          value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleEdit(owner.id); if (e.key === 'Escape') setEditingId(null) }}
                          autoFocus/>
                        <select className="select text-xs w-20 py-1" value={editBu} onChange={e => setEditBu(e.target.value)}>
                          <option value="VGT">VGT</option>
                          <option value="ECT">ECT</option>
                          <option value="ALL">ALL</option>
                        </select>
                        <button onClick={() => handleEdit(owner.id)} className="text-green-600 hover:text-green-700"><Check size={14}/></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{owner.name}</p>
                          {owner.bu === 'ALL' && <span className="text-[10px] text-gray-400">Both teams</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Active toggle */}
                          <button onClick={() => handleToggle(owner)}
                            title={owner.active ? 'Deactivate' : 'Activate'}
                            className={`w-8 h-4 rounded-full transition-colors relative ${owner.active ? 'bg-green-400' : 'bg-gray-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${owner.active ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                          </button>
                          <button onClick={() => startEdit(owner)} className="text-gray-400 hover:text-navy p-1">
                            <Edit3 size={12}/>
                          </button>
                          <button onClick={() => handleDelete(owner.id)} className="text-gray-300 hover:text-red-500 p-1">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        After adding owners here, go to <strong>Users</strong> to link each account to their sales owner.
      </p>
    </div>
  )
}

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
          <p className="font-semibold">{t("settings_rate_note")}</p>
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

      {/* ── SALES OWNERS ────────────────────────────────────────────── */}
      {isAdmin && <SalesOwnersSection />}

    </div>
  )
}
