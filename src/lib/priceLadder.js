// Whether a volume ladder holds together.
//
// Pure, and outside the hook that loads it: the editor needs it on every
// keystroke and a test must reach it without a Supabase client, which throws at
// import time when the environment has no keys.

/**
 * What is wrong with a ladder, in words a person can act on.
 *
 * Returned rather than enforced: a half-built ladder is a normal intermediate
 * state while typing, and refusing to render it would make the editor unusable.
 */
export function validateTiers(rows) {
  const problems = []
  const list = (rows || []).filter(r => r.tier_label?.trim() || r.global_list_price !== '')

  list.forEach((r, i) => {
    const from = numOrNull(r.tier_from)
    const to = numOrNull(r.tier_to)
    const price = numOrNull(r.global_list_price)

    if (price === null || price < 0) problems.push(`Band ${i + 1}: price is missing`)
    if (from !== null && to !== null && to < from) {
      problems.push(`Band ${i + 1}: ends (${to}) before it starts (${from})`)
    }
    if (i > 0) {
      const prevTo = numOrNull(list[i - 1].tier_to)
      // A gap prices nothing at all for the volumes that fall in it — the
      // quietest way a price list can be wrong.
      if (prevTo !== null && from !== null && from > prevTo + 1) {
        problems.push(`Between bands ${i} and ${i + 1}: ${prevTo + 1}–${from - 1} has no price`)
      }
      if (prevTo !== null && from !== null && from <= prevTo) {
        problems.push(`Bands ${i} and ${i + 1} overlap at ${from}`)
      }
    }
  })

  const openEnded = list.filter(r => numOrNull(r.tier_to) === null).length
  if (list.length && openEnded === 0) {
    problems.push('No band is open-ended — the largest customers price at nothing')
  }
  if (openEnded > 1) problems.push('More than one band is open-ended')

  return problems
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
