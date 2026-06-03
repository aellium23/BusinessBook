import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner, EmptyState } from '../components/ui'
import { ContactEditor } from '../components/ContactsList'
import { CONTACT_ROLES, contactRole } from '../constants'
import {
  Users, Plus, Search, Edit3, Trash2, Mail, Phone, Star,
  AlertCircle, Download, X,
} from 'lucide-react'

function exportToCSV(rows) {
  const headers = ['BU','Client','Full name','Role','Job title','Email','Phone','Country','Primary','Notes','Created']
  const data = rows.map(c => [
    c.bu, c.client_name, c.full_name, contactRole(c.role_type).label,
    c.job_title || '', c.email || '', c.phone || '', c.country || '',
    c.is_primary ? 'Yes' : 'No', (c.notes || '').replace(/\n/g, ' '),
    new Date(c.created_at).toISOString().slice(0, 10),
  ])
  const csv = [headers, ...data]
    .map(r => r.map(v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BusinessBook_Contacts_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Contacts() {
  const { isAdmin, profile, canEdit } = useAuth()
  const { t } = useTranslation()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [debounced, setDebounced] = useState('')
  const [buFilter, setBuFilter]   = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | contact

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  async function refresh() {
    setLoading(true)
    let q = supabase.from('contacts').select('*').order('client_name').order('is_primary', { ascending: false }).order('full_name')
    if (!isAdmin) {
      if (profile?.bu === 'VGT') q = q.eq('bu', 'VGT')
      else if (profile?.bu === 'ECT') q = q.eq('bu', 'ECT')
    }
    const { data, error } = await q
    if (error) setError(error.message)
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile !== undefined && profile !== null) refresh()
    // eslint-disable-next-line
  }, [profile?.id, profile?.bu, isAdmin])

  const filtered = useMemo(() => {
    return items.filter(c => {
      if (buFilter && c.bu !== buFilter) return false
      if (roleFilter && c.role_type !== roleFilter) return false
      if (clientFilter && c.client_name.toLowerCase() !== clientFilter.toLowerCase()) return false
      if (debounced) {
        const hay = [c.full_name, c.client_name, c.email, c.phone, c.job_title, c.country, c.notes]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(debounced)) return false
      }
      return true
    })
  }, [items, buFilter, roleFilter, clientFilter, debounced])

  const clients = useMemo(() => {
    const s = new Set(items.map(c => c.client_name).filter(Boolean))
    return Array.from(s).sort()
  }, [items])

  // Group by client for the main list
  const grouped = useMemo(() => {
    const m = new Map()
    filtered.forEach(c => {
      if (!m.has(c.client_name)) m.set(c.client_name, [])
      m.get(c.client_name).push(c)
    })
    return Array.from(m.entries())
  }, [filtered])

  async function handleDelete(c) {
    if (!confirm(`Delete "${c.full_name}"?`)) return
    const { error } = await supabase.from('contacts').delete().eq('id', c.id)
    if (error) { setError(error.message); return }
    refresh()
  }

  const activeFilters = [buFilter, roleFilter, clientFilter, debounced].filter(Boolean).length

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-navy"/> {t('contacts_title')}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('contacts_subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => exportToCSV(filtered)} className="btn-secondary text-xs">
            <Download size={13}/> {t('contacts_export')}
          </button>
          {canEdit && (
            <button onClick={() => setEditing('new')} className="btn-primary">
              <Plus size={15}/> <span className="hidden sm:inline">{t('contacts_new')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{items.length}</p>
          <p className="text-micro text-gray-400 uppercase tracking-wide">{t('contacts_total')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">
            {items.filter(c => c.role_type === 'decision_maker').length}
          </p>
          <p className="text-micro text-gray-400 uppercase tracking-wide">{t('contacts_decision_makers')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">
            {items.filter(c => c.role_type === 'champion').length}
          </p>
          <p className="text-micro text-gray-400 uppercase tracking-wide">{t('contacts_champions')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
          <p className="text-micro text-gray-400 uppercase tracking-wide">{t('contacts_clients')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8 w-full" placeholder={t('contacts_search_ph')}
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">×</button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <select className="select text-xs py-1.5" value={buFilter}
              onChange={e => setBuFilter(e.target.value)}>
              <option value="">{t('contacts_all_bu')}</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          )}
          <select className="select text-xs py-1.5" value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}>
            <option value="">{t('contacts_all_roles')}</option>
            {CONTACT_ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <select className="select text-xs py-1.5 flex-1 min-w-40" value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}>
            <option value="">{t('contacts_all_clients')}</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {activeFilters > 0 && (
            <button type="button"
              onClick={() => { setBuFilter(''); setRoleFilter(''); setClientFilter(''); setSearch('') }}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2">
              {t('contacts_clear')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={13}/> {error}
        </p>
      )}

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <EmptyState icon="👥" title={t("contacts_empty_title")}
          description={activeFilters > 0 ? t("contacts_empty_desc") : t('contacts_add_first')}
          action={canEdit && <button onClick={() => setEditing('new')} className="btn-primary">{t('contacts_add')}</button>}/>
      ) : (
        <div className="space-y-4">
          {grouped.map(([clientName, list]) => (
            <div key={clientName} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800 truncate">{clientName}</p>
                <span className="text-micro text-gray-400 shrink-0">{list.length} {list.length !== 1 ? t('contacts_contacts_word') : t('contacts_contact_word')}</span>
              </div>
              <ul className="divide-y divide-gray-50">
                {list.map(c => {
                  const role = contactRole(c.role_type)
                  return (
                    <li key={c.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                      <div className="text-lg shrink-0" aria-hidden>{role.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900">{c.full_name}</p>
                          {c.is_primary && <Star size={11} className="text-amber-500 fill-amber-400"/>}
                          <span className={`text-micro font-bold px-1.5 py-0.5 rounded border ${role.color}`}>
                            {role.label}
                          </span>
                          <span className="text-micro text-gray-400">· {c.bu}</span>
                        </div>
                        {c.job_title && (
                          <p className="text-xs text-gray-500 mt-0.5">{c.job_title}{c.country ? ` · ${c.country}` : ''}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1">
                          {c.email && (
                            <a href={`mailto:${c.email}`}
                              className="text-tiny text-blue-600 hover:underline flex items-center gap-1">
                              <Mail size={10}/> {c.email}
                            </a>
                          )}
                          {c.phone && (
                            <a href={`tel:${c.phone}`}
                              className="text-tiny text-blue-600 hover:underline flex items-center gap-1">
                              <Phone size={10}/> {c.phone}
                            </a>
                          )}
                        </div>
                        {c.notes && (
                          <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap line-clamp-2">{c.notes}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button type="button" onClick={() => setEditing(c)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                            aria-label="Edit contact">
                            <Edit3 size={13}/>
                          </button>
                          <button type="button" onClick={() => handleDelete(c)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                            aria-label="Delete contact">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ContactEditor
          contact={editing === 'new' ? null : editing}
          bu={editing === 'new' ? (profile?.bu || '') : editing.bu}
          clientName={editing === 'new' ? '' : editing.client_name}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}
