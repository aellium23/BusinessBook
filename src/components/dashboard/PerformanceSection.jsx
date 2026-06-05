import { formatK } from '../ui'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

// ── Current FY month index (0=Apr, 1=May, ... 11=Mar) ────────────────────
function getFYMonthIndex() {
  const m = new Date().getMonth() + 1
  return (m - 4 + 12) % 12
}
const MONTHS_LABEL = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function pct(value, reference) {
  if (!reference || reference === 0) return null
  return ((value - reference) / Math.abs(reference) * 100)
}

function PctBadge({ value, reference, label }) {
  const p = pct(value, reference)
  if (p === null) return null
  const positive = p >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-micro font-bold px-1.5 py-0.5 rounded ${
      positive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      {positive ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% vs {label}
    </span>
  )
}

function BUPerformanceCard({ bu, color, label, actMTD, actYTD, actExtMTD=0, actIntMTD=0, actExtYTD=0, actIntYTD=0, fcExtYTD=0, fcIntYTD=0, planMTD, planYTD, planExtYTD=0, planIntYTD=0, pyMTD, pyYTD, cycle, mtdLabel, ytdLabel }) {
  function BarChart({ value, max, c }) {
    const p = max > 0 ? Math.min(value/max*100, 140) : 0
    return (
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width:`${Math.min(p,100)}%`, background: p > 100 ? '#1D9E75' : c }}/>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border-2 shadow-sm overflow-hidden" style={{ borderColor: color }}>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between" style={{ background: `${color}12` }}>
        <div>
          <p className="text-xs font-bold" style={{ color }}>{label}</p>
          <p className="text-micro text-gray-400">{cycle} · {new Date().toLocaleString('en',{month:'short',year:'2-digit'})}</p>
        </div>
        <span className="text-micro text-gray-400">K€</span>
      </div>
      {/* MTD */}
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-micro text-gray-400 font-semibold uppercase tracking-wide">Actuals · {mtdLabel}</p>
            <p className="text-2xl font-bold text-gray-900">{formatK(actMTD*1000)}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-micro bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold">Ext {formatK(actExtMTD*1000)}</span>
              <span className="text-micro bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Int {formatK(actIntMTD*1000)}</span>
            </div>
          </div>
          <div className="text-right space-y-0.5 mt-1">
            <PctBadge value={actMTD} reference={planMTD} label="Plan"/>
            <div/><PctBadge value={actMTD} reference={pyMTD} label="PY"/>
          </div>
        </div>
        <BarChart value={actMTD} max={planMTD} c={color}/>
        <div className="flex justify-between text-micro text-gray-400 mt-0.5">
          <span>Plan: {formatK(planMTD*1000)}</span><span>PY: {formatK(pyMTD*1000)}</span>
        </div>
      </div>
      {/* YTD */}
      <div className="px-4 py-3">
        <p className="text-micro text-gray-400 font-semibold uppercase tracking-wide mb-1.5">Actuals YTD · {ytdLabel}</p>
        <div className="flex items-start justify-between mb-1.5">
          <p className="text-2xl font-bold text-gray-900">{formatK(actYTD*1000)}</p>
          <div className="text-right space-y-0.5">
            <PctBadge value={actYTD} reference={planYTD} label="Plan"/>
            <div/><PctBadge value={actYTD} reference={pyYTD} label="PY"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-micro text-green-600 font-bold uppercase mb-0.5">External</p>
            <p className="text-sm font-bold text-gray-800">{formatK(actExtYTD*1000)}</p>
            <p className="text-micro text-gray-400">FC {formatK(fcExtYTD*1000)}{planExtYTD > 0 ? ` · Plan ${formatK(planExtYTD*1000)}` : ''}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-micro text-blue-600 font-bold uppercase mb-0.5">Internal</p>
            <p className="text-sm font-bold text-gray-800">{formatK(actIntYTD*1000)}</p>
            <p className="text-micro text-gray-400">FC {formatK(fcIntYTD*1000)}{planIntYTD > 0 ? ` · Plan ${formatK(planIntYTD*1000)}` : ''}</p>
          </div>
        </div>
        <BarChart value={actYTD} max={planYTD} c={color}/>
        <div className="flex justify-between text-micro text-gray-400 mt-0.5">
          <span>Plan: {formatK(planYTD*1000)}</span><span>PY: {formatK(pyYTD*1000)}</span>
        </div>
      </div>
    </div>
  )
}

