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

  const isCapex = ['capex', 'hybrid'].includes(businessModel)
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
    const allowed = product?.allowed_license_types
    if (Array.isArray(allowed) && allowed.length > 0) return allowed[0]
    const name = (product?.name || '').toLowerCase()
    const sku = (product?.sku || '').toLowerCase()
    if (sku.includes('ccu') || name.includes('ccu')) return 'per_ccu'
    if (name.includes('cwm') || name.includes('connectivity')) return 'per_equipment'
    if (name.includes('per study') || name.includes('pay per')) return 'per_volume'
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
    const price = isCapex ? (product.license_fee || 0) : (product.annual_fee || 0)
    const lt = inferLicenseType(product)
    const newLine = {
      _key: Date.now() + Math.random(),
      product_id:    product.id,
      product_name:  product.name,
      license_type:  lt,
      quantity:      1,
      volume:        '',
      package_size:  lt === 'per_package' ? 10000 : '',
      unit_price:    price,
      cost_price:    price,
      margin_pct:    0,
      discount_pct:  0,
      net_price:     price,
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
      if (hasCapex && hasOpex) onBusinessModelInfer('hybrid')
      else if (hasOpex) onBusinessModelInfer('pay_per_study')
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

      {lines.map((line, idx) => (
        <div key={line._key || line.id || idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {line.product_id ? (
                <p className="text-sm font-medium text-gray-800 truncate">{line.product_name}</p>
              ) : (
                <input className="input text-sm" value={line.product_name}
                  onChange={e => updateLine(idx, 'product_name', e.target.value)}
                  placeholder={t?.('products_name') || 'Product name'}/>
              )}
            </div>
            <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 p-1 min-h-tap">
              <X size={14}/>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">Licensing</label>
              <select className="select text-xs py-1" value={line.license_type || 'flat'}
                onChange={e => updateLine(idx, 'license_type', e.target.value)}>
                {getAllowedTypes(line).map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">
                {line.license_type === 'per_ccu' ? 'CCUs' :
                 line.license_type === 'per_equipment' ? 'Equipments' : 'Qty'}
              </label>
              <input className="input text-xs py-1" type="number" min="1" value={line.quantity}
                onChange={e => updateLine(idx, 'quantity', e.target.value)}/>
            </div>
          </div>

          {['per_volume', 'per_package'].includes(line.license_type) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-purple-500">Annual Studies</label>
                <input className="input text-xs py-1 border-purple-200" type="number" value={line.volume || ''}
                  onChange={e => updateLine(idx, 'volume', e.target.value)}
                  placeholder="e.g. 50000"/>
              </div>
              {line.license_type === 'per_package' && (
                <div>
                  <label className="text-[10px] text-purple-500">Package Size</label>
                  <input className="input text-xs py-1 border-purple-200" type="number" value={line.package_size || ''}
                    onChange={e => updateLine(idx, 'package_size', e.target.value)}
                    placeholder="e.g. 10000"/>
                </div>
              )}
            </div>
          )}

          <div className={`grid gap-2 ${isDistributor ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
            {!isDistributor && (
              <>
                <div>
                  <label className="text-[10px] text-gray-400">Cost €</label>
                  <input className="input text-xs py-1" type="number" value={line.cost_price || line.unit_price}
                    onChange={e => updateLine(idx, 'cost_price', e.target.value)}/>
                </div>
                <div>
                  <label className="text-[10px] text-green-500">Margin %</label>
                  <input className="input text-xs py-1 border-green-200" type="number" min="0" value={line.margin_pct || 0}
                    onChange={e => updateLine(idx, 'margin_pct', e.target.value)}/>
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] text-gray-400">{isDistributor ? 'Price €' : 'Sell €'}</label>
              <input className="input text-xs py-1" type="number" value={line.unit_price}
                onChange={e => updateLine(idx, 'unit_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Disc %</label>
              <input className="input text-xs py-1" type="number" min="0" max="100" value={line.discount_pct}
                onChange={e => updateLine(idx, 'discount_pct', e.target.value)}/>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-700 font-semibold">Net Price €</label>
              <input className="input text-xs py-1 font-semibold bg-white" type="number" value={line.net_price}
                onChange={e => updateLine(idx, 'net_price', e.target.value)}/>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-blue-500">Annual Fee €</label>
            <input className="input text-xs py-1 border-blue-200" type="number" value={line.annual_fee}
              onChange={e => updateLine(idx, 'annual_fee', e.target.value)}/>
          </div>
        </div>
      ))}

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
                  <p className="text-[10px] text-gray-400 uppercase font-semibold px-3 pt-2 pb-1">{cat}</p>
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
