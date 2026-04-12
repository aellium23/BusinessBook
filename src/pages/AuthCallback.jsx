import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

// Página intermediária que trata o redirect após magic link ou invite
export default function AuthCallback() {
  const navigate  = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    // Supabase trata automaticamente o hash fragment da URL
    // após magic link / invite / password reset
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/', { replace: true })
      }
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/auth/set-password', { replace: true })
      }
      if (event === 'USER_UPDATED') {
        navigate('/', { replace: true })
      }
    })

    // Verificar sessão actual (caso já tenha sido processada)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true })
      } else {
        // Se não há sessão após 3 segundos, mostrar erro
        setTimeout(() => {
          setError('Link inválido ou expirado. Por favor tenta novamente.')
        }, 3000)
      }
    })
  }, [navigate])

  if (error) return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl">⚠️</span>
        </div>
        <div>
          <h2 className="font-bold text-gray-900">Link inválido</h2>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
        <a href="/login" className="btn-primary w-full justify-center py-2.5 inline-flex">
          Voltar ao login
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center">
      <div className="text-center space-y-4">
        <Spinner />
        <p className="text-white/60 text-sm">A autenticar…</p>
      </div>
    </div>
  )
}
