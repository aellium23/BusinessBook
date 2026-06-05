import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatK, Spinner, CollapsibleSection } from '../components/ui'
import { Target, Plus, Save, Trash2, Crown, Package } from 'lucide-react'
import SalesOverlayConfig from '../components/SalesOverlayConfig'
import { useTranslation } from '../hooks/useTranslation'
import { MONTHS_K, PRODUCTS, safeJsonParse } from '../constants'

// Team structure — manager is first entry, rest are reports
const TEAM_STRUCTURE = {
  VGT: { manager: 'Elio Santos',    color: '#1D9E75' },
  ECT: { manager: 'Francisco Perez', color: '#D85A30' },
}

function ProgressRing({ pct, color, size = 64 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.min(Math.max(pct, 0) / 100, 1) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    </svg>
  )
}

// Normalise the `sub_targets` column into a { [product]: number } map
function readSubTargets(quota) {
  const raw = quota?.sub_targets
  const parsed = safeJsonParse(raw, {}) || {}
  const out = {}
  PRODUCTS.forEach(p => { out[p] = Number(parsed[p]) || 0 })
  return out
}

function QuotaCard({ quota, actuals, forecast, color, isManager, teamForecast, teamActuals, onEdit, onDelete, isAdmin, ownerName }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [showSubTargets, setShowSubTargets] = useState(false)
  const isOwnCard = ownerName && quota.sales_owner === ownerName
  const [editVal, setEditVal] = useState(quota.target_eur)
  const [subTargets, setSubTargets] = useState(() => readSubTargets(quota))
  const [saveError, setSaveError] = useState(null)

  // Reset local state when quota changes externally
  useEffect(() => {
    setEditVal(quota.target_eur)
    setSubTargets(readSubTargets(quota))
  }, [quota.id, quota.target_eur, quota.sub_targets])

  const act = isManager ? teamActuals : (actuals || 0)
  const fc  = isManager ? teamForecast : (forecast || 0)
  const target = quota.target_eur
  const pctAct = target > 0 ? (act / target * 100) : 0
  const pctFC  = target > 0 ? (fc  / target * 100) : 0

  const subTotal = Object.values(subTargets).reduce((s, v) => s + (Number(v) || 0), 0)
  const hasSubTargets = subTotal > 0

  async function save() {
    setSaveError(null)
    // Try to persist sub_targets too; gracefully degrade if the column is absent.
    const payload = { target_eur: editVal, sub_targets: subTargets }
    let { error } = await supabase.from('quotas').update(payload).eq('id', quota.id)
    if (error && /column .*sub_targets/i.test(error.message || '')) {
      const res = await supabase.from('quotas').update({ target_eur: editVal }).eq('id', quota.id)
      error = res.error
      if (!error) {
        setSaveError('Sub-targets column missing — only total target saved. Run the SQL migration.')
      }
    }
    if (error) { setSaveError(error.message); return }
    setEditing(false); setShowSubTargets(false)
    onEdit()
  }

  // Admins can edit any card (including managers); the owner of the card can edit their own
  const canEdit = isAdmin || isOwnCard

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isManager ? 'border-2' : 'border border-gray-200'}`}
      style={{ borderColor: isManager ? color : undefined }}>

      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {isManager && <Crown size={12} style={{ color }} />}
              <p className={`font-bold truncate ${isManager ? 'text-base' : 'text-sm text-gray-800'}`}
                style={isManager ? { color } : {}}>
                {quota.sales_owner}
              </p>
            </div>
            {editing ? (
              <div className="flex items-center gap-2 mt-1">
                <input type="number" className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-navy/20"
                  value={editVal} onChange={e => setEditVal(parseFloat(e.target.value)||0)}
                  aria-label={`Target for ${quota.sales_owner}`}/>
                <button onClick={save} className="text-xs bg-navy text-white px-2 py-1 rounded-lg"
                  aria-label="Save target">
                  <Save size={11}/>
                </button>
                <button onClick={() => { setEditing(false); setSaveError(null) }}
                  className="text-xs text-gray-400" aria-label="Cancel edit">✕</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Target: <strong className="text-gray-700">{formatK(target)}</strong>
                {isManager && <span className="ml-1 text-gray-400">({t("quotas_team_rollup")})</span>}
              </p>
            )}
            {saveError && <p className="text-micro text-red-500 mt-1">{saveError}</p>}
          </div>

          {/* Progress ring */}
          <div className="relative shrink-0">
            <ProgressRing pct={pctFC} color={color} size={isManager ? 72 : 60}/>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-bold leading-none ${isManager ? 'text-sm' : 'text-xs'}`}
                style={{ color }}>
                {Math.round(pctFC)}%
              </span>
              <span className="text-micro text-gray-400">FC</span>
            </div>
          </div>
        </div>

        {/* Bars */}
        <div className="mt-3 space-y-2">
          <div>
            <div className="flex justify-between text-micro text-gray-400 mb-1">
              <span>{t("quotas_actuals")}</span>
              <span className="font-medium text-gray-600">{formatK(act)} · {Math.round(pctAct)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width:`${Math.min(pctAct,100)}%`, background: color }}/>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-micro text-gray-400 mb-1">
              <span>{t("quotas_forecast")}</span>
              <span className="font-medium text-gray-600">{formatK(fc)} · {Math.round(pctFC)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all opacity-50"
                style={{ width:`${Math.min(pctFC,100)}%`, background: color }}/>
            </div>
          </div>
        </div>

        {/* Sub-targets — compact count only; full breakdown on expand */}
        {hasSubTargets && !showSubTargets && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button onClick={() => setShowSubTargets(true)}
              className="text-micro text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <Package size={11}/> {PRODUCTS.filter(p => subTargets[p] > 0).length} {t('quotas_sub_targets')} · {formatK(subTotal)}
            </button>
          </div>
        )}

        {/* Sub-targets editor */}
        {showSubTargets && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Package size={12}/> {t('quotas_sub_targets')}
              </p>
              <span className={`text-micro font-medium ${
                Math.abs(subTotal - (Number(editVal) || target)) < 1 ? 'text-green-600' : 'text-amber-600'
              }`}>
                Σ {formatK(subTotal)} / {formatK(Number(editVal) || target)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {PRODUCTS.map(p => (
                <div key={p} className="flex items-center gap-2">
                  <label className="text-tiny text-gray-500 flex-1 truncate" htmlFor={`sub-${quota.id}-${p}`}>
                    {p}
                  </label>
                  <input
                    id={`sub-${quota.id}-${p}`}
                    type="number"
                    min={0}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-navy/20"
                    value={subTargets[p]}
                    onChange={e => setSubTargets(s => ({ ...s, [p]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>
            {Math.abs(subTotal - (Number(editVal) || target)) > 1 && (
              <p className="text-micro text-amber-600">
                {t('quotas_sub_diff')} {formatK(Math.abs(subTotal - (Number(editVal) || target)))}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="flex-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-1.5 rounded-lg transition-colors">
              {t('quotas_edit_target')}
            </button>
          )}
          <button onClick={() => setShowSubTargets(s => !s)}
            className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            <Package size={11}/> {showSubTargets ? t('quotas_hide') : t('quotas_sub_targets')}
          </button>
          {editing && (
            <button onClick={save}
              className="text-xs bg-navy text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
              <Save size={11}/> {t('quotas_save')}
            </button>
          )}
          {isAdmin && !isManager && (
            <button onClick={() => onDelete(quota.id)}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors"
              aria-label={`Delete quota for ${quota.sales_owner}`}>
              <Trash2 size={12}/>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TeamSection({ bu, quotas, actuals, forecast, onRefresh, isAdmin, canWrite, profile }) {
  const { t } = useTranslation()
  const { color, manager } = TEAM_STRUCTURE[bu]
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTarget, setNewTarget] = useState('')

  const teamQuotas = quotas.filter(q => q.bu === bu)
  // Flexible match: exact or first name match
  const managerQ   = teamQuotas.find(q =>
    q.sales_owner === manager ||
    manager.startsWith(q.sales_owner) ||
    q.sales_owner.startsWith(manager.split(" ")[0])
  )
  const reportsQ   = teamQuotas.filter(q => q !== managerQ)

  // Manager totals = sum of reports
  const teamAct = reportsQ.reduce((s,q) => s + (actuals[`${bu}::${q.sales_owner}`]||0), 0)
  const teamFC  = reportsQ.reduce((s,q) => s + (forecast[`${bu}::${q.sales_owner}`]||0), 0)

  async function addQuota() {
    if (!newName || !newTarget) return
    await supabase.from('quotas').insert({
      bu, sales_owner: newName,
      target_eur: parseFloat(newTarget)||0,
      fiscal_year: 2026
    })
    setNewName(''); setNewTarget(""); setAddingNew(false)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      {/* BU Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: color }}/>
          <h2 className="font-bold text-gray-800">{bu} · {bu === 'VGT' ? 'Portugal' : 'Spain'}</h2>
        </div>
        {canWrite && (
          <button onClick={() => setAddingNew(o=>!o)}
            className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800">
            <Plus size={12}/> {t('quotas_add_member')}
          </button>
        )}
      </div>

      {/* Manager card — full width */}
      {managerQ ? (
        <QuotaCard
          quota={managerQ} color={color} isManager
          actuals={actuals[`${bu}::${manager}`]}
          forecast={forecast[`${bu}::${manager}`]}
          teamActuals={teamAct} teamForecast={teamFC}
          onEdit={onRefresh} onDelete={async id => { await supabase.from('quotas').delete().eq('id',id); onRefresh() }}
          isAdmin={canWrite} ownerName={profile?.sales_owner_name}
        />
      ) : (
        <div className="border-2 border-dashed rounded-xl p-4 text-center text-xs text-gray-400"
          style={{ borderColor: color }}>
          {t('quotas_no_quota').replace('{name}', manager)}
        </div>
      )}

      {/* Connector line visual */}
      {reportsQ.length > 0 && (
        <div className="flex items-center gap-2 px-2">
          <div className="w-4 border-l-2 border-b-2 border-gray-200 h-3 rounded-bl"/>
          <span className="text-micro text-gray-400">{t("quotas_reports")}</span>
          <div className="flex-1 border-t border-gray-100"/>
        </div>
      )}

      {/* Reports grid */}
      {reportsQ.length > 0 && (
        <div className="grid gap-3 pl-4">
          {reportsQ.filter(q =>
            isAdmin ||
            profile?.role?.includes('editor') ||
            profile?.role?.includes('member') ||
            !profile?.sales_owner_name ||
            q.sales_owner === profile?.sales_owner_name
          ).map(q => (
            <QuotaCard key={q.id} quota={q} color={color} isManager={false}
              actuals={actuals[`${bu}::${q.sales_owner}`]}
              forecast={forecast[`${bu}::${q.sales_owner}`]}
              teamActuals={0} teamForecast={0}
              onEdit={onRefresh}
              onDelete={async id => { await supabase.from('quotas').delete().eq('id',id); onRefresh() }}
              isAdmin={canWrite} ownerName={profile?.sales_owner_name}
            />
          ))}
        </div>
      )}

      {/* Add new member form */}
      {addingNew && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <p className="text-xs font-medium text-gray-600">{t('quotas_add_team_member')} — {bu}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20"
              placeholder={t('quotas_name_ph')} value={newName} onChange={e => setNewName(e.target.value)}/>
            <input type="number" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20"
              placeholder={t('quotas_target_ph')} value={newTarget} onChange={e => setNewTarget(e.target.value)}/>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAddingNew(false)} className="text-xs text-gray-400 px-3 py-1.5">{t("quotas_cancel")}</button>
            <button onClick={addQuota} className="text-xs bg-navy text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Save size={11}/> {t('quotas_save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sales Target do Distribuidor ─────────────────────────────────────────────
function DistributorQuota({ quotas, actuals, forecast, profile }) {
  const { t } = useTranslation()
  const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
  const MONTHS_L = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

  // Quota deste distribuidor
  const myQuota = quotas[0] || null
  const target  = myQuota?.target_eur || 0

  // Actuals e forecast deste distribuidor (sum all keys — deals may have different sales_owners)
  const myActuals  = Object.values(actuals).reduce((s, v) => s + (v || 0), 0)
  const myForecast = Object.values(forecast).reduce((s, v) => s + (v || 0), 0)

  const actPct = target > 0 ? Math.round(myActuals  / target * 100) : 0
  const fcPct  = target > 0 ? Math.round(myForecast / target * 100) : 0

  const COLOR = '#1D9E75'

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">{t('quotas_title')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('dist_target_sub')}</p>
      </div>

      {!target ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">{t('dist_no_target')}</p>
          <p className="text-gray-300 text-xs mt-1">{t('dist_contact_mgr')}</p>
        </div>
      ) : (
        <>
          {/* Target card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('dist_target_fy26')}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {Math.round(target/1000)}K€
                </p>
              </div>
              <ProgressRing pct={actPct} color={COLOR} size={72}/>
            </div>

            {/* Barras */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600">{t('dist_actuals_inv')}</span>
                  <span className="font-bold" style={{color: COLOR}}>
                    {Math.round(myActuals/1000)}K€ · {actPct}%
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{width: `${Math.min(actPct,100)}%`, background: COLOR}}/>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600">{t('dist_forecast_bl')}</span>
                  <span className="font-bold text-blue-600">
                    {Math.round(myForecast/1000)}K€ · {fcPct}%
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-400 transition-all"
                    style={{width: `${Math.min(fcPct,100)}%`}}/>
                </div>
              </div>
            </div>

            {/* Gap */}
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {t('dist_gap')} <span className="font-semibold text-gray-600">
                  {Math.round((target - myForecast)/1000)}K€
                </span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Quotas() {
  const { isAdmin, canSeeAll, profile, readOnly } = useAuth()
  const canWrite = isAdmin && !readOnly
  const { t } = useTranslation()
  const [quotas, setQuotas] = useState([])
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    let qQuery = supabase.from('quotas').select("*").order('bu').order('sales_owner')
    let dQuery = supabase.from('deals').select('bu,sales_owner,stage,company_id,' + MONTHS_K.join(',')).eq('is_intercompany_mirror', false)

    // Filtros por role
    if (!isAdmin) {
      if (profile?.role === 'distributor' && profile?.company_id) {
        // Distribuidor: ver só o seu target e os seus deals
        qQuery = qQuery.eq('company_id', profile.company_id)
        dQuery = dQuery.eq('company_id', profile.company_id)
      } else if (profile?.bu === 'VGT') {
        dQuery = dQuery.eq('bu','VGT')
      } else if (profile?.bu === 'ECT') {
        dQuery = dQuery.eq('bu','ECT')
      }
    }

    const [qRes, dRes] = await Promise.all([qQuery, dQuery])
    setQuotas(qRes.data || [])
    setDeals(dRes.data || [])
    setLoading(false)
  }
  useEffect(() => { if (profile !== undefined) load() }, [profile])

  const actuals = useMemo(() => {
    const map = {}
    deals.forEach(d => {
      if (d.stage !== 'Invoiced') return
      const key = `${d.bu}::${d.sales_owner || 'Unassigned'}`
      map[key] = (map[key]||0) + MONTHS_K.reduce((s,m)=>s+(Number(d[m])||0),0)
    })
    return map
  }, [deals])

  const forecast = useMemo(() => {
    const map = {}
    deals.forEach(d => {
      if (!['BackLog','Invoiced'].includes(d.stage)) return
      const key = `${d.bu}::${d.sales_owner || 'Unassigned'}`
      map[key] = (map[key]||0) + MONTHS_K.reduce((s,m)=>s+(Number(d[m])||0),0)
    })
    return map
  }, [deals])

  if (loading) return <Spinner/>

  // Vista dedicada para distribuidores
  if (profile?.role === 'distributor') {
    return <DistributorQuota quotas={quotas} actuals={actuals} forecast={forecast} profile={profile}/>
  }

  // Non-admins only see their own BU's targets
  const visibleBUs = isAdmin ? ['VGT', 'ECT'] : (profile?.bu ? [profile.bu] : [])

  // Managers see the whole team; plain members (sales reps) see only their own target
  const isManagerLevel = isAdmin || profile?.role === 'manager'
  const ownName = (profile?.sales_owner_name || '').toLowerCase()
  const scopedQuotas = isManagerLevel
    ? quotas
    : quotas.filter(q => (q.sales_owner || '').toLowerCase() === ownName)

  return (
    <div className="p-4 space-y-8 max-w-4xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">{t("quotas_title")}</h1>
        <p className="text-sm text-gray-400">{isManagerLevel ? t("quotas_team") : 'Your sales target'}</p>
      </div>

      {!isManagerLevel && scopedQuotas.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No sales target assigned to you yet.</p>
          <p className="text-gray-300 text-xs mt-1">Contact your manager to set your target.</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${visibleBUs.length > 1 ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
          {visibleBUs.map((bu, i) => (
            <div key={bu} className={`space-y-3 ${i > 0 ? 'lg:border-l lg:border-gray-100 lg:pl-6' : ''}`}>
              <TeamSection bu={bu} quotas={scopedQuotas} actuals={actuals} forecast={forecast}
                onRefresh={load} isAdmin={isAdmin} canWrite={canWrite} profile={profile}/>
            </div>
          ))}
        </div>
      )}

      {/* Sales Overlay Rules — admin/manager only, collapsed by default */}
      {isManagerLevel && (
        <CollapsibleSection title={t('quotas_overlay_section')} subtitle={t('df_optional')}>
          {visibleBUs.map(bu => (
            <SalesOverlayConfig key={bu} bu={bu}
              salesOwners={quotas.map(q => ({ name: q.sales_owner, bu: q.bu }))}/>
          ))}
        </CollapsibleSection>
      )}
    </div>
  )
}
