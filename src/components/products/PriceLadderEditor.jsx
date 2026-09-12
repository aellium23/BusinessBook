import { useState, useEffect } from 'react'
import { useProductTiers, saveProductTiers } from '../../hooks/useProductTiers'
import { validateTiers } from '../../lib/priceLadder'
import { useTranslation } from '../../hooks/useTranslation'
import { useToast } from '../Toast'
import { Spinner } from '../ui'
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'

const BLANK = { tier_label: '', tier_from: '', tier_to: '', global_list_price: '' }

/**
 * The volume ladder, editable.
 *
 * A price list used to move only by someone writing SQL, so every correction
 * took a round trip and the person who knew the right number was never the
 * person who could enter it. The CWM Dose curve sat wrong in the database for
 * months for exactly that reason.
 *
 * The order of the rows IS the ladder — the resolver walks them looking for the
 * band a volume falls in — so moving a row is a pricing change, and `sort_order`
 * is renumbered from the array on save rather than patched in place.
 *
 * Problems are reported, not blocked. A half-built ladder is what every ladder
 * looks like while it is being typed; refusing to render one would make the
 * editor unusable. The one worth reading twice is a gap, because a volume that
 * falls in it prices at nothing and no screen anywhere will say so.
 */
export default function PriceLadderEditor({ productId, priceUnit }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { tiers, loading, refetch } = useProductTiers(productId)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRows(tiers.length
      ? tiers.map(r => ({
          tier_label: r.tier_label ?? '',
          tier_from: r.tier_from ?? '',
          tier_to: r.tier_to ?? '',
          global_list_price: r.global_list_price ?? '',
        }))
      : [{ ...BLANK }])
  }, [tiers])

  const problems = validateTiers(rows)

  function set(i, key, v) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  }
  function addRow() { setRows(rs => [...rs, { ...BLANK }]) }
  function removeRow(i) { setRows(rs => rs.filter((_, j) => j !== i)) }
  function move(i, delta) {
    const j = i + delta
    if (j < 0 || j >= rows.length) return
    setRows(rs => {
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    setSaving(true)
    const { error } = await saveProductTiers(productId, rows)
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast(t('pl_saved'), 'success')
    refetch()
  }

  if (loading) return <Spinner/>

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">{t('pl_title')}</p>
        <p className="text-micro text-gray-400">
          {t('pl_hint')} {priceUnit && <strong>{priceUnit}</strong>}
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-2 py-2 font-semibold">{t('pl_band')}</th>
              <th className="text-right px-2 py-2 font-semibold w-24 tabular-nums">{t('pl_from')}</th>
              <th className="text-right px-2 py-2 font-semibold w-24 tabular-nums">{t('pl_to')}</th>
              <th className="text-right px-2 py-2 font-semibold w-24 tabular-nums">{t('pl_price')}</th>
              <th className="w-20"/>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input className="input text-xs py-1 w-full" value={r.tier_label}
                    placeholder={t('pl_band_ph')}
                    onChange={e => set(i, 'tier_label', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </td>
                <td className="px-2 py-1">
                  <input className="input text-xs py-1 text-right w-full" type="number"
                    value={r.tier_from} onChange={e => set(i, 'tier_from', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </td>
                <td className="px-2 py-1">
                  {/* Empty means open-ended, and exactly one band must be. */}
                  <input className="input text-xs py-1 text-right w-full" type="number"
                    value={r.tier_to} placeholder="∞"
                    onChange={e => set(i, 'tier_to', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </td>
                <td className="px-2 py-1">
                  <input className="input text-xs py-1 text-right w-full font-semibold"
                    type="number" step="0.0001" value={r.global_list_price}
                    onChange={e => set(i, 'global_list_price', e.target.value)}
                    style={{ fontSize: '16px' }}/>
                </td>
                <td className="px-1 py-1">
                  <div className="flex gap-0.5 justify-end">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="p-1 text-gray-400 hover:text-navy disabled:opacity-20"
                      title={t('pl_up')}><ChevronUp size={13}/></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                      className="p-1 text-gray-400 hover:text-navy disabled:opacity-20"
                      title={t('pl_down')}><ChevronDown size={13}/></button>
                    <button type="button" onClick={() => removeRow(i)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title={t('pl_remove')}><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {problems.length > 0 && (
        <div className="text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 space-y-0.5">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle size={11}/> {t('pl_problems')}
          </p>
          {problems.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="btn-secondary text-xs gap-1">
          <Plus size={13}/> {t('pl_add')}
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="btn-primary text-xs flex-1">
          {saving ? t('pl_saving') : t('pl_save')}
        </button>
      </div>

      <p className="text-micro text-gray-400">{t('pl_footnote')}</p>
    </div>
  )
}
