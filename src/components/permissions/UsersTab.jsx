import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, anonClient } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'
import { safeJsonParse } from '../../constants'
import {
  Shield, Plus, Edit3, Check, X,
  Mail, RefreshCw, AlertCircle, CheckCircle2, Search
} from 'lucide-react'

// ── Configuração das páginas disponíveis ──────────────────────────────────────
const ALL_PAGES = [
  { id:'dashboard',   label:'Dashboard',    group:'core' },
  { id:'deals',       label:'Deals',        group:'core' },
  { id:'clients',     label:'Clients',      group:'core' },
  { id:'tasks',       label:'Tasks',        group:'core' },
  { id:'tenders',     label:'Tenders',      group:'core' },
  { id:'history',     label:'History',      group:'reports' },
  { id:'quotas',      label:'Sales Targets',group:'reports' },
  { id:'budget',      label:'Budget',       group:'admin' },
  { id:'users',       label:'Users',        group:'admin' },
  { id:'settings',    label:'Settings',     group:'admin' },
  { id:'permissions', label:'Permissions',  group:'admin' },
]

const PAGE_GROUPS = {
  core:    { label:'Core',    color:'#1D9E75' },
  reports: { label:'Reports', color:'#185FA5' },
  admin:   { label:'Admin',   color:'#B45309' },
}

const COMPANY_TYPES = {
  internal_vgt: { label:'VGT (Portugal)', icon:'🇵🇹' },
  internal_ect: { label:'ECT (Spain)',    icon:'🇪🇸' },
  distributor:  { label:'Distribuidor',   icon:'🤝' },
  partner:      { label:'Parceiro',       icon:'🏢' },
  client:       { label:'Cliente',        icon:'🏥' },
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function PSBadge({ ps }) {
  if (!ps) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: ps.color || '#6B7280', background: (ps.color || '#6B7280') + '20' }}>
      <Shield size={9}/>{ps.name}
    </span>
  )
}

