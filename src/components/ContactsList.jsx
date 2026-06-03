import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SearchableSelect from './SearchableSelect'
import { CONTACT_ROLES, contactRole, REGIONS } from '../constants'

const ALL_COUNTRIES = ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','UAE','Saudi Arabia','Qatar','Kuwait','Egypt','Morocco','South Africa','Israel','Mexico','Brazil','Argentina','Chile','Colombia','Peru','Japan','China','South Korea','Australia','India','Singapore','USA','Canada']
import {
  Plus, Trash2, Edit3, Mail, Phone, Star, X,
  User, AlertCircle, Save,
} from 'lucide-react'

/**
 * ContactsList
 *
 * Props:
 *   bu:           'VGT' | 'ECT' — required to scope contacts
 *   clientName:   string        — required to filter contacts for this client
 *   canEdit:      boolean
 *   compact:      boolean       — render tighter (e.g. inside DealForm)
 */
export default function ContactsList({ bu, clientName, canEdit = true, compact = false }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [editing, setEditing] = useState(null)   // null | 'new' | contact object

  async function refresh() {
    if (!bu || !clientName) { setItems([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('bu', bu)
      .ilike('client_name', clientName)
      .order('is_primary', { ascending: false })
      .order('full_name')
    if (error) setError(error.message)
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [bu, clientName])

  async function handleDelete(c) {
    if (!confirm(`Delete "${c.full_name}"?`)) return
    const { error } = await supabase.from('contacts').delete().eq('id', c.id)
    if (error) { setError(error.message); return }
    refresh()
  }

  if (!bu || !clientName) {
    return (
      <p className="text-tiny text-gray-400 italic">
        Set the client first to manage its contacts.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <User size={12}/> Stakeholders
            <span className="text-micro text-gray-400 font-normal">
              ({items.length})
            </span>
          </p>
          {canEdit && (
            <button type="button" onClick={() => setEditing('new')}
              className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
              <Plus size={11}/> Add contact
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12}/> {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-4 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
          <User size={20} className="mx-auto mb-1 opacity-40"/>
          <p className="text-xs">No contacts yet for <strong>{clientName}</strong>.</p>
          {canEdit && compact && (
            <button type="button" onClick={() => setEditing('new')}
              className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 mx-auto mt-2">
              <Plus size={11}/> Add contact
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map(c => {
            const role = contactRole(c.role_type)
            return (
              <li key={c.id}
                className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-start gap-2">
                <div className="shrink-0 text-base" aria-hidden>{role.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-gray-900 truncate">{c.full_name}</p>
                    {c.is_primary && <Star size={10} className="text-amber-500 fill-amber-400"/>}
                    <span className={`text-micro font-bold px-1.5 py-0.5 rounded border ${role.color}`}>
                      {role.label}
                    </span>
                  </div>
                  {c.job_title && (
                    <p className="text-tiny text-gray-500 truncate">{c.job_title}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {c.email && (
                      <a href={`mailto:${c.email}`}
                        className="text-micro text-blue-600 hover:underline flex items-center gap-1"
                        onClick={e => e.stopPropagation()}>
                        <Mail size={9}/> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`}
                        className="text-micro text-blue-600 hover:underline flex items-center gap-1"
                        onClick={e => e.stopPropagation()}>
                        <Phone size={9}/> {c.phone}
                      </a>
                    )}
                  </div>
                  {c.notes && (
                    <p className="text-tiny text-gray-600 mt-1 whitespace-pre-wrap">{c.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" onClick={() => setEditing(c)}
                      className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                      aria-label="Edit contact">
                      <Edit3 size={12}/>
                    </button>
                    <button type="button" onClick={() => handleDelete(c)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                      aria-label="Delete contact">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {compact && canEdit && !editing && items.length > 0 && (
        <button type="button" onClick={() => setEditing('new')}
          className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 mt-1">
          <Plus size={11}/> Add contact
        </button>
      )}

      {editing && (
        <ContactEditor
          contact={editing === 'new' ? null : editing}
          bu={bu}
          clientName={clientName}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── ContactEditor modal ────────────────────────────────────────────────────
export function ContactEditor({ contact, bu, clientName, onClose, onSaved }) {
  const isEdit = !!contact?.id
  const [form, setForm] = useState({
    full_name:   contact?.full_name   ?? '',
    role_type:   contact?.role_type   ?? 'other',
    job_title:   contact?.job_title   ?? '',
    email:       contact?.email       ?? '',
    phone:       contact?.phone       ?? '',
    notes:       contact?.notes       ?? '',
    is_primary:  contact?.is_primary  ?? false,
    country:     contact?.country     ?? '',
    // Allow overriding client/BU only when editing an existing contact
    client_name: contact?.client_name ?? clientName ?? '',
    bu:          contact?.bu          ?? bu          ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [existingClients, setExistingClients] = useState([])

  useEffect(() => {
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setExistingClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    }).catch(() => {})
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required'); return }
    if (!form.client_name.trim()) { setError('Client is required'); return }
    if (!form.bu) { setError('BU is required'); return }

    setSaving(true)
    setError(null)

    const payload = {
      bu:         form.bu,
      client_name:form.client_name.trim(),
      full_name:  form.full_name.trim(),
      role_type:  form.role_type,
      job_title:  form.job_title || null,
      email:      form.email || null,
      phone:      form.phone || null,
      notes:      form.notes || null,
      is_primary: !!form.is_primary,
      country:    form.country || null,
    }

    let err
    if (isEdit) {
      const res = await supabase.from('contacts').update(payload).eq('id', contact.id)
      err = res.error
    } else {
      const { data: authData } = await supabase.auth.getUser()
      const res = await supabase.from('contacts')
        .insert({ ...payload, created_by: authData?.user?.id })
      err = res.error
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90dvh' }}>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">
            {isEdit ? 'Edit contact' : 'New contact'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Dr. João Silva" autoFocus/>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Client *</label>
              <SearchableSelect
                value={form.client_name}
                onChange={v => set('client_name', v)}
                options={existingClients.map(c => ({ value: c, label: c }))}
                placeholder="Search clients…"
                emptyLabel="— Select —"
                onCreateNew={(q) => { if (q) set('client_name', q) }}
                createLabel="New"
                size="sm"
              />
            </div>
            <div>
              <label className="label">BU *</label>
              <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
                <option value="">—</option>
                <option value="VGT">VGT</option>
                <option value="ECT">ECT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Stakeholder role</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_ROLES.map(r => {
                const active = form.role_type === r.id
                return (
                  <button key={r.id} type="button"
                    onClick={() => set('role_type', r.id)}
                    className={`text-xs px-2 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                      active ? `${r.color} ring-2 ring-navy/20` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                    <span>{r.icon}</span> {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Job title</label>
            <input className="input" value={form.job_title}
              onChange={e => set('job_title', e.target.value)}
              placeholder="Head of Radiology"/>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="name@hospital.pt"/>
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+351 …"/>
            </div>
          </div>

          <div>
            <label className="label">Country</label>
            <SearchableSelect
              value={form.country}
              onChange={v => set('country', v)}
              options={ALL_COUNTRIES.map(c => ({ value: c, label: c }))}
              placeholder="Search country…"
              emptyLabel="— Select —"
              size="sm"
            />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[72px] resize-none" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Context, preferences, last conversation…"/>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_primary}
              onChange={e => set('is_primary', e.target.checked)}/>
            <span className="text-xs text-gray-700 flex items-center gap-1">
              <Star size={11} className="text-amber-500"/> Primary contact for this client
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12}/> {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-gray-100"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1 flex items-center justify-center gap-1"
            onClick={handleSave} disabled={saving}>
            <Save size={12}/> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create contact'}
          </button>
        </div>
      </div>
    </div>
  )
}
