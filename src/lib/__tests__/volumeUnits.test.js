import { describe, it, expect } from 'vitest'
import { volumeKeyFor, unitsNeeded, quantityFor, VOLUME_UNITS } from '../volumeUnits'

const DOSE   = { sku: 'CWM-DOSE',  price_unit: 'exam' }
const DOSE_OLD = { sku: 'CWM-DOSE', price_unit: 'study' }   // before the rename
const VR     = { sku: 'CWM-VR',    price_unit: 'radiologist' }
const AIREP  = { sku: 'CWM-AIREP', price_unit: 'report' }
const ES     = { sku: 'CWM-ES',    price_unit: 'procedure_room' }
const PACS   = { sku: 'SYN-PACS',  price_unit: null }

describe('volumeKeyFor', () => {
  it('treats study and exam as the same question', () => {
    // The rename lands row by row; both must resolve to one field or a
    // half-migrated database splits one number in two.
    expect(volumeKeyFor('exam')).toBe('exam')
    expect(volumeKeyFor('study')).toBe('exam')
    expect(volumeKeyFor('Studies')).toBe('exam')
  })

  it('keeps the other units distinct', () => {
    expect(volumeKeyFor('radiologist')).toBe('radiologist')
    expect(volumeKeyFor('report')).toBe('report')
    expect(volumeKeyFor('procedure_room')).toBe('procedure_room')
  })

  it('is null for a product with no unit', () => {
    expect(volumeKeyFor(null)).toBeNull()
    expect(volumeKeyFor('')).toBeNull()
    expect(volumeKeyFor('bananas')).toBeNull()
  })
})

describe('unitsNeeded', () => {
  it('always asks for the exam count', () => {
    // It drives Dose, the per-10k PACS blocks, and the volume a committed
    // report count is negotiated from.
    expect(unitsNeeded([]).map(u => u.key)).toEqual(['exam'])
    expect(unitsNeeded([PACS]).map(u => u.key)).toEqual(['exam'])
  })

  it('adds a field only when something on the quote needs it', () => {
    expect(unitsNeeded([DOSE]).map(u => u.key)).toEqual(['exam'])
    expect(unitsNeeded([DOSE, VR]).map(u => u.key)).toEqual(['exam', 'radiologist'])
    expect(unitsNeeded([AIREP, VR, ES]).map(u => u.key))
      .toEqual(['exam', 'report', 'radiologist', 'procedure_room'])
  })

  it('does not ask twice for the same question', () => {
    expect(unitsNeeded([DOSE, DOSE_OLD]).map(u => u.key)).toEqual(['exam'])
  })

  it('keeps the fields in a stable order', () => {
    const a = unitsNeeded([VR, AIREP]).map(u => u.key)
    const b = unitsNeeded([AIREP, VR]).map(u => u.key)
    expect(a).toEqual(b)
    expect(VOLUME_UNITS[0].key).toBe('exam')
  })
})

describe('quantityFor', () => {
  const volumes = { exam: '200000', radiologist: '20', report: '120000' }

  it('prices each product on its own number', () => {
    // This is the bug it exists to stop: VR must see 20, not 200,000.
    expect(quantityFor(DOSE, volumes)).toBe(200000)
    expect(quantityFor(VR, volumes)).toBe(20)
    expect(quantityFor(AIREP, volumes)).toBe(120000)
  })

  it('reads the old study unit off the exam field', () => {
    expect(quantityFor(DOSE_OLD, volumes)).toBe(200000)
  })

  it('is zero when the rep has not answered that field yet', () => {
    expect(quantityFor(ES, volumes)).toBe(0)
    expect(quantityFor(VR, {})).toBe(0)
    expect(quantityFor(VR, { radiologist: '' })).toBe(0)
    expect(quantityFor(VR, { radiologist: '0' })).toBe(0)
  })

  it('is zero for a product with no unit rather than guessing', () => {
    expect(quantityFor(PACS, volumes)).toBe(0)
  })
})
