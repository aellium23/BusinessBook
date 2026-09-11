import { describe, it, expect } from 'vitest'
import { ROLE_PERMISSIONS, pageAllowed } from '../pageAccess'

/**
 * The gate and the page list have to agree.
 *
 * They did not: `canAccessPage` special-cased 'approvals' on approves_brands
 * alone and returned before it ever looked at the role's page list, so the
 * config could grant a page the gate would refuse. A distributor carried
 * 'approvals' in their pages and was turned round at the door — they could ask
 * for a discount and not read the reply.
 *
 * These tests are written against the same rule the hook applies, so the two
 * cannot drift apart again without one of them failing.
 */
const as = role => ({ role, pages: ROLE_PERMISSIONS[role].pages })

describe('who gets through the approvals door', () => {
  it('lets a distributor in, because their page list says so', () => {
    expect(ROLE_PERMISSIONS.distributor.pages).toContain('approvals')
    expect(pageAllowed(as('distributor'), 'approvals')).toBe(true)
  })

  it('lets a brand approver in on their brands alone', () => {
    expect(pageAllowed({ role: 'viewer', pages: [], approvesBrands: ['CWM'] }, 'approvals'))
      .toBe(true)
  })

  it('keeps out a role that neither approves nor was granted the page', () => {
    expect(ROLE_PERMISSIONS.viewer.pages).not.toContain('approvals')
    expect(pageAllowed(as('viewer'), 'approvals')).toBe(false)
  })

  it('lets an admin in regardless', () => {
    expect(pageAllowed({ role: 'admin', pages: [] }, 'approvals')).toBe(true)
  })
})

describe('the rest of the doors are unchanged', () => {
  it('still refuses a distributor a page they were never granted', () => {
    for (const page of ['settings', 'permissions', 'budget', 'verification']) {
      expect(ROLE_PERMISSIONS.distributor.pages).not.toContain(page)
      expect(pageAllowed(as('distributor'), page)).toBe(false)
    }
  })

  it('still gives a distributor the pages that carry their work', () => {
    // Tasks is where notifications land, so losing it loses every reply.
    for (const page of ['dashboard', 'deals', 'tasks', 'quotations']) {
      expect(pageAllowed(as('distributor'), page)).toBe(true)
    }
  })

  it('still shuts a brand-only approver out of everything else', () => {
    const approver = { role: 'viewer', pages: ['dashboard', 'deals'], approvesBrands: ['CWM'] }
    expect(pageAllowed(approver, 'deals')).toBe(false)
    expect(pageAllowed(approver, 'approvals')).toBe(true)
  })
})
