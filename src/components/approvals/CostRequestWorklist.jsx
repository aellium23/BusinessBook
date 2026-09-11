import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../Toast'
import { useTranslation } from '../../hooks/useTranslation'
import { Spinner } from '../ui'
import { ExternalLink, Check, X } from 'lucide-react'

/**
 * Supplier discounts a rep has promised but not yet asked for.
 *
 * These are not approvals and there is nothing here to decide: the discount
 * comes off what HCUS or Medsky charge us, and it exists only once somebody
 * opens a case in their Salesforce or sends the email. What this list is for is
 * making the gap between "quoted with a discount" and "actually asked for it"
 * visible, and getting shorter — which is why it leads with how many days each
 * one has been sitting.
 */
export default function CostRequestWorklist() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refFor, setRefFor] = useState(null)
  const [refValue, setRefValue] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('discount_worklist')
      .select('*').eq('route', 'external')
      .order('days_waiting', { ascending: false })
    if (error) showToast(error.message, 'error')
    setRows(data || [])
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  async function update(row, patch) {
    const { error } = await supabase.from('deal_discount_requests')
      .update(patch).eq('id', row.id)
    if (error) { showToast(error.message, 'error'); return }
    setRefFor(null); setRefValue('')
    load()
  }

  if (loading) return <Spinner/>
  if (!rows.length) return null

  const isManager = ['admin', 'manager'].includes(profile?.role)

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-amber-900">{t('wl_title')}</h2>
        <span className="text-micro text-amber-800">{rows.length}</span>
      </div>
      <p className="text-micro text-amber-800">{t('wl_hint')}</p>

      {rows.map(r => (
        <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{r.client}</p>
              <p className="text-micro text-gray-500 truncate">
                {r.product_name || r.product_sku || '—'} · {r.requested_pct}%
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-micro font-semibold text-navy">{r.channel}</p>
              <p className={`text-micro ${r.days_waiting >= 7 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                {r.days_waiting} {t('wl_days')}
              </p>
            </div>
          </div>

          {r.status === 'to_request' && (
            refFor === r.id ? (
              <div className="flex gap-1.5">
                <input className="input text-xs flex-1" value={refValue}
                  placeholder={t('wl_ref_ph')} style={{ fontSize: '16px' }}
                  onChange={e => setRefValue(e.target.value)}/>
                <button className="btn-primary text-xs px-2"
                  onClick={() => update(r, {
                    status: 'requested',
                    external_ref: refValue.trim() || null,
                    requested_at: new Date().toISOString(),
                  })}>
                  {t('wl_save')}
                </button>
              </div>
            ) : (
              <button className="btn-secondary text-xs w-full gap-1"
                onClick={() => { setRefFor(r.id); setRefValue('') }}>
                <ExternalLink size={12}/> {t('wl_mark_requested')}
              </button>
            )
          )}

          {r.status === 'requested' && (
            <div className="space-y-1.5">
              {r.external_ref && (
                <p className="text-micro text-gray-500 font-mono">{r.external_ref}</p>
              )}
              <div className="flex gap-1.5">
                <button className="btn-secondary text-xs flex-1 gap-1 text-green-700"
                  onClick={() => update(r, {
                    status: 'approved', approved_pct: r.requested_pct,
                    responded_at: new Date().toISOString(),
                  })}>
                  <Check size={12}/> {t('wl_granted')}
                </button>
                <button className="btn-secondary text-xs flex-1 gap-1 text-red-700"
                  onClick={() => update(r, { status: 'rejected', responded_at: new Date().toISOString() })}>
                  <X size={12}/> {t('wl_refused')}
                </button>
              </div>
            </div>
          )}

          {!isManager && r.requested_by !== profile?.id && (
            <p className="text-micro text-gray-400">{t('wl_not_yours')}</p>
          )}
        </div>
      ))}
    </div>
  )
}
