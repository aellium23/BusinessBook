import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'
import { riskSummary } from '../../lib/discountRouting'
import { formatK } from '../ui'
import { AlertTriangle, Clock } from 'lucide-react'

/**
 * How much of the pipeline's margin is waiting on somebody else.
 *
 * Split by who holds it up, because the two halves call for different action.
 * `unfiled` is a discount promised to a customer that nobody has asked the
 * supplier for — ours to fix, today. `awaiting` has been asked and all we can
 * do is chase. Rolled together they would read as one vague risk and neither
 * would get done.
 *
 * Silent when nothing is open: a dashboard row that is always there stops being
 * read.
 */
export default function DiscountRisk({ selectedBU = '' }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])

  useEffect(() => {
    let alive = true
    supabase.from('deal_open_discounts').select('*')
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [])

  const risk = useMemo(() => riskSummary(rows, { bu: selectedBU }), [rows, selectedBU])
  if (risk.total <= 0) return null

  const quarters = Object.entries(risk.byQuarter)
    .filter(([k]) => k !== 'unscheduled')
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-micro text-amber-900 uppercase tracking-wide font-semibold">
            {t('dr_title')}
          </p>
          <p className="text-xl font-bold text-amber-900 tabular-nums">{formatK(risk.total)}</p>
          <p className="text-micro text-amber-800">
            {risk.deals} {t('dr_deals')}
            {risk.oldestDays > 0 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Clock size={10}/> {risk.oldestDays} {t('dr_days_oldest')}
              </span>
            )}
          </p>
        </div>
        {risk.unfiled > 0 && (
          <div className="text-right">
            <p className="text-micro text-red-700 font-semibold inline-flex items-center gap-1">
              <AlertTriangle size={11}/> {t('dr_unfiled')}
            </p>
            <p className="text-base font-bold text-red-700 tabular-nums">{formatK(risk.unfiled)}</p>
            <p className="text-micro text-red-600">{risk.unfiledDeals} {t('dr_deals')}</p>
          </div>
        )}
      </div>

      {quarters.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 border-t border-amber-200 text-micro text-amber-900">
          {quarters.map(([q, v]) => (
            <span key={q}>{q} <strong className="tabular-nums">{formatK(v)}</strong></span>
          ))}
          {risk.byQuarter.unscheduled > 0 && (
            <span className="text-amber-700">
              {t('dr_unscheduled')} <strong className="tabular-nums">{formatK(risk.byQuarter.unscheduled)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
