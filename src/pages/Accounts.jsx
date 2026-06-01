import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner, EmptyState, formatK } from '../components/ui'
import { MONTHS_K, REGIONS } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

const ALL_COUNTRIES = ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','UAE','Saudi Arabia','Qatar','Kuwait','Egypt','Morocco','South Africa','Israel','Mexico','Brazil','Argentina','Chile','Colombia','Peru','Japan','China','South Korea','Australia','India','Singapore','USA','Canada']
import {
  Building2, Plus, Edit3, Trash2, ChevronDown, ChevronRight,
  Search, Save, X, AlertCircle, GitBranch,
} from 'lucide-react'

// Build a tree structure from flat accounts list
function buildTree(accounts) {
  const byParent = new Map()
  accounts.forEach(a => {
    const p = a.parent_id || null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(a)
  })
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  return byParent
}

// Aggregate deal stats per account (incl. descendants)
function computeRollups(accounts, deals) {
  // Build tree + all-descendants map
  const byParent = new Map()
  accounts.forEach(a => {
    const p = a.parent_id || null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(a.id)
  })
  function descendants(id, acc = new Set()) {
    acc.add(id)
    ;(byParent.get(id) || []).forEach(child => descendants(child, acc))
    return acc
  }

  // Stats per account (own only)
  const own = {}
  accounts.forEach(a => { own[a.id] = { count: 0, pipeline: 0, invoiced: 0 } })
  deals.forEach(d => {
    if (!d.account_id || !own[d.account_id]) return
    const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
    own[d.account_id].count += 1
    own[d.account_id].pipeline += ['Lead','Pipeline','Offer Presented','BackLog'].includes(d.stage)
      ? (Number(d.value_total) || 0) : 0
    own[d.account_id].invoiced += d.stage === 'Invoiced' ? fy26 : 0
  })

  // Roll-ups: own + all descendants
  const roll = {}
  accounts.forEach(a => {
    const ids = descendants(a.id)
    const agg = { count: 0, pipeline: 0, invoiced: 0 }
    for (const id of ids) {
      if (!own[id]) continue
      agg.count    += own[id].count
      agg.pipeline += own[id].pipeline
      agg.invoiced += own[id].invoiced
    }
    roll[a.id] = agg
  })
  return { own, roll }
}

