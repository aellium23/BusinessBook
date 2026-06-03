import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner, EmptyState } from '../components/ui'
import { Shield, Search, ChevronDown, ChevronRight, Plus, Pencil, Trash2, User, AlertCircle, Download } from 'lucide-react'

const TABLE_OPTIONS = [
  { id: '', label: 'All tables' },
  { id: 'deals',                 label: 'Deals' },
  { id: 'contacts',              label: 'Contacts' },
  { id: 'tenders',               label: 'Tenders' },
  { id: 'tender_requirements',   label: 'Tender requirements' },
  { id: 'quotas',                label: 'Sales targets (quotas)' },
  { id: 'attachments',           label: 'Attachments' },
]

const ACTIONS = [
  { id: '',       label: 'All actions' },
  { id: 'insert', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'delete', label: 'Delete' },
]

function ActionBadge({ action }) {
  const map = {
    insert: { label: 'Create',  cls: 'bg-green-100 text-green-700', Icon: Plus },
    update: { label: 'Update',  cls: 'bg-blue-100 text-blue-700',   Icon: Pencil },
    delete: { label: 'Delete',  cls: 'bg-red-100 text-red-700',     Icon: Trash2 },
  }
  const m = map[action] || { label: action, cls: 'bg-gray-100 text-gray-600', Icon: User }
  const I = m.Icon
  return (
    <span className={`inline-flex items-center gap-1 text-micro font-bold px-1.5 py-0.5 rounded ${m.cls}`}>
      <I size={10}/> {m.label}
    </span>
  )
}

function formatVal(v) {
  if (v === null || v === undefined) return <span className="text-gray-400 italic">null</span>
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'object') return <code className="text-micro">{JSON.stringify(v).slice(0, 60)}</code>
  return String(v).slice(0, 80)
}

