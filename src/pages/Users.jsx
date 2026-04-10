import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'
import { UserPlus, Mail, Shield, Eye, Edit3, Building2, Info, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const ROLES = [
  { value:'admin',       label:'Admin',         desc:'Full access — all BUs, edit everything',                           color:'#B45309', bg:'#FEF3C7', bu:'both', canEdit:true,  editOwn:false },
  { value:'vgt_editor',  label:'VGT Editor',    desc:'VGT — edit all deals of the team + own Sales Target',             color:'#0F6E56', bg:'#E1F5EE', bu:'VGT',  canEdit:true,  editOwn:false },
  { value:'ect_editor',  label:'ECT Editor',    desc:'ECT — edit all deals of the team + own Sales Target',             color:'#993C1D', bg:'#FAECE7', bu:'ECT',  canEdit:true,  editOwn:false },
  { value:'vgt_member',  label:'VGT Member',    desc:'VGT — sees all team deals, edits only own deals + own target',    color:'#1D9E75', bg:'#E1F5EE', bu:'VGT',  canEdit:true,  editOwn:true  },
  { value:'ect_member',  label:'ECT Member',    desc:'ECT — sees all team deals, edits only own deals + own target',    color:'#D85A30', bg:'#FAECE7', bu:'ECT',  canEdit:true,  editOwn:true  },
  { value:'distributor', label:'Distributor',   desc:'External partner — sees only own deals, submits discount requests', color:'#7C3AED', bg:'#F5F3FF', bu:'VGT',  canEdit:true,  editOwn:true  },
  { value:'viewer_vgt',  label:'Viewer VGT',    desc:'Read-only — VGT deals only, no edit',                             color:'#1D9E75', bg:'#F0FDF9', bu:'VGT',  canEdit:false, editOwn:false },
  { value:'viewer_ect',  label:'Viewer ECT',    desc:'Read-only — ECT deals only, no edit',                             color:'#D85A30', bg:'#FFF5F2', bu:'ECT',  canEdit:false, editOwn:false },
  { value:'viewer_all',  label:'Viewer All',    desc:'Read-only — all deals both BUs, no edit',                         color:'#185FA5', bg:'#E6F1FB', bu:'both', canEdit:false, editOwn:false },
]

// Permissions matrix for each role
const PERMISSIONS = {
  admin:       { deals:'VGT + ECT',  dealEdit:'All deals',  targets:'All teams', targetEdit:'All',      budget:true,  users:true  },
  vgt_editor:  { deals:'VGT only',   dealEdit:'All VGT',    targets:'VGT team',  targetEdit:'All VGT',  budget:false, users:false },
  ect_editor:  { deals:'ECT only',   dealEdit:'All ECT',    targets:'ECT team',  targetEdit:'All ECT',  budget:false, users:false },
  vgt_member:  { deals:'VGT only',   dealEdit:'Own only',   targets:'VGT team',  targetEdit:'Own only', budget:false, users:false },
  ect_member:  { deals:'ECT only',   dealEdit:'Own only',   targets:'ECT team',  targetEdit:'Own only', budget:false, users:false },
  distributor: { deals:'Own deals',  dealEdit:'Own + discounts', targets:'None', targetEdit:'None',     budget:false, users:false },
  viewer_vgt:  { deals:'VGT only',   dealEdit:'None',       targets:'VGT team',  targetEdit:'None',     budget:false, users:false },
  viewer_ect:  { deals:'ECT only',   dealEdit:'None',       targets:'ECT team',  targetEdit:'None',     budget:false, users:false },
  viewer_all:  { deals:'VGT + ECT',  dealEdit:'None',       targets:'All teams', targetEdit:'None',     budget:false, users:false },
}

function PermissionsLegend() {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const cols = [t('users_deals'),t('users_edit_deals'),t('users_sales_t'),t('users_edit_t'),'Budget',t('users_manage')]
  const keys = ['deals','dealEdit','targets','targetEdit','budget','users']

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Info size={15} className="text-blue-500"/>
          Permissions reference
        </span>
        {open ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
      </button>

      {open && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 font-semibold text-gray-500 w-28">{t('users_role')}</th>
                {cols.map(c => (
                  <th key={c} className="px-3 py-2 font-semibold text-gray-500 text-center whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r, i) => {
                const p = PERMISSIONS[r.value]
                return (
                  <tr key={r.value} className={i%2===0?'bg-white':'bg-gray-50/50'}>
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-[11px]" style={{ color:r.color }}>{r.label}</span>
                    </td>
                    {keys.map(k => (
                      <td key={k} className="px-3 py-2.5 text-center">
                        {typeof p[k] === 'boolean'
                          ? p[k]
                            ? <Check size={12} className="text-green-500 mx-auto"/>
                            : <X size={12} className="text-red-400 mx-auto"/>
                          : <span className={`text-[11px] ${
                              p[k]==='None' ? 'text-red-400' :
                              p[k]==='Own only' ? 'text-amber-600' :
                              'text-gray-600'
                            }`}>{p[k]}</span>
                        }
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RoleBadge({ role }) {
  const cfg = ROLES.find(r => r.value === role) || { label: role, color:'#6B7280', bg:'#F3F4F6' }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.canEdit ? <Edit3 size={9}/> : <Eye size={9}/>}
      {cfg.label}
    </span>
  )
}

function Avatar({ name, color }) {
  const initials = (name || '?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
      style={{ background: color || '#0D2137' }}>
      {initials}
    </div>
  )
}

function UserCard({ profile, onRoleChange, onOwnerChange, currentUserId, isAdmin }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [selectedRole, setSelectedRole] = useState(profile.role || 'viewer_all')
  const [ownerName, setOwnerName] = useState(profile.sales_owner_name || '')
  const [saving, setSaving] = useState(false)

  const roleCfg = ROLES.find(r => r.value === profile.role) || ROLES[5]
  const isSelf  = profile.id === currentUserId
  const needsOwner = ['vgt_editor','ect_editor','vgt_member','ect_member','viewer_vgt','viewer_ect','distributor'].includes(selectedRole)

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      role: selectedRole,
      sales_owner_name: needsOwner ? ownerName : null
    }).eq('id', profile.id)
    setEditing(false)
    setSaving(false)
    onRoleChange()
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isSelf ? 'border-amber-300 border-2' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <Avatar name={profile.full_name || profile.email} color={roleCfg.color}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {profile.full_name || profile.email?.split('@')[0]}
                {isSelf && <span className="ml-1 text-[10px] text-amber-600 font-medium">{t('users_you')}</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">{profile.email}</p>
              {profile.sales_owner_name && (
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <Building2 size={9}/> Linked to: {profile.sales_owner_name}
                </p>
              )}
            </div>
            <RoleBadge role={profile.role}/>
          </div>

          {/* Permissions summary */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              {roleCfg.canEdit ? <Edit3 size={9} className="text-green-600"/> : <Eye size={9} className="text-blue-500"/>}
              {roleCfg.editOwn ? 'Edit own deals' : roleCfg.canEdit ? 'Edit all deals' : 'Read only'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <Building2 size={9}/>
              {roleCfg.bu === 'both' ? 'VGT + ECT' : roleCfg.bu}
            </span>
          </div>
        </div>
      </div>

      {/* Edit panel */}
      {editing ? (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
          <div className="grid gap-2">
            {ROLES.map(r => {
              const p = PERMISSIONS[r.value]
              const isSelected = selectedRole === r.value
              return (
                <label key={r.value}
                  className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${
                    isSelected ? 'border-2' : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={isSelected ? { borderColor: r.color, background: r.bg } : {}}>
                  <input type="radio" name={`role-${profile.id}`} value={r.value}
                    checked={isSelected}
                    onChange={() => setSelectedRole(r.value)}
                    className="mt-0.5 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: r.color }}>{r.label}</p>
                    <p className="text-[10px] text-gray-500 mb-1.5">{r.desc}</p>
                    {isSelected && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 p-2 bg-white/60 rounded-lg">
                        <span className="text-[10px] text-gray-400">{t('users_sees')}<strong className="text-gray-600">{p.deals}</strong></span>
                        <span className="text-[10px] text-gray-400">{t('users_edits')}<strong className={p.dealEdit==='None'?'text-red-500':p.dealEdit==='Own only'?'text-amber-600':'text-gray-600'}>{p.dealEdit}</strong></span>
                        <span className="text-[10px] text-gray-400">{t('users_targets')}<strong className="text-gray-600">{p.targets}</strong></span>
                        <span className="text-[10px] text-gray-400">{t('users_budget')}<strong className={p.budget?'text-green-600':'text-red-500'}>{p.budget?'Yes':'No'}</strong></span>
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          {needsOwner && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {selectedRole === 'distributor' ? 'Distributor name (must match deal distributor field)' : 'Link to Sales Target (name must match exactly)'}
              </label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
                value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder={selectedRole === 'distributor' ? 'e.g. Fujifilm Mexico' : 'e.g. Paulo Cunha'}/>
              <p className="text-[10px] text-gray-400 mt-1">
                {selectedRole === 'distributor'
                  ? 'Distributor only sees deals where distributor field matches this name'
                  : 'This user will only see their own Sales Target card'}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)}
              className="flex-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-2 rounded-lg">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 text-xs bg-navy text-white py-2 rounded-lg font-medium hover:bg-navy-light">
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>
      ) : (
        isAdmin && !isSelf && (
          <div className="px-4 pb-3">
            <button onClick={() => setEditing(true)}
              className="w-full text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
              <Shield size={11}/> Edit permissions
            </button>
          </div>
        )
      )}
    </div>
  )
}

export default function Users() {
  const { isAdmin, user: currentUser } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('viewer_all')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [filterBU, setFilterBU] = useState('all')

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
    setLoading(false)
  }
  useEffect(() => { loadProfiles() }, [])

  if (!isAdmin) return <div className="p-8 text-center text-gray-400">{t('users_admin')}</div>

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail) return
    setInviting(true); setInviteMsg('')
    await supabase.from('pending_invites').insert({
      email: inviteEmail, role: inviteRole, invited_by: currentUser.id
    })
    setInviteMsg(`Invite sent to ${inviteEmail}`)
    setInviteEmail(''); await loadProfiles()
    setInviting(false)
  }

  const filtered = profiles.filter(p => {
    if (filterBU === 'all') return true
    const cfg = ROLES.find(r => r.value === p.role)
    return cfg?.bu === filterBU || cfg?.bu === 'both'
  })

  const stats = {
    total:   profiles.length,
    editors: profiles.filter(p => p.role?.includes('editor') || p.role==='admin').length,
    viewers: profiles.filter(p => p.role?.includes('viewer')).length,
  }

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">{t('users_title')}</h1>
        <p className="text-sm text-gray-400">
          {stats.total} users · {stats.editors} with edit access · {stats.viewers} read-only
        </p>
      </div>

      {/* Permissions Legend */}
      <PermissionsLegend/>

      {/* Invite */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UserPlus size={15}/> Invite new user
        </p>
        <form onSubmit={handleInvite} className="flex flex-col gap-2">
          <input type="email" required placeholder="user@fujifilm.com" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-navy/20"/>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm sm:w-40 focus:outline-none"
            value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button type="submit" disabled={inviting}
            className="bg-navy text-white text-sm px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-navy-light">
            <Mail size={13}/>{inviting ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteMsg && <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">{inviteMsg}</p>}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all','VGT','ECT'].map(bu => (
          <button key={bu} onClick={() => setFilterBU(bu)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterBU === bu
                ? bu==='VGT' ? 'bg-vgt text-white'
                : bu==='ECT' ? 'bg-ect text-white'
                : 'bg-navy text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {bu === 'all' ? 'All users' : bu}
          </button>
        ))}
      </div>

      {/* User cards */}
      {loading ? <Spinner/> : (
        <div className="grid gap-3">
          {filtered.map(p => (
            <UserCard key={p.id} profile={p}
              onRoleChange={loadProfiles}
              onOwnerChange={loadProfiles}
              currentUserId={currentUser?.id}
              isAdmin={isAdmin}/>
          ))}
        </div>
      )}
    </div>
  )
}
