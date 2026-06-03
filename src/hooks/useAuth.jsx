import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { safeJsonParse } from '../constants'
import { logger } from '../lib/logger'

const AuthContext = createContext(null)

// ── Permissões por role ───────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','audit','history','quotas','budget','settings','tasks','tenders','permissions','sla','products','quotations'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    'ALL',
    seeAll:   true,
    manageUsers: true,
  },
  manager: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','budget','tasks','tenders','sla','products','quotations'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  member: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','tasks','tenders','sla','products','quotations'],
    canEdit:  true,
    canDelete: false,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  distributor: {
    pages:    ['dashboard','deals','tasks','tenders','clients','contacts','history','quotas','quotations'],
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
    // Step 1: fetch profile without joins (immune to permission_sets RLS issues)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      logger.error('Failed to load user profile', { userId, error: error.message })
      // Fallback so loading never stays true forever
      setProfile({ id: userId, email: userEmail, role: 'viewer' })
      setCompany(null); setPermSet(null)
      return
    }

    if (data) {
      // Verificar se a conta está activa
      if (data.active === false) {
        await supabase.auth.signOut()
        setProfile(null); setCompany(null); setPermSet(null)
        return
      }

      setProfile(data)

      // Step 2: fetch related company and permission_set separately
      // so a failure in one doesn't block the whole profile load
      if (data.company_id) {
        const { data: co } = await supabase
          .from('companies').select('*').eq('id', data.company_id).single()
        setCompany(co || null)
      } else {
        setCompany(null)
      }

      if (data.permission_set_id) {
        const { data: ps } = await supabase
          .from('permission_sets').select('*').eq('id', data.permission_set_id).single()
        setPermSet(ps || null)
      } else {
        setPermSet(null)
      }
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
      setCompany(null); setPermSet(null)
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
  // Brand-only approvers have no other page access
  const isBrandApproverOnly = Array.isArray(profile?.approves_brands) && profile.approves_brands.length > 0
    && !['admin','manager','member'].includes(role)

  function canAccessPage(page) {
    if (role === 'admin') return true
    if (page === 'approvals') {
      return Array.isArray(profile?.approves_brands) && profile.approves_brands.length > 0
    }
    // Brand-only approvers cannot access any other page
    if (isBrandApproverOnly) return false
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