function DiffTable({ changed }) {
  if (!changed) return null
  const entries = Object.entries(changed)
  if (entries.length === 0) return null
  return (
    <table className="w-full text-tiny">
      <tbody>
        {entries.map(([field, { old: oldV, new: newV }]) => (
          <tr key={field} className="border-t border-gray-50">
            <td className="py-1 pr-2 font-medium text-gray-600 align-top">{field}</td>
            <td className="py-1 pr-2 text-red-500 line-through align-top">{formatVal(oldV)}</td>
            <td className="py-1 pr-1 text-gray-300 align-top">→</td>
            <td className="py-1 text-green-700 align-top">{formatVal(newV)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Snapshot({ data, title }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  const keys = Object.keys(data)
  return (
    <div className="text-tiny">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-gray-500 hover:text-gray-800 flex items-center gap-1">
        {open ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
        {title} ({keys.length} fields)
      </button>
      {open && (
        <pre className="mt-1 bg-gray-50 rounded p-2 overflow-x-auto max-h-48 text-micro leading-snug">
{JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function toCSV(rows) {
  const headers = ['Time','Actor','Action','Table','Record','Fields changed']
  const data = rows.map(r => [
    new Date(r.at).toISOString(),
    r.actor_email || '',
    r.action,
    r.table_name,
    r.record_id || '',
    r.changed ? Object.keys(r.changed).join('; ') : (r.action === 'insert' ? '(created)' : r.action === 'delete' ? '(deleted)' : ''),
  ])
  const csv = [headers, ...data]
    .map(row => row.map(v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BusinessBook_Audit_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditLog() {
  const { isAdmin } = useAuth()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [search, setSearch]   = useState('')
  const [debounced, setDebounced] = useState('')
  const [tableF, setTableF]   = useState('')
  const [actionF, setActionF] = useState('')
  const [actorF, setActorF]   = useState('')
  const [sinceF, setSinceF]   = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [limit, setLimit]     = useState(200)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  async function refresh() {
    if (!isAdmin) { setLoading(false); return }
    setLoading(true)
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(limit)
    if (tableF) q = q.eq('table_name', tableF)
    if (actionF) q = q.eq('action', actionF)
    if (actorF) { const safe = String(actorF).replace(/[%_\\]/g, m => `\\${m}`); q = q.ilike('actor_email', `%${safe}%`) }
    if (sinceF) q = q.gte('at', sinceF)
    const { data, error } = await q
    if (error) setError(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [tableF, actionF, actorF, sinceF, limit, isAdmin])

  const filtered = useMemo(() => {
    if (!debounced) return rows
    return rows.filter(r => {
      const hay = [
        r.actor_email, r.table_name, r.record_id, r.action,
        r.changed ? Object.keys(r.changed).join(' ') : '',
        r.snapshot ? JSON.stringify(r.snapshot).slice(0, 2000) : '',
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(debounced)
    })
  }, [rows, debounced])

  const actors = useMemo(() => {
    const s = new Set(rows.map(r => r.actor_email).filter(Boolean))
    return Array.from(s).sort()
  }, [rows])

  function toggle(id) {
    setExpanded(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <EmptyState icon="🔒" title="Admin only"
          description="The audit log is only visible to admins."/>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={20} className="text-navy"/> Audit log
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Who changed what, and when.
          </p>
        </div>
        <button onClick={() => toCSV(filtered)} className="btn-secondary text-xs">
          <Download size={13}/> Export
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8 w-full" placeholder="Search fields, record id, email, table…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="select text-xs py-1.5" value={tableF} onChange={e => setTableF(e.target.value)}>
            {TABLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select className="select text-xs py-1.5" value={actionF} onChange={e => setActionF(e.target.value)}>
            {ACTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select className="select text-xs py-1.5 flex-1 min-w-40" value={actorF} onChange={e => setActorF(e.target.value)}>
            <option value="">All actors</option>
            {actors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" className="select text-xs py-1.5" value={sinceF}
            onChange={e => setSinceF(e.target.value)} title="Events since"/>
          <select className="select text-xs py-1.5" value={limit} onChange={e => setLimit(Number(e.target.value))}>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
            <option value={1000}>Last 1000</option>
          </select>
          {(tableF || actionF || actorF || sinceF || search) && (
            <button type="button"
              onClick={() => { setTableF(''); setActionF(''); setActorF(''); setSinceF(''); setSearch('') }}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2">
              Clear
            </button>
          )}
        </div>
        <p className="text-micro text-gray-400">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''} shown
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={13}/> {error}
        </p>
      )}

      {loading ? (
        <Spinner/>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="No events"
          description="Try widening the filters or scope."/>
      ) : (
        <div className="space-y-1">
          {filtered.map(r => {
            const isOpen = expanded.has(r.id)
            return (
              <div key={r.id} className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                <button type="button"
                  onClick={() => toggle(r.id)}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 text-left">
                  <span className="shrink-0 mt-0.5">
                    {isOpen ? <ChevronDown size={13} className="text-gray-400"/> : <ChevronRight size={13} className="text-gray-400"/>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ActionBadge action={r.action}/>
                      <span className="text-xs font-semibold text-gray-800">{r.table_name}</span>
                      <span className="text-micro text-gray-400 font-mono truncate">
                        {r.record_id?.slice(0, 8) || '—'}
                      </span>
                      <span className="text-micro text-gray-400 ml-auto">
                        {new Date(r.at).toLocaleString('pt-PT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-tiny text-gray-500 flex items-center gap-1">
                        <User size={10}/> {r.actor_email || '(system)'}
                      </span>
                      {r.changed && (
                        <span className="text-micro text-gray-400">
                          · {Object.keys(r.changed).length} field{Object.keys(r.changed).length !== 1 ? 's' : ''} changed
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-50 space-y-2">
                    {r.changed && <DiffTable changed={r.changed}/>}
                    {r.snapshot && (
                      <Snapshot data={r.snapshot}
                        title={r.action === 'insert' ? 'Created record' : 'Deleted record'}/>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
