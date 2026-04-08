import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) getProfile(session.user.id).then(setProfile)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) getProfile(session.user.id).then(setProfile)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const isAdmin  = profile?.role === 'admin'
  const isVGT    = profile?.role === 'vgt' || isAdmin
  const isECT    = profile?.role === 'ect' || isAdmin
  const canEdit  = ['admin', 'vgt', 'ect'].includes(profile?.role)

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isVGT, isECT, canEdit }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