// ── User Card com atribuição de Permission Set ────────────────────────────────
function UserCard({ profile, permSets, companies, salesOwners, onSaved, isSelf }) {
  const { t } = useTranslation()
  const [open, setOpen]     = useState(false)
  const [psId, setPsId]     = useState(profile.permission_set_id || '')
  const [active, setActive] = useState(profile.active !== false)
  const [ownerId, setOwner] = useState(profile.sales_owner_id || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [pwdMsg, setPwdMsg] = useState(null)

  async function handleSetPwd() {
    const newPwd = prompt(`New password for ${profile.email} (min 6 chars):`)
    if (!newPwd) return
    if (newPwd.length < 6) { alert('Password must be at least 6 characters'); return }
    setPwdMsg('Setting...')
    try {
      // Login as the user with a temporary session, then update password
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } } }
      )
      // Use admin endpoint via edge function if available, otherwise try direct
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/admin/users/${profile.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ password: newPwd }),
        }
      )
      if (res.ok) {
        setPwdMsg('Password set successfully!')
      } else {
        // Fallback: send reset email
        await anonClient.auth.resetPasswordForEmail(profile.email, {
          redirectTo: `${window.location.origin}/auth/set-password`,
        })
        setPwdMsg('Could not set directly. Reset email sent instead.')
      }
    } catch (e) { setPwdMsg(`Error: ${e.message}`) }
    setTimeout(() => setPwdMsg(null), 5000)
  }

  const company = companies.find(c => c.id === profile.company_id)
  const ps = permSets.find(p => p.id === (profile.permission_set_id || psId))

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      permission_set_id: psId || null,
      sales_owner_id:    ownerId || null,
      sales_owner_name:  salesOwners.find(o => o.id === ownerId)?.name || null,
      active,
    }).eq('id', profile.id)
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1500)
    onSaved()
  }

  const pages = ps?.pages
    ? (Array.isArray(ps.pages) ? ps.pages : (safeJsonParse(ps.pages, []) ?? []))
    : []

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      isSelf ? 'border-amber-300 border-2' : 'border-gray-200'
    } ${!active ? 'opacity-60' : ''}`}>
      <div className="p-3 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: (ps?.color || '#6B7280') + '20',
            color: ps?.color || '#6B7280'
          }}>
          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {profile.full_name || profile.email?.split('@')[0]}
              {isSelf && <span className="ml-1 text-[10px] text-amber-600">(you)</span>}
            </p>
            {ps && <PSBadge ps={ps}/>}
            {!active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{t('perm_inactive')}</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{profile.email}</p>
          {company && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {COMPANY_TYPES[company.type]?.icon} {company.name}
              {profile.bu && <span className="ml-1.5 font-medium">{profile.bu}</span>}
            </p>
          )}
          {/* Mini page list */}
          <div className="flex flex-wrap gap-1 mt-1">
            {ALL_PAGES.map(page => {
              const has = pages.includes(page.id)
              const grp = PAGE_GROUPS[page.group]
              return (
                <span key={page.id}
                  className="text-[9px] px-1 py-0.5 rounded"
                  style={has
                    ? { background: grp.color + '20', color: grp.color }
                    : { color: '#D1D5DB' }
                  }>
                  {page.label}
                </span>
              )
            })}
          </div>
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="shrink-0 text-gray-300 hover:text-navy p-1 transition-colors">
          {open ? <X size={14}/> : <Edit3 size={14}/>}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50">

          {/* Permission Set */}
          <div>
            <label className="label">{t('perm_set_label')}</label>
            <div className="space-y-1.5">
              {permSets.map(p => {
                const active = psId === p.id
                return (
                  <button key={p.id} onClick={() => setPsId(p.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                      active ? 'border-2' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    style={active ? { borderColor: p.color, background: p.color + '08' } : {}}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: p.color + '20' }}>
                      <Shield size={12} style={{ color: p.color }}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                      {p.description && <p className="text-[10px] text-gray-400 truncate">{p.description}</p>}
                    </div>
                    {active && <Check size={12} style={{ color: p.color }} className="shrink-0"/>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sales Owner */}
          <div>
            <label className="label">{t('perm_sales_owner')}</label>
            <select className="select text-sm" value={ownerId}
              onChange={e => setOwner(e.target.value)}>
              <option value="">— Sem ligação —</option>
              {salesOwners.filter(o => o.active).map(o => (
                <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
              ))}
            </select>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">{t('perm_account_active')}</label>
            <button onClick={() => setActive(o => !o)} disabled={isSelf}
              className={`w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-green-400' : 'bg-gray-200'} disabled:opacity-40`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`}/>
            </button>
          </div>

          {/* Business Unit (direct) */}
          <div>
            <label className="label">Business Unit</label>
            <select className="select text-sm" value={profile.bu || ''}
              onChange={async (e) => {
                await supabase.from('profiles').update({ bu: e.target.value || null }).eq('id', profile.id)
                onSaved()
              }}>
              <option value="">— None —</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>

          {/* Company */}
          <div>
            <label className="label">Company</label>
            <select className="select text-sm" value={profile.company_id || ''}
              onChange={async (e) => {
                await supabase.from('profiles').update({ company_id: e.target.value || null }).eq('id', profile.id)
                onSaved()
              }}>
              <option value="">— No company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Reset Password */}
          <div>
            <button onClick={handleSetPwd} disabled={isSelf}
              className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-40">
              Set / Reset Password
            </button>
            {pwdMsg && <p className="text-[10px] text-green-600 mt-0.5">{pwdMsg}</p>}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={save} disabled={saving || isSelf}
              className="btn-primary flex-1 text-xs">
              {saving ? <RefreshCw size={12} className="animate-spin mx-auto"/> : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
          {isSelf && <p className="text-[10px] text-amber-600 text-center">Não podes editar o teu próprio perfil.</p>}
        </div>
      )}
    </div>
  )
}

