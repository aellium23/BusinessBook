import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner, EmptyState, formatK } from '../components/ui'
import { PRODUCTS, MONTHS_K } from '../constants'
import {
  LayoutGrid, Search, AlertCircle, CheckCircle2, Circle,
  Clock, TrendingUp, Download,
} from 'lucide-react'

// Cell status priority (higher wins if an account has multiple deals for the product)
const PRIORITY = ['Invoiced','BackLog','Offer Presented','Pipeline','Lead','Lost']

function CellStatus({ deals, product }) {
  const matches = deals.filter(d => d.product === product)
  if (matches.length === 0) return {
    status: 'whitespace', label: '—', total: 0,
    cls: 'bg-gray-50 hover:bg-amber-50 hover:border-amber-200 text-gray-400 border border-dashed border-gray-200',
  }
  // Pick the most advanced stage by PRIORITY (lower index = more important)
  let best = matches[0]
  let bestRank = PRIORITY.indexOf(matches[0].stage)
  let total = 0
  const hasSla = matches.some(d => d.is_sla)
  for (const d of matches) {
    const r = PRIORITY.indexOf(d.stage)
    if (r !== -1 && (r < bestRank || bestRank === -1)) { best = d; bestRank = r }
    total += d.value_total || 0
  }
  const stageStyles = {
    Invoiced:          'bg-green-100 text-green-800 border border-green-200',
    BackLog:           'bg-blue-100 text-blue-700 border border-blue-200',
    'Offer Presented': 'bg-purple-100 text-purple-700 border border-purple-200',
    Pipeline:          'bg-amber-100 text-amber-700 border border-amber-200',
    Lead:              'bg-gray-100 text-gray-600 border border-gray-200',
    Lost:              'bg-red-50 text-red-500 border border-red-100',
  }
  return {
    status: best.stage,
    label:  best.stage,
    cls:    stageStyles[best.stage] || 'bg-gray-100 text-gray-600 border',
    total,
    hasSla,
    count:  matches.length,
  }
}

