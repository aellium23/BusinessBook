import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner } from '../components/ui'
import {
  Shield, Building2, Users, Plus, Edit3, Trash2, Check, X,
  Mail, Lock, Globe, RefreshCw, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Search
} from 'lucide-react'

// ── Permissões por role ───────────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  admin:       { pages: ['dashboard','deals','clients','history','quotas','budget','users','settings','tasks','tenders','permissions'], canEdit: true,  editOwn: false, seesAll: true  },
  manager:     { pages: ['dashboard','deals','clients','history','quotas','tasks','tenders'],                                          canEdit: true,  editOwn: false, seesAll: false },
  member:      { pages: ['dashboard','deals','clients','history','quotas','tasks','tenders'],                                          canEdit: true,  editOwn: true,  seesAll: false },
  distributor: { pages: ['dashboard','deals','tasks'],                                                                                  canEdit: true,  editOwn: true,  seesAll: false },
  viewer:      { pages: ['dashboard','deals','clients','history'],                                                                      canEdit: false, editOwn: false, seesAll: false },
  partner:     { pages: ['dashboard','deals','clients','tasks','tenders'],                                                              canEdit: false, editOwn: false, seesAll: false },
}

const ROLE_CONFIG = {
  admin:       { label:'Admin',       color:'#B45309', bg:'#FEF3C7' },
  manager:     { label:'Manager',     color:'#0F6E56', bg:'#E1F5EE' },
  member:      { label:'Member',      color:'#1D9E75', bg:'#F0FDF9' },
  distributor: { label:'Distributor', color:'#7C3AED', bg:'#F5F3FF' },
  viewer:      { label:'Viewer',      color:'#185FA5', bg:'#E6F1FB' },
  partner:     { label:'Partner',     color:'#6B7280', bg:'#F3F4F6' },
}

const COMPANY_TYPES = {
  internal_vgt: { label:'VGT (Portugal)', icon:'🇵🇹', color:'#0F6E56' },
  internal_ect: { label:'ECT (Spain)',    icon:'🇪🇸', color:'#D85A30' },
  distributor:  { label:'Distribuidor',   icon:'🤝', color:'#7C3AED' },
  partner:      { label:'Parceiro',       icon:'🏢', color:'#6B7280' },
  client:       { label:'Cliente',        icon:'🏥', color:'#185FA5' },
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || { label: role, color:'#6B7280', bg:'#F3F4F6' }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ── User Card ─────────────────────────────────────────────────────────────────
function UserCard({ profile, companies, salesOwners, onSaved, isSelf }) {
  const { t } = useTranslation()
  const [open, setOpen]         = useState(false)
  const [role, setRole]         = useState(profile.role || 'viewer')
  const [companyId, setCompany] = useState(profile.company_id || '')
  const [ownerId, setOwner]     = useState(profile.sales_owner_id || '')
  const [active, setActive]     = useState(profile.active !== false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const company = companies.find(c => c.id === profile.company_id)
  const roleCfg = ROLE_CONFIG[profile.role] || ROLE_CONFIG.viewer

  async function save() {
    setSaving(true)
    const co = companies.find(c => c.id === companyId)
    const bu = role === 'admin' ? 'ALL'
             : co?.type === 'internal_vgt' ? 'VGT'
             : co?.type === 'internal_ect' ? 'ECT'
             : co?.bu || null
    await supabase.from('profiles').update({
      role, company_id: companyId || null,
      sales_owner_id: ownerId || null,
      sales_owner_name: salesOwners.find(o => o.id === ownerId)?.name || null,
      bu, active,
    }).eq('id', profile.id)
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1500)
    onSaved()
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      isSelf ? 'border-amber-300 border-2' : 'border-gray-200'
    } ${!active ? 'opacity-60' : ''}`}>

      {/* Row principal */}
      <div className="p-3 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: roleCfg.bg, color: roleCfg.color }}>
          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {profile.full_name || profile.email?.split('@')[0]}
              {isSelf && <span className="ml-1 text-[10px] text-amber-600">(you)</span>}
            </p>
            <RoleBadge role={profile.role} />
            {!active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inactive</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{profile.email}</p>
          {company && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {COMPANY_TYPES[company.type]?.icon} {company.name}
              {profile.bu && <span className="ml-1.5 font-medium text-gray-500">{profile.bu}</span>}
            </p>
          )}
        </div>

        {/* Toggle editar */}
        <button onClick={() => setOpen(o => !o)}
          className="shrink-0 text-gray-300 hover:text-navy transition-colors p-1">
          {open ? <ChevronUp size={16}/> : <Edit3 size={14}/>}
        </button>
      </div>

      {/* Painel de edição */}
      {open && (
        <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50">

          {/* Role */}
          <div>
            <label className="label mb-1.5">Role</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(ROLE_CONFIG).map(([r, cfg]) => (
                <button key={r} onClick={() => setRole(r)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                    role === r ? 'border-2' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  style={role === r ? { borderColor: cfg.color, background: cfg.bg, color: cfg.color } : {}}>
                  {cfg.label}
                </button>
              ))}
            </div>
            {role && (
              <p className="text-[10px] text-gray-400 mt-1">
                Acesso: {ROLE_PERMISSIONS[role]?.pages.join(', ')}
              </p>
            )}
          </div>

          {/* Empresa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Empresa</label>
              <select className="select text-sm" value={companyId}
                onChange={e => setCompany(e.target.value)}>
                <option value="">— Sem empresa —</option>
                {companies.filter(c => c.active).map(co => (
                  <option key={co.id} value={co.id}>
                    {COMPANY_TYPES[co.type]?.icon} {co.name}
                  </option>
                ))}
              </select>
            </div>
            {['manager','member','distributor'].includes(role) && (
              <div>
                <label className="label">Sales Owner</label>
                <select className="select text-sm" value={ownerId}
                  onChange={e => setOwner(e.target.value)}>
                  <option value="">— Sem ligação —</option>
                  {salesOwners.filter(o => o.active).map(o => (
                    <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">Conta activa</label>
            <button onClick={() => setActive(o => !o)} disabled={isSelf}
              className={`w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-green-400' : 'bg-gray-200'} disabled:opacity-40`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`}/>
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={save} disabled={saving || isSelf}
              className="btn-primary flex-1 text-xs">
              {saving ? <RefreshCw size={12} className="animate-spin mx-auto"/> : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
          {isSelf && <p className="text-[10px] text-amber-600 text-center">Não podes editar o teu próprio role.</p>}
        </div>
      )}
    </div>
  )
}

