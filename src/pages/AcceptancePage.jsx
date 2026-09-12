import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tFor, langForCountry, LOCALE_BY_LANG } from '../lib/i18n'

/**
 * A única página desta aplicação que alguém de fora abre.
 *
 * Um hospital recebe um link, toca nele no telemóvel e confirma que o
 * equipamento chegou. Não há sessão, não há perfil, não há preferência de língua
 * guardada — o browser dele nunca cá entrou.
 *
 * Por isso o `t()` da aplicação não serve: lê a língua do `localStorage`, que
 * aqui está vazio, e cai sempre em inglês. Era o que acontecia — um certificado
 * de entrega em inglês para um hospital em Viseu, com a data escrita em
 * português porque o `toLocaleDateString` tinha `'pt-PT'` cravado. O pior dos
 * dois lados.
 *
 * A língua vem do país do negócio, que é a coisa que nós sabemos: fomos nós que
 * o vendemos. Se o negócio não trouxer país, vale a língua do browser de quem
 * está a ler — é um palpite, mas é o palpite dele e não o nosso. E se nenhuma
 * das duas disser nada, inglês.
 */
function linguaDoCliente(deal) {
  const doPais = langForCountry(deal?.country)
  if (doPais) return doPais
  const doBrowser = String(navigator?.language || '').slice(0, 2).toLowerCase()
  return ['pt', 'es', 'en'].includes(doBrowser) ? doBrowser : 'en'
}

export default function AcceptancePage() {
  const { token } = useParams()
  const [acceptance, setAcceptance] = useState(null)
  const [deal, setDeal] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  // O link inválido e a falha de rede são estados, não frases. A frase só se
  // escolhe depois de se saber em que língua se fala, e isso vem do negócio —
  // que numa destas falhas nunca chegou. Guardar a frase feita fixava o inglês.
  const [falha, setFalha] = useState(null)   // 'link' | 'rede' | null

  const lang = useMemo(() => linguaDoCliente(deal), [deal])
  const t = useMemo(() => tFor(lang), [lang])
  const locale = LOCALE_BY_LANG[lang] || 'en-GB'

  useEffect(() => {
    if (!token) { setFalha('link'); setLoading(false); return }
    supabase.rpc('get_acceptance_details', { p_token: token })
      .then(({ data, error: err }) => {
        if (err || !data) { setFalha('link'); setLoading(false); return }
        setAcceptance(data.acceptance)
        setDeal(data.deal)
        setProducts(data.products || [])
        if (data.acceptance?.accepted_at) setConfirmed(true)
        setLoading(false)
      })
      .catch(() => { setFalha('rede'); setLoading(false) })
  }, [token])

  async function handleConfirm() {
    setConfirming(true)
    const { data, error: err } = await supabase.rpc('confirm_delivery', { p_token: token })
    if (err || !data?.success) {
      setError(err?.message || data?.error || t('acc_err_confirm'))
      setConfirming(false)
      return
    }
    setConfirmed(true)
    setConfirming(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse text-gray-400 text-sm">{t('loading')}</div>
    </div>
  )

  const mensagemDeFalha = falha === 'rede' ? t('acc_err_network') : t('acc_err_expired')

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
            <p className="text-micro text-gray-400">{t('acc_title')}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="max-w-2xl w-full">
          {falha && !deal ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <span className="text-red-500 text-xl">!</span>
              </div>
              <p className="text-sm text-red-600">{mensagemDeFalha}</p>
              <p className="text-micro text-gray-400">{t('acc_err_contact')}</p>
            </div>
          ) : confirmed ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">{t('acc_confirmed_title')}</h2>
              <p className="text-sm text-gray-600">
                {t('acc_confirmed_body')} <strong>{deal?.client}</strong>.
              </p>
              {acceptance?.accepted_at && (
                <p className="text-micro text-gray-400">
                  {t('acc_confirmed_on')} {new Date(acceptance.accepted_at).toLocaleDateString(locale,
                    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          ) : (
            <div className="card p-6 space-y-5">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{t('acc_title')}</h1>
                <p className="text-sm text-gray-500 mt-1">{t('acc_intro')}</p>
              </div>

              {/* Deal info */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase font-semibold">{t('acc_client')}</p>
                  <p className="text-sm font-bold text-gray-900">{deal?.client}</p>
                </div>
                {deal?.description && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase font-semibold">{t('acc_description')}</p>
                    <p className="text-sm text-gray-700">{deal.description}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase font-semibold">{t('acc_value')}</p>
                  <p className="text-sm font-bold text-gray-900">
                    {deal?.currency === 'USD' ? '$' : deal?.currency === 'GBP' ? '£' : '€'}
                    {Number(deal?.value_total || 0).toLocaleString(locale, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Products */}
              {products.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">{t('acc_products')}</p>
                  {/* overflow-x-auto e não só hidden: o `main` do Layout corta o
                      que transborda, e uma tabela cortada não avisa ninguém. */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold">{t('acc_item')}</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold tabular-nums">{t('acc_qty')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-800">{p.product_name || p.name || '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{p.quantity || 1}</td>
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
                  {confirming ? t('acc_confirming') : t('acc_confirm')}
                </button>
                <p className="text-micro text-gray-400 text-center mt-2">{t('acc_disclaimer')}</p>
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