export default function WhiteSpace() {
  const { isAdmin, profile } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [deals, setDeals]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [buF, setBuF]           = useState('')
  const [hideComplete, setHideComplete] = useState(false)

  async function refresh() {
    setLoading(true)
    const [aRes, dRes] = await Promise.all([
      supabase.from('accounts').select('id, bu, name, country, region').order('name'),
      supabase.from('deals').select('id, account_id, product, stage, value_total, is_sla, is_intercompany_mirror').eq('is_intercompany_mirror', false),
    ])
    if (aRes.error) setError(aRes.error.message)
    setAccounts(aRes.data ?? [])
    setDeals((dRes.data ?? []).filter(d => d.account_id && d.product))
    setLoading(false)
  }

  useEffect(() => {
    if (profile !== undefined && profile !== null) refresh()
  }, [profile?.id])

  const dealsByAccount = useMemo(() => {
    const m = new Map()
    deals.forEach(d => {
      if (!m.has(d.account_id)) m.set(d.account_id, [])
      m.get(d.account_id).push(d)
    })
    return m
  }, [deals])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts
      .filter(a => !buF || a.bu === buF)
      .filter(a => {
        if (!q) return true
        return [a.name, a.country, a.region].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
      .map(a => {
        const d = dealsByAccount.get(a.id) || []
        const cells = PRODUCTS.map(p => ({ product: p, ...CellStatus({ deals: d, product: p }) }))
        const coverage = cells.filter(c => c.status !== 'whitespace').length
        return { account: a, cells, coverage }
      })
      .filter(r => !hideComplete || r.coverage < PRODUCTS.length)
      .sort((a, b) => {
        // Most white-space first (ascending coverage)
        if (a.coverage !== b.coverage) return a.coverage - b.coverage
        return a.account.name.localeCompare(b.account.name)
      })
  }, [accounts, deals, dealsByAccount, search, buF, hideComplete])

  // Column totals: how many accounts have each product covered
  const colTotals = useMemo(() => {
    const counts = {}
    PRODUCTS.forEach(p => { counts[p] = 0 })
    rows.forEach(r => r.cells.forEach(c => {
      if (c.status !== 'whitespace' && c.status !== 'Lost') counts[c.product] += 1
    }))
    return counts
  }, [rows])

  function exportCSV() {
    const headers = ['Account', 'BU', 'Country', ...PRODUCTS, 'Coverage']
    const data = rows.map(r => [
      r.account.name, r.account.bu, r.account.country || '',
      ...r.cells.map(c => c.status === 'whitespace' ? '' : `${c.status}${c.hasSla ? ' (SLA)' : ''}`),
      `${r.coverage}/${PRODUCTS.length}`,
    ])
    const csv = [headers, ...data]
      .map(row => row.map(v => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BusinessBook_WhiteSpace_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutGrid size={20} className="text-navy"/> White-space analysis
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Accounts × products. Empty cells are cross-sell opportunities. Only deals linked to an account and with a product are counted.
          </p>
        </div>
        <button onClick={exportCSV} className="btn-secondary text-xs">
          <Download size={13}/> Export
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8 w-full" placeholder="Search accounts…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {isAdmin && (
          <select className="select text-xs py-1.5" value={buF}
            onChange={e => setBuF(e.target.value)}>
            <option value="">All BUs</option>
            <option>VGT</option>
            <option>ECT</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={hideComplete}
            onChange={e => setHideComplete(e.target.checked)}/>
          Hide fully-covered
        </label>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className="text-gray-400 mr-1">Legend:</span>
        {[
          { s: 'Invoiced',          cls: 'bg-green-100 text-green-800 border-green-200' },
          { s: 'BackLog',           cls: 'bg-blue-100 text-blue-700 border-blue-200' },
          { s: 'Offer Presented',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
          { s: 'Pipeline',          cls: 'bg-amber-100 text-amber-700 border-amber-200' },
          { s: 'Lead',              cls: 'bg-gray-100 text-gray-600 border-gray-200' },
          { s: 'White-space',       cls: 'bg-gray-50 text-gray-400 border-dashed border-gray-200' },
        ].map(x => (
          <span key={x.s} className={`px-1.5 py-0.5 rounded border ${x.cls}`}>{x.s}</span>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={13}/> {error}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="📊" title="Nothing to show"
          description="Link some deals to accounts (via the DealForm) to populate this matrix."/>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left font-semibold text-gray-600 px-3 py-2 min-w-56">Account</th>
                  {PRODUCTS.map(p => (
                    <th key={p} className="text-center font-semibold text-gray-600 px-2 py-2 min-w-28">
                      {p}
                      <div className="text-[10px] text-gray-400 font-normal">{colTotals[p]} accounts</div>
                    </th>
                  ))}
                  <th className="text-center font-semibold text-gray-600 px-2 py-2">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.account.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                    <td className="px-3 py-2 align-top">
                      <p className="font-semibold text-gray-900 truncate">{r.account.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {r.account.bu}{r.account.country ? ` · ${r.account.country}` : ''}
                      </p>
                    </td>
                    {r.cells.map(c => (
                      <td key={c.product} className="px-2 py-2 text-center align-top">
                        <div className={`inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 min-w-20 ${c.cls}`}>
                          <span className="text-[10px] font-bold leading-tight">
                            {c.label}
                          </span>
                          {c.total > 0 && (
                            <span className="text-[9px] opacity-70">{formatK(c.total)}</span>
                          )}
                          {c.hasSla && (
                            <span className="text-[9px] font-bold">SLA</span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center align-top">
                      <span className={`text-[11px] font-semibold ${
                        r.coverage === PRODUCTS.length ? 'text-green-700' :
                        r.coverage > 0                 ? 'text-amber-700' :
                                                         'text-gray-400'
                      }`}>
                        {r.coverage}/{PRODUCTS.length}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