// ── Companies Section ─────────────────────────────────────────────────────────
function CompaniesSection({ companies, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm]     = useState({ name:'', type:'distributor', country:'' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      name: form.name.trim(), type: form.type,
      bu: form.type === 'internal_vgt' ? 'VGT' : form.type === 'internal_ect' ? 'ECT' : null,
      country: form.country || null, active: true,
    })
    setForm({ name:'', type:'distributor', country:'' })
    setAdding(false); setSaving(false); onRefresh()
  }

  const grouped = useMemo(() => {
    const g = {}
    companies.forEach(co => { if (!g[co.type]) g[co.type] = []; g[co.type].push(co) })
    return g
  }, [companies])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Building2 size={15} className="text-navy"/>
          Empresas
        </h2>
        <button onClick={() => setAdding(o => !o)} className="btn-primary text-xs gap-1">
          <Plus size={12}/> Nova empresa
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" placeholder="ex: Distribuidor X"
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                style={{fontSize:'16px'}}/>
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select className="select" value={form.type}
                onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                {Object.entries(COMPANY_TYPES).map(([k,v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">País</label>
              <input className="input" placeholder="ex: Portugal"
                value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))}
                style={{fontSize:'16px'}}/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || saving}
              className="btn-primary flex-1 text-xs">
              {saving ? 'A guardar…' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(grouped).map(([type, list]) => {
          const cfg = COMPANY_TYPES[type] || { label: type, icon:'🏢', color:'#6B7280' }
          return (
            <div key={type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span>{cfg.icon}</span>
                <p className="text-xs font-bold text-gray-700">{cfg.label}</p>
                <span className="ml-auto text-xs text-gray-400">{list.filter(c=>c.active).length} activas</span>
              </div>
              {list.map(co => (
                <div key={co.id} className={`px-3 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0 ${!co.active ? 'opacity-40' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{co.name}</p>
                    {co.country && <p className="text-[10px] text-gray-400">{co.country}</p>}
                  </div>
                  <button onClick={async () => { await supabase.from('companies').update({active:!co.active}).eq('id',co.id); onRefresh() }}
                    className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 ${co.active ? 'bg-green-400' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${co.active ? 'translate-x-3.5' : 'translate-x-0.5'}`}/>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Access Matrix ─────────────────────────────────────────────────────────────
function AccessMatrix() {
  const pages = ['dashboard','deals','clients','history','quotas','budget','users','settings','tasks','tenders','permissions']
  const labels = { dashboard:'Dashboard', deals:'Deals', clients:'Clients', history:'History', quotas:'Targets', budget:'Budget', users:'Users', settings:'Settings', tasks:'Tasks', tenders:'Tenders', permissions:'Permissions' }
  const roles = Object.keys(ROLE_CONFIG)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2.5 font-semibold text-gray-500 sticky left-0 bg-gray-50 w-24">Página</th>
              {roles.map(r => (
                <th key={r} className="px-2 py-2.5 font-bold text-center"
                  style={{ color: ROLE_CONFIG[r].color }}>
                  {ROLE_CONFIG[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page, i) => (
              <tr key={page} className={i%2===0?'bg-white':'bg-gray-50/50'}>
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-inherit">{labels[page]}</td>
                {roles.map(r => {
                  const has = r==='admin' || (ROLE_PERMISSIONS[r]?.pages||[]).includes(page)
                  return (
                    <td key={r} className="px-2 py-2 text-center">
                      {has ? <Check size={12} className="text-green-500 mx-auto"/> : <X size={12} className="text-gray-200 mx-auto"/>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Invite Section ────────────────────────────────────────────────────────────
function InviteSection({ companies, salesOwners, onSaved }) {
  const { t } = useTranslation()
  const [email, setEmail]           = useState('')
  const [displayName, setName]      = useState('')
  const [role, setRole]             = useState('member')
  const [companyId, setCompany]     = useState('')
  const [ownerId, setOwner]         = useState('')
  const [sending, setSending]       = useState(false)
  const [result, setResult]         = useState(null)

  async function handleInvite() {
    if (!email.trim()) return
    setSending(true); setResult(null)
    const co = companies.find(c => c.id === companyId)
    const bu = role === 'admin' ? 'ALL' : co?.type === 'internal_vgt' ? 'VGT' : co?.type === 'internal_ect' ? 'ECT' : co?.bu || null
    const ownerName = salesOwners.find(o => o.id === ownerId)?.name || null

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.toLowerCase().trim(), role, company_id: companyId||null, sales_owner_id: ownerId||null, sales_owner_name: ownerName, bu, display_name: displayName||null }),
        }
      )
      const json = await res.json()
      setSending(false)
      if (json.success) {
        setResult({ ok: true, msg: json.message })
        setEmail(''); setName(''); setRole('member'); setCompany(''); setOwner('')
        onSaved()
      } else {
        setResult({ ok: false, msg: json.error || 'Erro desconhecido' })
      }
    } catch (err) {
      setSending(false)
      setResult({ ok: false, msg: err.message })
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
        <Mail size={15} className="text-navy"/>
        Adicionar utilizador
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome (opcional)</label>
            <input className="input" placeholder="Nome completo" value={displayName}
              onChange={e => setName(e.target.value)} style={{fontSize:'16px'}}/>
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" placeholder="user@empresa.com" value={email}
              onChange={e => setEmail(e.target.value)} style={{fontSize:'16px'}}/>
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="select" value={role} onChange={e => setRole(e.target.value)}>
              {Object.entries(ROLE_CONFIG).map(([r,cfg]) => (
                <option key={r} value={r}>{cfg.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              {role === 'admin' && 'Acesso total — todas as BUs'}
              {role === 'manager' && 'Gestor — edita todos os deals da BU'}
              {role === 'member' && 'Membro — edita os seus próprios deals'}
              {role === 'distributor' && 'Parceiro externo — vê só os seus deals'}
              {role === 'viewer' && 'Leitura apenas — sem edição'}
              {role === 'partner' && 'Parceiro — dashboard + deals linkados'}
            </p>
          </div>
          <div>
            <label className="label">Empresa</label>
            <select className="select" value={companyId} onChange={e => setCompany(e.target.value)}>
              <option value="">— Sem empresa —</option>
              {companies.filter(c=>c.active).map(co => (
                <option key={co.id} value={co.id}>{COMPANY_TYPES[co.type]?.icon} {co.name}</option>
              ))}
            </select>
          </div>
          {['manager','member','distributor'].includes(role) && (
            <div className="sm:col-span-2">
              <label className="label">Sales Owner (opcional)</label>
              <select className="select" value={ownerId} onChange={e => setOwner(e.target.value)}>
                <option value="">— Sem ligação —</option>
                {salesOwners.filter(o=>o.active).map(o => (
                  <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {result && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5"/> : <AlertCircle size={14} className="shrink-0 mt-0.5"/>}
            {result.msg}
          </div>
        )}

        <button onClick={handleInvite} disabled={!email.trim() || sending}
          className="btn-primary w-full disabled:opacity-50">
          {sending ? <><RefreshCw size={14} className="animate-spin"/><span>A processar…</span></> : <><Mail size={14}/><span>Convidar utilizador</span></>}
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          O utilizador recebe email com link para definir a password.
        </p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Permissions() {
  const { t } = useTranslation()
  const { isAdmin, user, loading: authLoading } = useAuth()
  const [companies, setCompanies]     = useState([])
  const [profiles, setProfiles]       = useState([])
  const [salesOwners, setSalesOwners] = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('users')
  const [buFilter, setBuFilter]       = useState('all')
  const [search, setSearch]           = useState('')

  async function load() {
    const [c, p, o] = await Promise.all([
      supabase.from('companies').select('*').order('type').order('name'),
      supabase.from('profiles').select('*').order('role').order('email'),
      supabase.from('sales_owners').select('*').eq('active', true).order('bu').order('name'),
    ])
    setCompanies(c.data || [])
    setProfiles(p.data || [])
    setSalesOwners(o.data || [])
    setLoading(false)
  }

  useEffect(() => { if (!authLoading) load() }, [authLoading])

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64"><Spinner/></div>
  )

  if (!isAdmin) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <Lock size={32} className="mx-auto mb-2 opacity-30"/>
        <p className="text-sm">Acesso restrito — apenas admin.</p>
      </div>
    </div>
  )

  // Filtrar profiles
  const filtered = profiles.filter(p => {
    const matchBU = buFilter === 'all' || p.bu === buFilter || (buFilter === 'ALL' && p.bu === 'ALL')
    const matchSearch = !search || p.email?.toLowerCase().includes(search.toLowerCase()) || p.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchBU && matchSearch
  })

  const TABS = [
    { id:'users',    label:`Utilizadores`, count: profiles.length },
    { id:'companies',label:'Empresas',     count: companies.length },
    { id:'matrix',   label:'Access Matrix' },
    { id:'invite',   label:'+ Convidar' },
  ]

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-navy"/>
          Permissions
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {profiles.length} utilizadores · {profiles.filter(p=>['admin','manager','member'].includes(p.role)).length} com acesso de edição
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tab_ => (
          <button key={tab_.id} onClick={() => setTab(tab_.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === tab_.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab_.label}
            {tab_.count !== undefined && (
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{tab_.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Utilizadores */}
      {tab === 'users' && (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <input className="input pl-8 text-sm" placeholder="Pesquisar…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{fontSize:'16px'}}/>
              <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
            </div>
            {/* BU Filter */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {['all','VGT','ECT','ALL'].map(bu => (
                <button key={bu} onClick={() => setBuFilter(bu)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    buFilter === bu ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}>
                  {bu === 'all' ? 'Todos' : bu}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-2">
            {filtered.map(p => (
              <UserCard key={p.id} profile={p}
                companies={companies} salesOwners={salesOwners}
                onSaved={load} isSelf={p.id === user?.id}/>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nenhum utilizador encontrado.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Empresas */}
      {tab === 'companies' && (
        <CompaniesSection companies={companies} onRefresh={load}/>
      )}

      {/* Tab: Access Matrix */}
      {tab === 'matrix' && <AccessMatrix/>}

      {/* Tab: Convidar */}
      {tab === 'invite' && (
        <InviteSection companies={companies} salesOwners={salesOwners} onSaved={load}/>
      )}
    </div>
  )
}
