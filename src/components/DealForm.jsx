import { useState, useEffect, useMemo } from 'react'
import { Modal } from './ui'
import { upsertDeal, upsertDealWithIntercompany } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useFxRates } from '../hooks/useFxRates'
import { logger } from '../lib/logger'
import { Plus } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import AttachmentsList from './AttachmentsList'
import ContactsList from './ContactsList'
import SearchableSelect from './SearchableSelect'
import ProductLineItems from './ProductLineItems'
import { FORECAST_CATEGORIES, defaultForecastFromStage, BUSINESS_MODELS, REGIONS, COUNTRY_MAP, MONTHS, MONTHS_K, DIST_STAGES, regionForCountry } from '../constants'
import { saveDealProducts } from '../hooks/useDealProducts'
import { getAllowedTransitions, canTransition } from '../lib/stateMachine'
import { validateDeal } from '../lib/validation'
import { calcSLARecognition } from './deal/RevenueRecognition'
import IntercompanySection from './deal/IntercompanySection'
import DealMonthlyGrid from './deal/DealMonthlyGrid'
import DealActivityNotes from './deal/DealActivityNotes'
import DistributionSection from './deal/DistributionSection'
import DiscountSection from './deal/DiscountSection'
import { EMPTY_DEAL as EMPTY } from './deal/dealDefaults'

