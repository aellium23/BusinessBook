import { useState, useEffect } from 'react'
import { Modal } from '../components/ui'
import { upsertDeal, upsertDealWithIntercompany } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useFxRates } from '../hooks/useFxRates'
import { Link, Clock, Plus, AlertCircle, CheckCircle, XCircle, RefreshCw as CounterIcon } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import AttachmentsList from './AttachmentsList'
import ContactsList from './ContactsList'
import DealTimeline from './DealTimeline'
import SearchableSelect from './SearchableSelect'
import ProductLineItems from './ProductLineItems'
import { FORECAST_CATEGORIES, defaultForecastFromStage, DISTRIBUTION_PATHS, computeMargins, BUSINESS_MODELS } from '../constants'
import { formatK } from './ui'
import { saveDealProducts } from '../hooks/useDealProducts'

// ── MarginsPanel — live calculation of margin per level ──────────────────
function MarginsPanel({ form }) {
  const m = computeMargins({
    distribution_path:  form.distribution_path,
    value_total:        parseFloat(form.value_total) || 0,
    vgt_cost:           parseFloat(form.vgt_cost) || 0,
    distributor_price:  parseFloat(form.distributor_price) || 0,
    end_customer_price: parseFloat(form.end_customer_price) || 0,
  })
  if (!m) return null
  const rows = [
    { label: 'VGT', value: m.vgt, color: 'bg-vgt/10 text-vgt' },
    ...(m.hub         ? [{ label: 'Hub',         value: m.hub,         color: 'bg-purple-100 text-purple-700' }] : []),
    ...(m.distributor ? [{ label: 'Distributor', value: m.distributor, color: 'bg-amber-100 text-amber-700'   }] : []),
  ]
  const hasValues = rows.some(r => r.value && (r.value.abs !== 0 || r.value.pct !== 0))
  if (!hasValues) return null
  return (
    <div className="bg-white border border-gray-100 rounded-control p-3">
      <p className="text-micro font-semibold text-gray-700 uppercase tracking-wide mb-2">
        Margin per level
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rows.map(r => (
          <div key={r.label} className={`rounded-control px-3 py-2 ${r.color}`}>
            <p className="text-micro font-semibold uppercase tracking-wide opacity-70">{r.label}</p>
            <p className="text-sm font-bold mt-0.5">{formatK(r.value.abs)}</p>
            <p className="text-micro opacity-70">{r.value.pct.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const YEARS    = [2023,2024,2025,2026,2027,2028,2029,2030,2031]
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
  cs_day:1, cs_month:'', cs_year:'', ce_day:31, ce_month:'', ce_year:'',
  lost_reason:'',
  win_probability:'',
  currency: 'EUR',
  exchange_rate: '',
  is_sla: false,
  sla_type: '',
  sla_annual_value: '',
  sla_billing_month: '',
  sla_billing_year: '',
  sla_owner: '',
  sla_renewal_target: '',
  end_customer: '',
  distributor: '',
  hub: '',
  end_customer_value: '',
  // Structured distribution network (PR 5)
  distribution_path:  '',
  distributor_id:     null,
  hub_id:             null,
  vgt_cost:           '',
  distributor_price:  '',
  end_customer_price: '',
  company_id: '',
  list_price: '',
  discount_requested: '',
  discount_note_dist: '',
  product: '',
  business_model: '',
  warranty_months: 36,
  equipment_count: '',
  annual_studies: '',
  annual_exams: '',
}

// ── SLA Revenue Recognition Calculator ─────────────────────────────────
// Logic: bill month = retroactive catchup + linear for remaining months in FY26
const FY26_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const ALL_MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function calcSLARecognition({ startDay, startMonth, startYear, endDay, endMonth, endYear, billingMonth, billingYear, annualValue, currency, exchangeRate }) {
  if (!startMonth || !startYear || !endMonth || !endYear || !billingMonth || !billingYear || !annualValue) return null

  const startDate = new Date(`${startYear}-${String(ALL_MONTHS.indexOf(startMonth)+1).padStart(2,'0')}-${String(startDay||1).padStart(2,'0')}`)
  const endDate   = new Date(`${endYear}-${String(ALL_MONTHS.indexOf(endMonth)+1).padStart(2,'0')}-${String(endDay||28).padStart(2,'0')}`)
  const billDate  = new Date(`${billingYear}-${String(ALL_MONTHS.indexOf(billingMonth)+1).padStart(2,'0')}-01`)

  // Total contract duration in days
  const totalDays = (endDate - startDate) / 86400000 + 1
  if (totalDays <= 0) return null

  // Daily rate
  const rate = parseFloat(exchangeRate) || 1
  const valueEUR = parseFloat(annualValue) * (currency === 'EUR' ? 1 : rate)
  const dailyRate = valueEUR / totalDays

  // FY26 months: Apr 2026 → Mar 2027
  const fy26Start = new Date('2026-04-01')
  const fy26End   = new Date('2027-03-31')

  const recognition = {}
  FY26_MONTHS.forEach((m, i) => {
    const yr = i < 9 ? 2026 : 2027  // Apr-Dec=2026, Jan-Mar=2027
    const mNum = ALL_MONTHS.indexOf(m) + 1
    const monthStart = new Date(`${yr}-${String(mNum).padStart(2,'0')}-01`)
    const monthEnd   = new Date(yr, mNum, 0) // last day of month
    recognition[m] = { days: 0, value: 0, type: 'none' }

    // Is this month within contract period?
    if (monthEnd < startDate || monthStart > endDate) return

    // Days of contract within this month
    const overlapStart = monthStart < startDate ? startDate : monthStart
    const overlapEnd   = monthEnd > endDate ? endDate : monthEnd
    const days = Math.max(0, (overlapEnd - overlapStart) / 86400000 + 1)
    recognition[m].days = days
    recognition[m].rawValue = dailyRate * days
  })

  // Apply billing logic: on billing month, catch up all previous months
  const billMonthIdx = FY26_MONTHS.indexOf(billingMonth)
  if (billMonthIdx < 0) return null

  let catchupTotal = 0
  FY26_MONTHS.forEach((m, i) => {
    if (i < billMonthIdx) {
      catchupTotal += recognition[m].rawValue || 0
      recognition[m].value = 0
      recognition[m].type = 'deferred'
    }
  })

  // Billing month = catchup + own month
  const billM = FY26_MONTHS[billMonthIdx]
  recognition[billM].value = catchupTotal + (recognition[billM].rawValue || 0)
  recognition[billM].type = 'billing'

  // Remaining months after billing = normal
  FY26_MONTHS.forEach((m, i) => {
    if (i > billMonthIdx) {
      recognition[m].value = recognition[m].rawValue || 0
      recognition[m].type = recognition[m].days > 0 ? 'normal' : 'none'
    }
  })

  const totalRecognized = FY26_MONTHS.reduce((s,m) => s + recognition[m].value, 0)
  return { recognition, totalRecognized, totalDays, dailyRate, valueEUR }
}

function DiscountApprovalPanel({ deal, onSave }) {
  const { t } = useTranslation()
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
          <label className="label">{t("df_decision")}</label>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="counter">{t("df_counter")}</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="label">{t("df_approved_disc")}</label>
          <input className="input" type="number" min="0" max="100"
            value={approved} onChange={e => setApproved(e.target.value)}
            placeholder="e.g. 12"/>
        </div>
        <div>
          <label className="label">{t("df_transfer")}</label>
          <input className="input" type="number"
            value={transfer} onChange={e => setTransfer(e.target.value)}
            placeholder="Price to distributor"/>
        </div>
      </div>
      <div>
        <label className="label">{t("df_note_dist")}</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Reason, conditions, expiry…"/>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full btn-primary text-xs">
        {saving ? t("df_saving") : t("df_save")}
      </button>
    </div>
  )
}

export default function DealForm({ deal, onClose, onSaved }) {
  const { profile, isAdmin, canEdit } = useAuth()
  const { t } = useTranslation()
  const { getRate } = useFxRates()
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
    sla_billing_month: deal.sla_billing_month || '',
    sla_billing_year: deal.sla_billing_year || '',
    sla_owner: deal.sla_owner || '',
    sla_renewal_target: deal.sla_renewal_target || '',
    win_probability: deal.win_probability ?? '',
    end_customer: deal.end_customer || '',
    distributor: deal.distributor || '',
    hub: deal.hub || '',
    end_customer_value: deal.end_customer_value || '',
    // Structured distribution network (PR 5)
    distribution_path:  deal.distribution_path || '',
    distributor_id:     deal.distributor_id    || null,
    hub_id:             deal.hub_id            || null,
    vgt_cost:           deal.vgt_cost          || '',
    distributor_price:  deal.distributor_price || '',
    end_customer_price: deal.end_customer_price || '',
    list_price: deal.list_price || '',
    discount_requested: deal.discount_requested || '',
    discount_note_dist: deal.discount_note_dist || '',
    product: deal.product || '',
    business_model: deal.business_model || '',
    warranty_months: deal.warranty_months || 36,
    equipment_count: deal.equipment_count || '',
    annual_studies: deal.annual_studies || '',
    annual_exams: deal.annual_exams || '',
    company_id: deal.company_id || '',
  } : {
    ...EMPTY,
    bu: isAdmin ? '' : profile?.role?.toUpperCase() || '',
    company_id: profile?.role === 'distributor' ? (profile?.company_id || '') : '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState(null)
  const [icPreview, setIcPreview] = useState(null)
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [actNote, setActNote] = useState('')
  const [addingAct, setAddingAct] = useState(false)
  const [timelineNonce, setTimelineNonce] = useState(0) // bump to force DealTimeline refetch
  const [owners, setOwners]           = useState([])
  const [accounts, setAccounts]       = useState([])
  const [distributors, setDistributors] = useState([])
  const [hubs, setHubs]               = useState([])
  const [dealLines, setDealLines]     = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])
  const [existingClients, setExistingClients] = useState([])

  const isMaint = form.deal_type === 'Maintenance'
  const accountsForBU = accounts.filter(a => !form.bu || a.bu === form.bu)

  // Auto-calculate SLA monthly recognition
  useEffect(() => {
    // Carregar sales owners da tabela quotas (nomes únicos por BU)
    supabase.from('quotas')
      .select('sales_owner, bu')
      .order('bu').order('sales_owner')
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(q => q.sales_owner).filter(Boolean))].sort()
          setOwners(unique)
        }
      })
      .catch(e => console.warn('Failed to load quotas:', e?.message))
    // Load accounts (for the optional "Account" link). Scoped by RLS to the
    // user's BU server-side, so we don't need to filter here.
    supabase.from('accounts').select('id, name, bu').order('name')
      .then(({ data }) => { if (data) setAccounts(data) })
      .catch(e => console.warn('Failed to load accounts:', e?.message))
    // Load distribution network (new in PR 5)
    supabase.from('distributors').select('id, name, country, region, hub_id').order('name')
      .then(({ data }) => { if (data) setDistributors(data) })
      .catch(e => console.warn('Failed to load distributors:', e?.message))
    supabase.from('regional_hubs').select('id, name, region').order('name')
      .then(({ data }) => { if (data) setHubs(data) })
      .catch(e => console.warn('Failed to load regional hubs:', e?.message))
    supabase.from('products').select('*').eq('active', true).order('sort_order').order('name')
      .then(({ data }) => { if (data) setCatalogProducts(data) })
      .catch(() => {})
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setExistingClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    }).catch(() => {})
    if (deal?.id) {
      supabase.from('deal_products').select('*').eq('deal_id', deal.id).order('created_at')
        .then(({ data }) => { if (data) setDealLines(data.map(d => ({ ...d, _key: d.id }))) })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!form.is_sla || !form.sla_annual_value || !form.cs_month || !form.cs_year ||
        !form.ce_month || !form.ce_year || !form.sla_billing_month || !form.sla_billing_year) return
    const result = calcSLARecognition({
      startDay: parseInt(form.cs_day)||1,
      startMonth: form.cs_month, startYear: parseInt(form.cs_year),
      endDay: parseInt(form.ce_day)||31, endMonth: form.ce_month, endYear: parseInt(form.ce_year),
      billingMonth: form.sla_billing_month, billingYear: parseInt(form.sla_billing_year),
      annualValue: form.sla_annual_value, currency: form.currency, exchangeRate: form.exchange_rate,
    })
    if (!result) return
    setForm(f => {
      const next = { ...f }
      const MK = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
      FY26_MONTHS.forEach((m, i) => {
        const val = result.recognition[m]?.value || 0
        next[MK[i]] = val > 0 ? Math.round(val) : ''
      })
      // Set value_total to EUR total
      next.value_total = Math.round(result.totalRecognized)
      return next
    })
  }, [form.is_sla, form.sla_annual_value, form.cs_month, form.cs_year,
      form.ce_month, form.ce_year, form.sla_billing_month, form.sla_billing_year,
      form.currency, form.exchange_rate])
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

  // DealTimeline handles its own fetching; we only need to write new notes here.
  async function addActivity() {
    if (!deal?.id || !actNote) return
    setAddingAct(true)
    const { error } = await supabase.from('deal_activities').insert({
      deal_id: deal.id,
      user_id: profile?.id,
      user_name: profile?.full_name || profile?.email,
      action_type: 'note',
      note: actNote,
      next_action: nextAction || null,
      next_action_date: nextActionDate || null,
    })
    if (error) console.warn('Failed to add note:', error.message)
    setActNote(''); setNextAction(''); setNextActionDate('')
    setAddingAct(false)
  }
  const isECT   = form.bu === 'ECT'
  const hasIC   = isECT && parseFloat(form.intercompany_value) > 0

  // Auto-set BU=VGT for distributors (default, mas podem mudar para ECT)
  useEffect(() => {
    if (isDistributor && !form.bu) set('bu', 'VGT')
  }, [isDistributor, form.bu])

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
      forecast_category: form.forecast_category || null,
      account_id: form.account_id || null,
      client: form.client, region: form.region, country: form.country,
      sales_owner: form.sales_owner, deal_type: form.deal_type,
      description: form.description,
      value_total: parseFloat(form.value_total) || 0,
      gm_pct: parseFloat(form.gm_pct) / 100 || 0,
      rec_month: form.rec_month || null, rec_year: parseInt(form.rec_year) || null,
      cs_day: parseInt(form.cs_day) || 1, cs_month: form.cs_month || null, cs_year: parseInt(form.cs_year) || null,
      ce_day: parseInt(form.ce_day) || 31, ce_month: form.ce_month || null, ce_year: parseInt(form.ce_year) || null,
      // Currency
      currency: form.currency || 'EUR',
      exchange_rate: form.currency === 'EUR' ? 1.0 : (parseFloat(form.exchange_rate) || 1.0),
      // SLA
      is_sla: form.is_sla || false,
      sla_type: form.is_sla ? (form.sla_type || null) : null,
      sla_annual_value: form.is_sla ? (parseFloat(form.sla_annual_value) || null) : null,
      sla_billing_month: form.is_sla ? (form.sla_billing_month || null) : null,
      sla_billing_year: form.is_sla ? (parseInt(form.sla_billing_year) || null) : null,
      sla_owner: form.is_sla ? (form.sla_owner || null) : null,
      sla_renewal_target: form.is_sla ? (parseFloat(form.sla_renewal_target) || null) : null,
      // Product & Business Model
      product: form.product || null,
      business_model: form.business_model || null,
      warranty_months: parseInt(form.warranty_months) || 36,
      equipment_count: parseInt(form.equipment_count) || null,
      annual_studies: parseInt(form.annual_studies) || null,
      annual_exams: parseInt(form.annual_exams) || null,
      // Distribution chain
      end_customer: form.end_customer || null,
      distributor: form.distributor || null,
      hub: form.hub || null,
      end_customer_value: parseFloat(form.end_customer_value) || null,
      // Structured distribution network (PR 5)
      distribution_path:  form.distribution_path || null,
      distributor_id:     form.distributor_id    || null,
      hub_id:             form.hub_id            || null,
      vgt_cost:           parseFloat(form.vgt_cost)           || null,
      distributor_price:  parseFloat(form.distributor_price)  || null,
      end_customer_price: parseFloat(form.end_customer_price) || null,
      // Discount
      list_price: parseFloat(form.list_price) || null,
      discount_requested: parseFloat(form.discount_requested) || null,
      discount_note_dist: form.discount_note_dist || null,
      ...((!deal?.discount_status || deal.discount_status === null) && form.discount_requested
        ? { discount_status: 'pending' } : {}),
      // Win probability
      win_probability: ['BackLog','Invoiced','Lost'].includes(form.stage)
        ? { BackLog:80, Invoiced:100, Lost:0 }[form.stage]
        : (parseFloat(form.win_probability) || null),
      // Lost
      lost_reason: form.stage === 'Lost' ? (form.lost_reason || null) : null,
      // company_id: ligar ao distribuidor que criou o deal
      company_id: form.company_id || null,
      created_by: profile?.id || null,
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

    if (result.error) { setError(result.error.message); setSaving(false); return }
    if (result.data?.id && dealLines.length > 0) {
      await saveDealProducts(result.data.id, dealLines)
    }
    onSaved(); onClose()
    setSaving(false)
  }

  return (
    <Modal open title={deal?.id ? 'Edit deal' : 'New deal'} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">{t("df_cancel")}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? t("df_saving") : t("df_save")}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* BU + Sales Type + Stage */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">{t("df_bu")} *</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)} disabled={!isAdmin && !isDistributor}>
              <option value="">—</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
          <div>
            <label className="label">{t("df_sales_type")}</label>
            <select className="select" value={form.sales_type} onChange={e => set('sales_type', e.target.value)}>
              <option>Internal</option>
              <option>External</option>
            </select>
          </div>
          <div>
            <label className="label">{t("df_stage")} *</label>
            <select className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
              {(isDistributor ? DIST_STAGES : ['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost']).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Forecast category — Commit / Best case / Upside / Omit */}
        {!isDistributor && (
          <div>
            <label className="label flex items-center gap-1">
              Forecast category
              <span className="text-[10px] text-gray-400 font-normal">
                (Auto from stage: <strong>{FORECAST_CATEGORIES.find(c => c.id === defaultForecastFromStage(form.stage))?.label}</strong>)
              </span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {[{ id: '', label: 'Auto' }, ...FORECAST_CATEGORIES].map(opt => {
                const active = (form.forecast_category || '') === opt.id
                return (
                  <button key={opt.id || 'auto'} type="button"
                    onClick={() => set('forecast_category', opt.id || null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Client / Account */}
        <div>
          <label className="label">{t("df_client")} *</label>
          <SearchableSelect
            value={form.account_id || ''}
            onChange={v => {
              set('account_id', v || null)
              const acc = accounts.find(a => a.id === v)
              if (acc) set('client', acc.name)
            }}
            options={accountsForBU.map(a => ({ value: a.id, label: a.name, hint: a.country || a.bu }))}
            placeholder="Search accounts…"
            emptyLabel="— Select account —"
            onCreateNew={(query) => { if (query) set('client', query) }}
            createLabel="New client"
          />
          {form.client && !form.account_id && (
            <p className="text-[10px] text-amber-500 mt-1">Custom client: {form.client} (not linked to account)</p>
          )}
        </div>

        {/* Region + Country */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("df_region")}</label>
            <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country','') }}>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t("df_country")}</label>
            <SearchableSelect
              value={form.country}
              onChange={v => set('country', v)}
              options={(COUNTRY_MAP[form.region] || []).map(c => ({ value: c, label: c }))}
              placeholder={t("df_country_search")}
              emptyLabel="—"
            />
          </div>
        </div>

        {/* Owner + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("df_owner")}</label>
            <SearchableSelect
              value={form.sales_owner}
              onChange={v => set('sales_owner', v)}
              options={owners.map(o => ({ value: o, label: o }))}
              placeholder={t("df_owner_search")}
              emptyLabel={t("df_owner_none")}
            />
          </div>
          <div>
            <label className="label">{t("df_deal_type")}</label>
            <select className="select" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
              <option>One-Shot</option>
              <option>Maintenance</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">{t("df_description")}</label>
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
              <option>{t("df_budget_freeze")}</option>
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
            <label className="label">{t("df_currency")}</label>
            <div className="flex gap-2 mt-1">
              {['EUR','USD','GBP'].map(c => (
                <button key={c} type="button"
                  onClick={() => {
                    set('currency', c)
                    if (c === 'EUR') {
                      set('exchange_rate', '1')
                    } else if (!deal?.id) {
                      // New deal: pre-fill global rate (locked at creation time)
                      const globalRate = getRate(c)
                      if (globalRate) set('exchange_rate', String(globalRate))
                    }
                  }}
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
              <label className="label">{t("df_rate")}</label>
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
              {!deal?.id && form.currency !== 'EUR' && getRate(form.currency) && (
                <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                  Global rate applied
                </p>
              )}
            </div>
          )}
        </div>

        {/* Value + GM + Win Probability */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">
              {t("df_value")} {form.currency === 'EUR' ? '€' : form.currency === 'USD' ? '$' : '£'}
            </label>
            <input className="input" type="number" value={form.value_total} onChange={e => set('value_total', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">{t("df_gm")}</label>
            <input className="input" type="number" value={form.gm_pct} onChange={e => set('gm_pct', e.target.value)} placeholder="0.0" />
          </div>
          <div>
            <label className="label">
              {t("df_win_prob")}
              {['Lead','Pipeline','Offer Presented'].includes(form.stage) && (
                <span className="ml-1 text-purple-500 font-normal">{t("df_editable")}</span>
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

        {/* ── BUSINESS MODEL & PRODUCTS ─────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("df_product_lbl")}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("df_deal_type")}</label>
              <select className="select" value={form.business_model} onChange={e => set('business_model', e.target.value)}>
                <option value="">— Select —</option>
                {BUSINESS_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {['capex','hybrid'].includes(form.business_model) && (
              <div>
                <label className="label">Warranty (months)</label>
                <input className="input" type="number" value={form.warranty_months}
                  onChange={e => set('warranty_months', e.target.value)} placeholder="36"/>
              </div>
            )}
          </div>

          {['capex','hybrid'].includes(form.business_model) && (
            <p className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1">
              SLA available after {form.warranty_months || 36} months warranty
            </p>
          )}

          <ProductLineItems
            lines={dealLines}
            onChange={setDealLines}
            products={catalogProducts}
            businessModel={form.business_model}
            userRole={profile?.role}
            t={t}
            onTotalChange={(total) => {
              if (total > 0) set('value_total', total.toFixed(2))
            }}
            onBusinessModelInfer={(model) => {
              if (!form.business_model) set('business_model', model)
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                {t("df_equipment")}
                <span className="text-gray-400 font-normal ml-1">{t("df_total_units")}</span>
              </label>
              <input className="input" type="number" min="0"
                value={form.equipment_count}
                onChange={e => set('equipment_count', e.target.value)}
                placeholder="e.g. 12"/>
            </div>
            <div>
              <label className="label">
                {t("df_annual_studies")}
                <span className="text-gray-400 font-normal ml-1">{t("df_studies_year")}</span>
              </label>
              <input className="input" type="number" min="0"
                value={form.annual_studies}
                onChange={e => set('annual_studies', e.target.value)}
                placeholder="e.g. 50000"/>
            </div>
          </div>
        </div>

        {/* ── DISTRIBUTION & MARGINS ──────────────────────────────
            New structured distribution network:
              direct:       VGT → Distributor → Client
              hub_mediated: VGT → Hub → Distributor → Client
            Legacy free-text fields (distributor/hub) are preserved so
            old deals keep rendering; new deals use the FK-based selects.
        */}
        {(form.region !== 'Europe' || form.sales_type === 'External') && (
          <div className="bg-gray-50 border border-gray-200 rounded-card p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {t("df_distribution_margins")}
              </p>
              <p className="text-micro text-gray-400 mt-0.5">
                {t("df_distribution_hint")}
              </p>
            </div>

            {/* Path selector */}
            <div className="flex gap-2">
              {DISTRIBUTION_PATHS.map(p => {
                const active = form.distribution_path === p.id
                return (
                  <button key={p.id} type="button"
                    onClick={() => {
                      set('distribution_path', p.id)
                      if (p.id === 'direct') { set('hub_id', null) }
                    }}
                    className={`flex-1 text-left rounded-control border p-3 transition-colors ${
                      active
                        ? 'border-navy bg-white ring-2 ring-navy/10'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}>
                    <p className="text-xs font-bold text-gray-900">{p.label}</p>
                    <p className="text-micro text-gray-500 mt-0.5">{p.hint}</p>
                  </button>
                )
              })}
            </div>

            {form.distribution_path && (
              <>
                {/* Distributor + Hub selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t("df_distributor")}</label>
                    <SearchableSelect
                      value={form.distributor_id || ''}
                      onChange={v => set('distributor_id', v || null)}
                      options={distributors
                        .filter(d => !form.country || !d.country || d.country.toLowerCase() === form.country.toLowerCase())
                        .map(d => ({ value: d.id, label: d.name, hint: d.country }))}
                      placeholder={t("df_distributor_search")}
                      emptyLabel={t("df_distributor_none")}
                    />
                  </div>
                  {form.distribution_path === 'hub_mediated' && (
                    <div>
                      <label className="label">{t("df_hub")}</label>
                      <SearchableSelect
                        value={form.hub_id || ''}
                        onChange={v => set('hub_id', v || null)}
                        options={hubs.map(h => ({ value: h.id, label: h.name, hint: h.region }))}
                        placeholder={t("df_hub_search")}
                        emptyLabel={t("df_hub_none")}
                      />
                    </div>
                  )}
                </div>

                {/* End customer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t("df_end_customer")}</label>
                    <input className="input" value={form.end_customer}
                      onChange={e => set('end_customer', e.target.value)}
                      placeholder={t("df_end_customer_hint")}/>
                  </div>
                  <div>
                    <label className="label">{t("df_ec_value")}</label>
                    <input className="input" type="number" value={form.end_customer_value}
                      onChange={e => set('end_customer_value', e.target.value)}
                      placeholder={t("df_ec_value_hint")}/>
                  </div>
                </div>

                {/* Price levels */}
                <div className="bg-white border border-gray-100 rounded-control p-3 space-y-3">
                  <p className="text-micro font-semibold text-gray-700 uppercase tracking-wide">
                    {t("df_prices_title")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">{t("df_vgt_cost")}</label>
                      <input className="input" type="number" value={form.vgt_cost}
                        onChange={e => set('vgt_cost', e.target.value)}
                        placeholder="0"/>
                    </div>
                    <div>
                      <label className="label">
                        {form.distribution_path === 'hub_mediated' ? t("df_price_vgt_hub") : t("df_price_vgt_distributor")}
                      </label>
                      <input className="input" type="number" value={form.value_total}
                        onChange={e => set('value_total', e.target.value)}
                        placeholder="0"/>
                    </div>
                    {form.distribution_path === 'hub_mediated' && (
                      <div>
                        <label className="label">{t("df_price_hub_distributor")}</label>
                        <input className="input" type="number" value={form.distributor_price}
                          onChange={e => set('distributor_price', e.target.value)}
                          placeholder="0"/>
                      </div>
                    )}
                    <div>
                      <label className="label">{t("df_price_distributor_client")}</label>
                      <input className="input" type="number" value={form.end_customer_price}
                        onChange={e => set('end_customer_price', e.target.value)}
                        placeholder="0"/>
                    </div>
                  </div>
                </div>

                {/* Live margins */}
                <MarginsPanel form={form}/>
              </>
            )}
          </div>
        )}

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
                {t("df_disc_request")}
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
                <label className="label">{t("df_list_price")}</label>
                <input className="input" type="number"
                  value={form.list_price}
                  onChange={e => set('list_price', e.target.value)}
                  disabled={!isDistributor && !!deal?.id}
                  placeholder="Catalogue price"/>
              </div>
              <div>
                <label className="label">{t("df_disc_req")}</label>
                <input className="input" type="number" min="0" max="100"
                  value={form.discount_requested}
                  onChange={e => set('discount_requested', e.target.value)}
                  disabled={!isDistributor && !!deal?.id}
                  placeholder="e.g. 15"/>
              </div>
              <div>
                <label className="label">{t("df_your_price")}</label>
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
                {isDistributor ? t("df_your_note") : t("df_dist_note")}
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
                    {t("df_approved_pct")} {deal.discount_approved}%
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
                  <label className="label">{t("df_sla_type")}</label>
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
                  <label className="label">{t("df_sla_annual")}</label>
                  <input className="input bg-white" type="number"
                    value={form.sla_annual_value||''} onChange={e => set('sla_annual_value', e.target.value)}
                    placeholder="Annual contract value"/>
                </div>
              </div>
              {/* Billing month — when the invoice is issued */}
              <div>
                <label className="label">{t("df_billing")} <span className="text-gray-400 font-normal">{t("df_billing_note")}</span></label>
                <div className="flex gap-1.5">
                  <select className="select flex-1 bg-white" value={form.sla_billing_month||''} onChange={e => set('sla_billing_month', e.target.value)}>
                    <option value="">— Month —</option>
                    {FY26_MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <select className="select w-20 bg-white" value={form.sla_billing_year||''} onChange={e => set('sla_billing_year', e.target.value)}>
                    <option value="">Year</option>
                    {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t("df_sla_owner")}</label>
                  <input className="input bg-white" value={form.sla_owner} onChange={e => set('sla_owner', e.target.value)} placeholder="Responsible for renewal"/>
                </div>
                <div>
                  <label className="label">{t("df_renewal")}</label>
                  <input className="input bg-white" type="number" min="0" max="100"
                    value={form.sla_renewal_target} onChange={e => set('sla_renewal_target', e.target.value)}
                    placeholder="e.g. 5"/>
                </div>
              </div>

              {deal?.id && form.sla_annual_value && (isAdmin || profile?.role === 'manager') && (
                <div className="border-t border-blue-200 pt-2 mt-1">
                  <button type="button"
                    onClick={async () => {
                      const { createSlaFromDeal } = await import('../hooks/useSlas')
                      const { data, error } = await createSlaFromDeal(
                        { ...deal, ...form, id: deal.id },
                        { warranty_months: 36 }
                      )
                      if (error) alert(error.message)
                      else alert(`SLA created for ${form.client} — check SLA Management page`)
                    }}
                    className="w-full text-xs py-2 px-3 rounded-lg border border-blue-300 bg-white text-blue-700 font-semibold hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
                    <Plus size={12}/> Create SLA Contract
                  </button>
                  <p className="text-[9px] text-blue-400 mt-1 text-center">Creates an SLA record in SLA Management with warranty + projected revenue</p>
                </div>
              )}
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
                <label className="label">{t("df_vgt_cost")}</label>
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
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("df_contract")}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* Start + End on same row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label mb-1">Start date</label>
                  <div className="flex gap-1">
                    <select className="select w-16 text-sm" value={form.cs_day||1} onChange={e => set('cs_day', e.target.value)}>
                      {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d}>{d}</option>)}
                    </select>
                    <select className="select w-20 text-sm" value={form.cs_month||''} onChange={e => set('cs_month', e.target.value)}>
                      <option value="">Mon</option>
                      {MONTHS.map(m=><option key={m}>{m}</option>)}
                    </select>
                    <select className="select w-[84px] text-sm" value={form.cs_year||''} onChange={e => set('cs_year', e.target.value)}>
                      <option value="">Yr</option>
                      {YEARS.map(y=><option key={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label mb-1">End date</label>
                  <div className="flex gap-1">
                    <select className="select w-16 text-sm" value={form.ce_day||31} onChange={e => set('ce_day', e.target.value)}>
                      {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d}>{d}</option>)}
                    </select>
                    <select className="select w-20 text-sm" value={form.ce_month||''} onChange={e => set('ce_month', e.target.value)}>
                      <option value="">Mon</option>
                      {MONTHS.map(m=><option key={m}>{m}</option>)}
                    </select>
                    <select className="select w-[84px] text-sm" value={form.ce_year||''} onChange={e => set('ce_year', e.target.value)}>
                      <option value="">Yr</option>
                      {YEARS.map(y=><option key={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Duration pill */}
              {form.cs_month && form.cs_year && form.ce_month && form.ce_year && (() => {
                const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                const s = new Date(`${form.cs_year}-${String(M.indexOf(form.cs_month)+1).padStart(2,'0')}-${String(form.cs_day||1).padStart(2,'0')}`)
                const e = new Date(`${form.ce_year}-${String(M.indexOf(form.ce_month)+1).padStart(2,'0')}-${String(form.ce_day||28).padStart(2,'0')}`)
                const days = Math.round((e - s) / 86400000) + 1
                const months = Math.round(days / 30.44 * 10) / 10
                const expired = e < new Date()
                const expiring = !expired && (e - new Date()) < 90*24*60*60*1000
                return (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                    expired  ? 'bg-red-50 text-red-700 border border-red-200' :
                    expiring ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                               'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    {expired ? '⚠ Expired' : expiring ? '⏰ Expiring soon' : '✓ Active'}
                    <span className="opacity-60">·</span>
                    {days} days · {months} months
                    {form.sla_annual_value && (
                      <><span className="opacity-60">·</span>Total €{Math.round(parseFloat(form.sla_annual_value) * days / 365).toLocaleString()}</>
                    )}
                  </div>
                )
              })()}

              {/* Revenue recognition — only when SLA + billing month set */}
              {form.is_sla && form.sla_billing_month && form.sla_billing_year && form.sla_annual_value && form.cs_month && form.cs_year && form.ce_month && form.ce_year && (() => {
                const result = calcSLARecognition({
                  startDay: parseInt(form.cs_day)||1,
                  startMonth: form.cs_month, startYear: parseInt(form.cs_year),
                  endDay: parseInt(form.ce_day)||31,
                  endMonth: form.ce_month, endYear: parseInt(form.ce_year),
                  billingMonth: form.sla_billing_month,
                  billingYear: parseInt(form.sla_billing_year),
                  annualValue: form.sla_annual_value,
                  currency: form.currency, exchangeRate: form.exchange_rate,
                })
                if (!result) return null
                const catchupMonths = FY26_MONTHS.indexOf(form.sla_billing_month)
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">Revenue recognition · FY26</p>
                      <span className="text-xs font-bold text-blue-700">
                        Total €{Math.round(result.totalRecognized).toLocaleString()}
                      </span>
                    </div>
                    {/* 12 month grid - 2 rows of 6 */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {FY26_MONTHS.map(m => {
                        const r = result.recognition[m]
                        const v = Math.round(r?.value || 0)
                        const t = r?.type || 'none'
                        return (
                          <div key={m} className={`rounded-lg p-2 text-center ${
                            t==='billing'  ? 'bg-blue-600 text-white' :
                            t==='normal'   ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            t==='deferred' ? 'bg-gray-50 text-gray-400 border border-gray-100' :
                                             'bg-white text-gray-200 border border-gray-100'
                          }`}>
                            <div className="text-[10px] font-semibold">{m}</div>
                            <div className={`text-[11px] font-bold mt-0.5 ${t==='billing'?'text-white':''}`}>
                              {v>0 ? `€${v>=1000?Math.round(v/100)/10+'K':v}` : '—'}
                            </div>
                            {t==='billing' && <div className="text-[8px] opacity-75 mt-0.5">BILL</div>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block"/> Billing (catchup {catchupMonths}m)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-100 inline-block"/>{t("df_linear")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-50 border border-gray-100 inline-block"/>{t("df_deferred")}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
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

        {/* Unified activity timeline — replaces the old Change History + Activity Log */}
        {deal?.id && (
          <div className="space-y-2">
            <p className="label flex items-center gap-1.5"><Clock size={12}/> {t("df_activity")}</p>

            {/* Add note / next action — writes to deal_activities */}
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
              <button
                onClick={async () => {
                  await addActivity()
                  setTimelineNonce(n => n + 1) // force DealTimeline to refetch
                }}
                disabled={!actNote || addingAct}
                className="btn-secondary text-xs w-full">
                <Plus size={11}/> {addingAct ? 'Adding…' : 'Add note'}
              </button>
            </div>

            {/* Unified timeline: notes + auto-tracked field changes + attachments */}
            <DealTimeline key={timelineNonce} dealId={deal.id}/>
          </div>
        )}

        {/* Stakeholders / Contacts — keyed by BU + client name */}
        {form.bu && form.client && (
          <div className="pt-3 border-t border-gray-100">
            <ContactsList
              bu={form.bu}
              clientName={form.client}
              canEdit={canEdit}
              compact
            />
          </div>
        )}

        {/* Attachments — available after the deal exists */}
        <div className="pt-3 border-t border-gray-100">
          <AttachmentsList
            entityType="deal"
            entityId={deal?.id}
            canEdit={canEdit}
          />
        </div>
      </div>
    </Modal>
  )
}
