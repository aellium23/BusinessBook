import { useState } from 'react'
import { signInWithPassword, signInWithMagicLink, resetPassword } from '../lib/supabase'
import { Mail, ArrowRight, Lock, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'

// ── Sub-componente: Password login ────────────────────────────────────────────
function PasswordForm({ onSuccess }) {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [showReset, setShowReset] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')
    const { error: err } = await signInWithPassword(email, password)
    if (err) {
      setError(
        err.message.includes('Invalid login') ? 'Email ou password incorrectos.' :
        err.message.includes('Email not confirmed') ? 'Confirma o teu email primeiro.' :
        err.message
      )
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!email) { setError('Introduz o teu email primeiro.'); return }
    setLoading(true); setError('')
    const { error: err } = await resetPassword(email)
    if (err) setError(err.message)
    else setShowReset('sent')
    setLoading(false)
  }

  if (showReset === 'sent') return (
    <div className="text-center py-4 space-y-3">
      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={24} className="text-green-600" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">Email enviado</h3>
        <p className="text-sm text-gray-500 mt-1">
          Verifica a tua caixa de entrada em <strong>{email}</strong> para redefinir a password.
        </p>
      </div>
      <button onClick={() => setShowReset(false)} className="text-sm text-navy hover:underline">
        ← Voltar ao login
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label className="label">Email</label>
        <input
          type="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@fujifilm.com"
          className="input"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Password */}
      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'} required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input pr-10"
            style={{ fontSize: '16px' }}
          />
          <button type="button" tabIndex={-1}
            onClick={() => setShowPw(o => !o)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="shrink-0 mt-0.5"/>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading || !email || !password}
        className="btn-primary w-full justify-center py-2.5 disabled:opacity-50">
        {loading ? 'A entrar…' : <><Lock size={14}/> Entrar</>}
      </button>

      <button type="button" onClick={handleReset}
        className="w-full text-center text-sm text-gray-400 hover:text-navy transition-colors">
        Esqueceste a password?
      </button>
    </form>
  )
}

// ── Sub-componente: Magic link ────────────────────────────────────────────────
function MagicLinkForm() {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')
    const { error: err } = await signInWithMagicLink(email)
    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  if (sent) return (
    <div className="text-center py-4 space-y-3">
      <div className="w-12 h-12 bg-vgt/10 rounded-full flex items-center justify-center mx-auto">
        <Mail size={24} className="text-vgt" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">Verifica o teu email</h3>
        <p className="text-sm text-gray-500 mt-1">
          Enviámos um link para <strong>{email}</strong>.<br/>
          Clica no link para entrar — sem password.
        </p>
      </div>
      <button onClick={() => setSent(false)} className="text-sm text-navy hover:underline">
        Usar email diferente
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Email</label>
        <input
          type="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@fujifilm.com"
          className="input"
          style={{ fontSize: '16px' }}
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="shrink-0 mt-0.5"/>
          {error}
        </div>
      )}
      <button type="submit" disabled={loading || !email}
        className="btn-primary w-full justify-center py-2.5 disabled:opacity-50">
        {loading ? 'A enviar…' : <><Mail size={14}/> Enviar link de acesso</>}
      </button>
    </form>
  )
}

// ── Página principal de Login ─────────────────────────────────────────────────
export default function Login() {
  const [tab, setTab] = useState('password')

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo + Título */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Business Book · FY26</h1>
          <p className="text-white/50 text-sm mt-1">VGT & ECT · Iberia</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('password')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'password'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-gray-400 hover:text-gray-600 bg-gray-50'
              }`}>
              <Lock size={13}/> Password
            </button>
            <button
              onClick={() => setTab('magic')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'magic'
                  ? 'text-navy border-b-2 border-navy bg-white'
                  : 'text-gray-400 hover:text-gray-600 bg-gray-50'
              }`}>
              <Mail size={13}/> Magic Link
            </button>
          </div>

          {/* Conteúdo */}
          <div className="p-6">
            {tab === 'password'
              ? <PasswordForm />
              : <MagicLinkForm />
            }
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Fujifilm Medical IT · Iberia & VGT
        </p>
      </div>
    </div>
  )
}
