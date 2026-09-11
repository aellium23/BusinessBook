import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDeals } from '../hooks/useDeals'
import { useTranslation } from '../hooks/useTranslation'
import { useToast } from '../components/Toast'
import { formatK, Spinner } from '../components/ui'
import { logger } from '../lib/logger'
import { canPrice, seesGovernance } from '../lib/roles'
import { salesByClient, monthsFor } from '../lib/salesByClient'
import { parseSapPaste, normaliseName } from '../lib/sapImport'
import { reconcile } from '../lib/reconcile'
import { MONTHS, MONTHS_K } from '../constants'
import { Upload, Link2, AlertTriangle, CheckCircle } from 'lucide-react'

/**
 * Where the difference is.
 *
 * Two books of the same month: SAP, imported by hand, and the deals people
 * record here. They never agree, and the gap is only useful named — which
 * customers we invoiced and never recorded, which we recorded and did not
 * invoice, and which differ. The total at the top splits into exactly those
 * three, and they add back up to it.
 */
export default function Verification() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { deals, loading: dealsLoading } = useDeals()

  const canImport = seesGovernance(profile?.role)
  const isAdmin = profile?.role === 'admin'

  const [bu, setBu] = useState(isAdmin ? '' : (profile?.bu || ''))
  const [month, setMonth] = useState(MONTHS_K[new Date().getMonth() >= 3
    ? new Date().getMonth() - 3
    : new Date().getMonth() + 9])
  const [sapRows, setSapRows] = useState([])
  const [aliases, setAliases] = useState([])
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linking, setLinking] = useState(null)

  async function load() {
    setLoading(true)
    const q = supabase.from('sap_sales')
      .select('bu, fy_month, customer_name, customer_key, net_sales, gross_margin')
      .eq('fy_month', month)
    const { data, error } = bu ? await q.eq('bu', bu) : await q
    if (error) logger.error('Failed to load SAP sales', { error: error.message })
    setSapRows((data || []).map(r => ({
      key: r.customer_key, name: r.customer_name,
      net: Number(r.net_sales) || 0, margin: Number(r.gross_margin) || 0,
    })))
    const { data: al } = await supabase.from('sap_client_aliases').select('sap_key, crm_key')
    setAliases(al || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [month, bu])   // eslint-disable-line react-hooks/exhaustive-deps

  const crm = useMemo(
    () => salesByClient(deals, { months: monthsFor(month), bu }).rows,
    [deals, month, bu]
  )
  const result = useMemo(() => reconcile(crm, sapRows, aliases), [crm, sapRows, aliases])
  const preview = useMemo(() => (paste ? parseSapPaste(paste) : null), [paste])

  /** The month is stored per business unit, so an import needs one. */
  async function saveImport() {
    if (!bu) { showToast(t('vf_need_bu'), 'error'); return }
    if (!preview?.rows.length) return
    setSaving(true)
    // Replacing the month rather than adding to it: an import run twice must
    // leave one month, not two.
    const del = await supabase.from('sap_sales').delete()
      .eq('bu', bu).eq('fy_month', month).eq('fiscal_year', 'FY26')
    if (del.error) {
      setSaving(false); showToast(del.error.message, 'error'); return
    }
    const { error } = await supabase.from('sap_sales').insert(
      preview.rows.map(r => ({
        bu, fiscal_year: 'FY26', fy_month: month,
        customer_name: r.name, customer_key: r.key,
        net_sales: r.net, gross_margin: r.margin,
        imported_by: profile?.id || null,
      }))
    )
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${preview.rows.length} ${t('vf_imported')}`, 'success')
    setPaste(''); setImportOpen(false)
    load()
  }

  async function linkAlias(sapKey, crmRow) {
    const { error } = await supabase.from('sap_client_aliases').upsert({
      sap_key: sapKey, crm_key: crmRow.key, crm_name: crmRow.name,
      created_by: profile?.id || null,
    }, { onConflict: 'sap_key' })
    if (error) { showToast(error.message, 'error'); return }
    setLinking(null)
    load()
  }

  if (!canPrice(profile?.role)) {
    return <p className="p-4 text-sm text-gray-600">{t('vf_internal_only')}</p>
  }
  if (loading || dealsLoading) return <Spinner label={t('vf_title')}/>

  const monthLabel = MONTHS[MONTHS_K.indexOf(month)]
  const agrees = Math.abs(result.total.delta) < 1

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('vf_title')}</h1>
          <p className="text-sm text-gray-400">{t('vf_sub')}</p>
        </div>
        {canImport && (
          <button onClick={() => setImportOpen(o => !o)}
            className="btn-secondary text-xs flex items-center gap-1">
            <Upload size={12}/> {t('vf_import')}
          </button>
        )}
      </div>

      {/* Which company, which month. 1715 is VGT and 1766 is ECT; Iberia is the
          two of them read together. */}
      <div className="flex flex-wrap gap-1.5">
        {[{ k: '', l: t('vf_iberia') }, { k: 'VGT', l: 'VGT · 1715' }, { k: 'ECT', l: 'ECT · 1766' }]
          .filter(o => isAdmin || !o.k || o.k === profile?.bu)
          .map(o => (
            <button key={o.k || 'all'} onClick={() => setBu(o.k)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                bu === o.k ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>{o.l}</button>
          ))}
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-0.5">
        {MONTHS_K.map((m, i) => (
          <button key={m} onClick={() => setMonth(m)}
            className={`text-micro py-1 rounded font-medium transition-colors ${
              month === m ? 'bg-navy text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}>{MONTHS[i]}</button>
        ))}
      </div>

      {importOpen && canImport && (
        <section className="card p-3 space-y-2">
          <div>
            <p className="text-xs font-bold text-navy uppercase tracking-wide">
              {t('vf_import_title')} · {monthLabel} · {bu || t('vf_pick_bu')}
            </p>
            <p className="text-micro text-gray-400">{t('vf_import_hint')}</p>
          </div>
          <textarea className="input text-xs w-full font-mono" rows={6}
            value={paste} onChange={e => setPaste(e.target.value)}
            placeholder={'CustomerName\tNet Sales\tGross Margin\tGross Margin %'}/>

          {preview && (
            <div className="text-micro space-y-1">
              <p className="text-gray-600">
                {preview.rows.length} {t('vf_rows')} · {t('sbc_net')} <strong>{formatK(preview.total.net)}</strong>
                {' · '}{t('sbc_gm')} <strong>{formatK(preview.total.margin)}</strong>
              </p>
              {preview.problems.length > 0 && (
                <p className="text-red-700">
                  {preview.problems.length} {t('vf_unreadable')}: {preview.problems.slice(0, 3).map(p => `#${p.line}`).join(', ')}
                </p>
              )}
              {preview.rows.some(r => r.pctMismatch) && (
                <p className="text-amber-700">{t('vf_pct_mismatch')}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setPaste(''); setImportOpen(false) }}
              className="btn-secondary text-xs flex-1">{t('qd_cancel')}</button>
            <button onClick={saveImport} disabled={saving || !bu || !preview?.rows.length}
              className="btn-primary text-xs flex-1">
              {saving ? t('qd_creating') : `${t('vf_replace_month')} ${monthLabel}`}
            </button>
          </div>
        </section>
      )}

      {/* The gap, and where it comes from. */}
      <section className={`rounded-xl border p-3 space-y-2 ${
        agrees ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'
      }`}>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-micro text-gray-500">SAP</p>
            <p className="text-base font-bold text-navy">{formatK(result.total.sap)}</p>
          </div>
          <div>
            <p className="text-micro text-gray-500">BusinessBook</p>
            <p className="text-base font-bold text-navy">{formatK(result.total.crm)}</p>
          </div>
          <div>
            <p className="text-micro text-gray-500">{t('vf_delta')}</p>
            <p className={`text-base font-bold ${agrees ? 'text-green-700' : 'text-amber-800'}`}>
              {agrees ? formatK(0) : `${result.total.delta > 0 ? '+' : '−'}${formatK(Math.abs(result.total.delta))}`}
            </p>
          </div>
        </div>
        {agrees ? (
          <p className="text-micro text-green-700 flex items-center gap-1">
            <CheckCircle size={11}/> {t('vf_agree')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-gray-600 pt-1 border-t border-amber-200">
            <span>{t('vf_from_missing')}: <strong>{formatK(result.total.fromMissing)}</strong></span>
            <span>{t('vf_from_extra')}: <strong>{formatK(result.total.fromExtra)}</strong></span>
            <span>{t('vf_from_diff')}: <strong>{formatK(result.total.fromDifferences)}</strong></span>
          </div>
        )}
      </section>

      <Bucket title={`${t('vf_only_sap')} (${result.onlySap.length})`}
        hint={t('vf_only_sap_hint')} tone="red" rows={result.onlySap}
        render={r => (
          <>
            <span className="truncate">{r.name}</span>
            <span className="ml-auto font-medium">{formatK(r.net)}</span>
            {canImport && (
              <button onClick={() => setLinking(linking === r.key ? null : r.key)}
                className="text-micro text-navy underline underline-offset-2 flex items-center gap-0.5">
                <Link2 size={10}/> {t('vf_link')}
              </button>
            )}
          </>
        )}
        after={r => linking === r.key && (
          <div className="pl-4 pt-1 space-y-0.5">
            <p className="text-micro text-gray-500">{t('vf_link_to')}</p>
            {result.onlyCrm.slice(0, 8).map(c => (
              <button key={c.key} onClick={() => linkAlias(r.key, c)}
                className="block text-micro text-navy hover:underline">
                {c.name} · {formatK(c.net)}
              </button>
            ))}
            {result.onlyCrm.length === 0 && (
              <p className="text-micro text-gray-400">{t('vf_no_candidates')}</p>
            )}
          </div>
        )}/>

      <Bucket title={`${t('vf_only_crm')} (${result.onlyCrm.length})`}
        hint={t('vf_only_crm_hint')} tone="amber" rows={result.onlyCrm}
        render={r => (
          <>
            <span className="truncate">{r.name}</span>
            <span className="ml-auto font-medium">{formatK(r.net)}</span>
          </>
        )}/>

      <Bucket title={`${t('vf_both')} (${result.matched.length})`}
        hint={`${result.total.agreeing} ${t('vf_agreeing')} · ${result.total.differing} ${t('vf_differing')}`}
        tone="gray" rows={result.matched}
        render={r => (
          <>
            <span className="truncate">{r.name}</span>
            <span className="ml-auto text-gray-500">{formatK(r.sapNet)}</span>
            <span className="text-gray-400">vs</span>
            <span className="text-gray-500">{formatK(r.crmNet)}</span>
            <span className={`w-16 text-right font-semibold ${
              r.agrees ? 'text-green-700' : 'text-amber-800'
            }`}>
              {r.agrees ? '=' : `${r.delta > 0 ? '+' : '−'}${formatK(Math.abs(r.delta))}`}
            </span>
          </>
        )}/>
    </div>
  )
}

/** One of the three answers, with its rows. */
function Bucket({ title, hint, tone, rows, render, after }) {
  const [open, setOpen] = useState(true)
  const colour = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-800' : 'text-gray-700'
  return (
    <section className="card p-3 space-y-1.5">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left">
        <p className={`text-xs font-bold uppercase tracking-wide ${colour}`}>
          {tone === 'red' && <AlertTriangle size={11} className="inline mr-1 -mt-0.5"/>}
          {title}
        </p>
        <p className="text-micro text-gray-400">{hint}</p>
      </button>
      {open && rows.length > 0 && (
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {rows.map(r => (
            <div key={r.key}>
              <div className="flex items-center gap-2 text-xs text-gray-700 py-0.5 border-b border-gray-50">
                {render(r)}
              </div>
              {after?.(r)}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
