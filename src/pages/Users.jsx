import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'
import { UserPlus, Mail, Trash2 } from 'lucide-react'

const ROLES = ['admin','vgt','ect','viewer']
const ROLE_LABELS = { admin:'Admin (all access)', vgt:'VGT · Portugal', ect:'ECT · Spain', viewer:'Viewer (read-only)' }
const ROLE_COLORS = { admin:'bg-amber-100 text-amber-800', vgt:'bg-vgt/10 text-vgt-dark', ect:'bg-ect/10 text-ect-dark', viewer:'bg-gray-100 text-gray-600' }

export default function Users() {
  const { isAdmin, user: currentUser } = useAuth()
  const [profiles, setProfiles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('viewer')
  const [inviting, setInviting]   = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

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

    // Create profile placeholder — Supabase sends magic link on first login
    const { error } = await supabase.from('pending_invites').insert({
      email: inviteEmail, role: inviteRole, invited_by: currentUser.id
    })

    // Also trigger magic link
    await supabase.auth.admin?.inviteUserByEmail?.(inviteEmail).catch(() => {})

    if (!error) {
      setInviteMsg(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      loadProfiles()
    }
    setInviting(false)
  }

  async function updateRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    loadProfiles()
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-400">{profiles.length} active users</p>
      </div>

      {/* Invite form */}
      <div className="card p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UserPlus size={16}/> Invite user
        </p>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
          <input type="email" required placeholder="user@fujifilm.com" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)} className="input flex-1"/>
          <select className="select sm:w-44" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button type="submit" disabled={inviting} className="btn-primary whitespace-nowrap">
            <Mail size={14}/>{inviting ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteMsg && <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">{inviteMsg}</p>}
        <p className="text-xs text-gray-400">User receives a magic link by email. No password required.</p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map(r => (
          <div key={r} className="card p-3">
            <span className={`text-xs px-2 py-0.5 rounded font-bold ${ROLE_COLORS[r]}`}>{r.toUpperCase()}</span>
            <p className="text-xs text-gray-500 mt-1">{ROLE_LABELS[r]}</p>
          </div>
        ))}
      </div>

      {/* User list */}
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {profiles.map(p => (
            <div key={p.id} className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(p.full_name || p.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{p.full_name || p.email}</p>
                {p.full_name && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
              </div>
              <select
                className="select text-xs w-32"
                value={p.role || 'viewer'}
                onChange={e => updateRole(p.id, e.target.value)}
                disabled={p.id === currentUser?.id}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
