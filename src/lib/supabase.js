import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at boot if the deploy is missing env vars — silent misconfig is the
// worst kind of bug, because the UI looks fine but every query returns empty.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ')
  throw new Error(
    `[BusinessBook] Missing required environment variable(s): ${missing}. ` +
    `Set them in your deployment (Vercel / .env.local) and redeploy.`
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// A second client with NO persisted session — used exclusively for admin-initiated
// signUp calls.  When the admin is already logged in, calling signUp on the main
// client can fail ("failed to fetch") because it tries to create a new session that
// conflicts with the existing one.  This isolated client avoids that entirely.
export const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

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
