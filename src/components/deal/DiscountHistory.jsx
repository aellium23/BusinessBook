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
  const [brand, setBrand] = useState('')      // brand the request routes to
  const [dealBrands, setDealBrands] = useState([])  // brands present in this deal
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
    // Determine which brands are in this deal (from its products)
    const { data: dps } = await supabase.from('deal_products')
      .select('product_id').eq('deal_id', dealId)
    let brands = []
    if (dps?.length) {
      const ids = dps.map(d => d.product_id).filter(Boolean)
      if (ids.length) {
        const { data: prods } = await supabase.from('products').select('brand').in('id', ids)
        brands = [...new Set((prods || []).map(p => (p.brand || 'Fujifilm').trim()))]
        setDealBrands(brands)
        if (brands.length === 1) setBrand(brands[0])
      }
    }
    // Self-heal: if the deal has a single brand and a pending request was
    // created with a wrong/missing brand (e.g. product brand set later),
    // correct it so it routes to the right approver.
    if (brands.length === 1) {
      const stale = (data || []).filter(r => r.status === 'pending' && r.brand !== brands[0])
      if (stale.length) {
        await Promise.all(stale.map(r =>
          supabase.from('deal_discount_requests').update({ brand: brands[0] }).eq('id', r.id)
        ))
        const { data: refreshed } = await supabase.from('deal_discount_requests')
          .select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
        setRequests(refreshed || [])
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [dealId])

  const hasPending = requests.some(r => r.status === 'pending')

  async function handleSubmit() {
    if (!pct || parseFloat(pct) <= 0) return
    if (!justification.trim()) { showToast('Please provide a justification', 'error'); return }
    if (dealBrands.length > 1 && !brand) { showToast('Please select which brand this discount is for', 'error'); return }
    const reqBrand = brand || dealBrands[0] || 'Fujifilm'
    setSaving(true)
    try {
      await supabase.from('deal_discount_requests').insert({
        deal_id: dealId,
        requested_by: profile?.id,
        requested_pct: parseFloat(pct),
        justification: justification.trim(),
        brand: reqBrand,
      })
      await supabase.from('deals').update({ discount_status: 'pending', discount_requested: parseFloat(pct) }).eq('id', dealId)
      // Route notification: brand approvers first, fall back to admin/manager
      try {
        const { data: approvers } = await supabase.from('profiles')
          .select('id, approves_brands').eq('active', true)
        const brandApprovers = (approvers || []).filter(a =>
          Array.isArray(a.approves_brands) && a.approves_brands.includes(reqBrand)
        )
        let targets = brandApprovers.map(a => a.id)
        if (targets.length === 0) {
          // No dedicated approver for this brand → notify admins/managers
          const { data: admins } = await supabase.from('profiles')
            .select('id').in('role', ['admin', 'manager']).eq('active', true)
          targets = (admins || []).map(a => a.id)
        }
        if (targets.length) {
          await supabase.from('notifications').insert(
            targets.map(uid => ({
              user_id: uid,
              type: 'discount_request',
              title: `${reqBrand} discount request: ${dealClient || 'Deal'}`,
              body: `${profile?.full_name || 'Distributor'} requested ${pct}% discount on ${reqBrand} products`,
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
      const pct = (respStatus === 'approved' || respStatus === 'counter') ? (parseFloat(respPct) || null) : null
      const { error } = await supabase.rpc('respond_discount_request', {
        p_request_id: reqId,
        p_status: respStatus,
        p_approved_pct: pct,
        p_note: respNote || null,
      })
      if (error) throw error
      // Notification is created inside the RPC (SECURITY DEFINER)
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
          {dealBrands.length > 1 && (
            <div>
              <label className="label">Brand *</label>
              <select className="select" value={brand} onChange={e => setBrand(e.target.value)}>
                <option value="">— Select brand —</option>
                {dealBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">This deal has products from multiple brands. Pick which one the discount applies to.</p>
            </div>
          )}
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.cls}`}>
                  <Icon size={10}/> {st.label}
                </span>
                {req.brand && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{req.brand}</span>
                )}
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
              {req.status === 'pending' && (
                isAdmin ||
                profile?.role === 'manager' ||
                (Array.isArray(profile?.approves_brands) && req.brand && profile.approves_brands.includes(req.brand))
              ) && (
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
