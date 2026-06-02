import { describe, it, expect } from 'vitest'
import { canTransition, getAllowedTransitions } from '../stateMachine.js'

// ── Deal transitions ────────────────────────────────────────────────────

describe('canTransition — deal', () => {
  it('allows Lead → Pipeline', () => {
    expect(canTransition('deal', 'Lead', 'Pipeline')).toBe(true)
  })

  it('rejects Lead → Invoiced (invalid skip)', () => {
    expect(canTransition('deal', 'Lead', 'Invoiced')).toBe(false)
  })

  it('allows Lost → Lead (reopen)', () => {
    expect(canTransition('deal', 'Lost', 'Lead')).toBe(true)
  })

  it('allows Lead → Lost', () => {
    expect(canTransition('deal', 'Lead', 'Lost')).toBe(true)
  })

  it('rejects Pipeline → Invoiced (skip BackLog)', () => {
    expect(canTransition('deal', 'Pipeline', 'Invoiced')).toBe(false)
  })

  it('allows BackLog → Invoiced', () => {
    expect(canTransition('deal', 'BackLog', 'Invoiced')).toBe(true)
  })
})

describe('getAllowedTransitions — deal', () => {
  it('Lead can go to Pipeline and Lost', () => {
    const allowed = getAllowedTransitions('deal', 'Lead')
    expect(allowed).toContain('Pipeline')
    expect(allowed).toContain('Lost')
  })

  it('always includes the current state', () => {
    const allowed = getAllowedTransitions('deal', 'Lead')
    expect(allowed).toContain('Lead')
  })

  it('Invoiced can only go to Lost (plus itself)', () => {
    const allowed = getAllowedTransitions('deal', 'Invoiced')
    expect(allowed).toEqual(['Invoiced', 'Lost'])
  })
})

// ── SLA transitions ─────────────────────────────────────────────────────

describe('canTransition — sla', () => {
  it('allows draft → waiting_po', () => {
    expect(canTransition('sla', 'draft', 'waiting_po')).toBe(true)
  })

  it('rejects draft → active (must go through waiting_po or warranty)', () => {
    expect(canTransition('sla', 'draft', 'active')).toBe(false)
  })

  it('allows active → pending_renewal', () => {
    expect(canTransition('sla', 'active', 'pending_renewal')).toBe(true)
  })

  it('allows cancelled → draft (re-draft)', () => {
    expect(canTransition('sla', 'cancelled', 'draft')).toBe(true)
  })

  it('rejects expired → cancelled', () => {
    expect(canTransition('sla', 'expired', 'cancelled')).toBe(false)
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────

describe('canTransition — edge cases', () => {
  it('staying in the same state is always valid (deal)', () => {
    expect(canTransition('deal', 'Lead', 'Lead')).toBe(true)
    expect(canTransition('deal', 'Lost', 'Lost')).toBe(true)
    expect(canTransition('deal', 'Invoiced', 'Invoiced')).toBe(true)
  })

  it('staying in the same state is always valid (sla)', () => {
    expect(canTransition('sla', 'draft', 'draft')).toBe(true)
    expect(canTransition('sla', 'active', 'active')).toBe(true)
  })

  it('returns false for unknown type', () => {
    expect(canTransition('unknown', 'A', 'B')).toBe(false)
  })

  it('returns false for unknown fromState', () => {
    expect(canTransition('deal', 'Nonexistent', 'Pipeline')).toBe(false)
  })

  it('returns false for unknown toState', () => {
    expect(canTransition('deal', 'Lead', 'Nonexistent')).toBe(false)
  })

  it('getAllowedTransitions with unknown type returns only the current state', () => {
    expect(getAllowedTransitions('unknown', 'X')).toEqual(['X'])
  })

  it('getAllowedTransitions with unknown fromState returns only that state', () => {
    expect(getAllowedTransitions('deal', 'Nonexistent')).toEqual(['Nonexistent'])
  })
})
