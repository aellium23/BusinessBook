import { describe, it, expect } from 'vitest'
import { validateDeal, validateSLA, validateTask, validateTender } from '../validation.js'

// ── validateDeal ────────────────────────────────────────────────────────

describe('validateDeal', () => {
  const validDeal = { bu: 'VGT', client: 'Acme Corp', stage: 'Lead' }

  it('returns valid for correct data', () => {
    const result = validateDeal(validDeal)
    expect(result.valid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  it('requires bu, client, and stage', () => {
    const result = validateDeal({})
    expect(result.valid).toBe(false)
    expect(result.errors.bu).toBeDefined()
    expect(result.errors.client).toBeDefined()
    expect(result.errors.stage).toBeDefined()
  })

  it('rejects empty/whitespace client', () => {
    const result = validateDeal({ bu: 'VGT', client: '   ', stage: 'Lead' })
    expect(result.valid).toBe(false)
    expect(result.errors.client).toBeDefined()
  })

  it('rejects negative value_total', () => {
    const result = validateDeal({ ...validDeal, value_total: -100 })
    expect(result.valid).toBe(false)
    expect(result.errors.value_total).toBeDefined()
  })

  it('accepts zero value_total', () => {
    const result = validateDeal({ ...validDeal, value_total: 0 })
    expect(result.valid).toBe(true)
  })

  it('rejects negative vgt_cost', () => {
    const result = validateDeal({ ...validDeal, vgt_cost: -5 })
    expect(result.valid).toBe(false)
    expect(result.errors.vgt_cost).toBeDefined()
  })

  it('rejects invalid currency', () => {
    const result = validateDeal({ ...validDeal, currency: 'XYZ' })
    expect(result.valid).toBe(false)
    expect(result.errors.currency).toBeDefined()
  })

  it('accepts allowed currencies', () => {
    for (const cur of ['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'CLP', 'MXN']) {
      const result = validateDeal({ ...validDeal, currency: cur })
      expect(result.valid).toBe(true)
    }
  })

  it('requires lost_reason when stage is Lost', () => {
    const result = validateDeal({ ...validDeal, stage: 'Lost' })
    expect(result.valid).toBe(false)
    expect(result.errors.lost_reason).toBeDefined()
  })

  it('accepts Lost stage with lost_reason', () => {
    const result = validateDeal({ ...validDeal, stage: 'Lost', lost_reason: 'Price' })
    expect(result.valid).toBe(true)
  })

  it('rejects win_probability > 100', () => {
    const result = validateDeal({ ...validDeal, win_probability: 150 })
    expect(result.valid).toBe(false)
    expect(result.errors.win_probability).toBeDefined()
  })

  it('rejects win_probability < 0', () => {
    const result = validateDeal({ ...validDeal, win_probability: -10 })
    expect(result.valid).toBe(false)
    expect(result.errors.win_probability).toBeDefined()
  })

  it('rejects client name exceeding 500 characters', () => {
    const result = validateDeal({ ...validDeal, client: 'A'.repeat(501) })
    expect(result.valid).toBe(false)
    expect(result.errors.client).toBeDefined()
  })

  it('rejects description exceeding 2000 characters', () => {
    const result = validateDeal({ ...validDeal, description: 'X'.repeat(2001) })
    expect(result.valid).toBe(false)
    expect(result.errors.description).toBeDefined()
  })

  it('accepts description exactly at limit', () => {
    const result = validateDeal({ ...validDeal, description: 'X'.repeat(2000) })
    expect(result.valid).toBe(true)
  })
})

// ── validateSLA ─────────────────────────────────────────────────────────

describe('validateSLA', () => {
  const validSLA = { bu: 'ECT', client: 'BigCo' }

  it('returns valid for correct data', () => {
    const result = validateSLA(validSLA)
    expect(result.valid).toBe(true)
  })

  it('requires bu and client', () => {
    const result = validateSLA({})
    expect(result.valid).toBe(false)
    expect(result.errors.bu).toBeDefined()
    expect(result.errors.client).toBeDefined()
  })

  it('rejects end_date before start_date', () => {
    const result = validateSLA({
      ...validSLA,
      start_date: '2025-06-01',
      end_date: '2025-05-01',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.end_date).toBeDefined()
  })

  it('rejects end_date equal to start_date', () => {
    const result = validateSLA({
      ...validSLA,
      start_date: '2025-06-01',
      end_date: '2025-06-01',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.end_date).toBeDefined()
  })

  it('accepts end_date after start_date', () => {
    const result = validateSLA({
      ...validSLA,
      start_date: '2025-06-01',
      end_date: '2025-12-31',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects negative annual_value', () => {
    const result = validateSLA({ ...validSLA, annual_value: -500 })
    expect(result.valid).toBe(false)
    expect(result.errors.annual_value).toBeDefined()
  })

  it('rejects invalid currency', () => {
    const result = validateSLA({ ...validSLA, currency: 'ZZZ' })
    expect(result.valid).toBe(false)
    expect(result.errors.currency).toBeDefined()
  })

  it('rejects client name exceeding 500 characters', () => {
    const result = validateSLA({ ...validSLA, client: 'B'.repeat(501) })
    expect(result.valid).toBe(false)
    expect(result.errors.client).toBeDefined()
  })
})

// ── validateTask ────────────────────────────────────────────────────────

describe('validateTask', () => {
  it('returns valid for a task with a title', () => {
    const result = validateTask({ title: 'Follow up with client' })
    expect(result.valid).toBe(true)
  })

  it('rejects empty title', () => {
    const result = validateTask({ title: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects whitespace-only title', () => {
    const result = validateTask({ title: '   ' })
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects missing title', () => {
    const result = validateTask({})
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects title exceeding 500 characters', () => {
    const result = validateTask({ title: 'T'.repeat(501) })
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects notes exceeding 2000 characters', () => {
    const result = validateTask({ title: 'OK', notes: 'N'.repeat(2001) })
    expect(result.valid).toBe(false)
    expect(result.errors.notes).toBeDefined()
  })
})

// ── validateTender ──────────────────────────────────────────────────────

describe('validateTender', () => {
  it('returns valid for a tender with a title', () => {
    const result = validateTender({ title: 'Government RFP' })
    expect(result.valid).toBe(true)
  })

  it('rejects missing title', () => {
    const result = validateTender({})
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects decision_date before submission_deadline', () => {
    const result = validateTender({
      title: 'Tender X',
      submission_deadline: '2025-06-15',
      decision_date: '2025-06-10',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.decision_date).toBeDefined()
  })

  it('accepts decision_date after submission_deadline', () => {
    const result = validateTender({
      title: 'Tender X',
      submission_deadline: '2025-06-15',
      decision_date: '2025-07-01',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects negative estimated_value', () => {
    const result = validateTender({ title: 'Tender X', estimated_value: -1000 })
    expect(result.valid).toBe(false)
    expect(result.errors.estimated_value).toBeDefined()
  })

  it('rejects invalid currency', () => {
    const result = validateTender({ title: 'Tender X', currency: 'ABC' })
    expect(result.valid).toBe(false)
    expect(result.errors.currency).toBeDefined()
  })
})
