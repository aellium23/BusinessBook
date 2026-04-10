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
          <img
            src="data:image/jpeg;base64,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"
            alt="Business Book"
            className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4"
            style={{ objectPosition: 'center 15%' }}
          />
          <h1 className="text-white text-2xl font-bold">Business Book · FY26</h1>
          <p className="text-white/50 text-sm mt-1">VGT & ECT · Iberia</p>
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