function AccountRow({ account, depth, open, children, onToggle, onEdit, onDelete, canEdit, own, roll, hasChildren }) {
  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-2 border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
        style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <button type="button" onClick={onToggle} disabled={!hasChildren}
          className={`shrink-0 w-5 ${hasChildren ? 'text-gray-400 hover:text-gray-600' : 'text-transparent'}`}
          aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        </button>
        <Building2 size={13} className="text-navy/60 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-gray-900 truncate">{account.name}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {account.bu}
            </span>
            {(account.country || account.region) && (
              <span className="text-[10px] text-gray-400">
                {[account.country, account.region].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3 text-[10px]">
          <span className="text-gray-500" title="Own / Roll-up deals">
            {own.count}{hasChildren ? ` · Σ ${roll.count}` : ''}
          </span>
          <span className="text-amber-700 font-semibold" title="Pipeline (own / roll-up)">
            {formatK(hasChildren ? roll.pipeline : own.pipeline)}
          </span>
          <span className="text-green-700 font-semibold" title="Invoiced FY26 (own / roll-up)">
            {formatK(hasChildren ? roll.invoiced : own.invoiced)}
          </span>
          {canEdit && (
            <div className="flex gap-0.5">
              <button type="button" onClick={onEdit}
                className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                aria-label="Edit account">
                <Edit3 size={11}/>
              </button>
              <button type="button" onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                aria-label="Delete account">
                <Trash2 size={11}/>
              </button>
            </div>
          )}
        </div>
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

function AccountEditor({ account, accounts, defaultBU, onClose, onSaved }) {
  const isEdit = !!account?.id
  const [form, setForm] = useState({
    name:      account?.name       ?? '',
    bu:        account?.bu         ?? defaultBU ?? '',
    parent_id: account?.parent_id  ?? '',
    country:   account?.country    ?? '',
    region:    account?.region     ?? '',
    notes:     account?.notes      ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Can't assign self or descendants as parent (would create a cycle).
  const blocked = useMemo(() => {
    if (!isEdit) return new Set()
    const set = new Set([account.id])
    const byParent = new Map()
    accounts.forEach(a => {
      if (!byParent.has(a.parent_id)) byParent.set(a.parent_id, [])
      byParent.get(a.parent_id).push(a.id)
    })
    function walk(id) {
      ;(byParent.get(id) || []).forEach(c => { set.add(c); walk(c) })
    }
    walk(account.id)
    return set
  }, [account?.id, accounts, isEdit])

  const parentOptions = accounts
    .filter(a => !blocked.has(a.id) && (!form.bu || a.bu === form.bu))
    .sort((a, b) => a.name.localeCompare(b.name))

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.bu) { setError('BU is required'); return }
    setSaving(true); setError(null)

    const payload = {
      name:      form.name.trim(),
      bu:        form.bu,
      parent_id: form.parent_id || null,
      country:   form.country   || null,
      region:    form.region    || null,
      notes:     form.notes     || null,
    }

    let err
    if (isEdit) {
      const res = await supabase.from('accounts').update(payload).eq('id', account.id)
      err = res.error
    } else {
      const { data: authData } = await supabase.auth.getUser()
      const res = await supabase.from('accounts').insert({ ...payload, created_by: authData?.user?.id })
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
            {isEdit ? 'Edit account' : 'New account'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name}
              onChange={e => set('name', e.target.value)} autoFocus
              placeholder="Hospital Group XYZ"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">BU *</label>
              <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
                <option value="">—</option>
                <option>VGT</option>
                <option>ECT</option>
              </select>
            </div>
            <div>
              <label className="label">Parent</label>
              <SearchableSelect
                value={form.parent_id}
                onChange={v => set('parent_id', v)}
                options={parentOptions.map(a => ({ value: a.id, label: a.name }))}
                placeholder="Search…"
                emptyLabel="(top-level)"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Region</label>
              <SearchableSelect
                value={form.region}
                onChange={v => { set('region', v); set('country', '') }}
                options={REGIONS.map(r => ({ value: r, label: r }))}
                emptyLabel="— Select —"
              />
            </div>
            <div>
              <label className="label">Country</label>
              <SearchableSelect
                value={form.country}
                onChange={v => set('country', v)}
                options={ALL_COUNTRIES.map(c => ({ value: c, label: c }))}
                placeholder="Search…"
                emptyLabel="— Select —"
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[72px] resize-none" value={form.notes}
              onChange={e => set('notes', e.target.value)}/>
          </div>
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
            <Save size={12}/> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Accounts() {
  const { isAdmin, profile, canEdit } = useAuth()
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState([])
  const [deals, setDeals]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [buF, setBuF]           = useState('')
  const [editing, setEditing]   = useState(null)
  const [open, setOpen]         = useState(() => new Set())

  async function refresh() {
    setLoading(true)
    const [aRes, dRes] = await Promise.all([
      supabase.from('accounts').select('*').order('name'),
      supabase.from('deals').select('id, account_id, stage, value_total, is_intercompany_mirror, ' + MONTHS_K.join(',')).eq('is_intercompany_mirror', false),
    ])
    if (aRes.error) setError(aRes.error.message)
    setAccounts(aRes.data ?? [])
    setDeals(dRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile !== undefined && profile !== null) refresh()
  }, [profile?.id])

  const { own, roll } = useMemo(() => computeRollups(accounts, deals), [accounts, deals])

  const byParent = useMemo(() => buildTree(accounts), [accounts])

  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q && !buF) return null // no filter — render whole tree
    const kept = new Set()
    accounts.forEach(a => {
      const matchSearch = !q || [a.name, a.country, a.region, a.notes].filter(Boolean).join(' ').toLowerCase().includes(q)
      const matchBu = !buF || a.bu === buF
      if (matchSearch && matchBu) {
        // Keep the match + all its ancestors so the tree stays connected
        kept.add(a.id)
        let parent = a.parent_id
        while (parent) {
          kept.add(parent)
          const p = accounts.find(x => x.id === parent)
          parent = p?.parent_id
        }
      }
    })
    return kept
  }, [accounts, search, buF])

  async function handleDelete(a) {
    if (!confirm(`Delete "${a.name}"? Children become top-level.`)) return
    const { error } = await supabase.from('accounts').delete().eq('id', a.id)
    if (error) { setError(error.message); return }
    refresh()
  }

  function toggle(id) {
    setOpen(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function expandAll() {
    setOpen(new Set(accounts.map(a => a.id)))
  }
  function collapseAll() { setOpen(new Set()) }

  function renderNode(a, depth) {
    if (filteredIds && !filteredIds.has(a.id)) return null
    const children = (byParent.get(a.id) || [])
    const hasChildren = children.length > 0
    const isOpen = open.has(a.id) || (!!filteredIds && filteredIds.size > 0)
    return (
      <AccountRow
        key={a.id}
        account={a}
        depth={depth}
        open={isOpen}
        hasChildren={hasChildren}
        own={own[a.id] || { count: 0, pipeline: 0, invoiced: 0 }}
        roll={roll[a.id] || { count: 0, pipeline: 0, invoiced: 0 }}
        onToggle={() => toggle(a.id)}
        onEdit={() => setEditing(a)}
        onDelete={() => handleDelete(a)}
        canEdit={canEdit}>
        {children.map(c => renderNode(c, depth + 1))}
      </AccountRow>
    )
  }

  const topLevel = (byParent.get(null) || [])

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={20} className="text-navy"/> Accounts
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{t('accounts_subtitle') || 'Organizational hierarchy and structure'}</p>
          <Link to="/clients" className="text-[10px] text-blue-500 hover:text-blue-700">{t('accounts_go_clients') || 'View individual clients →'}</Link>
        </div>
        <div className="flex gap-1.5">
          <button onClick={expandAll}   className="btn-secondary text-xs">Expand all</button>
          <button onClick={collapseAll} className="btn-secondary text-xs">Collapse all</button>
          {canEdit && (
            <button onClick={() => setEditing('new')} className="btn-primary">
              <Plus size={15}/> <span className="hidden sm:inline">New account</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8 w-full" placeholder="Search accounts…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {isAdmin && (
          <select className="select text-xs py-1.5" value={buF}
            onChange={e => setBuF(e.target.value)}>
            <option value="">All BUs</option>
            <option>VGT</option>
            <option>ECT</option>
          </select>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={13}/> {error}
        </p>
      )}

      {topLevel.length === 0 ? (
        <EmptyState icon="🏥" title={t("accounts_empty_title")}
          description={t("accounts_empty_desc")}
          action={canEdit && <button onClick={() => setEditing('new')} className="btn-primary">New account</button>}/>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border-b border-gray-100">
            <span className="flex-1">Account</span>
            <span className="w-20 text-right">Deals</span>
            <span className="w-20 text-right">Pipeline</span>
            <span className="w-20 text-right">Invoiced</span>
            {canEdit && <span className="w-12"/>}
          </div>
          {topLevel.map(a => renderNode(a, 0))}
        </div>
      )}

      {editing && (
        <AccountEditor
          account={editing === 'new' ? null : editing}
          accounts={accounts}
          defaultBU={profile?.bu || ''}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}
