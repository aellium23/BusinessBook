import { describe, it, expect } from 'vitest'
import {
  authKey, authMapOf, authorisedProducts, hasAuthorisations, authorisedCountries,
  partnerLineCost,
} from '../partnerCatalogue'
import { partnerTargetPrice, partnerEconomics } from '../partnerMargin'

// TIMED, as the user describes them: four products and nothing else.
const CATALOGUE = [
  { id: 'p1', sku: 'CWM-DOSE',  name: 'CWM Dose',         license_fee: 0.53 },
  { id: 'p2', sku: 'CWM-AIREP', name: 'CWM AI Reporting', license_fee: 0.95 },
  { id: 'p3', sku: 'CWM-VR',    name: 'CWM VR',           license_fee: 500 },
  { id: 'p4', sku: 'MEDPORTAL', name: 'Medportal',        license_fee: 1000 },
  { id: 'p5', sku: 'SYN-PACS',  name: 'Synapse PACS',     license_fee: 31602 },
  { id: 'p6', sku: 'SYN-VNA',   name: 'Synapse VNA',      license_fee: 12000 },
]

const TIMED = authMapOf([
  { product_id: 'p1', country: 'Chile', price: 0.49, active: true },
  { product_id: 'p2', country: 'Chile', price: null, active: true },
  { product_id: 'p3', country: 'Chile', price: 460, active: true },
  { product_id: 'p4', country: 'Chile', price: 900, active: true },
  { product_id: 'p1', country: 'Peru',  price: 0.52, active: true },
])

describe('what a partner may quote', () => {
  it('is their four products, not the catalogue', () => {
    const list = authorisedProducts(CATALOGUE, TIMED, 'Chile')
    expect(list.map(p => p.sku)).toEqual(['CWM-DOSE', 'CWM-AIREP', 'CWM-VR', 'MEDPORTAL'])
  })

  it('never leaks a product they are not authorised for', () => {
    const list = authorisedProducts(CATALOGUE, TIMED, 'Chile')
    expect(list.find(p => p.sku === 'SYN-PACS')).toBeUndefined()
    expect(list.find(p => p.sku === 'SYN-VNA')).toBeUndefined()
  })

  it('is authorised per country, not per company', () => {
    // Authorised for Dose in Peru only.
    expect(authorisedProducts(CATALOGUE, TIMED, 'Peru').map(p => p.sku)).toEqual(['CWM-DOSE'])
  })

  it('is empty in a country they were never authorised in', () => {
    expect(authorisedProducts(CATALOGUE, TIMED, 'Colombia')).toEqual([])
  })

  it('is empty with no country, rather than everything', () => {
    // "No rows yet" and "everything" are one typo apart, and only one of them
    // is safe.
    expect(authorisedProducts(CATALOGUE, TIMED, '')).toEqual([])
    expect(authorisedProducts(CATALOGUE, TIMED, null)).toEqual([])
  })

  it('is empty for a partner with no authorisations at all', () => {
    expect(authorisedProducts(CATALOGUE, {}, 'Chile')).toEqual([])
    expect(hasAuthorisations({})).toBe(false)
    expect(hasAuthorisations(TIMED)).toBe(true)
  })
})

describe('the price a partner sees', () => {
  it('is the price agreed with them, where one is set', () => {
    const list = authorisedProducts(CATALOGUE, TIMED, 'Chile')
    expect(list.find(p => p.sku === 'CWM-DOSE').license_fee).toBe(0.49)
    expect(list.find(p => p.sku === 'CWM-VR').license_fee).toBe(460)
  })

  it('falls back to the regional list where none is set', () => {
    expect(authorisedProducts(CATALOGUE, TIMED, 'Chile')
      .find(p => p.sku === 'CWM-AIREP').license_fee).toBe(0.95)
  })

  it('treats a zero price as unfilled, not as free', () => {
    const map = authMapOf([{ product_id: 'p1', country: 'Chile', price: 0, active: true }])
    expect(authorisedProducts(CATALOGUE, map, 'Chile')[0].license_fee).toBe(0.53)
  })

  it('differs by country for the same product', () => {
    expect(authorisedProducts(CATALOGUE, TIMED, 'Peru')[0].license_fee).toBe(0.52)
  })
})

