import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Clock, Pencil, FileUp, ArrowRight, TrendingUp, Filter,
  Calendar as CalendarIcon, AlertCircle, MessageSquare,
} from 'lucide-react'

// ── Field labels (human-readable names for deal_history.field_name) ─────────
const FIELD_LABELS = {
  stage: 'Stage',
  value_total: 'Value',
  gm_pct: 'GM %',
  client: 'Client',
  country: 'Country',
  region: 'Region',
  sales_owner: 'Sales owner',
  deal_type: 'Deal type',
  currency: 'Currency',
  win_probability: 'Win probability',
  lost_reason: 'Lost reason',
  discount_status: 'Discount status',
  discount_approved: 'Approved discount',
  sla_annual_value: 'SLA annual value',
  description: 'Description',
  bu: 'BU',
  forecast_category: 'Forecast category',
  product: 'Product',
  is_sla: 'SLA',
  sla_type: 'SLA type',
}

// ── Time bucket grouping ────────────────────────────────────────────────────
function bucketFor(date) {
  const now = Date.now()
  const ts  = new Date(date).getTime()
  const day = 86400000
  const diff = now - ts
  if (diff < day) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return 'This week'
  if (diff < 30 * day) return 'This month'
  return 'Earlier'
}
const BUCKET_ORDER = ['Today','Yesterday','This week','This month','Earlier']

function relativeTime(date) {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)    return 'just now'
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)    return `${d}d ago`
  return new Date(date).toLocaleDateString('pt-PT', { day:'numeric', month:'short' })
}

function fmtValue(v) {
  if (v == null || v === '') return '—'
  return String(v)
}

// ── Event rendering ──────────────────────────────────────────────────────────
function EventIcon({ type, subtype }) {
  const cls = 'w-7 h-7 rounded-full flex items-center justify-center shrink-0'
  if (type === 'note')
    return <div className={`${cls} bg-blue-100 text-blue-700`}><MessageSquare size={13}/></div>
  if (type === 'attachment')
    return <div className={`${cls} bg-purple-100 text-purple-700`}><FileUp size={13}/></div>
  if (subtype === 'stage_change')
    return <div className={`${cls} bg-green-100 text-green-700`}><TrendingUp size={13}/></div>
  return <div className={`${cls} bg-gray-100 text-gray-500`}><Pencil size={13}/></div>
}