export default function PerformanceSection({ deals, budget, fy25, activeCycle, isAdmin, selectedBU = '', source = 'BB' }) {
  const fyIdx = getFYMonthIndex()
  const curMonth = MONTHS_K[fyIdx]
  const ytdMonths = MONTHS_K.slice(0, fyIdx + 1)
  const mtdLabel = MONTHS_LABEL[fyIdx]
  const ytdLabel = fyIdx === 0 ? MONTHS_LABEL[0] : `${MONTHS_LABEL[0]}–${MONTHS_LABEL[fyIdx]}`

  // SAP actuals from the budget ACT cycle (ns_int/ns_ext), already in thousands
  function sumSap(bu, months, salesType = null) {
    const keys = salesType === 'External' ? ['ns_ext']
      : salesType === 'Internal' ? ['ns_int'] : ['ns_int','ns_ext']
    return keys.reduce((s,key)=>{
      const row = budget.find(r => r.bu===bu && r.cycle==='ACT' && r.pl_key===key)
      return s + months.reduce((ms,m)=>ms+(Number(row?.[m])||0),0)
    },0)
  }
  function sumDeals(bu, months, salesType = null) {
    if (source === 'SAP') return sumSap(bu, months, salesType)
    return deals
      .filter(d => d.bu===bu && d.stage==='Invoiced' && !d.is_intercompany_mirror
        && (salesType===null || (salesType==='External' ? d.sales_type!=='Internal' : d.sales_type==='Internal')))
      .reduce((s,d)=>{
        const rate = (!d.currency||d.currency==='EUR') ? 1 : (Number(d.exchange_rate)||1)
        const monthSum = months.reduce((ms,m)=>ms+(Number(d[m])||0),0)
        return s + monthSum * rate
      },0)/1000
  }
  function sumForecast(bu, months, salesType = null) {
    return deals
      .filter(d => d.bu===bu && d.stage==='BackLog' && !d.is_intercompany_mirror
        && (salesType===null || (salesType==='External' ? d.sales_type!=='Internal' : d.sales_type==='Internal')))
      .reduce((s,d)=>{
        const rate = (!d.currency||d.currency==='EUR') ? 1 : (Number(d.exchange_rate)||1)
        const monthSum = months.reduce((ms,m)=>ms+(Number(d[m])||0),0)
        return s + monthSum * rate
      },0)/1000
  }
  function sumPlan(bu, months) {
    return ['ns_int','ns_ext'].reduce((s,key)=>{
      const row=budget.find(r=>r.bu===bu&&r.cycle===activeCycle&&r.pl_key===key)
      return s+months.reduce((ms,m)=>ms+(row?.[m]||0),0)
    },0)
  }
  function sumPY(bu, months) {
    const row=fy25.find(r=>r.bu===bu&&r.pl_key==='ns')
    return row ? months.reduce((s,m)=>s+(row[m]||0),0) : 0
  }

  const busToShow = selectedBU ? [selectedBU] : ['VGT','ECT']
  const cards = busToShow.map(bu=>({
    bu, label: bu==='VGT'?'VGT · Portugal':'ECT · Spain',
    color: bu==='VGT'?'#1D9E75':'#D85A30',
    actMTD:     sumDeals(bu,[curMonth]),
    actYTD:     sumDeals(bu,ytdMonths),
    actExtMTD:  sumDeals(bu,[curMonth],'External'),
    actIntMTD:  sumDeals(bu,[curMonth],'Internal'),
    actExtYTD:  sumDeals(bu,ytdMonths,'External'),
    actIntYTD:  sumDeals(bu,ytdMonths,'Internal'),
    fcExtYTD:   sumDeals(bu,ytdMonths,'External') + sumForecast(bu,ytdMonths,'External'),
    fcIntYTD:   sumDeals(bu,ytdMonths,'Internal') + sumForecast(bu,ytdMonths,'Internal'),
    planMTD:    sumPlan(bu,[curMonth]),
    planYTD:    sumPlan(bu,ytdMonths),
    planExtYTD: (() => { const r=budget.find(r=>r.bu===bu&&r.cycle===activeCycle&&r.pl_key==='ns_ext'); return ytdMonths.reduce((s,m)=>s+(r?.[m]||0),0) })(),
    planIntYTD: (() => { const r=budget.find(r=>r.bu===bu&&r.cycle===activeCycle&&r.pl_key==='ns_int'); return ytdMonths.reduce((s,m)=>s+(r?.[m]||0),0) })(),
    pyMTD:      sumPY(bu,[curMonth]),
    pyYTD:      sumPY(bu,ytdMonths),
  }))

  const iberia = {
    bu:'ALL', label:'Iberia · Consolidated', color:'#0D2137',
    actMTD:  cards.reduce((s,c)=>s+c.actMTD,0),
    actYTD:  cards.reduce((s,c)=>s+c.actYTD,0),
    planMTD: cards.reduce((s,c)=>s+c.planMTD,0),
    planYTD: cards.reduce((s,c)=>s+c.planYTD,0),
    pyMTD:   cards.reduce((s,c)=>s+c.pyMTD,0),
    pyYTD:   cards.reduce((s,c)=>s+c.pyYTD,0),
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sales performance · {activeCycle} · MTD & YTD</p>
        <span className="text-micro text-gray-400">MTD: <strong>{mtdLabel}</strong> · YTD: <strong>{ytdLabel}</strong></span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {cards.map(c=><BUPerformanceCard key={c.bu} {...c} cycle={activeCycle} mtdLabel={mtdLabel} ytdLabel={ytdLabel}/>)}
      </div>
      {isAdmin && <BUPerformanceCard {...iberia} cycle={activeCycle} mtdLabel={mtdLabel} ytdLabel={ytdLabel}/>}
    </div>
  )
}