describe('what a partner pays us', () => {
  const DOSE = { price_basis: 'per_unit' }
  const PACS = { price_basis: 'flat' }

  it('is the regional list less their channel rate', () => {
    // R3, 20,000 exams. The ladder has been walked and this is where it lands —
    // but the ladder is the CUSTOMER's price, so a Full VAR buys at 60% of it.
    expect(partnerLineCost({
      product: DOSE, pinnedUnit: 0, listedNet: 9180.32, quantity: 20000, channelPct: 40,
    })).toBe(5508.19)
  })

  it('sells at our own list when the partner quotes at their rate', () => {
    // The property that matters, and the one whose absence sent a customer a
    // price 54% above ours: buy at 60 of 100, sell at 40% margin, land on 100.
    const cost = partnerLineCost({
      product: DOSE, pinnedUnit: 0, listedNet: 13114.75, quantity: 20000, channelPct: 40,
    })
    expect(cost).toBe(7868.85)
    expect(partnerTargetPrice(cost, 40)).toBe(13114.75)
  })

  it('does not invent a discount for an arrangement nobody has recorded', () => {
    // No rate is not 40%. It is list, which is too expensive rather than free —
    // and the deal card says the role is unset, which is the thing to fix.
    expect(partnerLineCost({ product: DOSE, pinnedUnit: 0, listedNet: 9180.32, quantity: 20000 }))
      .toBe(9180.32)
  })

  it('is not zero just because nobody pinned a price for them', () => {
    // The fault this replaced: a partner with no per-product authorisation
    // price saw a cost of zero, and therefore a margin of 100%.
    expect(partnerLineCost({
      product: DOSE, pinnedUnit: null, listedNet: 9180.32, quantity: 20000, channelPct: 40,
    })).toBeGreaterThan(0)
  })

  it('lets a pinned price overrule the ladder, because somebody agreed it', () => {
    // And does not take the rate off it a second time: a negotiated price for
    // that partner in that country IS the transfer price.
    expect(partnerLineCost({
      product: DOSE, pinnedUnit: 0.4, listedNet: 9180.32, quantity: 20000, channelPct: 40,
    })).toBe(8000)
  })

  it('does not multiply a flat price by the volume', () => {
    expect(partnerLineCost({
      product: PACS, pinnedUnit: 31602, listedNet: 40000, quantity: 200000, channelPct: 40,
    })).toBe(31602)
  })

  it('is zero only when there is no ladder and no pinned price', () => {
    // Which the screen has to flag rather than present as a free product.
    expect(partnerLineCost({
      product: DOSE, pinnedUnit: 0, listedNet: 0, quantity: 20000, channelPct: 40,
    })).toBe(0)
  })
})

/**
 * The two screens, forced to agree.
 *
 * Our own quote for a TIMED deal and TIMED's own quote for the same deal are
 * built by different code from different starting points, and for a while they
 * disagreed by the partner's whole margin without either side noticing: ours
 * said the customer paid 65.6k and theirs said 100.9k. Nothing tested the pair,
 * because each was internally consistent. This does.
 */
describe('our view of a partner deal and the partner\'s view of it', () => {
  const DOSE = { price_basis: 'per_unit' }
  const LIST = 13114.75      // R3 CWM Dose, one year, at this volume
  const YEARS = 5

  it('reaches the same customer price, transfer and partner margin', () => {
    // Their screen: what they pay us, and what they quote on top of it.
    const theirCost = partnerLineCost({
      product: DOSE, pinnedUnit: 0, listedNet: LIST, quantity: 20000, channelPct: 40,
    }) * YEARS
    const theirPrice = partnerTargetPrice(theirCost, 40)

    // Ours: the same deal read from the list price down.
    const ours = partnerEconomics({
      listPrice: LIST * YEARS, netPrice: LIST * YEARS, role: 'full_var',
    })

    expect(theirPrice).toBeCloseTo(LIST * YEARS, 2)
    expect(theirCost).toBeCloseTo(ours.transfer, 2)
    expect(theirPrice - theirCost).toBeCloseTo(ours.partnerMargin, 2)
    expect(ours.partnerMarginPct).toBe(40)
  })
})

describe('an authorisation that was switched off', () => {
  it('is not an authorisation', () => {
    const map = authMapOf([
      { product_id: 'p1', country: 'Chile', price: 0.49, active: false },
      { product_id: 'p2', country: 'Chile', price: 0.9, active: true },
    ])
    expect(authorisedProducts(CATALOGUE, map, 'Chile').map(p => p.sku)).toEqual(['CWM-AIREP'])
  })
})

describe('where a partner can sell', () => {
  it('lists the countries they are authorised in', () => {
    expect(authorisedCountries(TIMED)).toEqual(['Chile', 'Peru'])
  })
})

describe('authKey', () => {
  it('keys on both halves, because either alone is wrong', () => {
    expect(authKey('p1', 'Chile')).toBe('p1_Chile')
    expect(authKey('p1', 'Chile')).not.toBe(authKey('p1', 'Peru'))
  })
})
