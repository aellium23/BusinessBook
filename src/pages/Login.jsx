import { useState } from 'react'
import { signIn } from '../lib/supabase'
import { Mail, ArrowRight } from 'lucide-react'

export default function Login() {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')
    const { error } = await signIn(email)
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
            <span className="text-3xl font-bold">
              <span className="text-vgt">B</span><span className="text-ect">B</span>
            </span>
          </div>
          <h1 className="text-white text-2xl font-bold">Business Book</h1>
          <p className="text-white/50 text-sm mt-1">FY26 · VGT & ECT</p>
        </div>

        <div className="card p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-vgt/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail size={24} className="text-vgt" />
              </div>
              <h2 className="font-semibold text-gray-900 mb-1">Check your email</h2>
              <p className="text-sm text-gray-500">
                We sent a magic link to <strong>{email}</strong>.<br />
                Click it to sign in — no password needed.
              </p>
              <button onClick={() => setSent(false)} className="mt-4 text-sm text-navy hover:underline">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Sign in</h2>
                <p className="text-sm text-gray-500">Enter your email to receive a magic link.</p>
              </div>
              <div>
                <label className="label">Work email</label>
                <input
                  type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@fujifilm.com"
                  className="input"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Sending…' : (<><span>Send magic link</span><ArrowRight size={16} /></>)}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Fujifilm Medical IT · Iberia & VGT
        </p>
      </div>
    </div>
  )
}