// ── Convidar utilizador ───────────────────────────────────────────────────────
function InviteSection({ companies, salesOwners, permSets, onSaved }) {
  const { t } = useTranslation()
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [psId, setPsId]       = useState('')
  const [companyId, setComp]  = useState('')
  const [buSel, setBuSel]     = useState('')  // direct BU override (VGT/ECT)
  const [ownerId, setOwner]   = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null)

  async function handleInvite() {
    if (!email.trim()) return
    setSending(true); setResult(null)
    const ps = permSets.find(p => p.id === psId)
    const co = companies.find(c => c.id === companyId)
    // Direct BU selection takes precedence; otherwise derive from company
    const bu = buSel || (co?.type === 'internal_vgt' ? 'VGT' : co?.type === 'internal_ect' ? 'ECT' : co?.bu || null)
    // Derivar o role do permission_set para retrocompatibilidade
    const roleMap = {
      'Admin':'admin','Manager':'manager','Member':'member',
      'Distributor':'distributor','Viewer':'viewer','Partner':'partner'
    }
    const role = roleMap[ps?.name] || 'viewer'

    try {
      const trimmedEmail = email.toLowerCase().trim()

      // Step 1: Create auth user via signUp with a random temporary password.
      // IMPORTANT: We use anonClient (a separate Supabase client with NO persisted
      // session) so the admin's active session does not interfere with the signUp
      // call.  Using the main `supabase` client here caused "failed to fetch" errors
      // because signUp tried to create a new session that conflicted with the
      // existing admin session.
      const tempPassword = crypto.randomUUID() + '-Aa1!'
      let signUpData, signUpError
      try {
        const result = await anonClient.auth.signUp({
          email: trimmedEmail,
          password: tempPassword,
          options: {
            data: { full_name: name || trimmedEmail.split('@')[0] },
            // emailRedirectTo tells Supabase where to send the user after they
            // click the confirmation link in the email.
            emailRedirectTo: `${window.location.origin}/auth/set-password`,
          },
        })
        signUpData = result.data
        signUpError = result.error
      } catch (fetchErr) {
        throw new Error(
          'Não foi possível ligar ao Supabase Auth. Verifica: ' +
          'Authentication > Providers > Email deve estar activo. ' +
          'Erro: ' + (fetchErr?.message || 'network error')
        )
      }

      if (signUpError) {
        // Provide a friendlier message for rate-limit errors
        if (signUpError.message?.includes('rate') || signUpError.status === 429) {
          throw new Error(
            'Limite de emails atingido (2/hora no plano gratuito). ' +
            'Aguarda alguns minutos e tenta novamente.'
          )
        }
        throw signUpError
      }

      const newUserId = signUpData.user?.id
      if (!newUserId) throw new Error('Sign-up succeeded but no user ID returned.')

      // If the user already existed (fake signup), identities will be empty
      if (signUpData.user?.identities?.length === 0) {
        throw new Error('Este email já está registado no sistema.')
      }

      // Step 2: Create the profile with the correct role, BU, company, etc.
      // This uses the main `supabase` client which has the admin session (needed
      // for RLS-protected inserts).
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: newUserId,
        email: trimmedEmail,
        full_name: name || null,
        role,
        bu,
        company_id: companyId || null,
        permission_set_id: psId || null,
        sales_owner_id: ownerId || null,
        sales_owner_name: salesOwners.find(o => o.id === ownerId)?.name || null,
        active: true,
      }, { onConflict: 'id' })

      if (profileError) throw profileError

      // Step 3: Send password reset email so the user can set their own password.
      // We use anonClient here too — the reset endpoint doesn't need a session
      // and this avoids any session-related issues.
      // NOTE: signUp already sends a confirmation email (counts toward the 2/hr
      // limit), so this reset email is a SECOND email.  If rate-limited, we treat
      // it as non-fatal since the user can always use "Forgot password" later.
      const { error: resetError } = await anonClient.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      })

      if (resetError) {
        // Non-fatal: profile was created, user just won't get the reset email now.
        // They can use "Forgot password" on the login page later.

      }

      const resetNote = resetError
        ? ' (Email de reset não enviado — limite atingido. O utilizador pode usar "Esqueci password" no login.)'
        : ''

      setResult({
        ok: true,
        msg: `Utilizador ${trimmedEmail} criado com sucesso! Foi enviado um email de confirmação.${resetNote}`,
      })
      setEmail(''); setName(''); setPsId(''); setComp(''); setBuSel(''); setOwner('')
      onSaved()
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
        <Mail size={15} className="text-navy"/>Adicionar utilizador
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome (opcional)</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              style={{fontSize:'16px'}}/>
          </div>
          <div>
            <label className="label">{t('perm_email_req')}</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{fontSize:'16px'}}/>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Permission Set *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {permSets.map(p => (
                <button key={p.id} onClick={() => setPsId(p.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                    psId === p.id ? 'border-2' : 'border-gray-200 bg-white'
                  }`}
                  style={psId === p.id ? { borderColor: p.color, background: p.color + '10' } : {}}>
                  <div className="w-4 h-4 rounded shrink-0" style={{ background: p.color }}/>
                  <span className="font-medium text-gray-800 truncate">{p.name}</span>
                  {psId === p.id && <Check size={10} style={{ color: p.color }} className="ml-auto shrink-0"/>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Business Unit</label>
            <select className="select" value={buSel} onChange={e => setBuSel(e.target.value)}>
              <option value="">— Derive from company —</option>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-0.5">Set directly for internal sales (VGT/ECT). Distributors leave empty + pick company.</p>
          </div>
          <div>
            <label className="label">{t('perm_companies')}</label>
            <select className="select" value={companyId} onChange={e => setComp(e.target.value)}>
              <option value="">— Sem empresa —</option>
              {companies.filter(c=>c.active).map(co => (
                <option key={co.id} value={co.id}>
                  {COMPANY_TYPES[co.type]?.icon} {co.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sales Owner</label>
            <select className="select" value={ownerId} onChange={e => setOwner(e.target.value)}>
              <option value="">— Sem ligação —</option>
              {salesOwners.filter(o=>o.active).map(o => (
                <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
              ))}
            </select>
          </div>
        </div>

        {result && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
            {result.msg}
          </div>
        )}

        <button onClick={handleInvite} disabled={!email.trim() || sending}
          className="btn-primary w-full disabled:opacity-50">
          {sending ? <RefreshCw size={14} className="animate-spin mx-auto"/> : <><Mail size={14}/><span>Convidar utilizador</span></>}
        </button>
      </div>
    </div>
  )
}

// Collapsible wrapper around InviteSection used inside the Users tab.
function UsersInviteBlock({ companies, salesOwners, permSets, onSaved }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-card bg-white overflow-hidden">
      <button type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="w-8 h-8 rounded-full bg-navy/10 text-navy flex items-center justify-center">+</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{t('perm_invite_title')}</p>
          <p className="text-micro text-gray-400">{t('perm_invite_subtitle')}</p>
        </div>
        <span className="text-gray-300 text-sm">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          <InviteSection companies={companies} salesOwners={salesOwners} permSets={permSets} onSaved={onSaved}/>
        </div>
      )}
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
export default function UsersTab({ profiles, permSets, companies, salesOwners, user, onRefresh, buFilter, setBuFilter, search, setSearch }) {
  const { t } = useTranslation()

  const filteredProfiles = profiles.filter(p => {
    const matchBU = buFilter === 'all' || p.bu === buFilter
    const matchSearch = !search || p.email?.toLowerCase().includes(search.toLowerCase()) || p.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchBU && matchSearch
  })

  return (
    <div className="space-y-4">
      {/* Invite — was a separate tab before; now lives as a collapsible CTA at the top of Users */}
      <UsersInviteBlock
        companies={companies}
        salesOwners={salesOwners}
        permSets={permSets}
        onSaved={onRefresh}
      />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <input className="input pl-8 text-sm" placeholder={t('perm_search_ph')}
            value={search} onChange={e => setSearch(e.target.value)} style={{fontSize:'16px'}}/>
          <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all','VGT','ECT'].map(bu => (
            <button key={bu} onClick={() => setBuFilter(bu)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                buFilter === bu ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}>
              {bu === 'all' ? t('perm_all') : bu}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {filteredProfiles.map(p => (
          <UserCard key={p.id} profile={p}
            permSets={permSets} companies={companies} salesOwners={salesOwners}
            onSaved={onRefresh} isSelf={p.id === user?.id}/>
        ))}
      </div>
    </div>
  )
}
