import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEAL_TRANSITIONS, getAllowedTransitions } from '../stateMachine'
import { DIST_STAGES } from '../../constants'
import { numOrNull } from '../numbers'

/**
 * The stage machine exists twice, and this is the only thing stopping the copies
 * from drifting.
 *
 * It has to exist twice: the form draws a select from it before any request is
 * made, and the database has to hold it because a select is not a control — a
 * direct API call moved a Lead to Invoiced. Two copies of a rule is one more
 * than anybody wants. Two copies that are diffed on every test run is the best
 * available answer, and it fails the build the moment somebody edits one.
 */
describe('the deal stage machine, in both places it is written', () => {
  const sql = readFileSync(
    new URL('../../../supabase_migration_20260911_write_guards.sql', import.meta.url), 'utf8')

  /** The seeded pairs, read back out of the migration itself. */
  const fromSql = () => {
    const block = sql.match(/insert into public\.deal_stage_transitions[^;]*;/)
    expect(block, 'the migration seeds the transition table').toBeTruthy()
    const pairs = [...block[0].matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
      .map(([, from, to]) => `${from} → ${to}`)
    return new Set(pairs)
  }

  const fromJs = () => new Set(
    Object.entries(DEAL_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map(to => `${from} → ${to}`)))

  it('says exactly the same thing in the migration and in stateMachine.js', () => {
    const sqlPairs = fromSql()
    const jsPairs = fromJs()
    // Named individually, because "sets differ" is not a message anybody can act
    // on at eight in the morning.
    expect([...jsPairs].filter(p => !sqlPairs.has(p)),
      'in the app but not in the database').toEqual([])
    expect([...sqlPairs].filter(p => !jsPairs.has(p)),
      'in the database but not in the app').toEqual([])
  })

  it('keeps Invoiced terminal except for a correction', () => {
    expect(DEAL_TRANSITIONS['Invoiced']).toEqual(['Lost'])
    expect(fromSql().has('Invoiced → Lost')).toBe(true)
    expect(fromSql().has('Lead → Invoiced')).toBe(false)
  })

  /**
   * The form intersects a distributor's four stages with the allowed moves, and
   * for months that intersection from a Lead was "Lost" and nothing else. Two
   * lists, each defensible alone, that together said a partner may abandon a
   * deal and may not advance one. Nothing was testing the intersection — so
   * this does, from every stage they have rather than only the one that broke.
   */
  it('leaves a distributor a way forward from every stage they have', () => {
    const forward = { 'Lead': 'Offer Presented', 'Offer Presented': 'BackLog' }
    for (const stage of DIST_STAGES) {
      const open = getAllowedTransitions('deal', stage)
        .filter(s => s !== stage && DIST_STAGES.includes(s))
      expect(open, `a distributor on "${stage}" can move`).not.toEqual([])
      // And not only to Lost: giving up is not a way forward.
      if (forward[stage]) expect(open).toContain(forward[stage])
    }
  })

  it('guards the stage column and the cost columns, and nothing else', () => {
    expect(sql).toMatch(/before update of stage on public\.deals/)
    expect(sql).toMatch(/before insert or update on public\.deal_products/)
    // INSERT on deals is deliberately unguarded: a deal can start anywhere.
    expect(sql).not.toMatch(/before insert[^\n]*on public\.deals/)
  })
})

/**
 * Unknown cost is null, and it took a trigger to notice it was not.
 *
 * `parseFloat(null) || 0` is 0. Every partner save sends `cost_price: null`, so
 * every partner save was writing a cost of zero — which reads as "free to
 * deliver" and produces a margin of 100%. The exact lie every screen in this app
 * has been taught to refuse, written into the table by the helper that saves it.
 */
describe('a cost nobody has given us', () => {
  it('is null, not zero', () => {
    expect(numOrNull(null)).toBe(null)
    expect(numOrNull(undefined)).toBe(null)
    expect(numOrNull('')).toBe(null)
    expect(numOrNull('not a number')).toBe(null)
  })

  it('keeps a real zero, which is a different statement', () => {
    expect(numOrNull(0)).toBe(0)
    expect(numOrNull('0')).toBe(0)
  })

  it('keeps the numbers it is given', () => {
    expect(numOrNull(9180.32)).toBe(9180.32)
    expect(numOrNull('9180.32')).toBe(9180.32)
  })
})
