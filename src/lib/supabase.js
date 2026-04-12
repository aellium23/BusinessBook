import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Auth helpers ──────────────────────────────────────────────────────────────

// Sign in com password
export async function signInWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

// Magic link (OTP)
export async function signInWithMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
  })
}

// Reset password — envia email
export async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/set-password`
  })
}

// Definir nova password (após invite ou reset)
export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword })
}

// Sign out
export async function signOut() {
  return supabase.auth.signOut()
}

// Verificar se o user tem profile activo
export async function checkActiveProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, role, active, company_id, bu')
    .eq('id', userId)
    .single()
  return data
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*, company:company_id(*)')
    .eq('id', userId)
    .single()
  return data
}

// Retrocompatibilidade
export async function signIn(email) {
  return signInWithMagicLink(email)
}