export default function DealForm({ deal, onClose, onSaved }) {
  const { profile, isAdmin, canEdit, company } = useAuth()
  const { t } = useTranslation()
  const { getRate } = useFxRates()
  const [form, setForm] = useState(() => deal ? {
    ...deal,
    value_total: deal.value_total || '',
    gm_pct: deal.gm_pct != null ? (deal.gm_pct * 100).toFixed(1) : '',
    intercompany_value: deal.intercompany_value || '',
    currency: deal.currency || 'EUR',
    exchange_rate: deal.exchange_rate || '',
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
    go_live_month: deal.go_live_month || '',
    go_live_year: deal.go_live_year || '',
    invoice_date: deal.invoice_date || '',
    equipment_count: deal.equipment_count || '',
    annual_studies: deal.annual_studies || '',
    annual_exams: deal.annual_exams || '',
    company_id: deal.company_id || '',
  } : {
    ...EMPTY,
    bu: isAdmin ? '' : (profile?.role === 'distributor'
      ? 'VGT'
      : (profile?.bu?.toUpperCase() || '')),
    company_id: profile?.role === 'distributor' ? (profile?.company_id || '') : '',
    currency: profile?.role === 'distributor' && company?.default_currency
      ? company.default_currency : 'EUR',
    region: profile?.role === 'distributor' && company?.country
      ? regionForCountry(company.country) : '',
    country: profile?.role === 'distributor' && company?.country
      ? company.country : '',
    sales_type: profile?.role === 'distributor' ? 'External' : 'Internal',
    sales_owner: profile?.role === 'distributor' ? (profile?.full_name || profile?.email || '') : '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
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
  const [authMap, setAuthMap] = useState({})
  const isDistributor = profile?.role === 'distributor'
  const accountsForBU = useMemo(() => {
    let filtered = accounts.filter(a => !form.bu || a.bu === form.bu)
    if (isDistributor && company?.country) {
      filtered = filtered.filter(a =>
        !a.country || a.country === company.country
      )
    }
    return filtered
  }, [accounts, form.bu, isDistributor, company?.country])
  // Auto-calculate SLA monthly recognition
  useEffect(() => {
    // Sales owners — for distributors, scope to their own company; otherwise all BUs
    let oq = supabase.from('quotas').select('sales_owner, bu, company_id').order('bu').order('sales_owner')
    if (profile?.role === 'distributor' && profile?.company_id) {
      oq = oq.eq('company_id', profile.company_id)
    }
    oq.then(({ data }) => {
        let names = [...new Set((data || []).map(q => q.sales_owner).filter(Boolean))].sort()
        // Fallback: a distributor with no quota owners still needs to pick themselves
        if (profile?.role === 'distributor' && names.length === 0) {
          const self = profile?.full_name || profile?.email
          if (self) names = [self]
        }
        setOwners(names)
      })
      .catch(() => {})
    // Load accounts (for the optional "Account" link). Scoped by RLS to the
    // user's BU server-side, so we don't need to filter here.
    supabase.from('accounts').select('id, name, bu').order('name')
      .then(({ data }) => { if (data) setAccounts(data) })
      .catch(() => {})
    // Load distribution network (new in PR 5)
    supabase.from('distributors').select('id, name, country, region, hub_id').order('name')
      .then(({ data }) => { if (data) setDistributors(data) })
      .catch(() => {})
    supabase.from('regional_hubs').select('id, name, region').order('name')
      .then(({ data }) => { if (data) setHubs(data) })
      .catch(() => {})
    supabase.from('products').select('*').eq('active', true).order('sort_order').order('name')
      .then(({ data }) => { if (data) setCatalogProducts(data) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Load product authorizations for distributors
  useEffect(() => {
    if (profile?.role === 'distributor' && profile?.company_id) {
      supabase.from('company_product_authorizations').select('product_id, country, price, active')
        .eq('company_id', profile.company_id)
        .then(({ data }) => {
          if (data) {
            const map = {}
            data.filter(a => a.active !== false).forEach(a => { map[`${a.product_id}_${a.country}`] = a })
            setAuthMap(map)
          }
        }).catch(() => {})
    }
  }, [profile?.role, profile?.company_id])
  useEffect(() => {
    if (deal?.id) {
      // Use the security view so cost_price/margin_pct are nulled for non-admin/manager roles
      supabase.from('deal_products_v').select('*').eq('deal_id', deal.id).order('created_at')
        .then(({ data }) => { if (data) setDealLines(data.map(d => ({ ...d, _key: d.id }))) })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
      MONTHS.forEach((m, i) => {
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
  const resolvedProducts = useMemo(() => {
    if (!isDistributor) return catalogProducts
    const country = form.country || ''
    if (!country || Object.keys(authMap).length === 0) return []
    return catalogProducts
      .filter(p => authMap[`${p.id}_${country}`])
      .map(p => {
        const auth = authMap[`${p.id}_${country}`]
        if (auth?.price) {
          return { ...p, license_fee: auth.price }
        }
        return p
      })
  }, [catalogProducts, authMap, isDistributor, form.country])
  async function addActivity() {
    if (!deal?.id || !actNote) return
    setAddingAct(true)
    await supabase.from('deal_activities').insert({
      deal_id: deal.id, user_id: profile?.id,
      user_name: profile?.full_name || profile?.email,
      action_type: 'note', note: actNote,
      next_action: nextAction || null, next_action_date: nextActionDate || null,
    })
    setActNote(''); setNextAction(''); setNextActionDate('')
    setAddingAct(false)
  }
  const isECT   = form.bu === 'ECT'
  const hasIC   = isECT && parseFloat(form.intercompany_value) > 0

  // Auto-set BU=VGT for distributors
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
  async function handleSave() {
    const { valid, errors: valErrors } = validateDeal(form)
    setFieldErrors(valErrors)
    if (!valid) { setError('Please fix the highlighted fields'); return }
    // Validate stage transition for existing deals
    if (deal?.id && deal.stage !== form.stage && !canTransition('deal', deal.stage, form.stage)) {
      setError(`Invalid stage transition: "${deal.stage}" to "${form.stage}". Allowed transitions: ${getAllowedTransitions('deal', deal.stage).filter(s => s !== deal.stage).join(', ') || 'none'}`)
      return
    }
    setSaving(true); setError('')

    const monthly = Object.fromEntries(MONTHS_K.map(m => [m, parseFloat(form[m]) || 0]))

    const payload = {
      ...(deal?.id ? { id: deal.id } : {}),
      bu: form.bu, sales_type: form.sales_type, stage: form.stage,
      forecast_category: form.forecast_category || null,
      account_id: form.account_id || null,
      client: form.client, region: form.region, country: form.country,
      sales_owner: form.sales_owner,
      description: form.description,
      value_total: parseFloat(form.value_total) || 0,
      gm_pct: parseFloat(form.gm_pct) / 100 || 0,
      rec_month: form.rec_month || null, rec_year: parseInt(form.rec_year) || null,
      cs_day: parseInt(form.cs_day) || 1, cs_month: form.cs_month || null, cs_year: parseInt(form.cs_year) || null,
      ce_day: parseInt(form.ce_day) || 31, ce_month: form.ce_month || null, ce_year: parseInt(form.ce_year) || null,
      // Currency
      currency: form.currency || 'EUR',
      exchange_rate: form.currency === 'EUR' ? 1.0 : (parseFloat(form.exchange_rate) || 1.0),
      // Product & Business Model
      product: form.product || null,
      business_model: form.business_model || null,
      warranty_months: parseInt(form.warranty_months) || 36,
      go_live_month: form.go_live_month || null,
      go_live_year: parseInt(form.go_live_year) || null,
      invoice_date: form.invoice_date || null,
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
    if (result.error) { logger.error('Failed to save deal', { error: result.error.message, dealId: deal?.id }); setError(result.error.message); setSaving(false); return }
    if (result.data?.id && dealLines.length > 0) {
      await saveDealProducts(result.data.id, dealLines)
    }
    // Auto-notify admins when a distributor requests a discount (non-blocking)
    try {
      if (isDistributor && form.discount_requested && parseFloat(form.discount_requested) > 0) {
        const { data: admins } = await supabase.from('profiles')
          .select('id').in('role', ['admin', 'manager']).eq('active', true)
        if (admins?.length) {
          await supabase.from('notifications').insert(
            admins.map(a => ({
              user_id: a.id,
              type: 'discount_request',
              title: `Discount request: ${form.client || 'Unknown'}`,
              body: `${profile?.full_name || 'Distributor'} requested ${form.discount_requested}% discount`,
              link_type: 'deal',
              link_id: result.data.id,
            }))
          )
        }
      }
    } catch (_) { /* notification failure must not block save */ }
    setSaving(false)
    onSaved(); onClose()
  }
  return (
    <Modal open title={deal?.id ? t("df_edit_deal") : t("df_new_deal")} onClose={onClose}
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
        <div className={`grid ${isDistributor ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'} gap-3`}>
          {!isDistributor && (
          <div>
            <label className="label">{t("df_bu")} *</label>
            <select className={`select ${fieldErrors.bu ? 'border-red-400' : ''}`} value={form.bu} onChange={e => set('bu', e.target.value)} disabled={!isAdmin}>
              <option value="">—</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
            {fieldErrors.bu && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.bu}</p>}
          </div>
          )}
          {!isDistributor && (
          <div>
            <label className="label">{t("df_sales_type")}</label>
            <select className="select" value={form.sales_type} onChange={e => set('sales_type', e.target.value)}>
              <option>Internal</option>
              <option>External</option>
            </select>
          </div>
          )}
          <div>
            <label className="label">{t("df_stage")} *</label>
            <select className={`select ${fieldErrors.stage ? 'border-red-400' : ''}`} value={form.stage} onChange={e => {
              const newStage = e.target.value
              // For existing deals, validate the transition
              if (deal?.id && !canTransition('deal', deal.stage, newStage)) {
                setError(`Cannot move from "${deal.stage}" to "${newStage}". Allowed: ${getAllowedTransitions('deal', deal.stage).filter(s => s !== deal.stage).join(', ') || 'none'}`)
                return
              }
              set('stage', newStage)
            }}>
              {(() => {
                const allStages = isDistributor ? DIST_STAGES : ['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost']
                // For existing deals, restrict to allowed transitions
                if (deal?.id) {
                  const allowed = getAllowedTransitions('deal', deal.stage)
                  return allStages.filter(s => allowed.includes(s)).map(s => <option key={s}>{s}</option>)
                }
                // New deals can pick any stage
                return allStages.map(s => <option key={s}>{s}</option>)
              })()}
            </select>
            {fieldErrors.stage && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.stage}</p>}
          </div>
        </div>

        {/* Forecast category — Commit / Best case / Upside / Omit */}
        {!isDistributor && (
          <div>
            <label className="label flex items-center gap-1">
              {t("df_forecast_cat")}
              <span className="text-[10px] text-gray-400 font-normal">
                ({t("df_auto_from_stage")} <strong>{FORECAST_CATEGORIES.find(c => c.id === defaultForecastFromStage(form.stage))?.label}</strong>)
              </span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {[{ id: '', label: t("df_auto") }, ...FORECAST_CATEGORIES].map(opt => {
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
          <div className={fieldErrors.client ? 'ring-1 ring-red-400 rounded-lg' : ''}>
            <SearchableSelect
              value={form.account_id || ''}
              onChange={v => {
                set('account_id', v || null)
                const acc = accounts.find(a => a.id === v)
                if (acc) set('client', acc.name)
              }}
              options={accountsForBU.map(a => ({ value: a.id, label: a.name, hint: a.country || a.bu }))}
              placeholder={t("df_search_accounts")}
              emptyLabel={t("df_select_account")}
              onCreateNew={async (query) => {
                if (!query || !query.trim()) return
                const name = query.trim()
                set('client', name)
                set('account_id', null)
                const payload = {
                  name,
                  bu: form.bu || 'VGT',
                  country: form.country || null,
                  region: form.region || null,
                  client_type: 'public',
                }
                if (isDistributor && company?.id) {
                  const { data: dist } = await supabase.from('distributors')
                    .select('id').eq('company_id', company.id).limit(1).single()
                  if (dist) payload.distributor_id = dist.id
                }
                const { data: acc } = await supabase.from('accounts').insert(payload).select().single()
                if (acc) {
                  set('account_id', acc.id)
                  setAccounts(prev => [...prev, acc])
                }
              }}
              createLabel={t("df_new_client")}
              createRequiresQuery
            />
          </div>
          {fieldErrors.client && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.client}</p>}
          {form.client && !form.account_id && !fieldErrors.client && (
            <p className="text-[10px] text-amber-500 mt-1">{t("df_custom_client")} {form.client} {t("df_not_linked")}</p>
          )}
        </div>
        {/* Region + Country — auto-filled for distributors from company */}
        {!isDistributor && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("df_region")}</label>
              <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country','') }}>
                <option value="">—</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
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
        )}
        {/* Owner */}
        {!isDistributor && (
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
          </div>
        )}
        {/* Description */}
        <div>
          <label className="label">{t("df_description")}</label>
          <input className={`input ${fieldErrors.description ? 'border-red-400' : ''}`} value={form.description} onChange={e => set('description', e.target.value)} placeholder={t("df_placeholder_details")} />
          {fieldErrors.description && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.description}</p>}
        </div>
        {/* Lost reason */}
        {form.stage === 'Lost' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <label className="label text-red-600">{t("df_reason_lost")} *</label>
            <select className={`select bg-white ${fieldErrors.lost_reason ? 'border-red-400' : ''}`} value={form.lost_reason} onChange={e => set('lost_reason', e.target.value)}>
              <option value="">{t("df_select_reason")}</option>
              <option>Price too high</option>
              <option>Lost to competitor</option>
              <option>{t("df_budget_freeze")}</option>
              <option>Project cancelled</option>
              <option>No decision</option>
              <option>Technical requirements not met</option>
              <option>Other</option>
            </select>
            {fieldErrors.lost_reason && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.lost_reason}</p>}
            {form.lost_reason === 'Other' && (
              <input className="input mt-2" placeholder={t("df_specify_reason")}
                value={form.lost_reason_detail || ''} onChange={e => set('lost_reason_detail', e.target.value)}/>
            )}
          </div>
        )}
        {/* Currency selector — hidden for distributors (auto from company) */}
        {!isDistributor && <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
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
                  {t("df_global_rate")}
                </p>
              )}
            </div>
          )}
        </div>}
        {/* Value + GM + Win Probability — hidden for distributors (auto from products) */}
        {!isDistributor && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">
              {t("df_value")} {form.currency === 'EUR' ? '€' : form.currency === 'USD' ? '$' : '£'}
            </label>
            <input className={`input ${fieldErrors.value_total ? 'border-red-400' : ''}`} type="number" value={form.value_total} onChange={e => set('value_total', e.target.value)} placeholder="0" />
            {fieldErrors.value_total && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.value_total}</p>}
          </div>
          <div>
            <label className="label">{t("df_gm")}</label>
            <input className={`input ${fieldErrors.gm_pct ? 'border-red-400' : ''}`} type="number" value={form.gm_pct} onChange={e => set('gm_pct', e.target.value)} placeholder="0.0" />
            {fieldErrors.gm_pct && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.gm_pct}</p>}
          </div>
          <div>
            <label className="label">
              {t("df_win_prob")}
              {['Lead','Pipeline','Offer Presented'].includes(form.stage) && (
                <span className="ml-1 text-purple-500 font-normal">{t("df_editable")}</span>
              )}
            </label>
            <input
              className={`input ${fieldErrors.win_probability ? 'border-red-400' : ''} ${!['Lead','Pipeline','Offer Presented'].includes(form.stage) ? 'bg-gray-50 text-gray-400' : ''}`}
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
            {fieldErrors.win_probability && <p className="text-[11px] text-red-500 mt-0.5">{fieldErrors.win_probability}</p>}
          </div>
        </div>}
        {/* ── BUSINESS MODEL & PRODUCTS ─────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("df_product_lbl")}</p>
          {/* Business model selector — hidden for distributors, auto-inferred from products */}
          {!isDistributor && <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("df_business_model")}</label>
              <select className="select" value={form.business_model} onChange={e => set('business_model', e.target.value)}>
                <option value="">{t("df_select_model")}</option>
                {BUSINESS_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {['opex','saas','pay_per_study'].includes(form.business_model) && !deal?.id && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-between">
                <p className="text-xs text-blue-700">
                  {t("df_recurring_hint")} <strong>{t("df_contract_lbl")}</strong>.
                </p>
                <a href="/sla" className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap ml-2">
                  {t("df_create_contract")}
                </a>
              </div>
            )}
            {['capex','hybrid'].includes(form.business_model) && (
              <div>
                <label className="label">{t("df_warranty_months")}</label>
                <input className="input" type="number" value={form.warranty_months}
                  onChange={e => set('warranty_months', e.target.value)} placeholder="36"/>
              </div>
            )}
          </div>}

          {!isDistributor && ['capex','hybrid'].includes(form.business_model) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t("df_go_live_month")} {['BackLog','Invoiced'].includes(form.stage) ? '*' : ''}</label>
                  <select className="select" value={form.go_live_month} onChange={e => set('go_live_month', e.target.value)}>
                    <option value="">—</option>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{t("df_go_live_year")}</label>
                  <select className="select" value={form.go_live_year} onChange={e => set('go_live_year', e.target.value)}>
                    <option value="">—</option>
                    {[2025,2026,2027,2028].map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1">
                {t("df_warranty_hint")} {form.warranty_months || 36} {t("df_warranty_months_suffix")}
              </p>
            </>
          )}
          {isDistributor && form.country && resolvedProducts.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              {Object.keys(authMap).length === 0
                ? `No product authorizations found for your company. Contact your account manager.`
                : `${t("df_no_products_auth")} ${form.country}. ${t("df_contact_am")}`}
            </p>
          )}

          <ProductLineItems
            lines={dealLines}
            onChange={setDealLines}
            products={resolvedProducts}
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
                placeholder={t("df_placeholder_equipment")}/>
            </div>
            <div>
              <label className="label">
                {t("df_annual_studies")}
                <span className="text-gray-400 font-normal ml-1">{t("df_studies_year")}</span>
              </label>
              <input className="input" type="number" min="0"
                value={form.annual_studies}
                onChange={e => set('annual_studies', e.target.value)}
                placeholder={t("df_placeholder_studies")}/>
            </div>
          </div>
        </div>

        {/* ── DISTRIBUTION & MARGINS ─────────────────────────────── */}
        {/* Internal VGT view only — distributors are themselves the channel
            and price via authorized products, so this is hidden for them. */}
        {!isDistributor && (form.region !== 'Europe' || form.sales_type === 'External') && (
          <DistributionSection form={form} set={set} distributors={distributors} hubs={hubs} t={t}/>
        )}

        {/* ── DISCOUNT REQUEST ─────────────────────────────────── */}
        {(isDistributor || deal?.discount_status || deal?.discount_requested) && (
          <DiscountSection form={form} set={set} deal={deal} isDistributor={isDistributor} onSaved={onSaved} t={t}/>
        )}

        {/* ── CONTRACT LINK ──────────────────────────────────── */}
        {deal?.id && (isAdmin || profile?.role === 'manager') && !deal.converted_to_sla && (() => {
          const isInvoiced = form.stage === 'Invoiced'
          const isRecurring = ['opex','saas','pay_per_study'].includes(form.business_model)
          const shouldPrompt = isInvoiced || isRecurring
          const hasRecurringProducts = dealLines.some(l => ['per_volume','per_package'].includes(l.license_type) || (Number(l.annual_fee) || 0) > 0)
          const urgent = isInvoiced && (isRecurring || hasRecurringProducts)
          return (
            <div className={`rounded-xl p-3 space-y-2 ${urgent ? 'bg-amber-50 border-2 border-amber-300' : 'bg-blue-50 border border-blue-200'}`}>
              {urgent && (
                <p className="text-xs font-bold text-amber-700">
                  ⚠ This deal is Invoiced {isRecurring ? 'with recurring billing' : 'with recurring products'} — convert to Contract?
                </p>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-semibold ${urgent ? 'text-amber-700' : 'text-blue-700'}`}>{t("df_contracts_recurring")}</p>
                  <p className="text-[10px] text-gray-500">
                    {deal.converted_to_sla ? t("df_already_converted") : shouldPrompt ? t("df_recommended_convert") : t("df_create_view_contracts")}
                  </p>
                </div>
                <button type="button"
                  onClick={async () => {
                    const { createSlaFromDeal } = await import('../hooks/useSlas')
                    const { data, error } = await createSlaFromDeal(
                      { ...deal, ...form, id: deal.id },
                      { warranty_months: parseInt(form.warranty_months) || 36 }
                    )
                    if (error) { alert(error.message); return }
                    await supabase.from('deals').update({ converted_to_sla: true }).eq('id', deal.id)
                    alert(`Contract created for ${form.client}`)
                    onSaved(); onClose()
                  }}
                  className={`text-xs py-2 px-3 rounded-lg border font-semibold flex items-center gap-1 ${
                    urgent ? 'border-amber-400 bg-white text-amber-700 hover:bg-amber-100' : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-100'
                  }`}>
                  <Plus size={12}/> {t("df_convert_to_contract")}
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── INTERCOMPANY (ECT only) ────────────────────────────── */}
        {isECT && (
          <IntercompanySection form={form} set={set} hasIC={hasIC}/>
        )}

        {/* Invoice Date */}
        {['BackLog','Invoiced'].includes(form.stage) && (
          <div>
            <label className="label">{t("df_invoice_date")}</label>
            <input className="input" type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)}/>
            <p className="text-[10px] text-gray-400 mt-0.5">{t("df_invoice_hint")}</p>
          </div>
        )}

        {/* Monthly recognition — internal VGT revenue-recognition view.
            Hidden for distributors; their deal value comes from products. */}
        {!isDistributor && <DealMonthlyGrid form={form} set={set} t={t}/>}

        {/* Unified activity timeline — replaces the old Change History + Activity Log */}
        {deal?.id && (
          <DealActivityNotes
            dealId={deal.id}
            actNote={actNote} setActNote={setActNote}
            nextAction={nextAction} setNextAction={setNextAction}
            nextActionDate={nextActionDate} setNextActionDate={setNextActionDate}
            addingAct={addingAct}
            onAddActivity={async () => {
              await addActivity()
              setTimelineNonce(n => n + 1)
            }}
            timelineNonce={timelineNonce}
            t={t}
          />
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
