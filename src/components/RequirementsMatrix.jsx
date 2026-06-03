import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Plus, Trash2, CheckCircle2, Circle, Clock, MinusCircle,
  ChevronDown, ChevronRight, ListChecks, AlertCircle, X,
} from 'lucide-react'

const CATEGORIES = [
  { id: 'regulatory',     label: 'Regulatory',     color: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'technical',      label: 'Technical',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'commercial',     label: 'Commercial',     color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'administrative', label: 'Administrative', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'other',          label: 'Other',          color: 'bg-gray-50 text-gray-700 border-gray-200' },
]

const STATUS_OPTIONS = [
  { id: 'pending',     label: 'Pending',     icon: Circle,        color: 'text-gray-400' },
  { id: 'in_progress', label: 'In progress', icon: Clock,         color: 'text-amber-500' },
  { id: 'complete',    label: 'Complete',    icon: CheckCircle2,  color: 'text-green-500' },
  { id: 'na',          label: 'N/A',         icon: MinusCircle,   color: 'text-gray-300' },
]

function StatusCell({ value, onChange }) {
  const opt = STATUS_OPTIONS.find(s => s.id === value) || STATUS_OPTIONS[0]
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`select py-1 text-xs font-medium ${opt.color}`}
      aria-label="Status">
      {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  )
}

