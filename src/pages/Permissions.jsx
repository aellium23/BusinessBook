import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner } from '../components/ui'
import { Shield, Lock } from 'lucide-react'
import RolesTab from '../components/permissions/RolesTab'
import UsersTab from '../components/permissions/UsersTab'
import CompaniesTab from '../components/permissions/CompaniesTab'

// ── Página principal ──────────────────────────────────────────────────────────
export default function Permissions() {
  const { t } = useTranslation()
  const { isAdmin, user, loading: authLoading } = useAuth()
  const [permSets, setPermSets]     = useState([])
  const [profiles, setProfiles]     = useState([])
  const [companies, setCompanies]   = useState([])
  const [salesOwners, setSalesOwners] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('sets')
  const [buFilter, setBuFilter]     = useState('all')
  const [search, setSearch]         = useState('')

  async function load() {
    const [ps, pr, co, so] = await Promise.all([
      supabase.from('permission_sets').select('*').order('is_system', {ascending:false}).order('name'),
      supabase.from('profiles').select('*').order('role').order('email'),
      supabase.from('companies').select('*').order('type').order('name'),
      supabase.from('sales_owners').select('*').eq('active',true).order('bu').order('name'),
    ])
    setPermSets(ps.data || [])
    setProfiles(pr.data || [])
    setCompanies(co.data || [])
    setSalesOwners(so.data || [])
    setLoading(false)
  }

  useEffect(() => { if (!authLoading) load() }, [authLoading])

  if (authLoading || loading) return <div className="flex items-center justify-center h-64"><Spinner/></div>

  if (!isAdmin) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <Lock size={32} className="mx-auto mb-2 opacity-30"/>
        <p className="text-sm">{t('perm_admin_only') || 'Admin access only'}</p>
      </div>
    </div>
  )

  // Tabs. The old "Sales Targets" tab was removed (duplicated with /quotas),
  // and "Invite" is merged into "Users" as a primary CTA inside that tab.
  const TABS = [
    { id:'sets',      label:t('perm_roles_title'),  count: permSets.length },
    { id:'users',     label:t('perm_users_title'),  count: profiles.length },
    { id:'companies', label:t('perm_companies'),    count: companies.length },
  ]

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-navy"/>{t('perm_title') || 'Permissions'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {profiles.length} {t('perm_users_title')} · {permSets.length} {t('perm_roles_title')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t_ => (
          <button key={t_.id} onClick={() => setTab(t_.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t_.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t_.label}
            {t_.count !== undefined && (
              <span className="text-micro bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{t_.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Permission Sets */}
      {tab === 'sets' && (
        <RolesTab permSets={permSets} profiles={profiles} onRefresh={load}/>
      )}

      {/* Tab: Users (now includes the Invite flow as a collapsible section) */}
      {tab === 'users' && (
        <UsersTab
          profiles={profiles}
          permSets={permSets}
          companies={companies}
          salesOwners={salesOwners}
          user={user}
          onRefresh={load}
          buFilter={buFilter}
          setBuFilter={setBuFilter}
          search={search}
          setSearch={setSearch}
        />
      )}

      {/* Tab: Companies */}
      {tab === 'companies' && (
        <CompaniesTab companies={companies} onRefresh={load}/>
      )}
    </div>
  )
}
