import { useState, useMemo, useCallback } from 'react'
import { Table, Copy, Check, Globe, Users, AlertTriangle } from 'lucide-react'
import {
  buildSalesByProduct, buildInternalSales,
  EST1_PRODUCTS, INTERNAL_REGIONS, QUARTER_LABELS, HALF_LABELS,
} from '../../lib/est1'

// Deal values are stored in EUR; the Japanese sheets are in K€.
const K = (eur) => eur / 1000
const fmt = (eur) => {
  const k = K(eur)
  if (Math.abs(k) < 0.05) return ''
  return k.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 0 })
}
const sum = (arr) => arr.reduce((s, v) => s + v, 0)

// Build a tab-separated block (header + rows) for pasting straight into Excel.
function toTSV(header, rows) {
  return [header, ...rows].map((r) => r.join('\t')).join('\n')
}

function CopyButton({ getText, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch { /* clipboard unavailable */ }
  }, [getText])
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600">
      {done ? <><Check size={12} className="text-green-600"/> Copied</> : <><Copy size={12}/> {label}</>}
    </button>
  )
}

// A K€ numeric cell (right-aligned, blank for ~zero, bold for totals).
function Num({ value, bold, accent }) {
  const txt = fmt(value)
  return (
    <td className={`px-2 py-1 text-right tabular-nums ${bold ? 'font-bold' : ''} ${
      accent === 'navy' ? 'text-navy' : accent === 'green' ? 'text-green-700' : 'text-gray-700'
    } ${!txt ? 'text-gray-300' : ''}`}>
      {txt || '·'}
    </td>
  )
}

function QuarterRow({ label, values, indent, bold, accent, divider }) {
  return (
    <tr className={`${divider ? 'border-t border-gray-300' : 'border-t border-gray-100'} ${bold ? 'bg-gray-50/60' : ''}`}>
      <td className={`px-2 py-1 text-xs ${indent ? 'pl-6 text-gray-500' : 'text-gray-700'} ${bold ? 'font-bold text-gray-900' : ''}`}>
        {label}
      </td>
      {values.map((v, i) => <Num key={i} value={v} bold={bold} accent={accent}/>)}
      <Num value={sum(values)} bold accent={accent || 'navy'}/>
    </tr>
  )
}

function SalesByProduct({ data }) {
  const { products, productTotal, maintenance, opex, total, newBusiness, existingBase, unallocated } = data

  const tsv = useCallback(() => {
    const header = ['Line', ...QUARTER_LABELS, 'FY']
    const row = (label, vals) => [label, ...vals.map(K), K(sum(vals))]
    const rows = [
      ['A. Product Sales', '', '', '', '', ''],
      ...EST1_PRODUCTS.map((p) => row('  ' + p, products[p])),
      row('A. Subtotal', productTotal),
      row('B. Maintenance', maintenance),
      row('C. Rental / MES / OPEX', opex),
      row('Total', total),
      ['', '', '', '', '', ''],
      row('New Business', newBusiness),
      row('Existing Base', existingBase),
    ]
    return toTSV(header, rows)
  }, [data])

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50/60">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Table size={14} className="text-navy"/> Sales by Product
          <span className="text-micro font-normal text-gray-400">· K€ · quarterly</span>
        </h3>
        <CopyButton getText={tsv} label="Copy table"/>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-micro uppercase tracking-wide">
              <th className="px-2 py-1.5 text-left font-semibold">Line</th>
              {QUARTER_LABELS.map((q) => <th key={q} className="px-2 py-1.5 text-right font-semibold">{q}</th>)}
              <th className="px-2 py-1.5 text-right font-semibold">FY</th>
            </tr>
          </thead>
          <tbody>
            <QuarterRow label="A. Product Sales" values={productTotal} bold accent="navy"/>
            {EST1_PRODUCTS.map((p) => (
              <QuarterRow key={p} label={p} values={products[p]} indent/>
            ))}
            <QuarterRow label="B. Maintenance" values={maintenance} bold divider/>
            <QuarterRow label="C. Rental / MES / OPEX" values={opex} bold/>
            <QuarterRow label="Total" values={total} bold accent="navy" divider/>
            <tr><td colSpan={6} className="py-1"></td></tr>
            <QuarterRow label="New Business" values={newBusiness} bold accent="green" divider/>
            <QuarterRow label="Existing Base" values={existingBase} bold/>
          </tbody>
        </table>
      </div>
      {unallocated > 0.05 && (
        <p className="flex items-center gap-1.5 px-3 py-2 text-micro text-amber-700 bg-amber-50 border-t border-amber-200">
          <AlertTriangle size={12}/>
          {fmt(unallocated)} K€ of deals have no recognition month and are excluded from the quarters.
          Allocate them in the Forecast Calendar tab.
        </p>
      )}
    </section>
  )
}