function EventRow({ ev }) {
  return (
    <div className="flex gap-2 items-start">
      <EventIcon type={ev.type} subtype={ev.subtype}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ev.user_name && (
            <span className="text-tiny font-medium text-gray-700">{ev.user_name}</span>
          )}
          <span className="text-micro text-gray-400">· {relativeTime(ev.at)}</span>
          <span className="text-micro text-gray-300 ml-auto">
            {new Date(ev.at).toLocaleString('pt-PT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
          </span>
        </div>
        <div className="text-xs text-gray-800 mt-0.5">{ev.body}</div>
        {ev.next_action && (
          <div className="mt-1 inline-flex items-center gap-1 text-tiny text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
            <CalendarIcon size={10}/>
            <span>Next: {ev.next_action}</span>
            {ev.next_action_date && (
              <span className="opacity-70">· {new Date(ev.next_action_date).toLocaleDateString('pt-PT', { day:'numeric', month:'short' })}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
/**
 * Unified deal timeline merging:
 *  - deal_activities     (user notes + next actions)
 *  - deal_history        (auto field changes)
 *  - attachments         (entity_type='deal')
 *
 * Props:
 *   dealId:  uuid
 */
export default function DealTimeline({ dealId }) {
  const [activities, setActivities]     = useState([])
  const [changes, setChanges]           = useState([])
  const [files, setFiles]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [filter, setFilter]             = useState('all') // 'all'|'notes'|'changes'|'files'

  async function refresh() {
    if (!dealId) { setActivities([]); setChanges([]); setFiles([]); setLoading(false); return }
    setLoading(true)
    const [act, hist, att] = await Promise.all([
      supabase.from('deal_activities')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('deal_history')
        .select('*, changed_by_profile:changed_by(full_name, email)')
        .eq('deal_id', dealId)
        .order('changed_at', { ascending: false })
        .limit(100),
      supabase.from('attachments')
        .select('*, uploader:uploaded_by(full_name, email)')
        .eq('entity_type', 'deal')
        .eq('entity_id', dealId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]).catch(e => { setError(e.message); return [{},{}, {}] })


    setActivities(act?.data ?? [])
    setChanges(hist?.data ?? [])
    setFiles(att?.data ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [dealId])

  // Normalise all three sources into a single shape
  const events = useMemo(() => {
    const list = []
    activities.forEach(a => {
      list.push({
        id:       `act-${a.id}`,
        type:     'note',
        subtype:  a.action_type || 'note',
        at:       a.created_at,
        user_name:a.user_name || '—',
        body:     <span className="whitespace-pre-wrap">{a.note}</span>,
        next_action:      a.next_action,
        next_action_date: a.next_action_date,
      })
    })
    changes.forEach(h => {
      const label = FIELD_LABELS[h.field_name] || h.field_name
      const user  = h.changed_by_profile?.full_name || h.changed_by_profile?.email?.split('@')[0] || '—'
      list.push({
        id:       `chg-${h.id}`,
        type:     'change',
        subtype:  h.field_name === 'stage' ? 'stage_change' : 'change',
        at:       h.changed_at,
        user_name:user,
        body: (
          <span>
            <strong>{label}</strong>{' '}
            {h.old_value ? (
              <>
                <span className="text-red-500 line-through">{fmtValue(h.old_value)}</span>
                <ArrowRight size={10} className="inline mx-1 text-gray-400"/>
              </>
            ) : null}
            <span className="text-green-700 font-medium">{fmtValue(h.new_value)}</span>
          </span>
        ),
      })
    })
    files.forEach(f => {
      const user = f.uploader?.full_name || f.uploader?.email?.split('@')[0] || '—'
      list.push({
        id:       `att-${f.id}`,
        type:     'attachment',
        subtype:  'uploaded',
        at:       f.created_at,
        user_name:user,
        body:     <>Uploaded <strong>{f.file_name}</strong></>,
      })
    })
    // Sort descending by date
    return list.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [activities, changes, files])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'notes')    return events.filter(e => e.type === 'note')
    if (filter === 'changes')  return events.filter(e => e.type === 'change')
    if (filter === 'files')    return events.filter(e => e.type === 'attachment')
    return events
  }, [events, filter])

  const buckets = useMemo(() => {
    const m = new Map()
    filtered.forEach(e => {
      const b = bucketFor(e.at)
      if (!m.has(b)) m.set(b, [])
      m.get(b).push(e)
    })
    // Preserve canonical bucket order
    return BUCKET_ORDER.filter(b => m.has(b)).map(b => [b, m.get(b)])
  }, [filtered])

  const counts = {
    all:      events.length,
    notes:    events.filter(e => e.type === 'note').length,
    changes:  events.filter(e => e.type === 'change').length,
    files:    events.filter(e => e.type === 'attachment').length,
  }

  if (!dealId) return null

  return (
    <div className="space-y-2">
      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-micro text-gray-400 flex items-center gap-1"><Filter size={10}/> Filter</span>
        {[
          { id: 'all',     label: 'All' },
          { id: 'notes',   label: 'Notes' },
          { id: 'changes', label: 'Changes' },
          { id: 'files',   label: 'Files' },
        ].map(o => {
          const active = filter === o.id
          const n = counts[o.id] || 0
          return (
            <button key={o.id} type="button"
              onClick={() => setFilter(o.id)}
              className={`text-micro px-2 py-0.5 rounded-full border transition-all ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}>
              {o.label} {n > 0 && <span className="opacity-70">{n}</span>}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12}/> {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading timeline…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-5 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
          <Clock size={18} className="mx-auto mb-1 opacity-40"/>
          <p className="text-xs">No activity yet.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {buckets.map(([bucket, list]) => (
            <div key={bucket}>
              <p className="sticky top-0 bg-white z-10 text-micro font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                {bucket} <span className="text-gray-300 font-normal">· {list.length}</span>
              </p>
              <div className="space-y-3 border-l border-gray-100 pl-3 ml-3">
                {list.map(ev => <EventRow key={ev.id} ev={ev}/>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
