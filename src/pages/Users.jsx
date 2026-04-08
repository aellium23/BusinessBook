import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'
import { UserPlus, Mail, Shield, Eye, Edit3, Building2 } from 'lucide-react'

const ROLES = [
  { value:'admin',       label:'Admin',         desc:'Full access — all BUs, edit everything', color:'#B45309', bg:'#FEF3C7', bu:'both', canEdit:true  },
  { value:'vgt_editor',  label:'VGT Editor',    desc:'VGT deals only — add/edit/delete + own target', color:'#0F6E56', bg:'#E1F5EE', bu:'VGT',  canEdit:true  },
  { value:'ect_editor',  label:'ECT Editor',    desc:'ECT deals only — add/edit/delete + own target', color:'#993C1D', bg:'#FAECE7', bu:'ECT',  canEdit:true  },
  { value:'viewer_vgt',  label:'Viewer VGT',    desc:'Read-only — VGT deals only',            color:'#1D9E75', bg:'#E1F5EE', bu:'VGT',  canEdit:false },
  { value:'viewer_ect',  label:'Viewer ECT',    desc:'Read-only — ECT deals only',            color:'#D85A30', bg:'#FAECE7', bu:'ECT',  canEdit:false },
  { value:'viewer_all',  label:'Viewer All',    desc:'Read-only — all deals, both BUs',       color:'#185FA5', bg:'#E6F1FB', bu:'both', canEdit:false },
]

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
  const [editing, setEditing] = useState(false)
  const [selectedRole, setSelectedRole] = useState(profile.role || 'viewer_all')
  const [ownerName, setOwnerName] = useState(profile.sales_owner_name || '')
  const [saving, setSaving] = useState(false)

  const roleCfg = ROLES.find(r => r.value === profile.role) || ROLES[5]
  const isSelf  = profile.id === currentUserId
  const needsOwner = ['vgt_editor','ect_editor','viewer_vgt','viewer_ect'].includes(selectedRole)

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
                {isSelf && <span className="ml-1 text-[10px] text-amber-600 font-medium">(you)</span>}
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
              {roleCfg.canEdit ? 'Can edit' : 'Read only'}
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
            {ROLES.map(r => (
              <label key={r.value}
                className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${
                  selectedRole === r.value ? 'border-2' : 'border-gray-100 hover:border-gray-200'
                }`}
                style={selectedRole === r.value ? { borderColor: r.color, background: r.bg } : {}}>
                <input type="radio" name={`role-${profile.id}`} value={r.value}
                  checked={selectedRole === r.value}
                  onChange={() => setSelectedRole(r.value)}
                  className="mt-0.5 shrink-0"/>
                <div>
                  <p className="text-xs font-bold" style={{ color: r.color }}>{r.label}</p>
                  <p className="text-[10px] text-gray-500">{r.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {needsOwner && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Link to Sales Target (name must match exactly)
              </label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
                value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="e.g. Paulo Cunha"/>
              <p className="text-[10px] text-gray-400 mt-1">
                This user will only see their own Sales Target card
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

  if (!isAdmin) return <div className="p-8 text-center text-gray-400">Admin access required.</div>

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
        <h1 className="text-xl font-bold text-gray-900">Users & Permissions</h1>
        <p className="text-sm text-gray-400">
          {stats.total} users · {stats.editors} with edit access · {stats.viewers} read-only
        </p>
      </div>

      {/* Invite */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UserPlus size={15}/> Invite new user
        </p>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
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
        <div className="grid sm:grid-cols-2 gap-3">
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