function InternalSales({ data }) {
  const { regions, total, unallocated } = data
  const tsv = useCallback(() => {
    const header = ['Region', ...HALF_LABELS, 'FY']
    const row = (label, vals) => [label, ...vals.map(K), K(sum(vals))]
    const rows = [
      ...INTERNAL_REGIONS.map((r) => row(r, regions[r])),
      row('Total', total),
    ]
    return toTSV(header, rows)
  }, [data])

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50/60">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Globe size={14} className="text-navy"/> Internal Sales
          <span className="text-micro font-normal text-gray-400">· VGT · K€ · semi-annual</span>
        </h3>
        <CopyButton getText={tsv} label="Copy table"/>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[320px]">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-micro uppercase tracking-wide">
              <th className="px-2 py-1.5 text-left font-semibold">Region</th>
              {HALF_LABELS.map((h) => <th key={h} className="px-2 py-1.5 text-right font-semibold">{h}</th>)}
              <th className="px-2 py-1.5 text-right font-semibold">FY</th>
            </tr>
          </thead>
          <tbody>
            {INTERNAL_REGIONS.map((r) => (
              <tr key={r} className="border-t border-gray-100">
                <td className="px-2 py-1 text-xs text-gray-700">{r}</td>
                {regions[r].map((v, i) => <Num key={i} value={v}/>)}
                <Num value={sum(regions[r])} bold accent="navy"/>
              </tr>
            ))}
            <tr className="border-t border-gray-300 bg-gray-50/60">
              <td className="px-2 py-1 text-xs font-bold text-gray-900">Total</td>
              {total.map((v, i) => <Num key={i} value={v} bold accent="navy"/>)}
              <Num value={sum(total)} bold accent="navy"/>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-micro text-gray-400 border-t border-gray-100">
        Margin % (MP) is entered manually in the Japanese sheet — cost data is not exposed in the CRM.
      </p>
      {unallocated > 0.05 && (
        <p className="flex items-center gap-1.5 px-3 py-2 text-micro text-amber-700 bg-amber-50 border-t border-amber-200">
          <AlertTriangle size={12}/> {fmt(unallocated)} K€ internal deals are unallocated (no recognition month).
        </p>
      )}
    </section>
  )
}

export default function EST1Builder({ allDeals = [] }) {
  const [bu, setBu] = useState('VGT')
  const sales = useMemo(() => buildSalesByProduct(allDeals, bu), [allDeals, bu])
  const internal = useMemo(() => buildInternalSales(allDeals, 'VGT'), [allDeals])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-400">
          Aggregates allocated deals into the FUJIFILM HQ <span className="font-medium text-gray-600">FY26 EST1</span> workbook
          structure. Copy each table and paste into the Japanese Excel.
        </p>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {['VGT', 'ECT'].map((b) => (
            <button key={b} onClick={() => setBu(b)}
              className={`px-3 py-1.5 font-medium ${
                bu === b ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              {b}
            </button>
          ))}
        </div>
      </div>

      <SalesByProduct data={sales}/>

      {bu === 'VGT' && <InternalSales data={internal}/>}

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-1">
          <Users size={14} className="text-navy"/> FTE
          <span className="text-micro font-normal text-gray-400">· headcount @ Mar 2027</span>
        </h3>
        <p className="text-micro text-gray-400">
          FTE counts (BU head, Account sales, Sales admin, Product spec, PM, Engineer, QA/RA, R&D) are not tracked in the
          CRM — enter them manually in the FTE workbook.
        </p>
      </section>
    </div>
  )
}
