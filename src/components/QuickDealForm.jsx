import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { X } from 'lucide-react'

/**
 * Minimal inline form to create a deal on the fly (used from Tenders and
 * Tasks "Link to deal" flows when the user can't find the deal they need).
 *
 * Props:
 *   initialClient : string — pre-fill the Client field
 *   onCancel      : () => void
 *   onCreated     : (newDealRow) => void
 */
export default function QuickDealForm({ initialClient = '', onCancel, onCreated }) {
  const { profile, isAdmin } = useAuth()
  const [form, setForm] = useState({
    client:  initialClient,
    bu:      profile?.bu || 'VGT',
    country: '',
    stage:   'Lead',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  async function save() {
    if (!form.client.trim()) { setError('Client is required'); return }
    setSaving(true); setError(null)
    const { data, error: e } = await supabase
      .from('deals')
      .insert({
        client: form.client.trim(),
        bu: form.bu,
        country: form.country || null,
        stage: form.stage,
        company_id: profile?.company_id || null,
      })
      .select('id, client, bu, country, company_id')
      .single()
    setSaving(false)
    if (e) { setError(e.message); return }
    onCreated?.(data)
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Create new deal</p>
        <button type="button" onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 min-h-tap min-w-tap p-1">
          <X size={14}/>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input text-sm" placeholder="Client *"
          value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
        <input className="input text-sm" placeholder="Country"
          value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
        {isAdmin && (
          <select className="select text-sm" value={form.bu}
            onChange={e => setForm(f => ({ ...f, bu: e.target.value }))}>
            <option value="VGT">VGT</option>
            <option value="ECT">ECT</option>
          </select>
        )}
        <select className="select text-sm" value={form.stage}
          onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
          <option value="Lead">Lead</option>
          <option value="Pipeline">Pipeline</option>
          <option value="Offer Presented">Offer Presented</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving}
          className="btn-primary text-xs py-1.5 px-3">
          {saving ? 'Saving…' : 'Create deal'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
