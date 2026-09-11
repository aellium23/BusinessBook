import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEAL_TRANSITIONS, SLA_TRANSITIONS, getAllowedTransitions } from '../stateMachine'
import { DIST_STAGES, SLA_STATUSES, SLA_PIPELINE_STATUSES, SLA_ACTIVE_STATUSES } from '../../constants'
import { numOrNull } from '../numbers'

/**
 * The seeded pairs of one transition table, read out of the migration itself.
 *
 * Line comments are stripped first, and that is not tidiness: a semicolon
 * inside a `--` comment ends the `[^;]*` match early, and the first version of
 * this silently read fifteen of seventeen pairs. The test failed, which is the
 * system working — but a reader would have gone hunting in the wrong file.
 */
function seededPairs(sql, table) {
  const bare = sql.replace(/--[^\n]*/g, '')
  const block = bare.match(new RegExp(`insert into public\\.${table}[^;]*;`))
  if (!block) return null
  return new Set([...block[0].matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
    .map(([, from, to]) => `${from} → ${to}`))
}

/** The same rule as the app writes it, in the same shape. */
function jsPairs(map) {
  return new Set(Object.entries(map).flatMap(([from, tos]) => tos.map(to => `${from} → ${to}`)))
}

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

  const fromSql = () => {
    const pairs = seededPairs(sql, 'deal_stage_transitions')
    expect(pairs, 'the migration seeds the transition table').toBeTruthy()
    return pairs
  }
  const fromJs = () => jsPairs(DEAL_TRANSITIONS)

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

/**
 * The contract lifecycle, same treatment.
 *
 * June's item #7 asked for both machines and only the deals one was built. A
 * contract moved from `draft` straight to `active` by a direct call skips the
 * PO entirely, and from there it counts towards the recurring revenue on the
 * dashboard and towards the EST1 — a number nobody typed and nobody can trace.
 */
describe('the contract status machine, in both places it is written', () => {
  const sql = readFileSync(
    new URL('../../../supabase_migration_20260911_sla_guards.sql', import.meta.url), 'utf8')

  const fromSql = () => {
    const pairs = seededPairs(sql, 'sla_status_transitions')
    expect(pairs, 'the migration seeds the transition table').toBeTruthy()
    return pairs
  }
  const fromJs = () => jsPairs(SLA_TRANSITIONS)

  it('says exactly the same thing in the migration and in stateMachine.js', () => {
    const sqlPairs = fromSql()
    const jsPairs = fromJs()
    expect([...jsPairs].filter(p => !sqlPairs.has(p)),
      'in the app but not in the database').toEqual([])
    expect([...sqlPairs].filter(p => !jsPairs.has(p)),
      'in the database but not in the app').toEqual([])
  })

  /**
   * Every status the machine names must also be one the app can draw, or the
   * select renders empty and the contract is stuck — the same failure the
   * distributors hit on Lead, in a different machine.
   */
  it('only names statuses the app actually has', () => {
    const known = new Set(SLA_STATUSES.map(s => s.id))
    const named = new Set(Object.entries(SLA_TRANSITIONS).flatMap(([f, ts]) => [f, ...ts]))
    expect([...named].filter(s => !known.has(s)), 'in the machine but not in SLA_STATUSES').toEqual([])
  })

  it('leaves every status a way out, so nothing is a dead end', () => {
    for (const s of SLA_STATUSES.map(x => x.id)) {
      expect(getAllowedTransitions('sla', s).filter(x => x !== s),
        `"${s}" has somewhere to go`).not.toEqual([])
    }
  })

  it('guards the status column and nothing else', () => {
    expect(sql).toMatch(/before update of status on public\.slas/)
    // INSERT stays open: a contract can reach us already active.
    expect(sql).not.toMatch(/before insert[^\n]*on public\.slas/)
  })
})

/**
 * A status that does not exist matched nothing, and nothing said so.
 *
 * Three screens filtered contracts with `status === 'pipeline'`. There is no
 * `pipeline` status — it is the id of a TAB on the contracts page, whose
 * contents are draft plus waiting_po. The id of a tab, used as the value of a
 * column. It matched nothing, so two dashboard figures were structurally zero,
 * and a zero reads as "no recurring pipeline" rather than as a broken sum.
 *
 * Confirmed against the database on 11-09: only the eight statuses exist.
 */
describe('the status groups the screens filter on', () => {
  const known = new Set(SLA_STATUSES.map(s => s.id))

  it('name only statuses that exist', () => {
    expect([...SLA_PIPELINE_STATUSES].filter(s => !known.has(s)), 'pipeline group').toEqual([])
    expect([...SLA_ACTIVE_STATUSES].filter(s => !known.has(s)), 'active group').toEqual([])
  })

  it('does not call a tab id a status', () => {
    expect(known.has('pipeline')).toBe(false)
    expect(SLA_PIPELINE_STATUSES).toEqual(['draft', 'waiting_po'])
  })

  it('keeps the two groups apart, because a contract is in one or the other', () => {
    expect(SLA_PIPELINE_STATUSES.filter(s => SLA_ACTIVE_STATUSES.includes(s))).toEqual([])
  })
})
