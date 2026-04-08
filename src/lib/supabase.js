import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function signIn(email) {
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
}

export async function signOut() {
  return supabase.auth.signOut()
}
