import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTranslation } from '../hooks/useTranslation'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { formatK, Spinner, EmptyState } from '../components/ui'
import { approvalImpact } from '../lib/approvalImpact'
import { askAgain as askAgainRequest } from '../lib/discountRequests'
import { CheckCircle, XCircle, RefreshCw, Clock, ShieldCheck } from 'lucide-react'
import CostRequestWorklist from '../components/approvals/CostRequestWorklist'

const STATUS = {
  pending:  { icon: Clock,       cls: 'bg-purple-100 text-purple-800', label: 'Pending' },
  approved: { icon: CheckCircle, cls: 'bg-green-100 text-green-700',   label: 'Approved' },
  rejected: { icon: XCircle,     cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
  counter:  { icon: RefreshCw,   cls: 'bg-amber-100 text-amber-700',   label: 'Counter' },
}

export default function Approvals() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [channel, setChannel] = useState({})

  const myBrands = Array.isArray(profile?.approves_brands) ? profile.approves_brands : []
  // Three ways to arrive here, and only one of them is a queue.
  //
  // An admin or manager answers for everything — the RPC already lets them, and
  // a page that showed them nothing because no brand was ticked was hiding work
  // they are responsible for.
  //
  // A brand approver answers for their brands.
  //
  // Everybody else asks rather than answers: a partner sees the replies to
  // their own requests, and no button to decide them.
  const canApproveAll = ['admin', 'manager'].includes(profile?.role)
  const asRequester = !canApproveAll && myBrands.length === 0

  async function load() {
    let q = supabase.from('deal_discount_requests')
      .select('*, deal:deal_id(id, client, value_total, currency, bu, country)')
      .order('created_at', { ascending: false })
    if (asRequester) q = q.eq('requested_by', profile?.id)
    else if (myBrands.length) q = q.in('brand', myBrands)
    const { data } = await q
    setRequests(data || [])

    // What the partner pays us and what their customer pays. Without the
    // second, an approver is looking at a percentage and guessing at whether
    // the deal behind it is worth funding.
    const dealIds = [...new Set((data || []).map(r => r.deal_id).filter(Boolean))]
    if (dealIds.length) {
      const { data: ch } = await supabase.from('deal_channel')
        .select('deal_id, partner_transfer, end_customer_price')
        .in('deal_id', dealIds)
      setChannel(Object.fromEntries((ch || []).map(c => [c.deal_id, c])))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  const filtered = useMemo(() => {
    if (tab === 'all') return requests
    // "Open" groups pending + counter (both still need attention)
    if (tab === 'pending') return requests.filter(r => r.status === 'pending' || r.status === 'counter')
    return requests.filter(r => r.status === tab)
  }, [requests, tab])

  const counts = useMemo(() => ({
    pending:  requests.filter(r => r.status === 'pending' || r.status === 'counter').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  /** The requester takes the counter-offer as it stands. */
  async function acceptCounter(req) {
    const { error } = await supabase.rpc('accept_counter_offer', { p_request_id: req.id })
    if (error) { showToast(error.message, 'error'); return }
    showToast('Counter-offer accepted', 'success')
    load()
  }

  /**
   * Another round. The rules live in lib/discountRequests, which is also what
   * the quote screen calls: this page had its own copy of the same insert, and
   * a negotiation whose rules exist in two copies drifts into two
   * negotiations — the copy here never told the approver a new round had
   * arrived.
   */
  async function askAgain(req, pct, note) {
    const { error } = await askAgainRequest(req, pct, note)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Request sent', 'success')
    load()
  }

  async function respond(req, status, approvedPct, note) {
    try {
      const pct = (status === 'approved' || status === 'counter') ? (parseFloat(approvedPct) || null) : null
      const { error } = await supabase.rpc('respond_discount_request', {
        p_request_id: req.id,
        p_status: status,
        p_approved_pct: pct,
        p_note: note || null,
      })
      if (error) throw error
      showToast(`Request ${status}`, 'success')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  if (loading) return <Spinner/>

  if (myBrands.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        <CostRequestWorklist/>
        <EmptyState icon="🛡️" title={t('ap_no_brands')}
          description="An admin must assign you as a discount approver for one or more brands."/>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <CostRequestWorklist/>

      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} className="text-navy"/> Discount Approvals
        </h1>
        <p className="text-sm text-gray-400">
          {asRequester ? 'Your requests'
            : myBrands.length ? myBrands.join(', ')
            : 'All brands'} · {counts.pending} pending
        </p>
      </div>

      <div className="flex gap-1.5">
        {[
          { id: 'pending',  label: `Open ${counts.pending}` },
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
        <EmptyState icon="✅" title={t('ap_nothing')} description={t('ap_nothing_desc')}/>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <ApprovalCard key={req.id} req={req} channel={channel[req.deal_id]}
              readOnly={asRequester} onRespond={respond}
              onAccept={acceptCounter} onAskAgain={askAgain}/>
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalCard({ req, onRespond, channel, readOnly, onAccept, onAskAgain }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [askPct, setAskPct] = useState('')
  const [askNote, setAskNote] = useState('')
  const [status, setStatus] = useState('approved')
  const [pct, setPct] = useState(String(req.requested_pct))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const st = STATUS[req.status] || STATUS.pending
  const Icon = st.icon

  // The two sides of the decision, moving with whatever is typed in the box:
  // what it costs us, and what it does for them.
  const impact = approvalImpact({
    transfer: channel?.partner_transfer,
    endCustomerPrice: channel?.end_customer_price,
    requestedPct: open ? pct : req.requested_pct,
  })

  // Approving less than was asked for is not approving, it is countering — and
  // the difference matters downstream: a counter waits for the partner to
  // accept, an approval does not. Deciding it from the figure rather than from
  // the dropdown means nobody has to remember to change both.
  const lowered = Number(pct) < Number(req.requested_pct)
  const decision = status === 'approved' && lowered ? 'counter' : status

  async function submit() {
    setSaving(true)
    await onRespond(req, decision, pct, note)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${req.status === 'pending' ? 'border-purple-200 bg-purple-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-micro font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.cls}`}>
          <Icon size={10}/> {st.label}
        </span>
        <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{req.brand}</span>
        <span className="text-sm font-bold text-gray-900">{req.requested_pct}%</span>
        <span className="text-micro text-gray-400 ml-auto">
          {new Date(req.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">{req.deal?.client || 'Unknown client'}</p>
        <p className="text-micro text-gray-400">
          {req.deal?.country} · {formatK(req.deal?.value_total || 0)}
        </p>
        {/* One line of a deal is being decided, and some deals are worth
            reading whole first. This opens the project's own breakdown. */}
        {req.deal?.id && (
          <button type="button" onClick={() => navigate(`/deals?deal=${req.deal.id}`)}
            className="text-micro font-semibold text-navy underline underline-offset-2 mt-0.5">
            See the whole project
          </button>
        )}
      </div>

      {impact.known && (
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 space-y-1">
          <div className="grid grid-cols-2 gap-2 text-micro">
            <div>
              <p className="text-gray-500">{t('ap_our_revenue')}</p>
              <p className="text-sm font-bold text-navy tabular-nums">
                {formatK(impact.ourRevenueIfGranted)}
              </p>
              {impact.given > 0 && (
                <p className="text-red-700 font-semibold tabular-nums">−{formatK(impact.given)}</p>
              )}
            </div>
            <div>
              <p className="text-gray-500">{t('ap_partner_margin')}</p>
              <p className={`text-sm font-bold tabular-nums ${
                impact.partnerMarginIfGranted < 0 ? 'text-red-700' : 'text-green-700'
              }`}>
                {formatK(impact.partnerMarginIfGranted)} · {impact.partnerMarginPctIfGranted}%
              </p>
              {impact.pct > 0 && (
                <p className="text-gray-400 tabular-nums">from {impact.partnerMarginPct}%</p>
              )}
            </div>
          </div>
          <p className="text-micro text-gray-400">
            Customer pays {formatK(impact.endCustomerPrice)}
          </p>
          {impact.underwater && (
            <p className="text-micro text-red-700 font-semibold">
              The partner is quoting below what they pay us.
            </p>
          )}
        </div>
      )}

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

      {/* The requester's side of a counter-offer. The buttons existed, in the
          discount history inside the long form — which is two screens from
          where the answer arrives. This is where they see the reply, so this is
          where the reply can be answered. */}
      {readOnly && req.status === 'counter' && (
        asking ? (
          <div className="border-t pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-micro text-gray-500">{t('ap_ask_pct')}</label>
                <input className="input text-xs" type="number" min="0" max="100"
                  value={askPct} onChange={e => setAskPct(e.target.value)}
                  placeholder={String(req.requested_pct)}/>
              </div>
            </div>
            <input className="input text-xs" value={askNote} onChange={e => setAskNote(e.target.value)}
              placeholder={t('ap_ask_note_ph')}/>
            <div className="flex gap-2">
              <button onClick={() => setAsking(false)} className="btn-secondary text-xs flex-1">{t('cancel')}</button>
              <button className="btn-primary text-xs flex-1"
                disabled={!askPct || !askNote.trim()}
                onClick={async () => { await onAskAgain(req, askPct, askNote); setAsking(false) }}>
                Send new request
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setAsking(true)} className="btn-secondary text-xs flex-1">
              Ask again
            </button>
            <button onClick={() => onAccept(req)} className="btn-primary text-xs flex-1">
              Accept {req.approved_pct}%
            </button>
          </div>
        )
      )}

      {!readOnly && (req.status === 'pending' || req.status === 'counter') && (
        open ? (
          <div className="border-t pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-micro text-gray-500">{t('ap_decision')}</label>
                <select className="select text-xs" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="approved">{t('ap_approve')}</option>
                  <option value="counter">{t('ap_counter')}</option>
                  <option value="rejected">{t('ap_reject')}</option>
                </select>
              </div>
              {(status === 'approved' || status === 'counter') && (
                <div>
                  <label className="text-micro text-gray-500">
                    {decision === 'counter' ? 'Counter %' : 'Approved %'}
                  </label>
                  <input className="input text-xs" type="number" min="0" max="100"
                    value={pct} onChange={e => setPct(e.target.value)}/>
                </div>
              )}
            </div>
            {status === 'approved' && lowered && (
              <p className="text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {req.requested_pct}% was asked for and this grants {pct || 0}%, so it goes as a
                counter-offer: the partner has to accept it before it is final.
              </p>
            )}
            <input className="input text-xs" value={note} onChange={e => setNote(e.target.value)}
              placeholder={t('ap_note_ph')}/>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary text-xs flex-1">{t('cancel')}</button>
              <button onClick={submit} disabled={saving} className="btn-primary text-xs flex-1">
                {saving ? 'Saving…'
                  : decision === 'counter' ? 'Send counter-offer'
                  : decision === 'rejected' ? 'Reject' : 'Approve'}
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
