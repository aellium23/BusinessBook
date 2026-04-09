import { useState, useEffect } from 'react'
import { Modal } from '../components/ui'
import { upsertDeal, upsertDealWithIntercompany } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Link, Clock, Plus, AlertCircle, CheckCircle, XCircle, RefreshCw as CounterIcon } from 'lucide-react'

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
  currency: 'EUR',
  exchange_rate: '',
  is_sla: false,
  sla_type: '',
  sla_annual_value: '',
  sla_start_date: '',
  sla_end_date: '',
  sla_owner: '',
  sla_renewal_target: '',
  end_customer: '',
  distributor: '',
  hub: '',
  end_customer_value: '',
  list_price: '',
  discount_requested: '',
  discount_note_dist: '',
  product: '',
  equipment_count: '',
  annual_studies: '',
  annual_exams: '',
}

function DiscountApprovalPanel({ deal, onSave }) {
  const [approved, setApproved] = useState(deal.discount_approved ?? '')
  const [transfer, setTransfer] = useState(deal.transfer_price ?? '')
  const [note, setNote]         = useState(deal.discount_note || '')
  const [status, setStatus]     = useState(deal.discount_status || 'pending')
  const [saving, setSaving]     = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('deals').update({
      discount_approved: parseFloat(approved) || null,
      transfer_price:    parseFloat(transfer) || null,
      discount_note:     note,
      discount_status:   status,
    }).eq('id', deal.id)
    setSaving(false)
    onSave?.()
  }

  return (
    <div className="border-t border-gray-200 pt-3 space-y-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">VGT Response</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Decision</label>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="counter">Counter offer</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="label">Approved discount %</label>
          <input className="input" type="number" min="0" max="100"
            value={approved} onChange={e => setApproved(e.target.value)}
            placeholder="e.g. 12"/>
        </div>
        <div>
          <label className="label">Transfer price €</label>
          <input className="input" type="number"
            value={transfer} onChange={e => setTransfer(e.target.value)}
            placeholder="Price to distributor"/>
        </div>
      </div>
      <div>
        <label className="label">Note to distributor</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Reason, conditions, expiry…"/>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full btn-primary text-xs">
        {saving ? 'Saving…' : 'Save VGT response'}
      </button>
    </div>
  )
}

