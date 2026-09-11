import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useCompanyScope } from '../hooks/useCompanyScope'
import { useTranslation } from '../hooks/useTranslation'
import { REGIONS } from '../constants'
import { regionOf, countriesOf } from '../lib/regions'
import { X } from 'lucide-react'
import SearchableSelect from './SearchableSelect'

/**
 * A deal, in four fields, from inside something else — a tender, a task.
 *
 * Two things it used to get wrong, both of them worst for a partner. The four
 * selects carried no labels at all, so a distributor opening a new tender was
 * shown a box saying "VGT", a box saying "Europe" and a box saying "Country"
 * with no indication of what any of them were for. And the region defaulted to
 * Europe for everybody, which offered a Chilean distributor a list of European
 * countries to find Chile in.
 *
 * A partner does not choose a business unit — they buy through VGT, and there
 * is nothing to pick — so they are not shown one; and their own company's
 * country decides the region rather than a hard-coded continent.
 */
export default function QuickDealForm({ initialClient = '', onCancel, onCreated }) {
  const { profile, company } = useAuth()
  const { homeId } = useCompanyScope()
  const { t } = useTranslation()
  const isPartner = profile?.role === 'distributor' || profile?.role === 'partner'

  // A partner's business is VGT's; ours follows whichever unit we sit in.
  const defaultBU = isPartner ? 'VGT'
    : (['VGT', 'ECT'].includes(profile?.bu) ? profile.bu : 'VGT')
  const homeCountry = company?.country || profile?.country || ''
  const homeRegion = regionOf(homeCountry)

  const [form, setForm] = useState({
    client: initialClient,
    bu: defaultBU,
    // Blank rather than Europe where the country is unknown: an empty field
    // gets filled in, a wrongly filled one does not get looked at again.
    region: homeRegion || '',
    country: homeRegion ? homeCountry : '',
    stage: 'Lead',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [existingClients, setExistingClients] = useState([])

  useEffect(() => {
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setExistingClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    }).catch(() => {})
  }, [])

  async function save() {
    if (!form.client.trim()) { setError(t('qdf_client_required')); return }
    setSaving(true); setError(null)
    const { data, error: e } = await supabase
      .from('deals')
      .insert({
        client: form.client.trim(),
        bu: form.bu,
        region: form.region || null,
        country: form.country || null,
        stage: form.stage,
        company_id: homeId || profile?.company_id || null,
      })
      .select('id, client, bu, country, company_id')
      .single()
    setSaving(false)
    if (e) { setError(e.message); return }
    onCreated?.(data)
  }

  const countries = countriesOf(form.region)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{t('qdf_title')}</p>
        <button type="button" onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 min-h-tap min-w-tap p-1">
          <X size={14}/>
        </button>
      </div>

      <div>
        <label className="label">{t('qdf_client')}</label>
        <SearchableSelect
          value={form.client}
          onChange={v => set('client', v)}
          options={existingClients.map(c => ({ value: c, label: c }))}
          placeholder={t('qdf_search_clients')}
          emptyLabel={t('qdf_pick_client')}
          onCreateNew={q => { if (q) set('client', q) }}
          createLabel={t('qdf_new_client')}
          size="sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* A partner has no business unit to choose. Theirs is VGT, and a
            select with one meaningful answer is a question nobody should be
            asked. */}
        {!isPartner && (
          <div>
            <label className="label">{t('qdf_bu')}</label>
            <select className="select text-sm" value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
        )}
        <div>
          <label className="label">{t('qdf_region')}</label>
          <select className="select text-sm" value={form.region}
            onChange={e => setForm(f => ({ ...f, region: e.target.value, country: '' }))}>
            <option value="">{t('qdf_region_ph')}</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('qdf_country')}</label>
          <select className="select text-sm" value={form.country}
            onChange={e => set('country', e.target.value)} disabled={!form.region}>
            <option value="">{t('qdf_country_ph')}</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('qdf_stage')}</label>
          <select className="select text-sm" value={form.stage} onChange={e => set('stage', e.target.value)}>
            <option value="Lead">Lead</option>
            <option value="Pipeline">Pipeline</option>
            <option value="Offer Presented">Offer Presented</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving}
          className="btn-primary text-xs py-1.5 px-3">
          {saving ? t('qdf_saving') : t('qdf_create')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">
          {t('qd_cancel')}
        </button>
      </div>
    </div>
  )
}
