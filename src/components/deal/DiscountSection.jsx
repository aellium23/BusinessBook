import { useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, RefreshCw as CounterIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'

function DiscountApprovalPanel({ deal, onSave }) {
  const { t } = useTranslation()
  const [approved, setApproved] = useState(deal.discount_approved ?? '')
  const [transfer, setTransfer] = useState(deal.transfer_price ?? '')
  const [note, setNote]         = useState(deal.discount_note || '')
  const [status, setStatus]     = useState(deal.discount_status || 'pending')
  const [saving, setSaving]     = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('deals').update({
      discount_approved: parseFloat(approved) || null,
      transfer_price:    parseFloat(transfer) || null,
      discount_note:     note,
      discount_status:   status,
    }).eq('id', deal.id)
    setSaving(false)
    onSave?.()
  }

  return (
    <div className="border-t border-gray-200 pt-3 space-y-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("df_vgt_response")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">{t("df_decision")}</label>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="pending">{t("df_pending")}</option>
            <option value="approved">{t("df_approved")}</option>
            <option value="counter">{t("df_counter")}</option>
            <option value="rejected">{t("df_rejected")}</option>
          </select>
        </div>
        <div>
          <label className="label">{t("df_approved_disc")}</label>
          <input className="input" type="number" min="0" max="100"
            value={approved} onChange={e => setApproved(e.target.value)}
            placeholder={t("df_placeholder_equipment")}/>
        </div>
        <div>
          <label className="label">{t("df_transfer")}</label>
          <input className="input" type="number"
            value={transfer} onChange={e => setTransfer(e.target.value)}
            placeholder={t("df_placeholder_price_dist")}/>
        </div>
      </div>
      <div>
        <label className="label">{t("df_note_dist")}</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)}
          placeholder={t("df_placeholder_reason")}/>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full btn-primary text-xs">
        {saving ? t("df_saving") : t("df_save")}
      </button>
    </div>
  )
}

export default function DiscountSection({ form, set, deal, isDistributor, onSaved, t }) {
  return (
    <div className={`rounded-xl p-4 space-y-3 border ${
      deal?.discount_status === 'approved' ? 'bg-green-50 border-green-200' :
      deal?.discount_status === 'rejected' ? 'bg-red-50 border-red-200' :
      deal?.discount_status === 'counter'  ? 'bg-amber-50 border-amber-200' :
      deal?.discount_status === 'pending'  ? 'bg-blue-50 border-blue-200' :
      'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {t("df_disc_request")}
        </p>
        {deal?.discount_status && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
            deal.discount_status === 'approved' ? 'bg-green-100 text-green-700' :
            deal.discount_status === 'rejected' ? 'bg-red-100 text-red-700' :
            deal.discount_status === 'counter'  ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {deal.discount_status === 'approved' && <CheckCircle size={10}/>}
            {deal.discount_status === 'rejected' && <XCircle size={10}/>}
            {deal.discount_status === 'counter'  && <CounterIcon size={10}/>}
            {deal.discount_status === 'pending'  && <AlertCircle size={10}/>}
            {deal.discount_status.charAt(0).toUpperCase() + deal.discount_status.slice(1)}
          </span>
        )}
      </div>

      {/* Distributor fills these */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">{t("df_list_price")}</label>
          <input className="input" type="number"
            value={form.list_price}
            onChange={e => set('list_price', e.target.value)}
            disabled={!isDistributor && !!deal?.id}
            placeholder={t("df_placeholder_price")}/>
        </div>
        <div>
          <label className="label">{t("df_disc_req")}</label>
          <input className="input" type="number" min="0" max="100"
            value={form.discount_requested}
            onChange={e => set('discount_requested', e.target.value)}
            disabled={!isDistributor && !!deal?.id}
            placeholder="e.g. 15"/>
        </div>
        <div>
          <label className="label">{t("df_your_price")}</label>
          <div className="input bg-gray-50 text-gray-600 text-sm">
            {form.list_price && form.discount_requested
              ? `€${(Number(form.list_price) * (1 - Number(form.discount_requested)/100)).toLocaleString('pt-PT', {maximumFractionDigits:0})}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Distributor note */}
      <div>
        <label className="label">
          {isDistributor ? t("df_your_note") : t("df_dist_note")}
        </label>
        <input className="input" value={form.discount_note_dist}
          onChange={e => set('discount_note_dist', e.target.value)}
          disabled={!isDistributor}
          placeholder={t("df_placeholder_discount")}/>
      </div>

      {/* Admin response - only visible/editable by admin/vgt */}
      {!isDistributor && deal?.discount_requested && (
        <DiscountApprovalPanel deal={deal} onSave={onSaved}/>
      )}

      {/* Distributor sees response */}
      {isDistributor && deal?.discount_status && deal.discount_status !== 'pending' && (
        <div className={`p-3 rounded-lg ${
          deal.discount_status === 'approved' ? 'bg-green-100' :
          deal.discount_status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'
        }`}>
          <p className="text-xs font-semibold text-gray-700 mb-1">{t("df_vgt_response_label")}</p>
          {deal.discount_approved !== null && (
            <p className="text-sm font-bold text-gray-900">
              {t("df_approved_pct")} {deal.discount_approved}%
              {deal.transfer_price && ` → Transfer price: €${deal.transfer_price.toLocaleString()}`}
            </p>
          )}
          {deal.discount_note && <p className="text-xs text-gray-600 mt-0.5">{deal.discount_note}</p>}
        </div>
      )}
    </div>
  )
}