export default function DealForm({ deal, onClose, onSaved }) {
  const { profile, isAdmin } = useAuth()
  const [form, setForm] = useState(() => deal ? {
    ...deal,
    value_total: deal.value_total || '',
    gm_pct: deal.gm_pct != null ? (deal.gm_pct * 100).toFixed(1) : '',
    intercompany_value: deal.intercompany_value || '',
    currency: deal.currency || 'EUR',
    exchange_rate: deal.exchange_rate || '',
    is_sla: deal.is_sla || false,
    sla_type: deal.sla_type || '',
    sla_annual_value: deal.sla_annual_value || '',
    sla_start_date: deal.sla_start_date || '',
    sla_end_date: deal.sla_end_date || '',
    sla_owner: deal.sla_owner || '',
    sla_renewal_target: deal.sla_renewal_target || '',
    win_probability: deal.win_probability ?? '',
    end_customer: deal.end_customer || '',
    distributor: deal.distributor || '',
    hub: deal.hub || '',
    end_customer_value: deal.end_customer_value || '',
    list_price: deal.list_price || '',
    discount_requested: deal.discount_requested || '',
    discount_note_dist: deal.discount_note_dist || '',
    product: deal.product || '',
    equipment_count: deal.equipment_count || '',
    annual_studies: deal.annual_studies || '',
    annual_exams: deal.annual_exams || '',
  } : {
    ...EMPTY,
    bu: isAdmin ? '' : profile?.role?.toUpperCase() || '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState(null)
  const [icPreview, setIcPreview] = useState(null)
  const [activities, setActivities] = useState([])
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [actNote, setActNote] = useState('')
  const [addingAct, setAddingAct] = useState(false)

  const isMaint = form.deal_type === 'Maintenance'
  const isDistributor = profile?.role === 'distributor'

  // Distributor stage flow — restricted stages
  const DIST_STAGES = ['Lead', 'Offer Presented', 'BackLog', 'Lost']

  // Products list — extensible
  const PRODUCTS = [
    { value: 'Dose',            label: 'Dose',                    hasEquipment: true,  hasStudies: true,  hasExams: false },
    { value: 'AI Reporting',    label: 'AI Reporting',            hasEquipment: false, hasStudies: false, hasExams: true  },
    { value: 'CWM 5',          label: 'CWM 5',                   hasEquipment: false, hasStudies: false, hasExams: true  },
    { value: 'Command Center',  label: 'Command Center',          hasEquipment: false, hasStudies: false, hasExams: true  },
  ]
  const selectedProduct = PRODUCTS.find(p => p.value === form.product)

  // Load activity log for existing deal
  useEffect(() => {
    if (!deal?.id) return
    supabase.from('deal_activities').select('*')
      .eq('deal_id', deal.id).order('created_at', { ascending: false })
      .then(({ data }) => setActivities(data || []))
  }, [deal?.id])

  async function addActivity() {
    if (!deal?.id || !actNote) return
    setAddingAct(true)
    await supabase.from('deal_activities').insert({
      deal_id: deal.id,
      user_id: profile?.id,
      user_name: profile?.full_name || profile?.email,
      action_type: 'note',
      note: actNote,
      next_action: nextAction || null,
      next_action_date: nextActionDate || null,
    })
    const { data } = await supabase.from('deal_activities').select('*')
      .eq('deal_id', deal.id).order('created_at', { ascending: false })
    setActivities(data || [])
    setActNote(''); setNextAction(''); setNextActionDate('')
    setAddingAct(false)
  }
  const isECT   = form.bu === 'ECT'
  const hasIC   = isECT && parseFloat(form.intercompany_value) > 0

  // Auto-set BU=VGT for distributors
  useEffect(() => {
    if (isDistributor && !form.bu) set('bu', 'VGT')
  }, [isDistributor])

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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              {(isDistributor ? DIST_STAGES : ['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost']).map(s => <option key={s}>{s}</option>)}
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

        {/* Currency selector */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex-1">
            <label className="label">Currency</label>
            <div className="flex gap-2 mt-1">
              {['EUR','USD','GBP'].map(c => (
                <button key={c} type="button"
                  onClick={() => { set('currency', c); if (c === 'EUR') set('exchange_rate', '1') }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                    form.currency === c
                      ? c === 'EUR' ? 'bg-blue-600 text-white'
                      : c === 'USD' ? 'bg-green-600 text-white'
                      : 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {c === 'EUR' ? '€ EUR' : c === 'USD' ? '$ USD' : '£ GBP'}
                </button>
              ))}
            </div>
          </div>
          {form.currency !== 'EUR' && (
            <div className="shrink-0">
              <label className="label">Rate to EUR</label>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-gray-400">1 {form.currency} =</span>
                <input className="input w-20 text-center" type="number" step="0.0001"
                  value={form.exchange_rate}
                  onChange={e => set('exchange_rate', e.target.value)}
                  placeholder="0.0000"/>
                <span className="text-xs text-gray-400">EUR</span>
              </div>
              {form.exchange_rate && form.value_total && (
                <p className="text-[10px] text-blue-600 mt-1 text-right">
                  ≈ €{(parseFloat(form.value_total) * parseFloat(form.exchange_rate)).toLocaleString('pt-PT', {maximumFractionDigits:0})}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Value + GM + Win Probability */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">
              Value {form.currency === 'EUR' ? '€' : form.currency === 'USD' ? '$' : '£'} (total)
            </label>
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

        {/* ── PRODUCT ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Product</p>

          <div>
            <label className="label">Product *</label>
            <select className="select" value={form.product} onChange={e => set('product', e.target.value)}>
              <option value="">— Select product —</option>
              {PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Dose-specific fields */}
          {selectedProduct?.hasEquipment && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  Equipment to integrate
                  <span className="text-gray-400 font-normal ml-1">(total units)</span>
                </label>
                <input className="input" type="number" min="0"
                  value={form.equipment_count}
                  onChange={e => set('equipment_count', e.target.value)}
                  placeholder="e.g. 12"/>
              </div>
              <div>
                <label className="label">
                  Annual studies volume
                  <span className="text-gray-400 font-normal ml-1">(studies/year)</span>
                </label>
                <input className="input" type="number" min="0"
                  value={form.annual_studies}
                  onChange={e => set('annual_studies', e.target.value)}
                  placeholder="e.g. 50000"/>
              </div>
            </div>
          )}

          {/* Other products — exams volume */}
          {selectedProduct?.hasExams && (
            <div>
              <label className="label">
                Annual exams volume
                <span className="text-gray-400 font-normal ml-1">(exams/year)</span>
              </label>
              <input className="input" type="number" min="0"
                value={form.annual_exams}
                onChange={e => set('annual_exams', e.target.value)}
                placeholder="e.g. 100000"/>
            </div>
          )}

          {/* Product summary badge */}
          {form.product && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded font-medium">
                {form.product}
              </span>
              {form.equipment_count && (
                <span className="text-xs text-gray-500">
                  📡 {form.equipment_count} equipments
                </span>
              )}
              {form.annual_studies && (
                <span className="text-xs text-gray-500">
                  📊 {Number(form.annual_studies).toLocaleString()} studies/yr
                </span>
              )}
              {form.annual_exams && (
                <span className="text-xs text-gray-500">
                  📋 {Number(form.annual_exams).toLocaleString()} exams/yr
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── DISTRIBUTION CHAIN ───────────────────────────────── */}
        {form.region !== 'Europe' || form.sales_type === 'External' ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Distribution chain</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {form.client} = who VGT invoices ·
                  {form.hub ? ` via ${form.hub}` : form.distributor ? ` direct to distributor` : ' direct'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">End customer (final client)</label>
                <input className="input" value={form.end_customer}
                  onChange={e => set('end_customer', e.target.value)}
                  placeholder="e.g. Hospital La Paz"/>
              </div>
              <div>
                <label className="label">End customer project value €</label>
                <input className="input" type="number" value={form.end_customer_value}
                  onChange={e => set('end_customer_value', e.target.value)}
                  placeholder="Full project value"/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Distributor <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" value={form.distributor}
                  onChange={e => set('distributor', e.target.value)}
                  placeholder="e.g. Fujifilm Mexico"/>
              </div>
              <div>
                <label className="label">HUB — Fujifilm entity <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" value={form.hub}
                  onChange={e => set('hub', e.target.value)}
                  list="hub-list"
                  placeholder="e.g. HCUS, Fujifilm Spain"/>
                <datalist id="hub-list">
                  {['HCUS','Fujifilm Spain','Fujifilm France','Fujifilm Germany',
                    'Fujifilm Italy','Fujifilm UK','Fujifilm Netherlands',
                    'Fujifilm Middle East','Fujifilm Australia'].map(h =>
                    <option key={h} value={h}/>
                  )}
                </datalist>
              </div>
            </div>

            {/* Chain visualisation */}
            {(form.end_customer || form.distributor || form.hub) && (
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] bg-white border border-gray-100 rounded-lg px-3 py-2">
                <span className="font-medium text-gray-500">Chain:</span>
                {form.end_customer && <><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">{form.end_customer}</span><span className="text-gray-300">→</span></>}
                {form.distributor && <><span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">{form.distributor}</span><span className="text-gray-300">→</span></>}
                {form.hub && <><span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">{form.hub}</span><span className="text-gray-300">→</span></>}
                <span className="bg-vgt/10 text-vgt px-2 py-0.5 rounded font-medium">VGT</span>
                {form.end_customer_value && form.value_total && (
                  <span className="ml-auto text-gray-400">
                    Project: €{Number(form.end_customer_value).toLocaleString()} → VGT: €{Number(form.value_total).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* ── DISCOUNT REQUEST ─────────────────────────────────── */}
        {(isDistributor || deal?.discount_status || deal?.discount_requested) && (
          <div className={`rounded-xl p-4 space-y-3 border ${
            deal?.discount_status === 'approved' ? 'bg-green-50 border-green-200' :
            deal?.discount_status === 'rejected' ? 'bg-red-50 border-red-200' :
            deal?.discount_status === 'counter'  ? 'bg-amber-50 border-amber-200' :
            deal?.discount_status === 'pending'  ? 'bg-blue-50 border-blue-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Discount request
              </p>
              {deal?.discount_status && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  deal.discount_status === 'approved' ? 'bg-green-100 text-green-700' :
                  deal.discount_status === 'rejected' ? 'bg-red-100 text-red-700' :
                  deal.discount_status === 'counter'  ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {deal.discount_status === 'approved' && <CheckCircle size={10}/>}
                  {deal.discount_status === 'rejected' && <XCircle size={10}/>}
                  {deal.discount_status === 'counter'  && <CounterIcon size={10}/>}
                  {deal.discount_status === 'pending'  && <AlertCircle size={10}/>}
                  {deal.discount_status.charAt(0).toUpperCase() + deal.discount_status.slice(1)}
                </span>
              )}
            </div>

            {/* Distributor fills these */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">List price €</label>
                <input className="input" type="number"
                  value={form.list_price}
                  onChange={e => set('list_price', e.target.value)}
                  disabled={!isDistributor && !!deal?.id}
                  placeholder="Catalogue price"/>
              </div>
              <div>
                <label className="label">Discount requested %</label>
                <input className="input" type="number" min="0" max="100"
                  value={form.discount_requested}
                  onChange={e => set('discount_requested', e.target.value)}
                  disabled={!isDistributor && !!deal?.id}
                  placeholder="e.g. 15"/>
              </div>
              <div>
                <label className="label">Your price to client €</label>
                <div className="input bg-gray-50 text-gray-600 text-sm">
                  {form.list_price && form.discount_requested
                    ? `€${(Number(form.list_price) * (1 - Number(form.discount_requested)/100)).toLocaleString('pt-PT', {maximumFractionDigits:0})}`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Distributor note */}
            <div>
              <label className="label">
                {isDistributor ? 'Your note to VGT' : 'Distributor note'}
              </label>
              <input className="input" value={form.discount_note_dist}
                onChange={e => set('discount_note_dist', e.target.value)}
                disabled={!isDistributor}
                placeholder="Reason for discount request, competition, client budget…"/>
            </div>

            {/* Admin response - only visible/editable by admin/vgt */}
            {!isDistributor && deal?.discount_requested && (
              <DiscountApprovalPanel deal={deal} onSave={onSaved}/>
            )}

            {/* Distributor sees response */}
            {isDistributor && deal?.discount_status && deal.discount_status !== 'pending' && (
              <div className={`p-3 rounded-lg ${
                deal.discount_status === 'approved' ? 'bg-green-100' :
                deal.discount_status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'
              }`}>
                <p className="text-xs font-semibold text-gray-700 mb-1">VGT response</p>
                {deal.discount_approved !== null && (
                  <p className="text-sm font-bold text-gray-900">
                    Approved discount: {deal.discount_approved}%
                    {deal.transfer_price && ` → Transfer price: €${deal.transfer_price.toLocaleString()}`}
                  </p>
                )}
                {deal.discount_note && <p className="text-xs text-gray-600 mt-0.5">{deal.discount_note}</p>}
              </div>
            )}
          </div>
        )}

        {/* ── SLA SECTION ──────────────────────────────────────── */}
        <div className={`rounded-xl p-4 space-y-3 border ${form.is_sla ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">SLA — Service Level Agreement</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Recurring contract · active during contract period</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{form.is_sla ? 'Active SLA' : 'Not SLA'}</span>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${form.is_sla ? 'bg-blue-500' : 'bg-gray-300'}`}
                onClick={() => set('is_sla', !form.is_sla)}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_sla ? 'translate-x-5' : 'translate-x-0'}`}/>
              </div>
            </label>
          </div>
          {form.is_sla && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">SLA Type</label>
                  <select className="select bg-white" value={form.sla_type||''} onChange={e => set('sla_type', e.target.value)}>
                    <option value="">— Select type —</option>
                    <option>Software Maintenance</option>
                    <option>Hardware Maintenance</option>
                    <option>Full Service (SW+HW)</option>
                    <option>Managed Service</option>
                    <option>Subscription</option>
                    <option>Support & Updates</option>
                  </select>
                </div>
                <div>
                  <label className="label">Annual SLA value €</label>
                  <input className="input bg-white" type="number"
                    value={form.sla_annual_value||''} onChange={e => set('sla_annual_value', e.target.value)}
                    placeholder="Annual contract value"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Contract start</label>
                  <input className="input bg-white" type="date"
                    value={form.sla_start_date||''} onChange={e => set('sla_start_date', e.target.value)}/>
                </div>
                <div>
                  <label className="label">Contract end</label>
                  <input className="input bg-white" type="date"
                    value={form.sla_end_date||''} onChange={e => set('sla_end_date', e.target.value)}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">SLA Owner</label>
                  <input className="input bg-white" value={form.sla_owner} onChange={e => set('sla_owner', e.target.value)} placeholder="Responsible for renewal"/>
                </div>
                <div>
                  <label className="label">Renewal target %</label>
                  <input className="input bg-white" type="number" min="0" max="100"
                    value={form.sla_renewal_target} onChange={e => set('sla_renewal_target', e.target.value)}
                    placeholder="e.g. 5"/>
                </div>
              </div>
              {/* Expiry warning */}
              {form.sla_end_date && (() => {
                const days = Math.ceil((new Date(form.sla_end_date) - new Date()) / 86400000)
                if (days < 0) return <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">⚠ Contract expired {Math.abs(days)} days ago</p>
                if (days < 90) return <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">⏰ Expires in {days} days — renewal needed</p>
                return <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">✓ Active — {days} days remaining</p>
              })()}
            </div>
          )}
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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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

        {/* Activity Log (only for existing deals) */}
        {deal?.id && (
          <div className="space-y-2">
            <p className="label flex items-center gap-1.5"><Clock size={12}/> Activity log</p>

            {/* Add activity */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <textarea className="input text-xs resize-none" rows={2}
                placeholder="Note or update…"
                value={actNote} onChange={e => setActNote(e.target.value)}/>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-xs py-1" placeholder="Next action"
                  value={nextAction} onChange={e => setNextAction(e.target.value)}/>
                <input className="input text-xs py-1" type="date"
                  value={nextActionDate} onChange={e => setNextActionDate(e.target.value)}/>
              </div>
              <button onClick={addActivity} disabled={!actNote || addingAct}
                className="btn-secondary text-xs w-full">
                <Plus size={11}/> {addingAct ? 'Adding…' : 'Add note'}
              </button>
            </div>

            {/* Activity list */}
            {activities.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {activities.map(a => (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium text-gray-500">{a.user_name || 'User'}</span>
                      <span className="text-[10px] text-gray-400">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-700">{a.note}</p>
                    {a.next_action && (
                      <p className="text-[10px] text-blue-600 mt-0.5">
                        → {a.next_action}{a.next_action_date ? ` · ${new Date(a.next_action_date).toLocaleDateString()}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
