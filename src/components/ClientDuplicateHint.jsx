import { useMemo } from 'react'
import { similarClients } from '../lib/clientMatch'
import { useTranslation } from '../hooks/useTranslation'

/**
 * "Isto já existe com outro nome?" — perguntado antes de gravar, não depois.
 *
 * Um duplicado nasce sempre da mesma maneira: alguém escreve o nome em vez de o
 * escolher da lista, e a aplicação aceita sem dizer nada. Depois o Hospital
 * Ramón y Cajal tem 713 mil numa linha e 119 mil noutra, e o relatório por
 * cliente nunca mostra o total do hospital.
 *
 * Sugere, não corrige. O comercial pode ter razão — dois hospitais parecidos
 * existem — e uma correcção automática num nome de cliente é uma decisão que
 * ninguém tomou. Um toque aceita a sugestão; não tocar mantém o que se escreveu.
 */
export default function ClientDuplicateHint({ value, existing, onPick }) {
  const { t } = useTranslation()
  const matches = useMemo(
    () => similarClients(value, existing, { limit: 3 }), [value, existing])

  if (matches.length === 0) return null

  const lead = matches[0].reason === 'same' ? t('cdh_same')
    : matches[0].reason === 'truncated' ? t('cdh_truncated')
    : t('cdh_similar')

  return (
    <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 space-y-1">
      <p className="text-micro text-amber-800">{lead}</p>
      <div className="flex flex-wrap gap-1">
        {matches.map(m => (
          <button key={m.name} type="button" onClick={() => onPick(m.name)}
            className="min-h-tap px-2 py-1 rounded-lg bg-white border border-amber-300
                       text-xs text-amber-900 hover:bg-amber-100 text-left">
            {m.name}
          </button>
        ))}
      </div>
      {/* Sem isto a caixa parece uma recusa. Não é: o nome escrito continua a
          valer, e há clientes genuinamente parecidos. */}
      <p className="text-micro text-amber-700/80">{t('cdh_keep')}</p>
    </div>
  )
}