// ── ApplyTemplatesModal ──────────────────────────────────────────────────────
function ApplyTemplatesModal({ onClose, onApply, existingTitles }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(new Set())
  const [search, setSearch]       = useState('')

  useEffect(() => {
    supabase.from('tender_requirement_templates')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data, error }) => {

        const list = data ?? []
        setTemplates(list)
        // Pre-select all templates that aren't already present by title
        const preset = new Set(list.filter(t => !existingTitles.has(t.title)).map(t => t.id))
        setSelected(preset)
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [existingTitles])

  const filtered = useMemo(() => {
    if (!search) return templates
    const q = search.toLowerCase()
    return templates.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    )
  }, [templates, search])

  function toggle(id) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function selectAllVisible() {
    setSelected(s => {
      const n = new Set(s)
      filtered.forEach(t => n.add(t.id))
      return n
    })
  }

  function clearVisible() {
    setSelected(s => {
      const n = new Set(s)
      filtered.forEach(t => n.delete(t.id))
      return n
    })
  }

  const groups = useMemo(() => {
    const m = {}
    filtered.forEach(t => { (m[t.category] ??= []).push(t) })
    return m
  }, [filtered])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85dvh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
            <ListChecks size={14}/> Apply requirement templates
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 space-y-2">
          <input className="input py-1.5 text-sm" placeholder="Search templates…"
            value={search} onChange={e => setSearch(e.target.value)}/>
          <div className="flex gap-2 text-tiny">
            <button onClick={selectAllVisible} className="text-navy hover:underline">Select visible</button>
            <span className="text-gray-300">·</span>
            <button onClick={clearVisible} className="text-gray-500 hover:underline">Clear visible</button>
            <span className="ml-auto text-gray-400">{selected.size} selected</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No templates match.</p>
          ) : CATEGORIES.map(cat => {
            const list = groups[cat.id] || []
            if (list.length === 0) return null
            return (
              <div key={cat.id} className="mb-3">
                <p className={`inline-block text-micro font-bold px-2 py-0.5 rounded-full mb-1 border ${cat.color}`}>
                  {cat.label}
                </p>
                <ul className="space-y-1">
                  {list.map(t => {
                    const alreadyHas = existingTitles.has(t.title)
                    const isSel = selected.has(t.id)
                    return (
                      <li key={t.id}>
                        <label className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSel ? 'bg-blue-50' : 'hover:bg-gray-50'
                        } ${alreadyHas ? 'opacity-50' : ''}`}>
                          <input type="checkbox" className="mt-0.5"
                            checked={isSel}
                            disabled={alreadyHas}
                            onChange={() => toggle(t.id)}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800">{t.title}</p>
                            {t.description && (
                              <p className="text-tiny text-gray-500 mt-0.5">{t.description}</p>
                            )}
                            {alreadyHas && (
                              <p className="text-micro text-gray-400 italic mt-0.5">Already added</p>
                            )}
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-gray-100"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1"
            disabled={selected.size === 0}
            onClick={() => {
              const picked = templates.filter(t => selected.has(t.id))
              onApply(picked)
            }}>
            Apply {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
/**
 * Props:
 *   tenderId: uuid
 *   canEdit:  boolean
 *   assignees: [{ id, full_name }] — sales owners list
 */
export default function RequirementsMatrix({ tenderId, canEdit = true, assignees = [] }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [openCats, setOpenCats]   = useState(new Set(CATEGORIES.map(c => c.id)))
  const [showTemplates, setShowTemplates] = useState(false)

  async function refresh() {
    if (!tenderId) { setItems([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('tender_requirements')
      .select('*')
      .eq('tender_id', tenderId)
      .order('sort_order').order('created_at')
    if (error) setError(error.message)
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [tenderId])

  async function addRequirement(partial = {}) {
    const { data: authData } = await supabase.auth.getUser()
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order || 0), 0)
    const { data, error } = await supabase.from('tender_requirements').insert({
      tender_id:  tenderId,
      title:      partial.title      ?? 'New requirement',
      description:partial.description?? null,
      category:   partial.category   ?? 'other',
      status:     partial.status     ?? 'pending',
      sort_order: (partial.sort_order ?? maxOrder + 10),
      created_by: authData?.user?.id,
    }).select().single()
    if (error) { setError(error.message); return null }
    setItems(prev => [...prev, data])
    return data
  }

  async function updateRequirement(id, patch) {
    setItems(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)) // optimistic
    const { error } = await supabase.from('tender_requirements').update(patch).eq('id', id)
    if (error) { setError(error.message); refresh() }
  }

  async function removeRequirement(id) {
    if (!confirm('Delete this requirement?')) return
    setItems(prev => prev.filter(r => r.id !== id))
    const { error } = await supabase.from('tender_requirements').delete().eq('id', id)
    if (error) { setError(error.message); refresh() }
  }

  async function applyTemplates(templates) {
    const existingTitles = new Set(items.map(i => i.title))
    const toInsert = templates
      .filter(t => !existingTitles.has(t.title))
      .map((t, idx) => ({
        tender_id: tenderId,
        title:       t.title,
        description: t.description,
        category:    t.category,
        status:      'pending',
        sort_order:  t.sort_order || (1000 + idx * 10),
      }))
    if (toInsert.length === 0) { setShowTemplates(false); return }
    const { error } = await supabase.from('tender_requirements').insert(toInsert)
    if (error) setError(error.message)
    setShowTemplates(false)
    refresh()
  }

  // Progress & grouping
  const effectiveItems = items.filter(i => i.status !== 'na')
  const doneCount = effectiveItems.filter(i => i.status === 'complete').length
  const totalCount = effectiveItems.length
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const grouped = useMemo(() => {
    const m = {}
    items.forEach(i => { (m[i.category] ??= []).push(i) })
    return m
  }, [items])

  function toggleCat(id) {
    setOpenCats(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (!tenderId) {
    return (
      <p className="text-tiny text-gray-400 italic">
        Save the tender first to start adding requirements.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="bg-gray-50 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <ListChecks size={13}/> Requirements
            <span className="text-micro text-gray-400 font-normal">
              ({doneCount} / {totalCount} complete{items.length !== totalCount ? `, ${items.length - totalCount} N/A` : ''})
            </span>
          </p>
          <span className={`text-xs font-bold ${
            pct === 100 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-gray-500'
          }`}>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${
            pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-400'
          }`} style={{ width: `${pct}%` }}/>
        </div>
        {canEdit && (
          <div className="flex gap-2 mt-2">
            <button onClick={() => addRequirement()} className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
              <Plus size={11}/> Add requirement
            </button>
            <button onClick={() => setShowTemplates(true)} className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
              <ListChecks size={11}/> Apply templates
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12}/> {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
          <ListChecks size={24} className="mx-auto mb-2 opacity-40"/>
          <p className="text-sm">No requirements yet.</p>
          {canEdit && (
            <p className="text-xs mt-1">Use <strong>Apply templates</strong> to start from the medical-imaging defaults.</p>
          )}
        </div>
      ) : CATEGORIES.map(cat => {
        const list = grouped[cat.id] || []
        if (list.length === 0) return null
        const isOpen = openCats.has(cat.id)
        const done = list.filter(i => i.status === 'complete').length
        return (
          <div key={cat.id} className="border border-gray-100 rounded-xl overflow-hidden">
            <button type="button" onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left">
              {isOpen ? <ChevronDown size={13} className="text-gray-400"/> : <ChevronRight size={13} className="text-gray-400"/>}
              <span className={`text-micro font-bold px-2 py-0.5 rounded-full border ${cat.color}`}>
                {cat.label}
              </span>
              <span className="text-tiny text-gray-500">{done} / {list.length}</span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-gray-100">
                {list.map(req => (
                  <li key={req.id} className="p-2 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
                      <div className="min-w-0">
                        <input
                          className="input py-1 text-xs font-medium"
                          value={req.title}
                          disabled={!canEdit}
                          onChange={e => updateRequirement(req.id, { title: e.target.value })}
                        />
                        {(req.description || canEdit) && (
                          <textarea
                            className="input py-1 text-tiny text-gray-600 mt-1 min-h-[28px] resize-none"
                            value={req.description || ''}
                            placeholder="Notes / description…"
                            disabled={!canEdit}
                            rows={1}
                            onChange={e => updateRequirement(req.id, { description: e.target.value })}
                          />
                        )}
                      </div>
                      <StatusCell
                        value={req.status}
                        onChange={v => updateRequirement(req.id, { status: v })}
                      />
                      <select
                        className="select py-1 text-xs"
                        value={req.assignee_id || ''}
                        disabled={!canEdit}
                        onChange={e => updateRequirement(req.id, { assignee_id: e.target.value || null })}
                        aria-label="Assignee">
                        <option value="">Unassigned</option>
                        {assignees.map(a => (
                          <option key={a.id} value={a.id}>{a.full_name}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input type="date" className="input py-1 text-xs w-32"
                          value={req.due_date || ''}
                          disabled={!canEdit}
                          onChange={e => updateRequirement(req.id, { due_date: e.target.value || null })}
                          aria-label="Due date"/>
                        {canEdit && (
                          <button type="button"
                            onClick={() => removeRequirement(req.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                            aria-label="Delete requirement">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {showTemplates && (
        <ApplyTemplatesModal
          onClose={() => setShowTemplates(false)}
          onApply={applyTemplates}
          existingTitles={new Set(items.map(i => i.title))}
        />
      )}
    </div>
  )
}
