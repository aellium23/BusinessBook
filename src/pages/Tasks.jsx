import { useState, useEffect, useRef } from 'react'
import { useTasks, createTask, updateTask, deleteTask, useNotifications } from '../hooks/useTasks'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Modal, Spinner } from '../components/ui'
import {
  Plus, CheckCircle2, Circle, Clock, Flag, User, Link2,
  Trash2, Edit3, Bell, BellOff, ChevronDown, ChevronUp,
  AlertCircle, Calendar, Filter, X, FileText
} from 'lucide-react'

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500' },
  medium: { label: 'Medium', color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-400' },
  low:    { label: 'Low',    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',  dot: 'bg-blue-400' },
}

function daysDiff(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  return diff
}

function DeadlineBadge({ deadline }) {
  if (!deadline) return null
  const diff = daysDiff(deadline)
  const label = diff < 0
    ? `${Math.abs(diff)}d overdue`
    : diff === 0 ? 'Today'
    : diff === 1 ? 'Tomorrow'
    : `${diff}d left`
  const cls = diff < 0
    ? 'bg-red-100 text-red-700'
    : diff <= 2 ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      <Clock size={9} /> {label}
    </span>
  )
}

// ── SearchableSelect ───────────────────────────────────────────────────────────
// Dropdown com barra de pesquisa — suporta centenas de opções sem perder usabilidade
function SearchableSelect({ value, onChange, options, placeholder = 'Search…', emptyLabel = '— None —' }) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const containerRef          = useRef(null)
  const inputRef              = useRef(null)

  const selected = options.find(o => o.value === value)

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(val) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="input w-full text-left flex items-center justify-between gap-2 min-h-[38px]">
        <span className={selected ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {selected ? selected.label : emptyLabel}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              className="input py-1.5 text-sm"
              placeholder={placeholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          {/* Options list */}
          <div className="max-h-48 overflow-y-auto">
            <button type="button"
              onClick={() => handleSelect("")}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">
              {emptyLabel}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            ) : filtered.map(o => (
              <button type="button" key={o.value}
                onClick={() => handleSelect(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate ${
                  o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TaskModal ──────────────────────────────────────────────────────────────────
function TaskModal({ task, onClose, onSaved, users, deals, tenders, canAssign, pushNotification }) {
  const { user } = useAuth()
  const isEdit = !!task?.id
  const [form, setForm] = useState({
    title:       task?.title       ?? '',
    notes:       task?.notes       ?? '',
    deadline:    task?.deadline    ?? '',
    priority:    task?.priority    ?? 'medium',
    assigned_to: task?.assigned_to ?? '',
    deal_id:     task?.deal_id     ?? '',
    tender_id:   task?.tender_id   ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    const payload = {
      title:       form.title.trim(),
      notes:       form.notes || null,
      deadline:    form.deadline || null,
      priority:    form.priority,
      assigned_to: form.assigned_to || null,
      deal_id:     form.deal_id     || null,
      tender_id:   form.tender_id   || null,
      owner_id:    user.id,
    }
    let err
    if (isEdit) {
      const res = await updateTask(task.id, payload)
      err = res.error
    } else {
      const res = await createTask(payload)
      err = res.error
      // Notify assignee if assigned to someone else
      if (!err && form.assigned_to && form.assigned_to !== user.id) {
        const assigneeName = users.find(u => u.id === form.assigned_to)?.full_name || 'You'
        await pushNotification({
          userId:   form.assigned_to,
          type:     'task_assigned',
          title:    'New task assigned to you',
          body:     form.title,
          linkType: 'task',
          linkId:   res.data?.id,
        })
      }
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'}
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
          </button>
        </div>
      }>
      <div className="space-y-4 w-full">
        {/* Title */}
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="What needs to be done?" />
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px] resize-none" value={form.notes}
            onChange={e => set('notes', e.target.value)} placeholder="Additional context…" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Deadline */}
          <div>
            <label className="label">Deadline</label>
            <input className="input" type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
          </div>
          {/* Priority */}
          <div>
            <label className="label">Priority</label>
            <select className="select" value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🔵 Low</option>
            </select>
          </div>
        </div>

        {/* Assign to (directors only) */}
        {canAssign && (
          <div>
            <label className="label">Assign to</label>
            <select className="select" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">— Personal task —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Link to deal or tender — mutually exclusive */}
        <div className="space-y-2">
          <label className="label">Link to deal <span className="text-gray-400">(optional)</span></label>
          <SearchableSelect
            value={form.deal_id}
            onChange={val => { set('deal_id', val); if (val) set('tender_id', '') }}
            options={deals.map(d => ({ value: d.id, label: `[${d.bu}] ${d.client}` }))}
            placeholder="Search deals…"
            emptyLabel="— No deal —"
          />
        </div>

        <div className="space-y-2">
          <label className="label">Link to tender <span className="text-gray-400">(optional)</span></label>
          <SearchableSelect
            value={form.tender_id}
            onChange={val => { set('tender_id', val); if (val) set('deal_id', '') }}
            options={tenders.map(t => ({ value: t.id, label: t.title }))}
            placeholder="Search tenders…"
            emptyLabel="— No tender —"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle size={13} /> {error}
          </p>
        )}

      </div>
    </Modal>
  )
}

// ── Single Task Row ────────────────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, currentUserId, canAssign, tenders = [] }) {
  const [toggling, setToggling] = useState(false)
  const isDone    = task.status === 'done'
  const isOverdue = !isDone && task.deadline && daysDiff(task.deadline) < 0
  const prio      = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const tenderName = task.tender_id ? (tenders.find(t => t.id === task.tender_id)?.title ?? null) : null

  async function toggleDone() {
    setToggling(true)
    await updateTask(task.id, { status: isDone ? 'open' : 'done' })
    setToggling(false)
    onEdit(null, true) // trigger refetch
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      isDone ? 'bg-gray-50 border-gray-100 opacity-60' :
      isOverdue ? 'bg-red-50 border-red-100' :
      'bg-white border-gray-200 hover:border-gray-300'
    }`}>
      {/* Checkbox */}
      <button onClick={toggleDone} disabled={toggling}
        className="mt-0.5 shrink-0 text-gray-400 hover:text-green-500 transition-colors">
        {isDone ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </span>
          {/* Priority dot */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${prio.dot}`} title={prio.label} />
          <DeadlineBadge deadline={task.deadline} />
        </div>

        {task.notes && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.notes}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-1.5 items-center">
          {/* Assignee */}
          {task.assignee && (
            <span className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">
              <User size={9} />
              {task.assignee.full_name || task.assignee.email}
            </span>
          )}
          {/* Owner (when viewing assigned tasks) */}
          {task.assigned_to === currentUserId && task.owner && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              from {task.owner.full_name || task.owner.email}
            </span>
          )}
          {/* Deal link */}
          {task.deal && (
            <span className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
              <Link2 size={9} /> {task.deal.client}
            </span>
          )}
          {/* Tender link — resolve name from tender_id */}
          {task.tender_id && tenderName && (
            <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
              <FileText size={9} /> {tenderName}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onEdit(task)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          <Edit3 size={13} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, count, overdueCount, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left py-1">
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {count > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{count}</span>
        )}
        {overdueCount > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
            {overdueCount} overdue
          </span>
        )}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  )
}

// ── Notifications Panel ────────────────────────────────────────────────────────
function NotificationsPanel({ onClose, notifications, markRead, markAllRead }) {
  const typeIcon = {
    task_assigned:    '📋',
    task_due:         '⏰',
    task_overdue:     '🔴',
    tender_deadline:  '📝',
  }
  return (
    <div className="absolute right-0 top-10 w-[min(320px,calc(100vw-2rem))] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-800">Notifications</span>
        <div className="flex gap-2 items-center">
          <button onClick={markAllRead} className="text-[10px] text-blue-600 hover:underline">Mark all read</button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No notifications</p>
        ) : notifications.map(n => (
          <div key={n.id}
            onClick={() => markRead(n.id)}
            className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${!n.read ? 'bg-blue-50/40' : ''}`}>
            <div className="flex gap-2 items-start">
              <span className="text-base shrink-0">{typeIcon[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${!n.read ? 'text-gray-900' : 'text-gray-500'}`}>{n.title}</p>
                {n.body && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{n.body}</p>}
                <p className="text-[10px] text-gray-300 mt-1">
                  {new Date(n.created_at).toLocaleDateString('pt-PT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
              {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Tasks Page ────────────────────────────────────────────────────────────
export default function Tasks() {
  const { user, profile, isAdmin } = useAuth()
  const canAssign = isAdmin || ['vgt_editor','ect_editor'].includes(profile?.role)

  const { myTasks, assignedToMe, assignedByMe, loading, refetch } = useTasks()
  const { unread, notifications, markRead, markAllRead, pushNotification } = useNotifications()

  const [modal, setModal]         = useState(null)  // null | task object | 'new'
  const [showNotif, setShowNotif] = useState(false)
  const [filter, setFilter]       = useState('all') // 'all'|'open'|'done'

  const [users, setUsers]   = useState([])
  const [deals, setDeals]   = useState([])
  const [tenders, setTenders] = useState([])

  useEffect(() => {
    if (!profile) return
    supabase.from('profiles').select("id, full_name, email").then(({ data }) => setUsers(data ?? []))
    supabase.from('deals').select("id, client, bu").order('client').then(({ data }) => setDeals(data ?? []))
    supabase.from('tenders').select("id, title").order('title').then(({ data }) => setTenders(data ?? []))
  }, [profile])

  function filterTasks(list) {
    if (filter === 'open') return list.filter(t => t.status === 'open')
    if (filter === 'done') return list.filter(t => t.status === 'done')
    return list
  }

  async function handleDelete(id) {
    if (!confirm('Delete this task?')) return
    await deleteTask(id)
    refetch()
  }

  function overdueIn(list) {
    return list.filter(t => t.status === 'open' && t.deadline && daysDiff(t.deadline) < 0).length
  }

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header — mobile-first: título + acções em coluna em mobile */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
            <p className="text-sm text-gray-400 mt-0.5">Your to-dos and team tasks</p>
          </div>
          {/* Notifications bell */}
          <div className="relative">
            <button onClick={() => setShowNotif(s => !s)}
              className="relative p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {showNotif && <NotificationsPanel onClose={() => setShowNotif(false)} notifications={notifications} markRead={markRead} markAllRead={markAllRead} />}
          </div>
        </div>
        {/* Filter + New task — linha separada em mobile */}
        <div className="flex items-center gap-2">
          <select className="select text-sm flex-1" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All tasks</option>
            <option value="open">Open only</option>
            <option value="done">Done only</option>
          </select>
          <button className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm shrink-0"
            onClick={() => setModal('new')}>
            <Plus size={15} /> <span>New task</span>
          </button>
        </div>
      </div>

      {/* My personal tasks */}
      <Section
        title="My tasks"
        count={filterTasks(myTasks).length}
        overdueCount={overdueIn(myTasks)}
      >
        {filterTasks(myTasks).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No personal tasks</p>
        ) : filterTasks(myTasks).map(t => (
          <TaskRow key={t.id} task={t} currentUserId={user?.id} canAssign={canAssign} tenders={tenders}
            onEdit={(t, refetchOnly) => refetchOnly ? refetch() : setModal(t)}
            onDelete={handleDelete} />
        ))}
        <button onClick={() => setModal('new')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mt-1 py-1">
          <Plus size={13} /> Add task
        </button>
      </Section>

      {/* Tasks assigned to me */}
      {assignedToMe.length > 0 && (
        <Section
          title="Assigned to me"
          count={filterTasks(assignedToMe).length}
          overdueCount={overdueIn(assignedToMe)}
        >
          {filterTasks(assignedToMe).map(t => (
            <TaskRow key={t.id} task={t} currentUserId={user?.id} canAssign={canAssign} tenders={tenders}
              onEdit={(t, refetchOnly) => refetchOnly ? refetch() : setModal(t)}
              onDelete={handleDelete} />
          ))}
        </Section>
      )}

      {/* Tasks I assigned to others (directors) */}
      {canAssign && assignedByMe.length > 0 && (
        <Section
          title="Assigned by me"
          count={filterTasks(assignedByMe).length}
          overdueCount={overdueIn(assignedByMe)}
          defaultOpen={false}
        >
          {filterTasks(assignedByMe).map(t => (
            <TaskRow key={t.id} task={t} currentUserId={user?.id} canAssign={canAssign} tenders={tenders}
              onEdit={(t, refetchOnly) => refetchOnly ? refetch() : setModal(t)}
              onDelete={handleDelete} />
          ))}
        </Section>
      )}

      {/* Task modal */}
      {modal !== null && (
        <TaskModal
          task={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={refetch}
          users={users}
          deals={deals}
          tenders={tenders}
          canAssign={canAssign}
          pushNotification={pushNotification}
        />
      )}
    </div>
  )
}
