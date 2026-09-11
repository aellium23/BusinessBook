import { describe, it, expect } from 'vitest'
import {
  authKey, authMapOf, authorisedProducts, hasAuthorisations, authorisedCountries,
  partnerLineCost,
} from '../partnerCatalogue'

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

  it('is the regional list at the tier the volume reaches', () => {
    // R3, 20,000 exams: the ladder has already been walked, and this is it.
    expect(partnerLineCost({ product: DOSE, pinnedUnit: 0, listedNet: 9180.32, quantity: 20000 }))
      .toBe(9180.32)
  })

  it('is not zero just because nobody pinned a price for them', () => {
    // The fault this replaced: a partner with no per-product authorisation
    // price saw a cost of zero, and therefore a margin of 100%.
    expect(partnerLineCost({ product: DOSE, pinnedUnit: null, listedNet: 9180.32, quantity: 20000 }))
      .toBeGreaterThan(0)
  })

  it('lets a pinned price overrule the ladder, because somebody agreed it', () => {
    expect(partnerLineCost({ product: DOSE, pinnedUnit: 0.4, listedNet: 9180.32, quantity: 20000 }))
      .toBe(8000)
  })

  it('does not multiply a flat price by the volume', () => {
    expect(partnerLineCost({ product: PACS, pinnedUnit: 31602, listedNet: 40000, quantity: 200000 }))
      .toBe(31602)
  })

  it('is zero only when there is no ladder and no pinned price', () => {
    // Which the screen has to flag rather than present as a free product.
    expect(partnerLineCost({ product: DOSE, pinnedUnit: 0, listedNet: 0, quantity: 20000 })).toBe(0)
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
