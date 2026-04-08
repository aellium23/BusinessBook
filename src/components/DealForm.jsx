import { useState, useEffect } from 'react'
import { Modal } from '../components/ui'
import { upsertDeal, upsertDealWithIntercompany } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { Link } from 'lucide-react'

const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const YEARS    = [2026,2027,2028,2029,2030]
const REGIONS  = ['Europe','MEA','LATAM','APAC','NA']
const COUNTRY_MAP = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA:    ['UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Egypt','Morocco','Algeria','Tunisia','South Africa','Israel','Jordan','Iraq','Nigeria','Kenya','Ghana','Other MEA'],
  LATAM:  ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Costa Rica','Panama','El Salvador','Guatemala','Ecuador','Bolivia','Venezuela','Dominican Republic','Other LATAM'],
  APAC:   ['Japan','China','South Korea','Australia','India','Singapore','Malaysia','Thailand','Indonesia','Vietnam','New Zealand','Other APAC'],
  NA:     ['USA','Canada','Other NA'],
}

const CAL = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }
const FY_ABS = { Apr:16,May:17,Jun:18,Jul:19,Aug:20,Sep:21,Oct:22,Nov:23,Dec:24,Jan:25,Feb:26,Mar:27 }

function calAbs(m, y) { return (y - 2025) * 12 + CAL[m] }

function calcMonthly(value, csM, csY, ceM, ceY, recM, recY) {
  if (!csM || !csY || !ceM || !ceY) return null
  const cs = calAbs(csM, parseInt(csY)), ce = calAbs(ceM, parseInt(ceY))
  const rec = recM && recY ? calAbs(recM, parseInt(recY)) : cs
  const n = Math.max(1, ce - cs + 1), slice = value / n
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
  bu:'', sales_type:'External', stage:'Pipeline',
  client:'', region:'Europe', country:'',
  sales_owner:'', deal_type:'One-Shot', description:'',
  value_total:'', gm_pct:'',
  rec_month:'', rec_year:'',
  cs_month:'', cs_year:'', ce_month:'', ce_year:'',
  lost_reason:'',
  win_probability:'',
}

