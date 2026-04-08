import { useState, useEffect } from 'react'
import { Modal } from '../components/ui'
import { upsertDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const YEARS  = [2026,2027,2028,2029,2030]
const REGIONS = ['Europe','MEA','LATAM','APAC','NA']
const COUNTRY_MAP = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA:    ['UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Egypt','Morocco','Algeria','Tunisia','South Africa','Israel','Jordan','Iraq','Nigeria','Kenya','Ghana','Other MEA'],
  LATAM:  ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Costa Rica','Panama','El Salvador','Guatemala','Ecuador','Bolivia','Venezuela','Dominican Republic','Other LATAM'],
  APAC:   ['Japan','China','South Korea','Australia','India','Singapore','Malaysia','Thailand','Indonesia','Vietnam','New Zealand','Other APAC'],
  NA:     ['USA','Canada','Other NA'],
}

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const CAL = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }
const FY_ABS = { Apr:16,May:17,Jun:18,Jul:19,Aug:20,Sep:21,Oct:22,Nov:23,Dec:24,Jan:25,Feb:26,Mar:27 }

function calAbs(month, year) {
  return (year - 2025) * 12 + CAL[month]
}

function calcMonthly(value, csM, csY, ceM, ceY, recM, recY) {
  if (!csM || !csY || !ceM || !ceY) return null
  const cs  = calAbs(csM, parseInt(csY))
  const ce  = calAbs(ceM, parseInt(ceY))
  const rec = recM && recY ? calAbs(recM, parseInt(recY)) : cs
  const n   = Math.max(1, ce - cs + 1)
  const slice = value / n
  return MONTHS.map(m => {
    const i = FY_ABS[m]
    if (i < rec) return 0
    const catchup = Math.max(0, Math.min(i, rec) - cs + 1)
    if (i === rec) return slice * catchup
    if (i <= ce) return slice
    return 0
  })
}

const EMPTY = {
  bu: '', sales_type: 'External', stage: 'Pipeline',
  client: '', region: 'Europe', country: '',
  sales_owner: '', deal_type: 'One-Shot', description: '',
  value_total: '', gm_pct: '',
  rec_month: '', rec_year: '',
  cs_month: '', cs_year: '', ce_month: '', ce_year: '',
}

