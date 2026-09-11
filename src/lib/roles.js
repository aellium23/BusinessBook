// Who sees what, as one answer rather than a condition repeated per screen.
//
// The rule for a distributor — TIMED in Latin America, and every partner like
// them — is short and absolute: they are scoped to their own company_id, and
// they never see cost or margin. Anything of ours they can read, they can read
// through a browser console, so a screen that merely hides a number is not a
// control. The controls are here and in the database; this file is what the UI
// asks so that the two cannot drift apart.
//
// Roles: admin · manager · member (our own sales) · distributor · partner ·
// viewer · brand approvers.

/** Ours. Cost, margin, transfer prices, the whole pricing screen. */
export const INTERNAL_ROLES = ['admin', 'manager', 'member']

/** Ours, and senior. Aggregates across the book: given up, clawbacks, channel. */
export const GOVERNANCE_ROLES = ['admin', 'manager']

/** Outside. Scoped to their own company, never shown what a deal costs us. */
export const EXTERNAL_ROLES = ['distributor', 'partner', 'viewer']

/** May open a screen that prices a deal in our own cost and margin. */
export function canPrice(role) {
  return INTERNAL_ROLES.includes(role)
}

/** May see what a line costs us, or the margin on it. */
export function seesCost(role) {
  return INTERNAL_ROLES.includes(role)
}

/** May see channel economics: the transfer price and what we gave up. */
export function seesChannelEconomics(role) {
  return INTERNAL_ROLES.includes(role)
}

/** May see the book-wide aggregates — discount given away, clawbacks due. */
export function seesGovernance(role) {
  return GOVERNANCE_ROLES.includes(role)
}

/** Rows outside their own company are not theirs to read. */
export function companyScoped(role) {
  return role === 'distributor' || role === 'partner'
}

/**
 * Who may open a deal for editing.
 *
 * Mirrors the database rather than guessing at it. Our own people fall under
 * whatever "edit own" the permission set says; a company-scoped role — a
 * distributor, a partner — is judged on the company, because that is what the
 * `deals partner update` policy matches on and nothing else.
 *
 * It used to apply the "edit your own" rule written for our reps to partners
 * too, so a distributor was refused a deal the row-level policy would have
 * accepted: one their colleague created, or one of ours set up on their behalf.
 * No button, and nothing on screen to say why. A screen stricter than the
 * database is the wrong way round — the database is where a refusal can be
 * justified and where it cannot be talked past.
 *
 * @param profile  the signed-in profile: role, id, company_id, full_name
 * @param deal     the deal being opened
 * @param opts     { canEdit, isAdmin, editOwnOnly } from the permission set
 */
export function canEditDeal(profile, deal, { canEdit, isAdmin, editOwnOnly } = {}) {
  if (!canEdit) return false
  if (isAdmin) return true
  if (companyScoped(profile?.role)) {
    // A null company on either side must never match: an unscoped partner is
    // not a partner with access to everything.
    return !!profile?.company_id && deal?.company_id === profile.company_id
  }
  if (editOwnOnly) {
    // Each comparison needs something on both sides. Written as a bare `===`
    // this matched a deal with no sales owner against a profile with no sales
    // owner name — undefined to undefined — and handed every unassigned deal in
    // the book to every rep whose profile had that field blank.
    const same = (a, b) => !!a && a === b
    return same(deal?.created_by, profile?.id)
      || same(deal?.sales_owner, profile?.full_name)
      || same(deal?.sales_owner, profile?.sales_owner_name)
  }
  return true
}
