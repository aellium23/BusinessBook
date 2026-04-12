import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// ── Permissões por role ───────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: {
    pages:    ['dashboard','deals','clients','history','quotas','budget','users','settings','tasks','tenders','permissions'],
    canEdit:  true,
    editOwn:  false,
    seeBU:    'ALL',
    seeAll:   true,
    manageUsers: true,
  },
  manager: {
    pages:    ['dashboard','deals','clients','history','quotas','tasks','tenders'],
    canEdit:  true,
    editOwn:  false,
    seeBU:    null,   // derivado do bu do profile
    seeAll:   false,
    manageUsers: false,
  },
  member: {
    pages:    ['dashboard','deals','clients','history','quotas','tasks','tenders'],
    canEdit:  true,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  distributor: {
    pages:    ['dashboard','deals','tasks'],
    canEdit:  true,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  viewer: {
    pages:    ['dashboard','deals','clients','history'],
    canEdit:  false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  partner: {
    pages:    ['dashboard','deals','clients','tasks','tenders'],
    canEdit:  false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId, userEmail) {
    const { data } = await supabase
      .from('profiles')
      .select('*, company:company_id(*)')
      .eq('id', userId)
      .single()

    if (data) {
      const { company: co, ...prof } = data
      setProfile(prof)
      setCompany(co || null)
    } else {
      const { data: upserted } = await supabase
        .from('profiles')
        .upsert({ id: userId, email: userEmail, role: 'viewer', active: true }, { onConflict: 'id' })
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
  const perms  = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer
  const bu     = profile?.bu || company?.bu || null

  // Flags de conveniência (retrocompatíveis)
  const isAdmin    = role === 'admin'
  const isVGT      = isAdmin || bu === 'VGT'
  const isECT      = isAdmin || bu === 'ECT'
  const canSeeAll  = isAdmin || perms.seeAll
  const canEdit    = perms.canEdit
  const editOwnOnly = perms.editOwn

  // Verificar se o user pode aceder a uma página
  function canAccessPage(page) {
    return isAdmin || perms.pages.includes(page)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, company, loading,
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