export default function DealForm({ deal, onClose, onSaved }) {
  const { profile, isAdmin } = useAuth()
  const [form, setForm] = useState(() => deal ? {
    ...deal,
    value_total: deal.value_total || '',
    gm_pct: deal.gm_pct != null ? (deal.gm_pct * 100).toFixed(1) : '',
    intercompany_value: deal.intercompany_value || '',
  } : {
    ...EMPTY,
    bu: isAdmin ? '' : profile?.role?.toUpperCase() || '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState(null)
  const [icPreview, setIcPreview] = useState(null)

  const isMaint = form.deal_type === 'Maintenance'
  const isECT   = form.bu === 'ECT'
  const hasIC   = isECT && parseFloat(form.intercompany_value) > 0

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-set win probability when stage changes
      if (k === 'stage') {
        const defaults = { Lead:10, Pipeline:30, 'Offer Presented':60, BackLog:80, Invoiced:100, Lost:0 }
        if (defaults[v] !== undefined && !f._prob_edited) {
          next.win_probability = defaults[v]
        }
      }
      if (k === 'win_probability') next._prob_edited = true
      return next
    })
  }

  // Monthly preview for main deal
  useEffect(() => {
    if (!isMaint || !form.value_total || !form.cs_month || !form.cs_year || !form.ce_month || !form.ce_year) {
      setPreview(null); return
    }
    const m = calcMonthly(parseFloat(form.value_total), form.cs_month, form.cs_year,
      form.ce_month, form.ce_year, form.rec_month || null, form.rec_year || null)
    if (m) setPreview(m)
  }, [isMaint, form.value_total, form.cs_month, form.cs_year, form.ce_month, form.ce_year, form.rec_month, form.rec_year])

  // Monthly preview for intercompany VGT mirror
  useEffect(() => {
    if (!hasIC || !preview) { setIcPreview(null); return }
    const icVal = parseFloat(form.intercompany_value)
    const total = preview.reduce((s, v) => s + v, 0)
    if (total === 0) { setIcPreview(null); return }
    setIcPreview(preview.map(v => Math.round((v / total) * icVal * 100) / 100))
  }, [hasIC, form.intercompany_value, preview])

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

    let result
    if (hasIC) {
      result = await upsertDealWithIntercompany(
        payload,
        parseFloat(form.intercompany_value),
        deal?.linked_deal_id || null
      )
    } else {
      result = await upsertDeal({ ...payload, intercompany_value: null })
    }

    if (result.error) setError(result.error.message)
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

        {/* BU + Sales Type + Stage */}
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
              {['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Client */}
        <div>
          <label className="label">Client / Site *</label>
          <input className="input" value={form.client} onChange={e => set('client', e.target.value)} placeholder="Hospital or organisation" />
        </div>

        {/* Region + Country */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Region</label>
            <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country','') }}>
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

        {/* Owner + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sales Owner</label>
            <input className="input" value={form.sales_owner} onChange={e => set('sales_owner', e.target.value)} />
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

        {/* Lost reason */}
        {form.stage === 'Lost' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <label className="label text-red-600">Reason lost *</label>
            <select className="select bg-white" value={form.lost_reason} onChange={e => set('lost_reason', e.target.value)}>
              <option value="">— Select reason —</option>
              <option>Price too high</option>
              <option>Lost to competitor</option>
              <option>Budget freeze</option>
              <option>Project cancelled</option>
              <option>No decision</option>
              <option>Technical requirements not met</option>
              <option>Other</option>
            </select>
            {form.lost_reason === 'Other' && (
              <input className="input mt-2" placeholder="Specify reason…"
                value={form.lost_reason_detail || ''} onChange={e => set('lost_reason_detail', e.target.value)}/>
            )}
          </div>
        )}

        {/* Value + GM + Win Probability */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Value € (total)</label>
            <input className="input" type="number" value={form.value_total} onChange={e => set('value_total', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">GM %</label>
            <input className="input" type="number" value={form.gm_pct} onChange={e => set('gm_pct', e.target.value)} placeholder="0.0" />
          </div>
          <div>
            <label className="label">
              Win prob %
              {['Lead','Pipeline','Offer Presented'].includes(form.stage) && (
                <span className="ml-1 text-purple-500 font-normal">editable</span>
              )}
            </label>
            <input
              className={`input ${!['Lead','Pipeline','Offer Presented'].includes(form.stage) ? 'bg-gray-50 text-gray-400' : ''}`}
              type="number" min="0" max="100"
              value={form.win_probability ?? ''}
              onChange={e => set('win_probability', e.target.value)}
              disabled={!['Lead','Pipeline','Offer Presented'].includes(form.stage)}
              placeholder={
                form.stage === 'Lead' ? '10' :
                form.stage === 'Pipeline' ? '30' :
                form.stage === 'Offer Presented' ? '60' :
                form.stage === 'BackLog' ? '80' :
                form.stage === 'Invoiced' ? '100' : '0'
              }
            />
          </div>
        </div>

        {/* ── INTERCOMPANY (ECT only) ────────────────────────────── */}
        {isECT && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link size={14} className="text-amber-600" />
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Intercompany · VGT cost
              </p>
            </div>
            <p className="text-xs text-amber-600">
              If ECT purchases from VGT to deliver this deal, enter the VGT amount below.
              A linked VGT Internal deal will be created automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">VGT cost (€)</label>
                <input className="input bg-white" type="number"
                  value={form.intercompany_value}
                  onChange={e => set('intercompany_value', e.target.value)}
                  placeholder="0 — leave empty if none" />
              </div>
              {hasIC && form.value_total && (
                <div className="flex items-end pb-2">
                  <div>
                    <p className="text-xs text-amber-600">ECT margin after VGT cost</p>
                    <p className="text-lg font-bold text-amber-800">
                      €{((parseFloat(form.value_total) - parseFloat(form.intercompany_value)) / 1000).toFixed(1)}K
                    </p>
                    <p className="text-xs text-amber-500">
                      {form.value_total > 0
                        ? Math.round((1 - parseFloat(form.intercompany_value) / parseFloat(form.value_total)) * 100)
                        : 0}% of deal value
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* VGT mirror preview */}
            {hasIC && (
              <div className="bg-vgt/5 border border-vgt/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-vgt mb-1">
                  VGT deal that will be created automatically
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <span>Client: <strong>{form.client || '—'}</strong></span>
                  <span>Value: <strong>€{(parseFloat(form.intercompany_value)/1000).toFixed(1)}K</strong></span>
                  <span>BU: <strong>VGT</strong></span>
                  <span>Type: <strong>Internal</strong></span>
                  <span>Stage: <strong>{form.stage}</strong></span>
                  <span>Description: <strong>[Intercompany]</strong></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Maintenance contract dates */}
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
                  FY26: €{(preview.reduce((s,v)=>s+v,0)/1000).toFixed(1)}K
                </p>
                {icPreview && (
                  <div className="mt-2">
                    <p className="text-xs text-amber-600 font-medium mb-1">VGT intercompany mirror (FY26)</p>
                    <div className="grid grid-cols-6 gap-1">
                      {MONTHS.map((m, i) => (
                        <div key={m} className={`text-center rounded p-1 ${icPreview[i] > 0 ? 'bg-amber-200' : 'bg-amber-50'}`}>
                          <p className="text-[9px] text-amber-500">{m}</p>
                          <p className="text-[10px] font-bold text-amber-800">{icPreview[i] > 0 ? `€${(icPreview[i]/1000).toFixed(1)}K` : '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* One-Shot monthly */}
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
