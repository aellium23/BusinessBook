import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { safeJsonParse } from '../constants'

const AuthContext = createContext(null)

// ── Permissões por role ───────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','audit','history','quotas','budget','users','settings','tasks','tenders','permissions','sla','products'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    'ALL',
    seeAll:   true,
    manageUsers: true,
  },
  manager: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','tasks','tenders','sla','products'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  member: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','tasks','tenders','sla'],
    canEdit:  true,
    canDelete: false,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  distributor: {
    pages:    ['dashboard','deals','tasks','tenders','clients','contacts','history','quotas'],
    canEdit:  true,
    canDelete: false,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  viewer: {
    pages:    ['dashboard','deals','clients','contacts','history'],
    canEdit:  false,
    canDelete: false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  partner: {
    pages:    ['dashboard','deals','clients','contacts','tasks','tenders'],
    canEdit:  false,
    canDelete: false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
}

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null)
  const [profile, setProfile]       = useState(null)
  const [company, setCompany]       = useState(null)
  const [permSet, setPermSet]       = useState(null)
  const [loading, setLoading]       = useState(true)

  async function loadProfile(userId, userEmail) {
    const { data } = await supabase
      .from('profiles')
      .select('*, company:company_id(*), permission_set:permission_set_id(*)')
      .eq('id', userId)
      .single()

    if (data) {
      // Verificar se a conta está activa
      if (data.active === false) {
        await supabase.auth.signOut()
        setProfile(null); setCompany(null); setPermSet(null)
        return
      }
      const { company: co, permission_set: ps, ...prof } = data
      setProfile(prof)
      setCompany(co || null)
      setPermSet(ps || null)
    } else {
      // Novo user — criar profile básico
      const { data: upserted } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: userEmail,
          role: 'viewer',
          active: true
        }, { onConflict: 'id' })
        .select()
        .single()
      setProfile(upserted || { id: userId, email: userEmail, role: 'viewer' })
      setCompany(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id, session.user.email)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id, session.user.email)
      else { setProfile(null); setCompany(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (profile !== null) setLoading(false)
  }, [profile])

  const role   = profile?.role || 'viewer'
  const bu     = profile?.bu || company?.bu || null

  // Usar permSet dinâmico se disponível, senão fallback para ROLE_PERMISSIONS estático
  const resolvedPages = permSet?.pages
    ? (Array.isArray(permSet.pages) ? permSet.pages : (safeJsonParse(permSet.pages, []) ?? []))
    : (ROLE_PERMISSIONS[role]?.pages || ROLE_PERMISSIONS.viewer.pages)

  const perms = {
    pages:    resolvedPages,
    canEdit:  permSet ? permSet.can_edit  : (ROLE_PERMISSIONS[role]?.canEdit  ?? false),
    editOwn:  permSet ? permSet.edit_own  : (ROLE_PERMISSIONS[role]?.editOwn  ?? true),
    canDelete:permSet ? permSet.can_delete: (ROLE_PERMISSIONS[role]?.canDelete ?? false),
    seeAll:   permSet ? permSet.see_all_bu: (ROLE_PERMISSIONS[role]?.seeAll   ?? false),
  }

  // Flags de conveniência (retrocompatíveis)
  const isAdmin    = role === 'admin' || (permSet?.see_all_bu === true && permSet?.can_delete === true)
  const isVGT      = isAdmin || bu === 'VGT'
  const isECT      = isAdmin || bu === 'ECT'
  const canSeeAll  = isAdmin || perms.seeAll
  const canEdit    = perms.canEdit
  const editOwnOnly = perms.editOwn

  // Verificar se o user pode aceder a uma página
  function canAccessPage(page) {
    if (role === 'admin') return true
    return resolvedPages.includes(page)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, company, permSet, loading,
      role, bu, perms,
      isAdmin, isVGT, isECT,
      canSeeAll, canEdit, editOwnOnly,
      canAccessPage,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
