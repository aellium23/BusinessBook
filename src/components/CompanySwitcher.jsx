import { useState, useRef, useEffect } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { useCompanyScope } from '../hooks/useCompanyScope'
import { useTranslation } from '../hooks/useTranslation'

/**
 * Which of my companies am I looking at.
 *
 * Only appears for somebody who acts for more than one — the CEO of TIMED Chile
 * who is also an officer of TIMED Peru. For everybody else there is nothing to
 * choose and so nothing to show: a control with one option is a control that
 * teaches people to ignore controls.
 *
 * It opens on all of them, because the first question of the day is how the
 * whole book is doing. Narrowing is deliberate, and remembered.
 */
export default function CompanySwitcher() {
  const { companies, scope, setScope, multi } = useCompanyScope()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!multi) return null

  const current = scope === 'all'
    ? t('cs_all')
    : (companies.find(c => c.id === scope)?.name || t('cs_all'))

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold
                   text-white/90 hover:text-white hover:bg-white/10 transition-colors max-w-36">
        <Building2 size={13} className="shrink-0"/>
        <span className="truncate">{current}</span>
        <ChevronDown size={12} className="shrink-0 opacity-70"/>
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-xl
                        border border-gray-100 z-50 overflow-hidden">
          <Option label={t('cs_all')} hint={t('cs_all_hint')}
            active={scope === 'all'} onPick={() => { setScope('all'); setOpen(false) }}/>
          <div className="border-t border-gray-100"/>
          {companies.map(c => (
            <Option key={c.id} label={c.name} hint={c.country}
              active={scope === c.id} onPick={() => { setScope(c.id); setOpen(false) }}/>
          ))}
        </div>
      )}
    </div>
  )
}

function Option({ label, hint, active, onPick }) {
  return (
    <button type="button" onClick={onPick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50
                  ${active ? 'bg-navy/5' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm truncate ${active ? 'font-semibold text-navy' : 'text-gray-700'}`}>
          {label}
        </span>
        {hint && <span className="block text-micro text-gray-400 truncate">{hint}</span>}
      </span>
      {active && <Check size={14} className="text-navy shrink-0"/>}
    </button>
  )
}
