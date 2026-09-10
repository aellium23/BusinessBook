import { useMemo, useState } from 'react'
import { cheapestCcuCombination, groupItems, packageLines } from '../../lib/ccu'
import { resolveVariant, hasBundleVariant, discountCeiling } from '../../lib/familyEconomics'
import { itemCost } from '../../lib/itemPricing'
import { formatK } from '../ui'
import { useTranslation } from '../../hooks/useTranslation'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'

const KIND_KEYS = {
  package: 'fi_packages', module: 'fi_modules',
  upgrade: 'fi_upgrades', service: 'fi_services', hardware: 'fi_hardware',
}

/**
 * The drill-down under one catalogue family: what we actually buy, and what it
 * costs us.
 *
 * Two ways in. Where the family sells capacity in fixed packages, the rep picks
 * which package line the site is on — Base, Radiology, Full, Mobility 3D Full —
 * and types how many concurrent users it needs; the cheapest combination within
 * that line is worked out, because it is not readable off a price list:
 * thirteen Base users is a 10 plus a 3 at 22,770, where thirteen single
 * licences would cost 71,760.
 *
 * The choice of line is the rep's and cannot be solved for. Capacities only add
 * up inside one line: a Base 10 CCU plus a Cardiology 1 CCU is not eleven users
 * of anything, it is two different products. Everything else is picked by hand.
 *
 * Only cost is shown here. The sell price is the line's margin applied on top,
 * set one level up in the quote.
 */
