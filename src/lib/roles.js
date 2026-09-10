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
