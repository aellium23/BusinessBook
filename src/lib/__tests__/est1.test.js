import { describe, it, expect } from 'vitest'
import {
  productCategory, coreCategory, businessLine, dealByQuarter, dealByHalf,
  buildBaseIndex, classifyNewVsExisting, internalRegion,
  buildSalesByProduct, buildInternalSales, est1Deals,
} from '../est1'

const deal = (o) => ({ bu: 'VGT', stage: 'Pipeline', client: 'C', ...o })

describe('productCategory', () => {
  it('maps Synapse 3D before PACS/Synapse', () => {
    expect(productCategory(deal({ product: 'Synapse 3D' }))).toBe('Synapse 3D')
  })
  it('maps Synapse (not 3D) and CWM and PACS to PACS', () => {
    expect(productCategory(deal({ product: 'Synapse PACS' }))).toBe('PACS')
    expect(productCategory(deal({ product: 'CWM Dose' }))).toBe('PACS')
    expect(productCategory(deal({ product: 'PACS upgrade' }))).toBe('PACS')
  })
  it('maps VNA and RIS and Pathology', () => {
    expect(productCategory(deal({ product: 'VNA archive' }))).toBe('VNA')
    expect(productCategory(deal({ product: 'CWM RIS' }))).toBe('RIS')
    expect(productCategory(deal({ product: 'SYN Pathology' }))).toBe('Pathology/DP')
    expect(productCategory(deal({ product: 'DP Extential' }))).toBe('Pathology/DP')
  })
  it('falls back to Others', () => {
    expect(productCategory(deal({ product: 'Command Center' }))).toBe('Others')
    expect(productCategory(deal({ product: '' }))).toBe('Others')
  })
})

describe('coreCategory', () => {
  it('detects core products', () => {
    expect(coreCategory(deal({ product: 'PACS' }))).toBe('PACS')
    expect(coreCategory(deal({ product: 'VNA' }))).toBe('VNA')
    expect(coreCategory(deal({ product: 'Digital Pathology' }))).toBe('DP')
    expect(coreCategory(deal({ product: 'CV suite' }))).toBe('CV')
    expect(coreCategory(deal({ product: 'EIS' }))).toBe('EIS')
  })
  it('returns null for non-core or empty', () => {
    expect(coreCategory(deal({ product: 'Synapse 3D' }))).toBe(null)
    expect(coreCategory(deal({ product: '' }))).toBe(null)
  })
})

describe('businessLine', () => {
  it('SLA → maintenance', () => {
    expect(businessLine(deal({ is_sla: true }))).toBe('maintenance')
    expect(businessLine(deal({ converted_to_sla: true }))).toBe('maintenance')
  })
  it('recurring business model → opex (incl. legacy)', () => {
    expect(businessLine(deal({ business_model: 'pay_per_study' }))).toBe('opex')
    expect(businessLine(deal({ business_model: 'subscription' }))).toBe('opex')
    expect(businessLine(deal({ business_model: 'saas' }))).toBe('opex') // legacy → subscription
  })
  it('everything else → product', () => {
    expect(businessLine(deal({ business_model: 'capex' }))).toBe('product')
    expect(businessLine(deal({ business_model: 'one_shot' }))).toBe('product')
    expect(businessLine(deal({}))).toBe('product')
  })
  it('maintenance wins over recurring model', () => {
    expect(businessLine(deal({ is_sla: true, business_model: 'subscription' }))).toBe('maintenance')
  })
})

describe('dealByQuarter', () => {
  it('uses monthly spread when present', () => {
    const r = dealByQuarter(deal({ apr: 100, sep: 50, mar: 25, value_total: 999 }))
    expect(r.quarters).toEqual([100, 50, 0, 25])
    expect(r.unallocated).toBe(0)
  })
  it('falls back to value_total in rec_month quarter', () => {
    const r = dealByQuarter(deal({ value_total: 200, rec_month: 'Oct' }))
    expect(r.quarters).toEqual([0, 0, 200, 0])
    expect(r.unallocated).toBe(0)
  })
  it('reports unallocated when no spread and no rec_month', () => {
    const r = dealByQuarter(deal({ value_total: 300 }))
    expect(r.quarters).toEqual([0, 0, 0, 0])
    expect(r.unallocated).toBe(300)
  })
})

describe('dealByHalf', () => {
  it('splits monthly spread into halves', () => {
    expect(dealByHalf(deal({ jun: 100, dec: 40 })).halves).toEqual([100, 40])
  })
})

