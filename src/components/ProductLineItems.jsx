import { useState, useMemo } from 'react'
import { Plus, X, Package } from 'lucide-react'
import { formatK } from './ui'

export default function ProductLineItems({ lines, onChange, products, businessModel, t }) {
  const [searchTerm, setSearchTerm] = useState('')

  const isCapex = ['capex', 'hybrid'].includes(businessModel)
  const isOpex  = ['opex', 'saas', 'hybrid'].includes(businessModel)

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products
    const s = searchTerm.toLowerCase()
    return products.filter(p =>
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

  function addLine(product) {
    const price = isCapex ? (product.license_fee || 0) : (product.annual_fee || 0)
    const newLine = {
      _key: Date.now() + Math.random(),
      product_id:   product.id,
      product_name: product.name,
      quantity:     1,
      unit_price:   price,
      discount_pct: 0,
      net_price:    price,
      annual_fee:   product.annual_fee || 0,
      notes:        '',
    }
    onChange([...lines, newLine])
    setSearchTerm('')
  }

  function addCustomLine() {
    const newLine = {
      _key: Date.now() + Math.random(),
      product_id:   null,
      product_name: '',
      quantity:     1,
      unit_price:   0,
      discount_pct: 0,
      net_price:    0,
      annual_fee:   0,
      notes:        '',
    }
    onChange([...lines, newLine])
  }

  function updateLine(idx, field, value) {
    const updated = [...lines]
    const line = { ...updated[idx] }

    if (field === 'unit_price') {
      const price = parseFloat(value) || 0
      line.unit_price = price
      line.net_price = price * (1 - (line.discount_pct || 0) / 100) * (line.quantity || 1)
    } else if (field === 'discount_pct') {
      const disc = Math.min(100, Math.max(0, parseFloat(value) || 0))
      line.discount_pct = disc
      line.net_price = (line.unit_price || 0) * (1 - disc / 100) * (line.quantity || 1)
    } else if (field === 'quantity') {
      const qty = parseInt(value) || 1
      line.quantity = qty
      line.net_price = (line.unit_price || 0) * (1 - (line.discount_pct || 0) / 100) * qty
    } else if (field === 'net_price') {
      const net = parseFloat(value) || 0
      line.net_price = net
      const totalUnit = (line.unit_price || 0) * (line.quantity || 1)
      line.discount_pct = totalUnit > 0 ? Math.round((1 - net / totalUnit) * 10000) / 100 : 0
    } else {
      line[field] = value
    }

    updated[idx] = line
    onChange(updated)
  }

  function removeLine(idx) {
    onChange(lines.filter((_, i) => i !== idx))
  }

  const totalLicense = lines.reduce((s, l) => s + (parseFloat(l.net_price) || 0), 0)
  const totalAnnual  = lines.reduce((s, l) => s + (parseFloat(l.annual_fee) || 0) * (parseInt(l.quantity) || 1), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
          <Package size={12}/> {t?.('products_title') || 'Products'} ({lines.length})
        </p>
        {totalLicense > 0 && (
          <div className="flex gap-3 text-xs">
            {isCapex && <span className="text-gray-600 font-semibold">{t?.('products_license') || 'License'}: {formatK(totalLicense)}</span>}
            {totalAnnual > 0 && <span className="text-blue-600">{t?.('products_annual') || 'Annual'}: {formatK(totalAnnual)}</span>}
          </div>
        )}
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

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">Qty</label>
              <input className="input text-xs py-1" type="number" min="1" value={line.quantity}
                onChange={e => updateLine(idx, 'quantity', e.target.value)}/>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">{t?.('products_license') || 'Unit €'}</label>
              <input className="input text-xs py-1" type="number" value={line.unit_price}
                onChange={e => updateLine(idx, 'unit_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Disc %</label>
              <input className="input text-xs py-1" type="number" min="0" max="100" value={line.discount_pct}
                onChange={e => updateLine(idx, 'discount_pct', e.target.value)}/>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Net €</label>
              <input className="input text-xs py-1 font-semibold" type="number" value={line.net_price}
                onChange={e => updateLine(idx, 'net_price', e.target.value)}/>
            </div>
          </div>

          {(isCapex || line.annual_fee > 0) && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-blue-500">{t?.('products_annual') || 'Annual Fee'} €</label>
                <input className="input text-xs py-1 border-blue-200" type="number" value={line.annual_fee}
                  onChange={e => updateLine(idx, 'annual_fee', e.target.value)}/>
              </div>
            </div>
          )}
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
                        {isCapex && p.license_fee > 0 ? formatK(p.license_fee) : ''}
                        {isOpex && p.annual_fee > 0 ? formatK(p.annual_fee) + '/yr' : ''}
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
        <button onClick={addCustomLine} className="btn-secondary text-xs px-3 shrink-0">
          <Plus size={12}/> Custom
        </button>
      </div>
    </div>
  )
}
