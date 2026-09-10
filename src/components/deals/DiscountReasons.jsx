import { useState } from 'react'
import { DISCOUNT_REASONS, NOT_EVIDENCE, DEAL_DISCOUNT_CAP_PCT } from '../../lib/dealDiscounts'
import { useTranslation } from '../../hooks/useTranslation'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Why this CWM deal is discounted — the part the price ladder cannot answer.
 *
 * Each reason is worth a published number and names the proof it needs. A
 * reason ticked with nothing attached is shown as worth zero and stops the
 * quote, which is deliberate: under a protected partner margin nobody pays for
 * a discount out of their own pocket any more, so evidence is the only brake
 * left on asking for one.
 *
 * The list of things that are NOT evidence is on screen with the rest, because
 * those are the sentences that actually get offered, and a rep who reads
 * "they are a strategic customer" here recognises it in their own draft.
 */
export default function DiscountReasons({ value, onChange, plan, years, bundleProducts = [] }) {
  const { t } = useTranslation()
  const [openNot, setOpenNot] = useState(false)

  const set = (key, patch) =>
    onChange({ ...(value || {}), [key]: { ...((value || {})[key] || {}), ...patch } })

  /**
   * Ticking a row asks for its proof. The bundle is the one proof this screen
   * already holds — the products are on this order form, in front of us — so it
   * is written into the cell rather than demanded from the rep, and stays
   * editable like any other.
   */
  function toggle(key, on) {
    const current = (value || {})[key] || {}
    const patch = { on }
    if (on && key === 'bundle' && !String(current.evidence || '').trim() && bundleProducts.length) {
      patch.evidence = bundleProducts.join(' + ')
    }
    set(key, patch)
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
      <div>
        <p className="text-xs font-bold text-navy uppercase tracking-wide">{t('dd_title')}</p>
        <p className="text-micro text-gray-500">{t('dd_hint')}</p>
      </div>

      <div className="space-y-1.5">
        {plan.rows.map(row => {
          const r = row.reason
          const invalid = row.on && (!row.available || !row.hasEvidence)
          return (
            <div key={row.key} className={`rounded-lg px-2 py-1.5 ${
              invalid ? 'bg-red-50 border border-red-200'
                : row.counts ? 'bg-green-50/60 border border-green-200'
                : 'border border-transparent'
            }`}>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 flex-1 min-w-0 min-h-tap cursor-pointer">
                  <input type="checkbox" checked={Boolean(row.on)}
                    onChange={e => toggle(row.key, e.target.checked)}/>
                  <span className="text-xs text-gray-800 truncate">{t(`dd_r_${row.key}`)}</span>
                </label>

                {/* Every reason is a ceiling, not a fixed price: a tender is
                    worth up to ten points and a rep who needs five quotes five.
                    An empty box asks for the whole entitlement. */}
                <input className="input text-xs py-1 text-right w-14" type="number"
                  min="0" max={row.ceiling} style={{ fontSize: '16px' }}
                  value={(value?.[row.key]?.pct) ?? ''} placeholder={String(row.ceiling)}
                  disabled={!row.on}
                  onChange={e => set(row.key, { pct: e.target.value })}/>
                <span className="text-micro text-gray-400 italic w-12 flex-shrink-0">
                  {t('dd_max')} {row.ceiling}%
                </span>
              </div>

              {row.on && r.requiresBidders && (
                <div className="flex items-center gap-2 mt-1 pl-6">
                  <span className="text-micro text-gray-500">{t('dd_bidders')}</span>
                  <input className="input text-xs py-1 text-right w-14" type="number" min="0"
                    style={{ fontSize: '16px' }} value={value?.[row.key]?.bidders ?? ''}
                    placeholder={String(r.requiresBidders)}
                    onChange={e => set(row.key, { bidders: e.target.value })}/>
                  {!row.available && (
                    <span className="text-micro text-red-700 font-semibold">{t('dd_unavail_tender')}</span>
                  )}
                </div>
              )}

              {row.on && r.requiresYears && !row.available && (
                <p className="text-micro text-red-700 font-semibold mt-1 pl-6">
                  {t('dd_unavail_term5').replace('{years}', years)}
                </p>
              )}

              {row.on && row.available && (
                <div className="mt-1 pl-6">
                  <input className={`input text-xs py-1 w-full ${row.hasEvidence ? '' : 'border-red-300 bg-yellow-50'}`}
                    style={{ fontSize: '16px' }} value={value?.[row.key]?.evidence || ''}
                    placeholder={t(`dd_e_${row.key}`)}
                    onChange={e => set(row.key, { evidence: e.target.value })}/>
                  <p className={`text-micro font-semibold mt-0.5 ${
                    row.hasEvidence ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {row.hasEvidence
                      ? `${row.pct}% · ${t('dd_evidenced')}`
                      : t('dd_no_evidence')}
                  </p>
                </div>
              )}

              {row.on && row.counts && r.clawbackMonths && (
                <p className="text-micro text-amber-800 mt-1 pl-6">{t('dd_clawback')}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-gray-200">
        <span className="text-xs font-bold text-navy uppercase tracking-wide">{t('dd_total')}</span>
        <span className={`text-base font-bold tabular-nums ${plan.stop ? 'text-red-700' : 'text-navy'}`}>
          {plan.justifiedPct}%
        </span>
      </div>
      <p className={`text-micro font-semibold ${
        plan.verdict === 'stop' ? 'text-red-700'
          : plan.verdict === 'capped' ? 'text-amber-800' : 'text-green-700'
      }`}>
        {plan.verdict === 'capped'
          ? t('dd_capped').replace('{earned}', plan.earnedPct).replace('{cap}', DEAL_DISCOUNT_CAP_PCT)
          : t(`dd_verdict_${plan.verdict}`)}
      </p>

      {plan.stop && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          {t('dd_stop')}
        </p>
      )}

      <p className="text-micro text-gray-400">{t('dd_expiry')}</p>

      <button type="button" onClick={() => setOpenNot(o => !o)}
        className="flex items-center gap-1 text-micro font-semibold text-gray-500 min-h-tap">
        {openNot ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
        {t('dd_not_evidence_title')}
      </button>
      {openNot && (
        <ul className="text-micro text-gray-600 space-y-0.5 pl-4 list-disc">
          {NOT_EVIDENCE.map(k => <li key={k}>{t(`dd_ne_${k}`)}</li>)}
        </ul>
      )}
    </div>
  )
}

/** The reasons a deal actually earned, for the record written on save. */
export function earnedRows(plan) {
  return (plan?.rows || []).filter(r => r.counts).map(r => ({
    reason: r.key, pct: r.pct, evidence: r.evidence || null, bidders: r.bidders || null,
  }))
}

export { DISCOUNT_REASONS }
