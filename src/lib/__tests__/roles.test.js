import { describe, it, expect } from 'vitest'
import {
  INTERNAL_ROLES, GOVERNANCE_ROLES, EXTERNAL_ROLES,
  canPrice, seesCost, seesChannelEconomics, seesGovernance, companyScoped,
  canEditDeal,
} from '../roles'

// The distributor profile, by name, because this is the one that gets tested
// against a real partner and the one where a mistake is visible to them.
const TIMED = 'distributor'

describe('what a distributor may never see', () => {
  it('cannot open a screen that prices a deal in our cost', () => {
    expect(canPrice(TIMED)).toBe(false)
  })

  it('cannot see cost or margin', () => {
    expect(seesCost(TIMED)).toBe(false)
  })

  it('cannot see what we charge them against what we gave up', () => {
    // The transfer price is theirs to know — they pay it — but what it cost us
    // to protect their margin is ours.
    expect(seesChannelEconomics(TIMED)).toBe(false)
  })

  it('cannot see the book-wide aggregates', () => {
    expect(seesGovernance(TIMED)).toBe(false)
  })

  it('is scoped to its own company', () => {
    expect(companyScoped(TIMED)).toBe(true)
  })
})

describe('the same applies to every external role', () => {
  for (const role of EXTERNAL_ROLES) {
    it(`refuses ${role} the pricing screen, cost and channel figures`, () => {
      expect(canPrice(role)).toBe(false)
      expect(seesCost(role)).toBe(false)
      expect(seesChannelEconomics(role)).toBe(false)
      expect(seesGovernance(role)).toBe(false)
    })
  }
})

describe('what our own people see', () => {
  it('lets a member price a deal — the quick deal is built for them', () => {
    expect(canPrice('member')).toBe(true)
    expect(seesCost('member')).toBe(true)
  })

  it('keeps the aggregates to admin and manager', () => {
    expect(seesGovernance('member')).toBe(false)
    expect(seesGovernance('manager')).toBe(true)
    expect(seesGovernance('admin')).toBe(true)
  })

  it('does not scope our own people to a company', () => {
    expect(companyScoped('member')).toBe(false)
  })
})

describe('an unknown or missing role is outside, not inside', () => {
  it('refuses everything rather than defaulting open', () => {
    for (const role of [undefined, null, '', 'brand_approver', 'whatever']) {
      expect(canPrice(role)).toBe(false)
      expect(seesCost(role)).toBe(false)
      expect(seesGovernance(role)).toBe(false)
    }
  })
})

describe('the role lists themselves', () => {
  it('never lets a role be internal and external at once', () => {
    for (const role of EXTERNAL_ROLES) expect(INTERNAL_ROLES).not.toContain(role)
    for (const role of GOVERNANCE_ROLES) expect(INTERNAL_ROLES).toContain(role)
  })

  it('names the three roles the database guard names', () => {
    // Mirrors public.sees_internal_economics() in the SQL: if one changes and
    // the other does not, a screen and its data disagree about who may read it.
    expect(INTERNAL_ROLES).toEqual(['admin', 'manager', 'member'])
    expect(GOVERNANCE_ROLES).toEqual(['admin', 'manager'])
  })
})

describe('who may open a deal for editing', () => {
  const deal = (o = {}) => ({ id: 'd1', company_id: 'co-timed', created_by: 'someone-else', ...o })
  const timed = { role: 'distributor', id: 'u-timed', company_id: 'co-timed', full_name: 'TIMED' }
  const perms = { canEdit: true, isAdmin: false, editOwnOnly: true }

  it('lets a partner edit a deal of their own company, whoever created it', () => {
    // The database says the same thing — `deals partner update` matches on
    // company_id and nothing else — and the screen must not be stricter.
    expect(canEditDeal(timed, deal(), perms)).toBe(true)
  })

  it('refuses a partner a deal belonging to another company', () => {
    expect(canEditDeal(timed, deal({ company_id: 'co-other' }), perms)).toBe(false)
  })

  it('never matches a null company against a null company', () => {
    // An unscoped partner is not a partner with access to everything.
    expect(canEditDeal({ ...timed, company_id: null }, deal({ company_id: null }), perms))
      .toBe(false)
  })

  it('still holds our own reps to their own deals', () => {
    const rep = { role: 'member', id: 'u-rep', full_name: 'Ana' }
    expect(canEditDeal(rep, deal({ created_by: 'u-rep' }), perms)).toBe(true)
    expect(canEditDeal(rep, deal({ sales_owner: 'Ana' }), perms)).toBe(true)
    expect(canEditDeal(rep, deal(), perms)).toBe(false)
  })

  it('lets an admin edit anything, and a read-only profile nothing', () => {
    expect(canEditDeal({ role: 'viewer' }, deal(), { canEdit: true, isAdmin: true })).toBe(true)
    expect(canEditDeal(timed, deal(), { ...perms, canEdit: false })).toBe(false)
  })
})

describe('the unassigned-deal trap', () => {
  it('does not hand an unowned deal to a rep with no sales-owner name', () => {
    // Written as a bare ===, undefined matched undefined and every unassigned
    // deal in the book became editable by every rep with that field blank.
    const rep = { role: 'member', id: 'u-rep' }
    const orphan = { id: 'd9', created_by: 'someone-else' }
    expect(canEditDeal(rep, orphan, { canEdit: true, editOwnOnly: true })).toBe(false)
  })

  it('still matches a rep named on the deal', () => {
    const rep = { role: 'member', id: 'u-rep', sales_owner_name: 'A. Costa' }
    const mine = { id: 'd9', sales_owner: 'A. Costa' }
    expect(canEditDeal(rep, mine, { canEdit: true, editOwnOnly: true })).toBe(true)
  })
})
