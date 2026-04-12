import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, ROLE_PERMISSIONS } from '../hooks/useAuth'
import { Spinner } from '../components/ui'
import {
  Shield, Building2, Users, Plus, Edit3, Trash2, Check, X,
  ChevronDown, ChevronUp, Mail, Eye, EyeOff, Globe, Save,
  AlertCircle, CheckCircle2, RefreshCw, Lock
} from 'lucide-react'

// ── Configurações visuais dos roles ─────────────────────────────────────────
const ROLE_CONFIG = {
  admin:       { label:'Admin',       color:'#B45309', bg:'#FEF3C7', desc:'Acesso total — todas as BUs, tudo editável' },
  manager:     { label:'Manager',     color:'#0F6E56', bg:'#E1F5EE', desc:'Gestor de equipa — edita todos os deals da BU' },
  member:      { label:'Member',      color:'#1D9E75', bg:'#F0FDF9', desc:'Membro — edita só os seus próprios deals' },
  distributor: { label:'Distributor', color:'#7C3AED', bg:'#F5F3FF', desc:'Parceiro externo — vê só os seus deals' },
  viewer:      { label:'Viewer',      color:'#185FA5', bg:'#E6F1FB', desc:'Leitura — sem edição' },
  partner:     { label:'Partner',     color:'#6B7280', bg:'#F3F4F6', desc:'Parceiro — dashboard + deals linkados' },
}

const COMPANY_TYPE_CONFIG = {
  internal_vgt: { label:'VGT (Portugal)', color:'#0F6E56', icon:'🇵🇹' },
  internal_ect: { label:'ECT (Spain)',    color:'#D85A30', icon:'🇪🇸' },
  distributor:  { label:'Distribuidor',   color:'#7C3AED', icon:'🤝' },
  partner:      { label:'Parceiro',       color:'#6B7280', icon:'🏢' },
  client:       { label:'Cliente',        color:'#185FA5', icon:'🏥' },
}

const PAGE_LABELS = {
  dashboard: 'Dashboard', deals: 'Deals', clients: 'Clients',
  history: 'History', quotas: 'Targets', budget: 'Budget',
  users: 'Users', settings: 'Settings', tasks: 'Tasks', tenders: 'Tenders',
}

// ── Componente: Badge de role ─────────────────────────────────────────────────
function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || { label: role, color:'#6B7280', bg:'#F3F4F6' }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>
      <Shield size={9} />{cfg.label}
    </span>
  )
}

