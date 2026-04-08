import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId, userEmail) {
    // Try to get profile
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
    } else {
      // Profile not readable via RLS — use email-based fallback
      // Check auth.users metadata or use a service role workaround
      // For now: if we can't read profile, try upsert to create it
      const { data: upserted } = await supabase
        .from('profiles')
        .upsert({ id: userId, email: userEmail, role: 'viewer' }, { onConflict: 'id' })
        .select()
        .single()
      setProfile(upserted || { id: userId, email: userEmail, role: 'viewer' })
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
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (profile !== null) setLoading(false)
  }, [profile])

  const isAdmin   = profile?.role === 'admin'
  const isVGT     = ['vgt_editor','vgt_member','viewer_vgt','distributor'].includes(profile?.role) || isAdmin
  const isECT     = ['ect_editor','ect_member','viewer_ect'].includes(profile?.role) || isAdmin
  const canSeeAll = ['admin','viewer_all'].includes(profile?.role)
  const canEdit   = ['admin','vgt_editor','ect_editor','vgt_member','ect_member','distributor'].includes(profile?.role)
  const editOwnOnly = ['vgt_member','ect_member','distributor'].includes(profile?.role)

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isVGT, isECT, canSeeAll, editOwnOnly, canEdit }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