describe('new vs existing business', () => {
  const deals = [
    deal({ id: '1', client: 'Hosp A', product: 'PACS', stage: 'Invoiced' }),
    deal({ id: '2', client: 'Hosp A', product: 'PACS', stage: 'Pipeline' }),
    deal({ id: '3', client: 'Hosp B', product: 'VNA', stage: 'Pipeline' }),
    deal({ id: '4', client: 'Hosp A', product: 'VNA', stage: 'Pipeline' }),
  ]
  const idx = buildBaseIndex(deals)
  it('repeat core sale to existing owner → existing', () => {
    expect(classifyNewVsExisting(deals[1], idx)).toBe('existing') // A already owns PACS
  })
  it('first core sale → new', () => {
    expect(classifyNewVsExisting(deals[2], idx)).toBe('new') // B has nothing
    expect(classifyNewVsExisting(deals[3], idx)).toBe('new')  // A owns PACS but not VNA
  })
  it('the invoiced deal itself is not its own prior base → new', () => {
    expect(classifyNewVsExisting(deals[0], idx)).toBe('new')
  })
  it('maintenance / non-core → existing', () => {
    expect(classifyNewVsExisting(deal({ product: 'PACS', is_sla: true }), idx)).toBe('existing')
    expect(classifyNewVsExisting(deal({ product: 'Command Center' }), idx)).toBe('existing')
  })
})

describe('internalRegion', () => {
  it('maps Spain/ECT, UK, Middle East, Mexico, LatAm', () => {
    expect(internalRegion(deal({ client: 'ECT Spain' }))).toBe('Spain')
    expect(internalRegion(deal({ country: 'Spain' }))).toBe('Spain')
    expect(internalRegion(deal({ client: 'FUJIFILM Healthcare UK' }))).toBe('UK')
    expect(internalRegion(deal({ client: 'FUJIFILM MIDDLE EAST FZE' }))).toBe('Middle East')
    expect(internalRegion(deal({ country: 'Mexico' }))).toBe('Mexico')
    expect(internalRegion(deal({ country: 'Colombia' }))).toBe('Other Latin America')
    expect(internalRegion(deal({ country: 'Germany' }))).toBe('Other Europe')
    expect(internalRegion(deal({ country: 'Japan' }))).toBe('Other regions')
  })
})

describe('buildSalesByProduct', () => {
  const deals = [
    deal({ id: '1', bu: 'VGT', client: 'A', product: 'PACS', stage: 'Invoiced', apr: 100, may: 0, jun: 0 }),
    deal({ id: '2', bu: 'VGT', client: 'A', product: 'PACS', stage: 'Pipeline', jul: 50 }),
    deal({ id: '3', bu: 'VGT', client: 'B', product: 'VNA', stage: 'Pipeline', value_total: 200, rec_month: 'Oct' }),
    deal({ id: '4', bu: 'VGT', client: 'C', is_sla: true, stage: 'Pipeline', value_total: 30, rec_month: 'Dec' }),
    deal({ id: '5', bu: 'VGT', client: 'D', business_model: 'subscription', stage: 'Pipeline', value_total: 12, rec_month: 'Jan' }),
    deal({ id: '6', bu: 'VGT', client: 'E', product: 'PACS', stage: 'Lost', apr: 999 }), // excluded
    deal({ id: '7', bu: 'ECT', client: 'F', product: 'PACS', stage: 'Pipeline', apr: 500 }), // other BU
  ]
  const r = buildSalesByProduct(deals, 'VGT')
  it('aggregates product sales into quarters', () => {
    expect(r.products.PACS).toEqual([100, 50, 0, 0])
    expect(r.products.VNA).toEqual([0, 0, 200, 0])
  })
  it('separates maintenance and opex lines', () => {
    expect(r.maintenance).toEqual([0, 0, 30, 0])
    expect(r.opex).toEqual([0, 0, 0, 12])
  })
  it('excludes Lost and other BUs', () => {
    expect(r.products.PACS[0]).toBe(100) // not 100+999+500
  })
  it('total = product + maintenance + opex', () => {
    expect(r.total).toEqual([100, 50, 230, 12])
  })
  it('new vs existing splits sum to total', () => {
    const sum = r.newBusiness.map((v, i) => v + r.existingBase[i])
    expect(sum).toEqual(r.total)
  })
})

describe('buildInternalSales', () => {
  const deals = [
    deal({ id: '1', bu: 'VGT', sales_type: 'Internal', country: 'Mexico', value_total: 100, rec_month: 'May' }),
    deal({ id: '2', bu: 'VGT', sales_type: 'Internal', country: 'United Kingdom', value_total: 60, rec_month: 'Nov' }),
    deal({ id: '3', bu: 'VGT', sales_type: 'External', country: 'Portugal', value_total: 999, rec_month: 'May' }), // excluded
  ]
  const r = buildInternalSales(deals, 'VGT')
  it('aggregates internal deals by region and half', () => {
    expect(r.regions.Mexico).toEqual([100, 0])
    expect(r.regions.UK).toEqual([0, 60])
    expect(r.total).toEqual([100, 60])
  })
})

describe('est1Deals', () => {
  it('keeps BU, drops mirrors and Lost', () => {
    const ds = [
      deal({ bu: 'VGT', stage: 'Pipeline' }),
      deal({ bu: 'VGT', stage: 'Lost' }),
      deal({ bu: 'VGT', stage: 'Pipeline', is_intercompany_mirror: true }),
      deal({ bu: 'ECT', stage: 'Pipeline' }),
    ]
    expect(est1Deals(ds, 'VGT')).toHaveLength(1)
  })
})