export default function FamilyItems({ items, studies, value, onChange, bundleDefault = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => groupItems(items || []), [items])

  // Buying Synapse PACS in the same quote answers the bundle question by
  // itself; the checkbox is for the site that already owns one.
  const bundle = value.bundle ?? bundleDefault

  // Each package line is its own capacity ladder; combinations stay inside one.
  const lines = useMemo(() => packageLines(items || []), [items])
  const lineKey = value.line || (lines.length === 1 ? lines[0].key : '')
  const line = lines.find(l => l.key === lineKey) || null

  const users = value.users || ''
  const combo = useMemo(
    () => (line ? cheapestCcuCombination(line.packages, parseFloat(users) || 0) : null),
    [line, users]
  )

  const picked = value.itemIds || []
  const pickedLines = useMemo(
    () => picked
      .map(id => (items || []).find(i => i.id === id))
      .filter(Boolean)
      .map(i => ({ item: i, ...itemCost(i, { studies, quantity: 1 }) })),
    [picked, items, studies]
  )

  function toggle(id) {
    onChange({ ...value, itemIds: picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id] })
  }

  const discounts = value.discounts || {}
  function setDiscount(id, pct) {
    onChange({ ...value, discounts: { ...discounts, [id]: pct } })
  }

  const manualCost = pickedLines.reduce((s, l) => s + l.cost, 0)
  const total = (combo?.cost || 0) + manualCost

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50/50">
      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.length > 1 && (
            <div>
              <label className="label">{t('fi_line')}</label>
              <select className="select" value={lineKey}
                onChange={e => onChange({ ...value, line: e.target.value })}>
                <option value="">{t('fi_pick_one')}</option>
                {lines.map(l => (
                  <option key={l.key} value={l.key}>
                    {l.label} ({l.packages.map(p => `${p.ccu} CCU`).join(' / ')})
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="label">{t('fi_users')}</label>
          <input className="input w-20" type="number" min="0" inputMode="numeric"
            value={users} placeholder="13" style={{ fontSize: '16px' }}
            disabled={!line}
            onChange={e => onChange({ ...value, users: e.target.value })}/>
          {combo && (
            <div className="text-xs text-gray-700 space-y-0.5">
              {combo.lines.map(l => (
                <div key={l.id} className="flex justify-between gap-3">
                  <span>{l.quantity} × {l.description || l.name} <span className="text-gray-400">({l.ccu} CCU)</span></span>
                  <span className="tabular-nums">{formatK(l.cost * l.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-1 border-t border-gray-200 font-semibold text-navy">
                <span>{combo.ccu} CCU · {t('fi_cost')}</span>
                <span className="tabular-nums">{formatK(combo.cost)}</span>
              </div>
              {combo.annualSupport > 0 && (
                <div className="flex justify-between gap-3 text-gray-500">
                  <span>{t('fi_annual_support')}</span>
                  <span className="tabular-nums">{formatK(combo.annualSupport)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasBundleVariant(items) && (
        <label className="flex items-start gap-2 text-xs text-gray-700 min-h-tap cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={Boolean(bundle)}
            onChange={e => onChange({ ...value, bundle: e.target.checked })}/>
          <span>
            {t('fi_bundle_q')}
            <span className="block text-micro text-gray-400">{t('fi_bundle_hint')}</span>
          </span>
        </label>
      )}

      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-semibold text-gray-600 min-h-tap">
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        {open ? t('fi_hide') : `${t('fi_show_a')} ${(items || []).length} ${t('fi_show_b')}`}
      </button>

      {open && (
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {['package', 'module', 'upgrade', 'service', 'hardware'].map(kind => {
            const rows = groups[kind === 'package' ? 'packages'
              : kind === 'module' ? 'modules'
              : kind === 'upgrade' ? 'upgrades'
              : kind === 'service' ? 'services' : 'hardware']
            if (!rows?.length) return null
            return (
              <div key={kind}>
                <p className="text-micro font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  {t(KIND_KEYS[kind])}
                </p>
                <div className="space-y-0.5">
                  {rows.filter(i => !i.variant || i.variant === 'standalone').map(i => {
                    const on = picked.includes(i.id)
                    const shown = resolveVariant(items, i, bundle)
                    const c = itemCost(shown, { studies, quantity: 1 })
                    return (
                      <button key={i.id} type="button" onClick={() => toggle(i.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs min-h-tap ${
                          on ? 'bg-navy/10 text-navy' : 'hover:bg-white text-gray-700'
                        }`}>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                            on ? 'bg-navy border-navy' : 'border-gray-300'
                          }`}>
                            {on && <Check size={10} className="text-white"/>}
                          </span>
                          <span className="truncate">{i.description || i.name}</span>
                        </span>
                        <span className="tabular-nums text-gray-500 flex-shrink-0">
                          {c.cost > 0 ? formatK(c.cost) : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {picked.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-700">{t('fi_disc')}</p>
            <p className="text-micro text-gray-400">{t('fi_disc_hint')}</p>
          </div>
          {picked.map(id => {
            const raw = (items || []).find(i => i.id === id)
            if (!raw) return null
            const shown = resolveVariant(items, raw, bundle)
            const ceiling = discountCeiling(shown)
            const pct = Number(discounts[id]) || 0
            const over = ceiling !== null && pct > ceiling
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">
                  {shown.description || shown.name}
                </span>
                <input className={`input text-xs py-1 text-right w-16 ${over ? 'border-red-300' : ''}`}
                  type="number" min="0" max="100" value={discounts[id] ?? ''}
                  placeholder="0" style={{ fontSize: '16px' }}
                  onChange={e => setDiscount(id, e.target.value)}/>
                <span className={`text-micro w-24 flex-shrink-0 ${over ? 'text-red-700 font-semibold' : 'text-gray-400'}`}>
                  {ceiling !== null ? `${t('fi_ceiling')} ${ceiling}%` : '%'}
                </span>
              </div>
            )
          })}
          {picked.some(id => {
            const raw = (items || []).find(i => i.id === id)
            const c = raw && discountCeiling(resolveVariant(items, raw, bundle))
            return c !== null && c !== undefined && (Number(discounts[id]) || 0) > c
          }) && (
            <p className="text-micro text-red-700">{t('fi_over_ceiling')}</p>
          )}
        </div>
      )}

      {total > 0 && (
        <p className="text-xs font-semibold text-navy border-t border-gray-200 pt-2">
          {t('fi_family_cost')} <span className="tabular-nums">{formatK(total)}</span>
        </p>
      )}
    </div>
  )
}
