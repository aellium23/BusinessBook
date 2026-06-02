import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { formatK, Spinner, EmptyState } from '../components/ui'
import { CheckCircle, XCircle, RefreshCw, Clock, ShieldCheck } from 'lucide-react'

const STATUS = {
  pending:  { icon: Clock,       cls: 'bg-purple-100 text-purple-800', label: 'Pending' },
  approved: { icon: CheckCircle, cls: 'bg-green-100 text-green-700',   label: 'Approved' },
  rejected: { icon: XCircle,     cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
  counter:  { icon: RefreshCw,   cls: 'bg-amber-100 text-amber-700',   label: 'Counter' },
}

export default function Approvals() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')

  const myBrands = Array.isArray(profile?.approves_brands) ? profile.approves_brands : []

  async function load() {
    if (myBrands.length === 0) { setLoading(false); return }
    const { data } = await supabase.from('deal_discount_requests')
      .select('*, deal:deal_id(id, client, value_total, currency, bu, country)')
      .in('brand', myBrands)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  const filtered = useMemo(() => {
    if (tab === 'all') return requests
    return requests.filter(r => r.status === tab)
  }, [requests, tab])

  const counts = useMemo(() => ({
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  async function respond(req, status, approvedPct, note) {
    try {
      await supabase.from('deal_discount_requests').update({
        status,
        approved_pct: (status === 'approved' || status === 'counter') ? (parseFloat(approvedPct) || null) : null,
        response_note: note || null,
        responded_by: profile?.id,
        responded_at: new Date().toISOString(),
      }).eq('id', req.id)
      await supabase.from('deals').update({
        discount_status: status,
        discount_approved: (status === 'approved' || status === 'counter') ? (parseFloat(approvedPct) || null) : null,
      }).eq('id', req.deal_id)
      if (req.requested_by) {
        await supabase.from('notifications').insert({
          user_id: req.requested_by,
          type: 'discount_response',
          title: `Discount ${status}: ${req.deal?.client || 'Deal'}`,
          body: status === 'approved' ? `Your ${req.requested_pct}% discount was approved.`
            : status === 'counter' ? `Counter-offer: ${approvedPct}%.`
            : 'Your discount request was rejected.',
          link_type: 'deal',
          link_id: req.deal_id,
        }).catch(() => {})
      }
      showToast(`Request ${status}`, 'success')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  if (loading) return <Spinner/>

  if (myBrands.length === 0) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <EmptyState icon="🛡️" title="No approval brands assigned"
          description="An admin must assign you as a discount approver for one or more brands."/>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} className="text-navy"/> Discount Approvals
        </h1>
        <p className="text-sm text-gray-400">
          {myBrands.join(', ')} · {counts.pending} pending
        </p>
      </div>

      <div className="flex gap-1.5">
        {[
          { id: 'pending',  label: `Pending ${counts.pending}` },
          { id: 'approved', label: `Approved ${counts.approved}` },
          { id: 'rejected', label: `Rejected ${counts.rejected}` },
          { id: 'all',      label: 'All' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
              tab === t.id ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="✅" title="Nothing here" description="No requests in this status."/>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => <ApprovalCard key={req.id} req={req} onRespond={respond}/>)}
        </div>
      )}
    </div>
  )
}

function ApprovalCard({ req, onRespond }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('approved')
  const [pct, setPct] = useState(String(req.requested_pct))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const st = STATUS[req.status] || STATUS.pending
  const Icon = st.icon

  async function submit() {
    setSaving(true)
    await onRespond(req, status, pct, note)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${req.status === 'pending' ? 'border-purple-200 bg-purple-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.cls}`}>
          <Icon size={10}/> {st.label}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{req.brand}</span>
        <span className="text-sm font-bold text-gray-900">{req.requested_pct}%</span>
        <span className="text-[10px] text-gray-400 ml-auto">
          {new Date(req.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">{req.deal?.client || 'Unknown client'}</p>
        <p className="text-[10px] text-gray-400">
          {req.deal?.country} · {formatK(req.deal?.value_total || 0)}
        </p>
      </div>

      {req.justification && (
        <p className="text-xs text-gray-600 bg-white rounded px-2 py-1.5 border border-gray-100">
          {req.justification}
        </p>
      )}

      {req.status !== 'pending' && (
        <div className={`rounded px-2 py-1.5 text-xs ${
          req.status === 'approved' ? 'bg-green-50 text-green-700' :
          req.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {(req.status === 'approved' || req.status === 'counter') && req.approved_pct != null && (
            <p className="font-semibold">{req.status === 'approved' ? 'Approved' : 'Counter'}: {req.approved_pct}%</p>
          )}
          {req.response_note && <p className="mt-0.5">{req.response_note}</p>}
        </div>
      )}

      {req.status === 'pending' && (
        open ? (
          <div className="border-t pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">Decision</label>
                <select className="select text-xs" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="approved">Approve</option>
                  <option value="counter">Counter-offer</option>
                  <option value="rejected">Reject</option>
                </select>
              </div>
              {(status === 'approved' || status === 'counter') && (
                <div>
                  <label className="text-[10px] text-gray-500">{status === 'counter' ? 'Counter %' : 'Approved %'}</label>
                  <input className="input text-xs" type="number" min="0" max="100"
                    value={pct} onChange={e => setPct(e.target.value)}/>
                </div>
              )}
            </div>
            <input className="input text-xs" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Response note (optional)"/>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={submit} disabled={saving} className="btn-primary text-xs flex-1">
                {saving ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="btn-primary text-xs w-full">
            Respond
          </button>
        )
      )}
    </div>
  )
}
