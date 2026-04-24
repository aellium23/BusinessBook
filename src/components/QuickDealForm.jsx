import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { REGIONS } from '../constants'
import { X } from 'lucide-react'
import SearchableSelect from './SearchableSelect'

const COUNTRY_MAP = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA:    ['UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Egypt','Morocco','Algeria','Tunisia','South Africa','Israel','Jordan','Iraq','Nigeria','Kenya','Ghana','Other MEA'],
  LATAM:  ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Costa Rica','Panama','El Salvador','Guatemala','Ecuador','Bolivia','Venezuela','Dominican Republic','Other LATAM'],
  APAC:   ['Japan','China','South Korea','Australia','India','Singapore','Malaysia','Thailand','Indonesia','Vietnam','New Zealand','Other APAC'],
  NA:     ['USA','Canada','Other NA'],
}

export default function QuickDealForm({ initialClient = '', onCancel, onCreated }) {
  const { profile, isAdmin } = useAuth()
  const defaultBU = ['VGT','ECT'].includes(profile?.bu) ? profile.bu : 'VGT'
  const [form, setForm] = useState({
    client:  initialClient,
    bu:      defaultBU,
    region:  'Europe',
    country: '',
    stage:   'Lead',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [existingClients, setExistingClients] = useState([])

  useEffect(() => {
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setExistingClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    }).catch(() => {})
  }, [])

  async function save() {
    if (!form.client.trim()) { setError('Client is required'); return }
    setSaving(true); setError(null)
    const { data, error: e } = await supabase
      .from('deals')
      .insert({
        client: form.client.trim(),
        bu: form.bu,
        region: form.region || 'Europe',
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

  const countries = COUNTRY_MAP[form.region] || []

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Create new deal</p>
        <button type="button" onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 min-h-tap min-w-tap p-1">
          <X size={14}/>
        </button>
      </div>
      <SearchableSelect
        value={form.client}
        onChange={v => setForm(f => ({ ...f, client: v }))}
        options={existingClients.map(c => ({ value: c, label: c }))}
        placeholder="Search clients…"
        emptyLabel="— Select client *"
        onCreateNew={(q) => { if (q) setForm(f => ({ ...f, client: q })) }}
        createLabel="New client"
        size="sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <select className="select text-sm" value={form.bu}
          onChange={e => setForm(f => ({ ...f, bu: e.target.value }))}>
          <option value="VGT">VGT</option>
          <option value="ECT">ECT</option>
        </select>
        <select className="select text-sm" value={form.region}
          onChange={e => setForm(f => ({ ...f, region: e.target.value, country: '' }))}>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select text-sm" value={form.country}
          onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
          <option value="">Country…</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
