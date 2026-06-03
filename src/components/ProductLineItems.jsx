import { useState, useMemo } from 'react'
import { Plus, X, Package } from 'lucide-react'
import { formatK } from './ui'

const LICENSE_TYPES = [
  { id: 'per_equipment', label: 'Per Equipment' },
  { id: 'per_volume',    label: 'Per Volume (studies)' },
  { id: 'per_package',   label: 'Package (e.g. 10K studies)' },
  { id: 'per_ccu',       label: 'Per CCU (concurrent)' },
  { id: 'flat',          label: 'Flat Fee' },
]

export default function ProductLineItems({ lines, onChange, products, businessModel, t, onTotalChange, onBusinessModelInfer, userRole }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedIdx, setExpandedIdx] = useState(null)

  const isCapex = ['capex', 'financed_project', 'one_shot'].includes(businessModel)
  const isDistributor = userRole === 'distributor'

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products || []
    const s = searchTerm.toLowerCase()
    return (products || []).filter(p =>
      p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || p.category.toLowerCase().includes(s)
    )
  }, [products, searchTerm])

  const grouped = useMemo(() => {
    const g = {}
    for (const p of filteredProducts) {
      if (!g[p.category]) g[p.category] = []
      g[p.category].push(p)
    }
    return g
  }, [filteredProducts])

  function inferLicenseType(product) {
    // The product's configured allowed types are authoritative
    const allowed = product?.allowed_license_types
    if (Array.isArray(allowed) && allowed.length > 0) return allowed[0]
    const name = (product?.name || '').toLowerCase()
    const sku = (product?.sku || '').toLowerCase()
    if (sku.includes('ccu') || name.includes('ccu')) return 'per_ccu'
    // CWM Dose is licensed by study volume; Connectivity / CWM-ES by equipment
    if (name.includes('dose') || name.includes('per study') || name.includes('pay per')) return 'per_volume'
    if (name.includes('connectivity') || name.includes('cwm-es') || name.includes('cwm es')) return 'per_equipment'
    return 'flat'
  }

  function getAllowedTypes(line) {
    const prod = (products || []).find(p => p.id === line.product_id)
    const allowed = prod?.allowed_license_types
    if (Array.isArray(allowed) && allowed.length > 0) {
      return LICENSE_TYPES.filter(lt => allowed.includes(lt.id))
    }
    return LICENSE_TYPES
  }

  function addLine(product) {
    const lt = inferLicenseType(product)
    const isVol = ['per_volume', 'per_package'].includes(lt)
    // For volume/package licensing, license_fee = price per unit/study
    // For capex/flat, license_fee = upfront license price
    const unitPrice = isVol
      ? (product.license_fee || product.annual_fee || 0)
      : isCapex ? (product.license_fee || 0) : (product.annual_fee || 0)
    const newLine = {
      _key: Date.now() + Math.random(),
      product_id:    product.id,
      product_name:  product.name,
      license_type:  lt,
      quantity:      isVol ? 0 : 1,
      volume:        '',
      package_size:  lt === 'per_package' ? 10000 : '',
      unit_price:    unitPrice,
      cost_price:    unitPrice,
      margin_pct:    0,
      discount_pct:  0,
      net_price:     isVol ? 0 : unitPrice,
      annual_fee:    product.annual_fee || 0,
      notes:         '',
    }
    const newLines = [...lines, newLine]
    onChange(newLines)
    notifyTotal(newLines)
    setSearchTerm('')
  }

  function addCustomLine() {
    const newLine = {
      _key: Date.now() + Math.random(),
      product_id:    null,
      product_name:  '',
      license_type:  'flat',
      quantity:      1,
      volume:        '',
      package_size:  '',
      unit_price:    0,
      cost_price:    0,
      margin_pct:    0,
      discount_pct:  0,
      net_price:     0,
      annual_fee:    0,
      notes:         '',
    }
    const newLines = [...lines, newLine]
    onChange(newLines)
    notifyTotal(newLines)
  }

  function recalcNet(line) {
    const qty = parseInt(line.quantity) || 1
    const up = parseFloat(line.unit_price) || 0
    const disc = parseFloat(line.discount_pct) || 0
    if (line.license_type === 'per_volume') {
      const vol = parseInt(line.volume) || 0
      return vol * up * (1 - disc / 100)
    }
    if (line.license_type === 'per_package') {
      const vol = parseInt(line.volume) || 0
      const pkgSize = parseInt(line.package_size) || 10000
      const pkgs = Math.ceil(vol / pkgSize)
      return pkgs * up * (1 - disc / 100)
    }
    return qty * up * (1 - disc / 100)
  }

  function notifyTotal(updatedLines) {
    if (onTotalChange) {
      const total = updatedLines.reduce((s, l) => s + (parseFloat(l.net_price) || 0), 0)
      onTotalChange(total)
    }
    if (onBusinessModelInfer && updatedLines.length > 0) {
      const types = new Set(updatedLines.map(l => l.license_type).filter(Boolean))
      const hasCapex = types.has('flat') || types.has('per_ccu') || types.has('per_equipment')
      const hasOpex = types.has('per_volume') || types.has('per_package')
      // Recurring volume/package licensing → pay-per-study; otherwise CAPEX.
      // (A capex+recurring mix stays CAPEX; the post-sale SLA captures the recurring part.)
      if (hasOpex && !hasCapex) onBusinessModelInfer('pay_per_study')
      else onBusinessModelInfer('capex')
    }
  }

  function updateLine(idx, field, value) {
    const updated = [...lines]
    const line = { ...updated[idx] }
    line[field] = value

    if (field === 'volume' && line.license_type === 'per_package') {
      const vol = parseInt(value) || 0
      const pkgSize = parseInt(line.package_size) || 10000
      line.quantity = Math.ceil(vol / pkgSize)
    }

    if (field === 'margin_pct') {
      const margin = Math.max(0, parseFloat(value) || 0)
      line.margin_pct = margin
      const cost = parseFloat(line.cost_price) || 0
      line.unit_price = Math.round(cost * (1 + margin / 100) * 100) / 100
    }

    if (field === 'cost_price') {
      line.cost_price = parseFloat(value) || 0
      const margin = parseFloat(line.margin_pct) || 0
      if (margin > 0) line.unit_price = Math.round(line.cost_price * (1 + margin / 100) * 100) / 100
    }

    if (['unit_price', 'discount_pct', 'quantity', 'volume', 'package_size', 'license_type', 'margin_pct', 'cost_price'].includes(field)) {
      line.net_price = Math.round(recalcNet(line) * 100) / 100

      const catalogProduct = (products || []).find(p => p.id === line.product_id)
      if (catalogProduct?.annual_fee > 0) {
        const qty = parseInt(line.quantity) || 1
        line.annual_fee = catalogProduct.annual_fee * qty
      }
    }

    if (field === 'net_price') {
      const net = parseFloat(value) || 0
      line.net_price = net
      const qty = parseInt(line.quantity) || 1
      const totalUnit = (parseFloat(line.unit_price) || 0) * qty
      line.discount_pct = totalUnit > 0 ? Math.round((1 - net / totalUnit) * 10000) / 100 : 0
    }

    updated[idx] = line
    onChange(updated)
    notifyTotal(updated)
  }

  function removeLine(idx) {
    const updated = lines.filter((_, i) => i !== idx)
    onChange(updated)
    notifyTotal(updated)
  }

  const totalNet     = lines.reduce((s, l) => s + (parseFloat(l.net_price) || 0), 0)
  const totalCost    = lines.reduce((s, l) => s + (parseFloat(l.cost_price || l.unit_price) || 0) * (parseInt(l.quantity) || 1), 0)
  const totalAnnual  = lines.reduce((s, l) => s + (parseFloat(l.annual_fee) || 0), 0)
  const gmPct = totalNet > 0 ? ((totalNet - totalCost) / totalNet * 100) : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap">
        <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
          <Package size={12}/> {t?.('products_title') || 'Products'} ({lines.length})
        </p>
        <div className="flex gap-3 text-xs flex-wrap">
          {totalNet > 0 && <span className="text-gray-600 font-semibold">Total: {formatK(totalNet)}</span>}
          {!isDistributor && gmPct > 0 && <span className="text-green-600">GM: {gmPct.toFixed(1)}%</span>}
          {totalAnnual > 0 && <span className="text-blue-600">Annual: {formatK(totalAnnual)}</span>}
        </div>
      </div>

      {lines.map((line, idx) => {
        const isVolume = ['per_volume', 'per_package'].includes(line.license_type)
        const qtyLabel = line.license_type === 'per_ccu' ? 'CCUs'
          : line.license_type === 'per_equipment' ? 'Equipments' : 'Qty'

        // ── DISTRIBUTOR VIEW — price read-only, only discount request editable ──
        if (isDistributor) {
          const unit = parseFloat(line.unit_price) || 0
          return (
            <div key={line._key || line.id || idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{line.product_name}</p>
                  <p className="text-micro text-gray-400">
                    {(getAllowedTypes(line).find(t => t.id === line.license_type) || {}).label || line.license_type}
                  </p>
                </div>
                <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 p-1 min-h-tap">
                  <X size={14}/>
                </button>
              </div>

              {/* Single contextual quantity driver */}
              <div>
                <label className="text-micro text-purple-500">
                  {isVolume ? 'Annual Studies (volume)' : qtyLabel}
                </label>
                <input className="input text-xs py-1 border-purple-200" type="number" min={isVolume ? 0 : 1}
                  value={isVolume ? (line.volume || '') : line.quantity}
                  onChange={e => updateLine(idx, isVolume ? 'volume' : 'quantity', e.target.value)}
                  placeholder={isVolume ? 'e.g. 50000' : '1'}/>
                {line.license_type === 'per_package' && line.package_size > 0 && (
                  <p className="text-micro text-gray-400 mt-0.5">
                    Billed in packages of {Number(line.package_size).toLocaleString()} — {line.quantity || 0} package(s)
                  </p>
                )}
              </div>

              {/* Price (read-only) + Net — discount is requested once at deal level */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-micro text-gray-400">{isVolume ? 'Price / study €' : 'Unit price €'}</label>
                  <div className="input text-xs py-1 bg-gray-100 text-gray-600 cursor-not-allowed">
                    {unit > 0 ? `€${unit}` : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-micro text-gray-700 font-semibold">{isVolume ? 'Annual €' : 'Net €'}</label>
                  <div className="input text-xs py-1 font-semibold bg-white text-gray-900">
                    {(parseFloat(line.net_price) || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Annual fee only relevant for CAPEX (flat/equipment), not volume subscription */}
              {!isVolume && Number(line.annual_fee) > 0 && (
                <p className="text-micro text-blue-600">Annual fee: €{Number(line.annual_fee).toLocaleString()}/yr</p>
              )}
              {isVolume && (parseFloat(line.net_price) || 0) > 0 && (
                <p className="text-micro text-blue-600">Annual recurring value: €{(parseFloat(line.net_price) || 0).toLocaleString()}/yr</p>
              )}
              {unit === 0 && (
                <p className="text-micro text-amber-600 bg-amber-50 rounded px-2 py-1">
                  No authorized price set for this product. Contact your account manager.
                </p>
              )}
            </div>
          )
        }

        // ── INTERNAL VIEW (admin/manager/member) — compact with expand ──
        return (
        <div key={line._key || line.id || idx} className="bg-gray-50 rounded-lg overflow-hidden">
          {/* Compact row: name + qty + net price + remove */}
          <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <p className="text-sm font-medium text-gray-800 truncate">{line.product_name || t?.('products_name') || '—'}</p>
              <span className="text-micro text-gray-400 shrink-0">×{line.quantity || 1}</span>
            </div>
            <span className="text-sm font-bold text-gray-900 shrink-0">{formatK(parseFloat(line.net_price) || 0)}</span>
            <button onClick={e => { e.stopPropagation(); removeLine(idx) }} className="text-gray-300 hover:text-red-500 p-1 min-h-tap shrink-0">
              <X size={12}/>
            </button>
          </div>

          {/* Expanded: full pricing detail */}
          {expandedIdx === idx && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-200">
          {!line.product_id && (
            <input className="input text-sm mt-2" value={line.product_name}
              onChange={e => updateLine(idx, 'product_name', e.target.value)}
              placeholder={t?.('products_name') || 'Product name'}/>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-micro text-gray-400">Licensing</label>
              <select className="select text-xs py-1" value={line.license_type || 'flat'}
                onChange={e => updateLine(idx, 'license_type', e.target.value)}>
                {getAllowedTypes(line).map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}
              </select>
            </div>
            {!isVolume && (
              <div>
                <label className="text-micro text-gray-400">{qtyLabel}</label>
                <input className="input text-xs py-1" type="number" min="1" value={line.quantity}
                  onChange={e => updateLine(idx, 'quantity', e.target.value)}/>
              </div>
            )}
          </div>

          {isVolume && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-micro text-purple-500">Annual Studies</label>
                <input className="input text-xs py-1 border-purple-200" type="number" value={line.volume || ''}
                  onChange={e => updateLine(idx, 'volume', e.target.value)}
                  placeholder="e.g. 50000"/>
              </div>
              {line.license_type === 'per_package' && (
                <div>
                  <label className="text-micro text-purple-500">Package Size</label>
                  <input className="input text-xs py-1 border-purple-200" type="number" value={line.package_size || ''}
                    onChange={e => updateLine(idx, 'package_size', e.target.value)}
                    placeholder="e.g. 10000"/>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            <div>
              <label className="text-micro text-gray-400">Cost €</label>
              <input className="input text-xs py-1" type="number" value={line.cost_price || line.unit_price}
                onChange={e => updateLine(idx, 'cost_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-micro text-green-500">Margin %</label>
              <input className="input text-xs py-1 border-green-200" type="number" min="0" value={line.margin_pct || 0}
                onChange={e => updateLine(idx, 'margin_pct', e.target.value)}/>
            </div>
            <div>
              <label className="text-micro text-gray-400">Sell €</label>
              <input className="input text-xs py-1" type="number" value={line.unit_price}
                onChange={e => updateLine(idx, 'unit_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-micro text-gray-400">Disc %</label>
              <input className="input text-xs py-1" type="number" min="0" max="100" value={line.discount_pct}
                onChange={e => updateLine(idx, 'discount_pct', e.target.value)}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-micro text-gray-700 font-semibold">Net Price €</label>
              <input className="input text-xs py-1 font-semibold bg-white" type="number" value={line.net_price}
                onChange={e => updateLine(idx, 'net_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-micro text-blue-500">Annual Fee €</label>
              <input className="input text-xs py-1 border-blue-200" type="number" value={line.annual_fee}
                onChange={e => updateLine(idx, 'annual_fee', e.target.value)}/>
            </div>
          </div>
          </div>
          )}
        </div>
        )
      })}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input className="input text-xs pl-7" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t?.('products_search') || 'Search catalog…'}
            style={{ fontSize: '16px' }}/>
          <Package size={12} className="absolute left-2.5 top-3 text-gray-400"/>

          {searchTerm && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {Object.entries(grouped).map(([cat, prods]) => (
                <div key={cat}>
                  <p className="text-micro text-gray-400 uppercase font-semibold px-3 pt-2 pb-1">{cat}</p>
                  {prods.map(p => (
                    <button key={p.id} onClick={() => addLine(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex justify-between items-center">
                      <span className="truncate">{p.name}</span>
                      <span className="text-gray-400 shrink-0 ml-2">
                        {p.license_fee > 0 ? formatK(p.license_fee) : ''}
                        {p.annual_fee > 0 ? ' +' + formatK(p.annual_fee) + '/yr' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">{t?.('no_results') || 'No results'}</p>
              )}
            </div>
          )}
        </div>
        {!isDistributor && (
          <button onClick={addCustomLine} className="btn-secondary text-xs px-3 shrink-0">
            <Plus size={12}/>
          </button>
        )}
      </div>
    </div>
  )
}
