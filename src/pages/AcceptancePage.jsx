import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AcceptancePage() {
  const { token } = useParams()
  const [acceptance, setAcceptance] = useState(null)
  const [deal, setDeal] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return }
    supabase.rpc('get_acceptance_details', { p_token: token })
      .then(({ data, error: err }) => {
        if (err || !data) { setError('This link is invalid or has expired.'); setLoading(false); return }
        setAcceptance(data.acceptance)
        setDeal(data.deal)
        setProducts(data.products || [])
        if (data.acceptance?.accepted_at) setConfirmed(true)
        setLoading(false)
      })
      .catch(() => { setError('Network error. Please try again.'); setLoading(false) })
  }, [token])

  async function handleConfirm() {
    setConfirming(true)
    const { data, error: err } = await supabase.rpc('confirm_delivery', { p_token: token })
    if (err || !data?.success) {
      setError(err?.message || data?.error || 'Failed to confirm. Please try again.')
      setConfirming(false)
      return
    }
    setConfirmed(true)
    setConfirming(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-navy rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">FH</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Fujifilm Healthcare</p>
            <p className="text-micro text-gray-400">Delivery Acceptance Certificate</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="max-w-2xl w-full">
          {error && !deal ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <span className="text-red-500 text-xl">!</span>
              </div>
              <p className="text-sm text-red-600">{error}</p>
              <p className="text-micro text-gray-400">If you believe this is an error, please contact your Fujifilm representative.</p>
            </div>
          ) : confirmed ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delivery Confirmed</h2>
              <p className="text-sm text-gray-600">
                Thank you. The delivery acceptance for <strong>{deal?.client}</strong> has been recorded.
              </p>
              {acceptance?.accepted_at && (
                <p className="text-micro text-gray-400">
                  Confirmed on {new Date(acceptance.accepted_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          ) : (
            <div className="card p-6 space-y-5">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Delivery Acceptance Certificate</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Please review the items below and confirm that all products/services have been delivered as agreed.
                </p>
              </div>

              {/* Deal info */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Client</p>
                  <p className="text-sm font-bold text-gray-900">{deal?.client}</p>
                </div>
                {deal?.description && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase font-semibold">Description</p>
                    <p className="text-sm text-gray-700">{deal.description}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Value</p>
                  <p className="text-sm font-bold text-gray-900">
                    {deal?.currency === 'USD' ? '$' : deal?.currency === 'GBP' ? '£' : '€'}
                    {Number(deal?.value_total || 0).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Products */}
              {products.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Products / Services</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold">Item</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-800">{p.product_name || p.name || '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{p.quantity || 1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Confirm button */}
              <div className="pt-2 border-t border-gray-100">
                {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
                <button onClick={handleConfirm} disabled={confirming}
                  className="btn-primary w-full text-base py-3">
                  {confirming ? 'Processing…' : 'Confirm Delivery'}
                </button>
                <p className="text-micro text-gray-400 text-center mt-2">
                  By clicking above, you confirm that all listed items have been delivered and accepted.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 px-6 py-3 text-center">
        <p className="text-micro text-gray-400">Fujifilm Healthcare — BusinessBook</p>
      </footer>
    </div>
  )
}
