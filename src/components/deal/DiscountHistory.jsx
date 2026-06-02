import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../Toast'
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Plus, Send, Clock } from 'lucide-react'

const STATUS_STYLE = {
  pending:  { icon: Clock,       cls: 'bg-purple-100 text-purple-800', label: 'Pending' },
  approved: { icon: CheckCircle, cls: 'bg-green-100 text-green-700',   label: 'Approved' },
  rejected: { icon: XCircle,     cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
  counter:  { icon: RefreshCw,   cls: 'bg-amber-100 text-amber-700',   label: 'Counter-offer' },
}

export default function DiscountHistory({ dealId, dealClient, isDistributor }) {
  const { profile, isAdmin } = useAuth()
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [pct, setPct] = useState('')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)

  // Admin response state
  const [respondingId, setRespondingId] = useState(null)
  const [respStatus, setRespStatus] = useState('approved')
  const [respPct, setRespPct] = useState('')
  const [respNote, setRespNote] = useState('')
  const [respSaving, setRespSaving] = useState(false)

  async function load() {
    if (!dealId) { setLoading(false); return }
    const { data } = await supabase.from('deal_discount_requests')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [dealId])

  const hasPending = requests.some(r => r.status === 'pending')

  async function handleSubmit() {
    if (!pct || parseFloat(pct) <= 0) return
    if (!justification.trim()) { showToast('Please provide a justification', 'error'); return }
    setSaving(true)
    try {
      await supabase.from('deal_discount_requests').insert({
        deal_id: dealId,
        requested_by: profile?.id,
        requested_pct: parseFloat(pct),
        justification: justification.trim(),
      })
      // Update deal discount_status to pending
      await supabase.from('deals').update({ discount_status: 'pending', discount_requested: parseFloat(pct) }).eq('id', dealId)
      // Notify admins
      try {
        const { data: admins } = await supabase.from('profiles')
          .select('id').in('role', ['admin', 'manager']).eq('active', true)
        if (admins?.length) {
          await supabase.from('notifications').insert(
            admins.map(a => ({
              user_id: a.id,
              type: 'discount_request',
              title: `Discount request: ${dealClient || 'Deal'}`,
              body: `${profile?.full_name || 'Distributor'} requested ${pct}% discount`,
              link_type: 'deal',
              link_id: dealId,
            }))
          )
        }
      } catch (_) {}
      setPct(''); setJustification(''); setShowForm(false)
      load()
    } catch (e) { showToast(e.message, 'error') }
    setSaving(false)
  }

  async function handleRespond(reqId) {
    setRespSaving(true)
    try {
      await supabase.from('deal_discount_requests').update({
        status: respStatus,
        approved_pct: respStatus === 'approved' || respStatus === 'counter' ? (parseFloat(respPct) || null) : null,
        response_note: respNote || null,
        responded_by: profile?.id,
        responded_at: new Date().toISOString(),
      }).eq('id', reqId)
      // Update deal-level status
      await supabase.from('deals').update({
        discount_status: respStatus,
        discount_approved: respStatus === 'approved' || respStatus === 'counter' ? (parseFloat(respPct) || null) : null,
      }).eq('id', dealId)
      // Notify distributor
      const req = requests.find(r => r.id === reqId)
      if (req?.requested_by) {
        try {
          await supabase.from('notifications').insert({
            user_id: req.requested_by,
            type: 'discount_response',
            title: `Discount ${respStatus}: ${dealClient || 'Deal'}`,
            body: respStatus === 'approved' ? `Your ${req.requested_pct}% discount was approved.`
              : respStatus === 'counter' ? `Counter-offer: ${respPct}% discount.`
              : 'Your discount request was rejected.',
            link_type: 'deal',
            link_id: dealId,
          })
        } catch (_) {}
      }
      setRespondingId(null); setRespStatus('approved'); setRespPct(''); setRespNote('')
      load()
    } catch (e) { showToast(e.message, 'error') }
    setRespSaving(false)
  }

  if (loading) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Discount Requests ({requests.length})
        </p>
        {isDistributor && !hasPending && (
          <button onClick={() => setShowForm(f => !f)}
            className="btn-secondary text-xs gap-1">
            <Plus size={12}/> {showForm ? 'Cancel' : 'New request'}
          </button>
        )}
        {isDistributor && hasPending && (
          <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-1 rounded-full font-semibold">
            Awaiting response
          </span>
        )}
      </div>

      {/* New request form (distributor) */}
      {showForm && isDistributor && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
          <div>
            <label className="label">Requested discount (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.1"
              value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 15"/>
          </div>
          <div>
            <label className="label">Justification *</label>
            <textarea className="input min-h-[100px] resize-y" rows={4}
              value={justification} onChange={e => setJustification(e.target.value)}
              placeholder="Explain why: competitive situation, client budget, strategic account, volume commitment…"/>
            <p className="text-[10px] text-gray-400 mt-1">Detailed justification speeds up approval.</p>
          </div>
          <button onClick={handleSubmit} disabled={saving || !pct || !justification.trim()}
            className="btn-primary text-xs w-full gap-1 disabled:opacity-40">
            <Send size={12}/> {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      )}

      {/* Request timeline */}
      {requests.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 text-center py-3">No discount requests yet.</p>
      )}

      <div className="space-y-2">
        {requests.map(req => {
          const st = STATUS_STYLE[req.status] || STATUS_STYLE.pending
          const Icon = st.icon
          const isResponding = respondingId === req.id
          return (
            <div key={req.id} className={`rounded-lg border p-3 space-y-2 ${
              req.status === 'pending' ? 'border-purple-200 bg-purple-50/50' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.cls}`}>
                  <Icon size={10}/> {st.label}
                </span>
                <span className="text-sm font-bold text-gray-900">{req.requested_pct}%</span>
                <span className="text-[10px] text-gray-400 ml-auto">
                  {new Date(req.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {req.justification && (
                <p className="text-xs text-gray-600 bg-white rounded px-2 py-1.5 border border-gray-100">
                  {req.justification}
                </p>
              )}

              {/* Response details */}
              {req.status !== 'pending' && (
                <div className={`rounded px-2 py-1.5 text-xs ${
                  req.status === 'approved' ? 'bg-green-50 text-green-700' :
                  req.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {(req.status === 'approved' || req.status === 'counter') && req.approved_pct != null && (
                    <p className="font-semibold">{req.status === 'approved' ? 'Approved' : 'Counter-offer'}: {req.approved_pct}%</p>
                  )}
                  {req.response_note && <p className="mt-0.5">{req.response_note}</p>}
                  {req.responded_at && (
                    <p className="text-[10px] opacity-70 mt-1">
                      {new Date(req.responded_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
              )}

              {/* Admin response form */}
              {req.status === 'pending' && (isAdmin || profile?.role === 'manager') && (
                isResponding ? (
                  <div className="border-t pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">Decision</label>
                        <select className="select text-xs" value={respStatus} onChange={e => setRespStatus(e.target.value)}>
                          <option value="approved">Approve</option>
                          <option value="counter">Counter-offer</option>
                          <option value="rejected">Reject</option>
                        </select>
                      </div>
                      {(respStatus === 'approved' || respStatus === 'counter') && (
                        <div>
                          <label className="text-[10px] text-gray-500">{respStatus === 'counter' ? 'Counter %' : 'Approved %'}</label>
                          <input className="input text-xs" type="number" min="0" max="100"
                            value={respPct} onChange={e => setRespPct(e.target.value)}
                            placeholder={String(req.requested_pct)}/>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">Note</label>
                      <input className="input text-xs" value={respNote} onChange={e => setRespNote(e.target.value)}
                        placeholder="Optional response note"/>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setRespondingId(null)} className="btn-secondary text-xs flex-1">Cancel</button>
                      <button onClick={() => handleRespond(req.id)} disabled={respSaving}
                        className="btn-primary text-xs flex-1">
                        {respSaving ? 'Saving…' : 'Submit'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setRespondingId(req.id); setRespPct(String(req.requested_pct)) }}
                    className="btn-primary text-xs w-full">
                    Respond to this request
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
