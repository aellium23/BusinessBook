import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useNotifications } from '../hooks/useTasks'
import { useTranslation } from '../hooks/useTranslation'
import { targetOf } from '../lib/notificationLink'

/**
 * The bell, in the top bar where it can be seen.
 *
 * It used to live on the Tasks page, behind a button, on a screen about to-dos.
 * A distributor has no reason to open Tasks, so the answer to a discount they
 * asked for sat there unread — five of them, the oldest three months old, every
 * one delivered correctly and none of them seen. A notification nobody finds is
 * a notification that was not sent.
 *
 * Clicking one now goes where it points. Every notification in this app carries
 * a link_type and a link_id and nothing ever used them: the click marked it read
 * and left you where you were, which taught people that clicking was pointless.
 */

const TYPE_ICON = {
  task_assigned: '📋',
  task_due: '⏰',
  task_overdue: '🔴',
  tender_deadline: '📝',
  discount_request: '💬',
  discount_response: '💬',
  quotation_sent: '📄',
  quotation_response: '📄',
}

const LOCALE = { en: 'en-GB', es: 'es-ES', pt: 'pt-PT' }

export default function NotificationsBell({ className = '' }) {
  const { t, lang } = useTranslation()
  const navigate = useNavigate()
  const { unread, notifications, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function openNotification(n) {
    markRead(n.id)
    const to = targetOf(n)
    setOpen(false)
    if (to) navigate(to)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        aria-label={t('notif_title')}
        className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10
                   transition-colors">
        <Bell size={18}/>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white
                           text-micro font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[min(320px,calc(100vw-2rem))] bg-white rounded-2xl
                        shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-800">{t('notif_title')}</span>
            <div className="flex gap-2 items-center">
              <button onClick={markAllRead} className="text-micro text-blue-600 hover:underline">
                {t('notif_mark_all')}
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14}/>
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('notif_none')}</p>
            ) : notifications.map(n => (
              <button key={n.id} type="button" onClick={() => openNotification(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${!n.read ? 'bg-blue-50/40' : ''}`}>
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${!n.read ? 'text-gray-900' : 'text-gray-500'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-tiny text-gray-400 mt-0.5 truncate">{n.body}</p>}
                    <p className="text-micro text-gray-300 mt-1">
                      {new Date(n.created_at).toLocaleDateString(LOCALE[lang] || 'en-GB',
                        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1"/>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
