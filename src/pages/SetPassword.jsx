import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, updatePassword } from '../lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'

// Página para definir password após convite ou reset
export default function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    // Verificar que há uma sessão válida (vinda do link de convite/reset)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true)
      else navigate('/login', { replace: true })
    })
  }, [navigate])

  // Validação da password
  const checks = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    number:  /[0-9]/.test(password),
    match:   password === confirm && confirm.length > 0,
  }
  const isValid = Object.values(checks).every(Boolean)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true); setError('')
    const { error: err } = await updatePassword(password)
    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/', { replace: true }), 2000)
    }
    setLoading(false)
  }

  if (!hasSession) return null

  if (success) return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Password definida!</h2>
          <p className="text-sm text-gray-500 mt-1">A redirigir para a app…</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Definir password</h1>
          <p className="text-white/50 text-sm mt-1">Escolhe uma password segura para a tua conta.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nova password */}
            <div>
              <label className="label">Nova password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="input pr-10"
                  style={{ fontSize: '16px' }}
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPw(o => !o)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {/* Confirmar */}
            <div>
              <label className="label">Confirmar password</label>
              <input
                type={showPw ? 'text' : 'password'} required
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repete a password"
                className="input"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Requisitos */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                {[
                  { key: 'length',  label: 'Mínimo 8 caracteres' },
                  { key: 'upper',   label: 'Pelo menos uma maiúscula' },
                  { key: 'number',  label: 'Pelo menos um número' },
                  { key: 'match',   label: 'Passwords coincidem' },
                ].map(({ key, label }) => (
                  <div key={key} className={`flex items-center gap-2 text-xs ${
                    checks[key] ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    <CheckCircle2 size={12} className={checks[key] ? 'text-green-500' : 'text-gray-300'} />
                    {label}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle size={14} className="shrink-0 mt-0.5"/>
                {error}
              </div>
            )}

            <button type="submit" disabled={!isValid || loading}
              className="btn-primary w-full justify-center py-2.5 disabled:opacity-50">
              {loading ? 'A guardar…' : <><Lock size={14}/> Definir password</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
