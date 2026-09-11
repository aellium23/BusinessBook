import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { useAuth } from '../../hooks/useAuth'
import { useDeals } from '../../hooks/useDeals'
import { canPrice } from '../../lib/roles'
import { salesByClient, sortRows, monthsFor } from '../../lib/salesByClient'
import { formatK, Spinner } from '../ui'
import { ChevronDown, ChevronRight, Download, ArrowUpDown } from 'lucide-react'
import { MONTHS, MONTHS_K } from '../../constants'

/**
 * What we invoiced, by client, over a period.
 *
 * The Power BI report this replaces is read once a month with one question in
 * mind — who did we invoice, and what did we make on them — so the table opens
 * on the answer: biggest first, current month, totals at the bottom.
 *
 * Margin is shown only to our own people. gm_pct is a column of `deals`, and
 * RLS filters rows rather than columns, so the screen is the control.
 */
export default function SalesByClient({ selectedBU = '' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { deals, loading } = useDeals()
  const navigate = useNavigate()
  const seesMargin = canPrice(profile?.role)

  const [period, setPeriod] = useState('ytd')
  const [sortBy, setSortBy] = useState('net')
  const [dir, setDir] = useState('desc')
  const [open, setOpen] = useState(null)

  const months = useMemo(() => monthsFor(period), [period])
  const { rows, total } = useMemo(
    () => salesByClient(deals, { months, bu: selectedBU }),
    [deals, months, selectedBU]
  )
  const sorted = useMemo(() => sortRows(rows, sortBy, dir), [rows, sortBy, dir])

  /** Clicking a column sorts by it; clicking it again turns it around. */
  function sortOn(key) {
    if (sortBy === key) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortBy(key); setDir(key === 'name' ? 'asc' : 'desc') }
  }

  const Th = ({ label, k, right }) => (
    <th className={`px-3 py-2 font-semibold text-gray-500 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => sortOn(k)}
        className={`inline-flex items-center gap-1 hover:text-navy ${sortBy === k ? 'text-navy' : ''}`}>
        {label}
        {sortBy === k
          ? <span className="text-micro">{dir === 'desc' ? '▼' : '▲'}</span>
          : <ArrowUpDown size={10} className="opacity-30"/>}
      </button>
    </th>
  )

  function exportCsv() {
    const headers = ['Client', 'Net sales', ...(seesMargin ? ['Gross margin', 'GM %'] : []), 'Deals']
    const body = sorted.map(r => [
      r.name, r.net,
      ...(seesMargin ? [r.margin, r.marginPct ?? ''] : []),
      r.deals.length,
    ])
    const csvSafe = v => {
      if (typeof v !== 'string') return v
      let s = v.replace(/"/g, '""')
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s}"` : s
    }
    const csv = [headers, ...body].map(r => r.map(csvSafe).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `BusinessBook_SalesByClient_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const periodLabel = k => {
    const i = MONTHS_K.indexOf(k)
    return i >= 0 ? MONTHS[i] : t(`sbc_p_${k}`)
  }

  if (loading) return <Spinner label={t('sbc_title')}/>

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs font-bold text-navy uppercase tracking-wide">{t('sbc_title')}</p>
            <p className="text-micro text-gray-400">{t('sbc_sub')}</p>
          </div>
          <button type="button" onClick={exportCsv}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-green-200 bg-white hover:bg-green-50 text-green-700 transition-colors">
            <Download size={12}/> CSV
          </button>
        </div>

        {/* Period. The year, its quarters and halves, and each month on its own. */}
        <div className="flex flex-wrap gap-1">
          {['ytd', 'fy', 'q1', 'q2', 'q3', 'q4', 'h1', 'h2'].map(k => (
            <button key={k} type="button" onClick={() => setPeriod(k)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                period === k ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {t(`sbc_p_${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-0.5">
          {MONTHS_K.map((m, i) => (
            <button key={m} type="button" onClick={() => setPeriod(m)}
              className={`text-micro py-1 rounded font-medium transition-colors ${
                period === m ? 'bg-navy text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}>
              {MONTHS[i]}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="px-3 py-6 text-xs text-gray-400 text-center">
          {t('sbc_empty')} {periodLabel(period)}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <Th label={t('sbc_client')} k="name"/>
                <Th label={t('sbc_net')} k="net" right/>
                {seesMargin && <Th label={t('sbc_gm')} k="margin" right/>}
                {seesMargin && <Th label={t('sbc_gm_pct')} k="marginPct" right/>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <FragmentRow key={r.key} r={r} i={i} open={open === r.key}
                  seesMargin={seesMargin} t={t}
                  onToggle={() => setOpen(o => (o === r.key ? null : r.key))}
                  onOpenDeals={() => navigate(`/deals?client=${encodeURIComponent(r.name)}`)}/>
              ))}
              <tr className="border-t-2 border-navy/20 bg-navy/[0.06] font-bold">
                <td className="px-3 py-2 text-navy">
                  {t('sbc_total')} <span className="font-normal text-gray-500">
                    · {total.clients} {t('sbc_clients')}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-navy">{formatK(total.net)}</td>
                {seesMargin && (
                  <td className="px-3 py-2 text-right text-green-700">{formatK(total.margin)}</td>
                )}
                {seesMargin && (
                  <td className="px-3 py-2 text-right text-green-700">
                    {total.marginPct === null ? '—' : `${total.marginPct} %`}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** One client, and the deals behind it when opened. */
function FragmentRow({ r, i, open, seesMargin, t, onToggle, onOpenDeals }) {
  return (
    <>
      <tr className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50/60 ${
        i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
      }`} onClick={onToggle}>
        <td className="px-3 py-1.5 font-medium text-gray-800">
          <span className="inline-flex items-center gap-1">
            {open ? <ChevronDown size={12} className="text-gray-400"/>
                  : <ChevronRight size={12} className="text-gray-400"/>}
            <span className="truncate max-w-[14rem] inline-block align-bottom">{r.name}</span>
            <span className="text-micro text-gray-400">({r.deals.length})</span>
          </span>
        </td>
        <td className="px-3 py-1.5 text-right font-medium text-gray-800">{formatK(r.net)}</td>
        {seesMargin && (
          <td className="px-3 py-1.5 text-right text-green-700">{formatK(r.margin)}</td>
        )}
        {seesMargin && (
          <td className={`px-3 py-1.5 text-right ${
            r.marginPct === null ? 'text-gray-300' : 'text-green-700'
          }`}>
            {r.marginPct === null ? '—' : `${r.marginPct} %`}
          </td>
        )}
      </tr>

      {open && r.deals.map(d => (
        <tr key={d.id} className="border-b border-gray-50 bg-gray-50/30">
          <td className="px-3 py-1 pl-8 text-gray-500">
            <span className="truncate max-w-[13rem] inline-block align-bottom">
              {d.description || d.owner || t('sbc_deal')}
            </span>
            {d.country && <span className="text-micro text-gray-400 ml-1">· {d.country}</span>}
          </td>
          <td className="px-3 py-1 text-right text-gray-600">{formatK(d.net)}</td>
          {seesMargin && <td className="px-3 py-1 text-right text-gray-500">{formatK(d.margin)}</td>}
          {seesMargin && (
            <td className="px-3 py-1 text-right text-gray-500">
              {d.marginPct === null ? '—' : `${d.marginPct} %`}
            </td>
          )}
        </tr>
      ))}

      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/30">
          <td colSpan={seesMargin ? 4 : 2} className="px-3 py-1 pl-8">
            <button type="button" onClick={onOpenDeals}
              className="text-micro font-semibold text-navy underline underline-offset-2">
              {t('sbc_open_deals')}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}
