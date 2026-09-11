// Who may open which page.
//
// This lives apart from the auth hook for one reason: the hook imports
// Supabase, Supabase refuses to load without credentials, and a rule nobody can
// load is a rule nobody tests. The rule below and the page lists it reads are
// the only copy — a test against a paraphrase of them would have passed while
// the real gate turned distributors away from a page their own list granted.

// ── Permissões por role ───────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  admin: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','audit','history','quotas','budget','forecast','settings','tasks','tenders','permissions','sla','products','quotations','verification'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    'ALL',
    seeAll:   true,
    manageUsers: true,
  },
  manager: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','budget','forecast','tasks','tenders','sla','products','quotations','verification'],
    canEdit:  true,
    canDelete: true,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  member: {
    pages:    ['dashboard','deals','clients','contacts','accounts','whitespace','network','history','quotas','forecast','tasks','tenders','sla','products','quotations'],
    canEdit:  true,
    canDelete: false,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  distributor: {
    // `approvals` reads from the other end for them: the answers to their own
    // requests, not a queue of somebody else's. A partner who can ask for a
    // discount and cannot see the reply is being asked to phone somebody.
    pages:    ['dashboard','deals','tasks','tenders','clients','contacts','history','quotas','quotations','approvals'],
    canEdit:  true,
    canDelete: false,
    editOwn:  true,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  viewer: {
    pages:    ['dashboard','deals','clients','contacts','history'],
    canEdit:  false,
    canDelete: false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
  partner: {
    pages:    ['dashboard','deals','clients','contacts','tasks','tenders'],
    canEdit:  false,
    canDelete: false,
    editOwn:  false,
    seeBU:    null,
    seeAll:   false,
    manageUsers: false,
  },
}

/**
 * Whether one profile may open one page.
 *
 * `approvals` is the only page reachable two ways, because it is two pages
 * behind one door: an approver opens a queue of other people's requests, and a
 * requester opens the answers to their own. The first is what `approves_brands`
 * buys; the second is what the page list grants, and distributors have carried
 * it in theirs all along.
 *
 * A brand-only approver — somebody who approves brands and holds no ordinary
 * role — gets that door and no other, which is the point of the profile.
 */
export function pageAllowed({ role, pages = [], approvesBrands = [] }, page) {
  if (role === 'admin') return true
  const approves = Array.isArray(approvesBrands) && approvesBrands.length > 0
  if (page === 'approvals') return approves || pages.includes('approvals')
  if (approves && !['admin', 'manager', 'member'].includes(role)) return false
  return pages.includes(page)
}