// ── Componente: Matriz de permissões ─────────────────────────────────────────
function PermissionsMatrix() {
  const allPages = Object.keys(PAGE_LABELS)
  const roles = Object.keys(ROLE_CONFIG)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Lock size={14} className="text-blue-500" />
          Access Matrix — páginas por role
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-28 sticky left-0 bg-white">Página</th>
              {roles.map(r => {
                const cfg = ROLE_CONFIG[r]
                return (
                  <th key={r} className="px-3 py-2.5 font-bold text-center whitespace-nowrap"
                    style={{ color: cfg.color }}>
                    {cfg.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {allPages.map((page, i) => (
              <tr key={page} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-2 font-medium text-gray-700 sticky left-0 bg-inherit">
                  {PAGE_LABELS[page]}
                </td>
                {roles.map(r => {
                  const perms = ROLE_PERMISSIONS[r]
                  const hasAccess = r === 'admin' || perms.pages.includes(page)
                  return (
                    <td key={r} className="px-3 py-2 text-center">
                      {hasAccess
                        ? <Check size={13} className="text-green-500 mx-auto" />
                        : <X    size={13} className="text-red-300 mx-auto" />
                      }
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

// ── Componente: Gestão de Companies ──────────────────────────────────────────
function CompaniesSection({ companies, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name:'', type:'distributor', bu:'VGT', country:'' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      name: form.name.trim(), type: form.type,
      bu: ['internal_vgt','internal_ect'].includes(form.type)
          ? (form.type === 'internal_vgt' ? 'VGT' : 'ECT')
          : (form.bu || null),
      country: form.country || null,
      active: true,
    })
    setForm({ name:'', type:'distributor', bu:'VGT', country:'' })
    setAdding(false); setSaving(false); onRefresh()
  }

  async function handleToggle(co) {
    await supabase.from('companies').update({ active: !co.active }).eq('id', co.id)
    onRefresh()
  }

  async function handleDelete(id) {
    if (!confirm('Remover esta empresa? Os users ligados ficarão sem empresa.')) return
    await supabase.from('companies').delete().eq('id', id)
    onRefresh()
  }

  const grouped = useMemo(() => {
    const g = {}
    companies.forEach(co => {
      const t = co.type || 'partner'
      if (!g[t]) g[t] = []
      g[t].push(co)
    })
    return g
  }, [companies])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={18} className="text-navy" />
            Empresas
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Fujifilm Portugal, Fujifilm España, distribuidores, parceiros e clientes.
          </p>
        </div>
        <button onClick={() => setAdding(o => !o)} className="btn-primary text-xs gap-1">
          <Plus size={13}/> Nova empresa
        </button>
      </div>

      {/* Formulário de adicionar */}
      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">Nova empresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" placeholder="ex: Distribuidor X" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select className="select" value={form.type}
                onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                {Object.entries(COMPANY_TYPE_CONFIG).map(([k,v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            {!['internal_vgt','internal_ect'].includes(form.type) && (
              <div>
                <label className="label">BU associada</label>
                <select className="select" value={form.bu}
                  onChange={e => setForm(f => ({...f, bu: e.target.value}))}>
                  <option value="VGT">VGT</option>
                  <option value="ECT">ECT</option>
                  <option value="ALL">Ambas</option>
                </select>
              </div>
            )}
            <div>
              <label className="label">País</label>
              <input className="input" placeholder="ex: Portugal" value={form.country}
                onChange={e => setForm(f => ({...f, country: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs flex-1">Cancelar</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || saving}
              className="btn-primary text-xs flex-1">
              {saving ? 'A guardar…' : 'Adicionar empresa'}
            </button>
          </div>
        </div>
      )}

      {/* Lista agrupada por tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.entries(grouped).map(([type, list]) => {
          const cfg = COMPANY_TYPE_CONFIG[type] || { label: type, icon: '🏢', color: '#6B7280' }
          return (
            <div key={type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <span>{cfg.icon}</span>
                <p className="text-xs font-bold text-gray-700">{cfg.label}</p>
                <span className="ml-auto text-xs text-gray-400">{list.filter(c => c.active).length} activas</span>
              </div>
              <div className="divide-y divide-gray-50">
                {list.map(co => (
                  <div key={co.id} className={`px-4 py-2.5 flex items-center gap-3 ${!co.active ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{co.name}</p>
                      <p className="text-xs text-gray-400">
                        {co.bu && <span className="mr-2">{co.bu}</span>}
                        {co.country}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggle(co)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${co.active ? 'bg-green-400' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${co.active ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                      </button>
                      {!['internal_vgt','internal_ect'].includes(co.type) && (
                        <button onClick={() => handleDelete(co.id)}
                          className="text-gray-300 hover:text-red-500 p-1">
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Componente: User card com edição inline ───────────────────────────────────
function UserPermCard({ profile, companies, salesOwners, onSaved, currentUserId }) {
  const [editing, setEditing]   = useState(false)
  const [role, setRole]         = useState(profile.role || 'viewer')
  const [companyId, setCompany] = useState(profile.company_id || '')
  const [ownerId, setOwner]     = useState(profile.sales_owner_id || '')
  const [active, setActive]     = useState(profile.active !== false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const isSelf = profile.id === currentUserId
  const company = companies.find(c => c.id === (editing ? companyId : profile.company_id))
  const roleCfg = ROLE_CONFIG[profile.role] || ROLE_CONFIG.viewer
  const perms   = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer

  // BU derivado da empresa seleccionada
  const derivedBU = company?.type === 'internal_vgt' ? 'VGT'
                  : company?.type === 'internal_ect' ? 'ECT'
                  : company?.bu || null

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      role,
      company_id:       companyId || null,
      sales_owner_id:   ownerId   || null,
      sales_owner_name: salesOwners.find(o => o.id === ownerId)?.name || null,
      bu:               role === 'admin' ? 'ALL' : (derivedBU || null),
      active,
    }).eq('id', profile.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setEditing(false); onSaved()
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
      isSelf ? 'border-amber-300 border-2' : 'border-gray-200'
    } ${!active ? 'opacity-60' : ''}`}>

      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: roleCfg.bg, color: roleCfg.color }}>
          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate text-sm">
                {profile.full_name || profile.email?.split('@')[0]}
                {isSelf && <span className="ml-1 text-[10px] text-amber-600 font-medium">(tu)</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">{profile.email}</p>
              {company && (
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <Building2 size={9}/>
                  {company.name}
                  {profile.bu && <span className="ml-1 font-medium text-gray-500">{profile.bu}</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <RoleBadge role={profile.role} />
              {!active && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">inactivo</span>}
            </div>
          </div>

          {/* Páginas acessíveis */}
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.keys(PAGE_LABELS).map(page => {
              const hasAccess = profile.role === 'admin' ||
                (ROLE_PERMISSIONS[profile.role]?.pages || []).includes(page)
              return (
                <span key={page}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    hasAccess ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-300'
                  }`}>
                  {PAGE_LABELS[page]}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Painel de edição */}
      {editing ? (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">

          {/* Role */}
          <div>
            <label className="label">Role</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(ROLE_CONFIG).map(([r, cfg]) => (
                <button key={r} onClick={() => setRole(r)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                    role === r ? 'border-2' : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={role === r ? { borderColor: cfg.color, background: cfg.bg, color: cfg.color } : {}}>
                  <Shield size={10}/>{cfg.label}
                </button>
              ))}
            </div>
            {role && (
              <p className="text-[10px] text-gray-400 mt-1 ml-1">
                {ROLE_CONFIG[role]?.desc} · Páginas: {perms.pages.map(p => PAGE_LABELS[p]).join(', ')}
              </p>
            )}
          </div>

          {/* Empresa */}
          <div>
            <label className="label">Empresa</label>
            <select className="select text-sm" value={companyId}
              onChange={e => setCompany(e.target.value)}>
              <option value="">— Sem empresa —</option>
              {companies.filter(c => c.active).map(co => {
                const cfg = COMPANY_TYPE_CONFIG[co.type] || {}
                return <option key={co.id} value={co.id}>{cfg.icon} {co.name} ({co.bu || co.type})</option>
              })}
            </select>
            {derivedBU && (
              <p className="text-[10px] text-gray-400 mt-1 ml-1">BU derivada: <strong>{derivedBU}</strong></p>
            )}
          </div>

          {/* Sales Owner (só para roles comerciais) */}
          {['manager','member','distributor'].includes(role) && (
            <div>
              <label className="label">Sales Owner (Sales Target)</label>
              <select className="select text-sm" value={ownerId}
                onChange={e => setOwner(e.target.value)}>
                <option value="">— Sem ligação —</option>
                {salesOwners.filter(o => o.active).map(o => (
                  <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
                ))}
              </select>
            </div>
          )}

          {/* Activo */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">Conta activa</label>
            <button onClick={() => setActive(o => !o)}
              className={`w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-green-400' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`}/>
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={save} disabled={saving || isSelf}
              className="btn-primary flex-1 text-xs">
              {saving ? 'A guardar…' : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
          {isSelf && <p className="text-[10px] text-amber-600 text-center">Não podes editar o teu próprio role.</p>}
        </div>
      ) : (
        <div className="px-4 pb-3">
          <button onClick={() => setEditing(true)}
            className="w-full text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
            <Edit3 size={11}/> Editar permissões
          </button>
        </div>
      )}
    </div>
  )
}

// ── Componente: Invite user ───────────────────────────────────────────────────
function InviteSection({ companies, salesOwners, onSaved }) {
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState('member')
  const [companyId, setCompany] = useState('')
  const [ownerId, setOwner]     = useState('')
  const [displayName, setDisplayName] = useState('')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState(null)

  async function handleInvite() {
    if (!email.trim()) return
    setSending(true); setResult(null)

    const company = companies.find(co => co.id === companyId)
    const bu = role === 'admin' ? 'ALL'
             : company?.type === 'internal_vgt' ? 'VGT'
             : company?.type === 'internal_ect' ? 'ECT'
             : company?.bu || null
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
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            role,
            company_id:       companyId   || null,
            sales_owner_id:   ownerId     || null,
            sales_owner_name: ownerName,
            bu,
            display_name:     displayName || null,
          }),
        }
      )
      const json = await res.json()
      setSending(false)
      if (json.success) {
        setResult({ type: 'success', msg: json.message })
        setEmail(''); setRole('member'); setCompany(''); setOwner(''); setDisplayName('')
        onSaved()
      } else {
        setResult({ type: 'error', msg: json.error || 'Erro desconhecido' })
      }
    } catch (err) {
      setSending(false)
      setResult({ type: 'error', msg: err.message })
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <Mail size={14} className="text-navy"/>
        <h3 className="text-sm font-bold text-gray-700">Adicionar utilizador</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome (opcional)</label>
            <input className="input" placeholder="Nome completo"
              value={displayName} onChange={e => setDisplayName(e.target.value)}/>
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" placeholder="user@empresa.com"
              value={email} onChange={e => setEmail(e.target.value)}/>
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="select" value={role} onChange={e => setRole(e.target.value)}>
              {Object.entries(ROLE_CONFIG).map(([r,cfg]) => (
                <option key={r} value={r}>{cfg.label} — {cfg.desc.substring(0,40)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Empresa</label>
            <select className="select" value={companyId} onChange={e => setCompany(e.target.value)}>
              <option value="">— Sem empresa —</option>
              {companies.filter(c => c.active).map(co => {
                const cfg = COMPANY_TYPE_CONFIG[co.type] || {}
                return <option key={co.id} value={co.id}>{cfg.icon} {co.name}</option>
              })}
            </select>
          </div>
          {['manager','member','distributor'].includes(role) && (
            <div className="sm:col-span-2">
              <label className="label">Sales Owner (opcional)</label>
              <select className="select" value={ownerId} onChange={e => setOwner(e.target.value)}>
                <option value="">— Sem ligação —</option>
                {salesOwners.filter(o => o.active).map(o => (
                  <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {result && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            result.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {result.type === 'error'
              ? <AlertCircle size={14} className="shrink-0 mt-0.5"/>
              : <CheckCircle2 size={14} className="shrink-0 mt-0.5"/>
            }
            {result.msg}
          </div>
        )}

        <button onClick={handleInvite} disabled={!email.trim() || sending}
          className="btn-primary w-full text-sm">
          {sending ? <RefreshCw size={14} className="animate-spin"/> : <Mail size={14}/>}
          {sending ? 'A processar…' : 'Criar perfil'}
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          O utilizador recebe um email com um link para definir a password e aceder à app.
        </p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Permissions() {
  const { isAdmin, profile: currentProfile, user } = useAuth()
  const [companies, setCompanies]   = useState([])
  const [profiles, setProfiles]     = useState([])
  const [salesOwners, setSalesOwners] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('users')
  const [search, setSearch]         = useState('')

  async function load() {
    const [compRes, profRes, ownRes] = await Promise.all([
      supabase.from('companies').select('*').order('type').order('name'),
      supabase.from('profiles').select('*').order('role').order('email'),
      supabase.from('sales_owners').select('*').eq('active', true).order('bu').order('name'),
    ])
    setCompanies(compRes.data || [])
    setProfiles(profRes.data || [])
    setSalesOwners(ownRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!isAdmin) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <Lock size={32} className="mx-auto mb-2 opacity-30"/>
        <p>Acesso restrito — apenas admin.</p>
      </div>
    </div>
  )

  if (loading) return <Spinner/>

  const filteredProfiles = profiles.filter(p =>
    !search ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const TABS = [
    { id:'users',    label:'Utilizadores', count: profiles.length },
    { id:'companies',label:'Empresas',     count: companies.length },
    { id:'matrix',   label:'Access Matrix' },
    { id:'invite',   label:'+ Adicionar'  },
  ]

  return (
    <div className="p-4 space-y-5 max-w-4xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-navy"/>
          Permissions
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Gestão de utilizadores, empresas e controlo de acesso.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.count !== undefined && (
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Utilizadores */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="relative">
            <input className="input pl-8" placeholder="Pesquisar por email ou nome…"
              value={search} onChange={e => setSearch(e.target.value)}/>
            <Users size={14} className="absolute left-2.5 top-3 text-gray-400"/>
          </div>
          <div className="space-y-3">
            {filteredProfiles.map(p => (
              <UserPermCard key={p.id} profile={p}
                companies={companies} salesOwners={salesOwners}
                onSaved={load} currentUserId={user?.id}/>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Empresas */}
      {tab === 'companies' && (
        <CompaniesSection companies={companies} onRefresh={load}/>
      )}

      {/* Tab: Access Matrix */}
      {tab === 'matrix' && <PermissionsMatrix/>}

      {/* Tab: Invite */}
      {tab === 'invite' && (
        <InviteSection companies={companies} salesOwners={salesOwners} onSaved={load}/>
      )}
    </div>
  )
}
