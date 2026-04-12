import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatK, Spinner } from '../components/ui'
import { Target, Plus, Save, Trash2, ChevronDown, ChevronUp, Crown } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

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

function QuotaCard({ quota, actuals, forecast, color, isManager, teamForecast, teamActuals, onEdit, onDelete, isAdmin, ownerName }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const isOwnCard = ownerName && quota.sales_owner === ownerName
  const [editVal, setEditVal] = useState(quota.target_eur)

  const act = isManager ? teamActuals : (actuals || 0)
  const fc  = isManager ? teamForecast : (forecast || 0)
  const target = quota.target_eur
  const pctAct = target > 0 ? (act / target * 100) : 0
  const pctFC  = target > 0 ? (fc  / target * 100) : 0

  async function save() {
    await supabase.from('quotas').update({ target_eur: editVal }).eq('id', quota.id)
    setEditing(false)
    onEdit()
  }

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
                  value={editVal} onChange={e => setEditVal(parseFloat(e.target.value)||0)}/>
                <button onClick={save} className="text-xs bg-navy text-white px-2 py-1 rounded-lg">
                  <Save size={11}/>
                </button>
                <button onClick={() => setEditing(false)} className="text-xs text-gray-400">✕</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Target: <strong className="text-gray-700">{formatK(target)}</strong>
                {isManager && <span className="ml-1 text-gray-400">({t("quotas_team_rollup")})</span>}
              </p>
            )}
          </div>

          {/* Progress ring */}
          <div className="relative shrink-0">
            <ProgressRing pct={pctFC} color={color} size={isManager ? 72 : 60}/>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-bold leading-none ${isManager ? 'text-sm' : 'text-xs'}`}
                style={{ color }}>
                {Math.round(pctFC)}%
              </span>
              <span className="text-[9px] text-gray-400">FC</span>
            </div>
          </div>
        </div>

        {/* Bars */}
        <div className="mt-3 space-y-2">
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>{t("quotas_actuals")}</span>
              <span className="font-medium text-gray-600">{formatK(act)} · {Math.round(pctAct)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width:`${Math.min(pctAct,100)}%`, background: color }}/>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>{t("quotas_forecast")}</span>
              <span className="font-medium text-gray-600">{formatK(fc)} · {Math.round(pctFC)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all opacity-50"
                style={{ width:`${Math.min(pctFC,100)}%`, background: color }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(isAdmin || isOwnCard) && !isManager && (
        <div className="px-4 pb-3 flex gap-2">
          <button onClick={() => setEditing(true)}
            className="flex-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-1.5 rounded-lg transition-colors">
            Edit target
          </button>
          {isAdmin && <button onClick={() => onDelete(quota.id)}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors">
            <Trash2 size={12}/>
          </button>}
        </div>
      )}
    </div>
  )
}

function TeamSection({ bu, quotas, actuals, forecast, onRefresh, isAdmin, profile }) {
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
        {isAdmin && (
          <button onClick={() => setAddingNew(o=>!o)}
            className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800">
            <Plus size={12}/> Add member
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
          isAdmin={isAdmin} ownerName={profile?.sales_owner_name}
        />
      ) : (
        <div className="border-2 border-dashed rounded-xl p-4 text-center text-xs text-gray-400"
          style={{ borderColor: color }}>
          No quota set for {manager} yet
        </div>
      )}

      {/* Connector line visual */}
      {reportsQ.length > 0 && (
        <div className="flex items-center gap-2 px-2">
          <div className="w-4 border-l-2 border-b-2 border-gray-200 h-3 rounded-bl"/>
          <span className="text-[10px] text-gray-400">{t("quotas_reports")}</span>
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
              isAdmin={isAdmin} ownerName={profile?.sales_owner_name}
            />
          ))}
        </div>
      )}

      {/* Add new member form */}
      {addingNew && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <p className="text-xs font-medium text-gray-600">Add team member — {bu}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20"
              placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}/>
            <input type="number" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20"
              placeholder="Target €" value={newTarget} onChange={e => setNewTarget(e.target.value)}/>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAddingNew(false)} className="text-xs text-gray-400 px-3 py-1.5">{t("quotas_cancel")}</button>
            <button onClick={addQuota} className="text-xs bg-navy text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Save size={11}/> Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Quotas() {
  const { isAdmin, canSeeAll, profile } = useAuth()
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
      map[key] = (map[key]||0) + MONTHS_K.reduce((s,m)=>s+(d[m]||0),0)
    })
    return map
  }, [deals])

  const forecast = useMemo(() => {
    const map = {}
    deals.forEach(d => {
      if (!['BackLog','Invoiced'].includes(d.stage)) return
      const key = `${d.bu}::${d.sales_owner || 'Unassigned'}`
      map[key] = (map[key]||0) + MONTHS_K.reduce((s,m)=>s+(d[m]||0),0)
    })
    return map
  }, [deals])

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-8 max-w-4xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">{t("quotas_title")}</h1>
        <p className="text-sm text-gray-400">{t("quotas_team")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <TeamSection bu="VGT" quotas={quotas} actuals={actuals} forecast={forecast}
            onRefresh={load} isAdmin={isAdmin} profile={profile}/>
        </div>
        <div className="space-y-3 lg:border-l lg:border-gray-100 lg:pl-6">
          <TeamSection bu="ECT" quotas={quotas} actuals={actuals} forecast={forecast}
            onRefresh={load} isAdmin={isAdmin} profile={profile}/>
        </div>
      </div>
    </div>
  )
}
