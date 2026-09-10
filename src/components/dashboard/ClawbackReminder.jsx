import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'
import { clawbackSummary, daysOverdue } from '../../lib/discountExpiry'
import { formatK } from '../ui'
import { RotateCcw, Clock } from 'lucide-react'

/**
 * Lighthouse discounts whose reference never arrived.
 *
 * Ten points off, bought with a named clinical champion, site visits and a
 * published case study. Without something counting the twelve months it is a
 * price cut with a story attached — and nobody counts twelve months in their
 * head, which is why the discount is nominally clawed back and never actually
 * is.
 *
 * Silent while every reference is either delivered or still inside its year: a
 * dashboard row that is always there stops being read.
 */
export default function ClawbackReminder({ selectedBU = '' }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])

  useEffect(() => {
    let alive = true
    supabase.from('discount_reason_clawbacks').select('*')
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [])

  const s = useMemo(() => clawbackSummary(rows, { bu: selectedBU }), [rows, selectedBU])
  if (s.deals <= 0) return null

  const worst = [...rows]
    .filter(r => (!selectedBU || r.bu === selectedBU) && daysOverdue(r.due_at) > 0)
    .sort((a, b) => daysOverdue(b.due_at) - daysOverdue(a.due_at))
    .slice(0, 3)

  return (
    <div className="border border-red-200 bg-red-50/60 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-micro text-red-900 uppercase tracking-wide font-semibold inline-flex items-center gap-1">
            <RotateCcw size={11}/> {t('cb_title')}
          </p>
          <p className="text-xl font-bold text-red-900 tabular-nums">{formatK(s.value)}</p>
          <p className="text-micro text-red-800">
            {s.deals} {t('cb_deals')}
            {s.oldestDays > 0 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Clock size={10}/> {s.oldestDays} {t('cb_days_over')}
              </span>
            )}
          </p>
        </div>
        {s.dueSoon > 0 && (
          <p className="text-micro text-red-700 text-right">
            {s.dueSoon} {t('cb_still_running')}
          </p>
        )}
      </div>

      {/* Named, because "three deals" gets deferred and "Hospital de Braga,
          92 days" gets a phone call. */}
      <div className="pt-1.5 border-t border-red-200 space-y-0.5">
        {worst.map(r => (
          <div key={r.id} className="flex justify-between gap-3 text-micro text-red-900">
            <span className="truncate">{r.client}</span>
            <span className="tabular-nums flex-shrink-0">
              {daysOverdue(r.due_at)} {t('cb_days')} · {formatK(Number(r.value_at_risk) || 0)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-micro text-red-800">{t('cb_hint')}</p>
    </div>
  )
}