export default function DealForm({ deal, onClose, onSaved }) {
  const { profile, isAdmin } = useAuth()
  const [form, setForm] = useState(() => deal ? {
    ...deal,
    value_total: deal.value_total || '',
    gm_pct: deal.gm_pct != null ? (deal.gm_pct * 100).toFixed(1) : '',
  } : {
    ...EMPTY,
    bu: isAdmin ? '' : profile?.role?.toUpperCase() || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const isMaint = form.deal_type === 'Maintenance'

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!isMaint || !form.value_total || !form.cs_month || !form.cs_year || !form.ce_month || !form.ce_year) {
      setPreview(null); return
    }
    const monthly = calcMonthly(
      parseFloat(form.value_total),
      form.cs_month, form.cs_year,
      form.ce_month, form.ce_year,
      form.rec_month || null, form.rec_year || null
    )
    if (monthly) setPreview(monthly)
  }, [isMaint, form.value_total, form.cs_month, form.cs_year, form.ce_month, form.ce_year, form.rec_month, form.rec_year])

  async function handleSave() {
    if (!form.bu || !form.client || !form.stage) { setError('BU, Client and Stage are required'); return }
    setSaving(true); setError('')

    const monthly = isMaint && preview
      ? Object.fromEntries(MONTHS_K.map((m, i) => [m, preview[i] || 0]))
      : Object.fromEntries(MONTHS_K.map(m => [m, parseFloat(form[m]) || 0]))

    const payload = {
      ...(deal?.id ? { id: deal.id } : {}),
      bu: form.bu, sales_type: form.sales_type, stage: form.stage,
      client: form.client, region: form.region, country: form.country,
      sales_owner: form.sales_owner, deal_type: form.deal_type,
      description: form.description,
      value_total: parseFloat(form.value_total) || 0,
      gm_pct: parseFloat(form.gm_pct) / 100 || 0,
      rec_month: form.rec_month || null, rec_year: parseInt(form.rec_year) || null,
      cs_month: form.cs_month || null, cs_year: parseInt(form.cs_year) || null,
      ce_month: form.ce_month || null, ce_year: parseInt(form.ce_year) || null,
      ...monthly,
    }
    const { error } = await upsertDeal(payload)
    if (error) setError(error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <Modal open title={deal?.id ? 'Edit deal' : 'New deal'} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save deal'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* Row 1: BU + Sales Type + Stage */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">BU *</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)} disabled={!isAdmin}>
              <option value="">—</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
          <div>
            <label className="label">Sales Type</label>
            <select className="select" value={form.sales_type} onChange={e => set('sales_type', e.target.value)}>
              <option>Internal</option>
              <option>External</option>
            </select>
          </div>
          <div>
            <label className="label">Stage *</label>
            <select className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
              {['Lead','Pipeline','BackLog','Invoiced'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Client */}
        <div>
          <label className="label">Client / Site *</label>
          <input className="input" value={form.client} onChange={e => set('client', e.target.value)} placeholder="Hospital name or organisation" />
        </div>

        {/* Region + Country */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Region</label>
            <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country', '') }}>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Country</label>
            <select className="select" value={form.country} onChange={e => set('country', e.target.value)}>
              <option value="">—</option>
              {(COUNTRY_MAP[form.region] || []).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Sales Owner + Deal Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sales Owner</label>
            <input className="input" value={form.sales_owner} onChange={e => set('sales_owner', e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className="label">Deal Type</label>
            <select className="select" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
              <option>One-Shot</option>
              <option>Maintenance</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Project details" />
        </div>

        {/* Value + GM */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Value € (total)</label>
            <input className="input" type="number" value={form.value_total} onChange={e => set('value_total', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">GM %</label>
            <input className="input" type="number" value={form.gm_pct} onChange={e => set('gm_pct', e.target.value)} placeholder="0.0" />
          </div>
        </div>

        {/* Maintenance fields */}
        {isMaint && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Maintenance · contract dates</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contract start</label>
                <div className="flex gap-2">
                  <select className="select" value={form.cs_month} onChange={e => set('cs_month', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <select className="select w-24" value={form.cs_year} onChange={e => set('cs_year', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Contract end</label>
                <div className="flex gap-2">
                  <select className="select" value={form.ce_month} onChange={e => set('ce_month', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <select className="select w-24" value={form.ce_year} onChange={e => set('ce_year', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Recognition start (if delayed)</label>
              <div className="flex gap-2">
                <select className="select" value={form.rec_month} onChange={e => set('rec_month', e.target.value)}>
                  <option value="">Month (default = contract start)</option>
                  {MONTHS.map(m => <option key={m}>{m}</option>)}
                </select>
                <select className="select w-24" value={form.rec_year} onChange={e => set('rec_year', e.target.value)}>
                  <option value="">Year</option>
                  {YEARS.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-2">Revenue preview (FY26)</p>
                <div className="grid grid-cols-6 gap-1">
                  {MONTHS.map((m, i) => (
                    <div key={m} className={`text-center rounded p-1 ${preview[i] > 0 ? 'bg-blue-200' : 'bg-blue-100/50'}`}>
                      <p className="text-[9px] text-blue-500">{m}</p>
                      <p className="text-[10px] font-bold text-blue-800">{preview[i] > 0 ? `€${(preview[i]/1000).toFixed(1)}K` : '—'}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-blue-500 mt-1 text-right">
                  FY26 total: €{(preview.reduce((s,v)=>s+v,0)/1000).toFixed(1)}K
                </p>
              </div>
            )}
          </div>
        )}

        {/* One-Shot monthly inputs */}
        {!isMaint && (
          <div>
            <p className="label mb-2">Monthly recognition · FY26</p>
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map((m, i) => (
                <div key={m}>
                  <label className="text-[10px] text-gray-400">{m}</label>
                  <input className="input py-1 text-xs" type="number"
                    value={form[MONTHS_K[i]] || ''} onChange={e => set(MONTHS_K[i], e.target.value)} placeholder="0" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
