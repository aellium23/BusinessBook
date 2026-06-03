import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Send, RefreshCw, Check, Clock, Mail } from 'lucide-react'

export default function AcceptanceSection({ dealId, client, t }) {
  const { profile } = useAuth()
  const [acceptance, setAcceptance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  const fetch = useCallback(async () => {
    if (!dealId) return
    const { data } = await supabase
      .from('deal_acceptances')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setAcceptance(data || null)
    setLoading(false)
  }, [dealId])

  useEffect(() => { fetch() }, [fetch])

  async function sendAcceptance() {
    if (!email) return
    setSending(true)
    const { data, error } = await supabase.from('deal_acceptances').insert({
      deal_id: dealId,
      client_email: email.trim(),
      client_name: name.trim() || client || null,
      created_by: profile?.id,
    }).select().single()

    if (error) { alert(error.message); setSending(false); return }

    // Update deal delivery_status
    await supabase.from('deals').update({ delivery_status: 'pending' }).eq('id', dealId)

    // Open email client with pre-filled acceptance email
    const acceptUrl = `${window.location.origin}/accept/${data.token}`
    const subject = encodeURIComponent(`Delivery Acceptance — ${client}`)
    const body = encodeURIComponent(
      `Dear ${name || client},\n\n` +
      `Please confirm the delivery of your order by clicking the link below:\n\n` +
      `${acceptUrl}\n\n` +
      `If you have any questions, please don't hesitate to contact us.\n\n` +
      `Best regards,\n${profile?.full_name || 'Fujifilm Healthcare'}`
    )
    window.open(`mailto:${email.trim()}?subject=${subject}&body=${body}`, '_self')

    setAcceptance(data)
    setShowForm(false)
    setSending(false)
  }

  async function sendReminder() {
    if (!acceptance) return
    setSending(true)
    await supabase.from('deal_acceptances').update({
      reminder_count: (acceptance.reminder_count || 0) + 1,
      last_reminder_at: new Date().toISOString(),
    }).eq('id', acceptance.id)

    const acceptUrl = `${window.location.origin}/accept/${acceptance.token}`
    const subject = encodeURIComponent(`Reminder: Delivery Acceptance — ${client}`)
    const body = encodeURIComponent(
      `Dear ${acceptance.client_name || client},\n\n` +
      `This is a friendly reminder to confirm the delivery of your order.\n\n` +
      `Please click the link below to confirm:\n${acceptUrl}\n\n` +
      `Best regards,\n${profile?.full_name || 'Fujifilm Healthcare'}`
    )
    window.open(`mailto:${acceptance.client_email}?subject=${subject}&body=${body}`, '_self')

    setAcceptance(prev => ({ ...prev, reminder_count: (prev.reminder_count || 0) + 1, last_reminder_at: new Date().toISOString() }))
    setSending(false)
  }

  if (loading) return null

  const isAccepted = acceptance?.accepted_at
  const isPending = acceptance && !acceptance.accepted_at

  return (
    <div className={`rounded-xl p-3 space-y-2 ${
      isAccepted ? 'bg-green-50 border border-green-200'
        : isPending ? 'bg-amber-50 border border-amber-200'
        : 'bg-gray-50 border border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAccepted ? (
            <span className="badge-success"><Check size={10}/> {t('df_acceptance_confirmed')}</span>
          ) : isPending ? (
            <span className="badge-warning"><Clock size={10}/> {t('df_acceptance_pending')}</span>
          ) : (
            <span className="badge-neutral"><Mail size={10}/> {t('df_acceptance_not_sent')}</span>
          )}
          <p className="text-xs font-semibold text-gray-700">{t('df_acceptance_title')}</p>
        </div>
      </div>

      {isAccepted && (
        <p className="text-micro text-green-700">
          {t('df_acceptance_confirmed_on')} {new Date(acceptance.accepted_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {acceptance.accepted_by_name && ` — ${acceptance.accepted_by_name}`}
        </p>
      )}

      {isPending && (
        <div className="flex items-center justify-between">
          <p className="text-micro text-amber-700">
            {t('df_acceptance_sent_to')} {acceptance.client_email}
            {acceptance.reminder_count > 0 && ` · ${acceptance.reminder_count} ${t('df_acceptance_reminders')}`}
          </p>
          <button onClick={sendReminder} disabled={sending}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 min-h-tap px-2">
            <RefreshCw size={11}/> {t('df_acceptance_resend')}
          </button>
        </div>
      )}

      {!acceptance && !showForm && (
        <button onClick={() => setShowForm(true)}
          className="btn-primary text-xs w-full">
          <Send size={12}/> {t('df_acceptance_send')}
        </button>
      )}

      {showForm && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-micro text-gray-500">{t('df_acceptance_email')}</label>
              <input className="input text-xs py-1" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="client@hospital.pt"/>
            </div>
            <div>
              <label className="text-micro text-gray-500">{t('df_acceptance_name')}</label>
              <input className="input text-xs py-1" value={name}
                onChange={e => setName(e.target.value)} placeholder={client}/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary text-xs flex-1">{t('df_cancel')}</button>
            <button onClick={sendAcceptance} disabled={sending || !email}
              className="btn-primary text-xs flex-1">
              <Send size={11}/> {sending ? t('df_saving') : t('df_acceptance_send')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
