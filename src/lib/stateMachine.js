// ── State Machine for Deal Stages and SLA/Contract Lifecycle ────────────
// Defines which transitions are allowed, preventing invalid stage jumps.

/**
 * DEAL_TRANSITIONS — allowed next stages for each deal stage.
 *
 * Lead           → Pipeline, Lost
 * Pipeline       → Offer Presented, Lead, Lost
 * Offer Presented→ BackLog, Pipeline, Lost
 * BackLog        → Invoiced, Offer Presented, Lost
 * Invoiced       → (terminal — no further transitions, except Lost for corrections)
 * Lost           → Lead (reopen only)
 */
export const DEAL_TRANSITIONS = {
  'Lead':             ['Pipeline', 'Lost'],
  'Pipeline':         ['Offer Presented', 'Lead', 'Lost'],
  'Offer Presented':  ['BackLog', 'Pipeline', 'Lost'],
  'BackLog':          ['Invoiced', 'Offer Presented', 'Lost'],
  'Invoiced':         ['Lost'],
  'Lost':             ['Lead'],
}

/**
 * SLA_TRANSITIONS — allowed next statuses for each contract lifecycle state.
 *
 * draft           → waiting_po, cancelled
 * waiting_po      → warranty, active, cancelled
 * warranty        → active, cancelled
 * active          → pending_renewal, cancelled, expired
 * pending_renewal → renewed, expired, cancelled
 * renewed         → active, pending_renewal
 * expired         → active (reactivation)
 * cancelled       → draft (re-draft only)
 */
export const SLA_TRANSITIONS = {
  'draft':            ['waiting_po', 'cancelled'],
  'waiting_po':       ['warranty', 'active', 'cancelled'],
  'warranty':         ['active', 'cancelled'],
  'active':           ['pending_renewal', 'cancelled', 'expired'],
  'pending_renewal':  ['renewed', 'expired', 'cancelled'],
  'renewed':          ['active', 'pending_renewal'],
  'expired':          ['active'],
  'cancelled':        ['draft'],
}

const TRANSITION_MAPS = {
  deal: DEAL_TRANSITIONS,
  sla:  SLA_TRANSITIONS,
}

/**
 * Check whether a transition from one state to another is allowed.
 * @param {'deal'|'sla'} type — which state machine to use
 * @param {string} fromState  — current state
 * @param {string} toState    — desired next state
 * @returns {boolean}
 */
export function canTransition(type, fromState, toState) {
  const map = TRANSITION_MAPS[type]
  if (!map) return false
  // A no-op is valid only if the state is a known state in this machine
  // (prevents corrupted/legacy values passing the guard as "same state").
  if (fromState === toState) return Object.prototype.hasOwnProperty.call(map, fromState)
  const allowed = map[fromState]
  if (!allowed) return false
  return allowed.includes(toState)
}

/**
 * Return the list of valid next states from a given state.
 * Always includes the current state itself (no-change option).
 * @param {'deal'|'sla'} type — which state machine to use
 * @param {string} fromState  — current state
 * @returns {string[]}
 */
export function getAllowedTransitions(type, fromState) {
  const map = TRANSITION_MAPS[type]
  if (!map) return [fromState]
  const allowed = map[fromState]
  if (!allowed) return [fromState]
  return [fromState, ...allowed]
}
