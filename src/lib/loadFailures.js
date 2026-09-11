// Telling "nothing came back" from "we did not manage to ask".
//
// Forty-one places in this app read a table and, if the read fails, carry on
// with nothing. A dashboard then draws zeros and a select draws an empty list,
// and both of those are ANSWERS — "you invoiced nothing this quarter", "this
// partner has no products". Neither is what happened, and nobody looking at the
// screen can tell the difference. BR-062.
//
// Two things were hiding it, and only one of them looked like a mistake:
//
//   .then(({ data }) => setBudget(data || []))
//   .catch(() => {})
//
// The `.catch` is the one that reads as careless, and it is the harmless one.
// **A Supabase query does not reject on a query error** — it resolves, with
// `{ data: null, error }` — so that catch almost never runs. The swallowing is
// `data || []`: the error is sitting in the same object, never read, and an
// empty array goes to the screen in its place.
//
// So the unit here is the RESPONSE, not the promise. It is the only shape that
// can see the error at all.

/**
 * Read one Supabase response honestly.
 *
 * @returns `{ ok: true, data }` or `{ ok: false, message }`.
 */
export function readResult(res) {
  const { data, error } = res || {}
  if (error) return { ok: false, message: error.message || String(error) }
  return { ok: true, data }
}

/** Record a failure under its label. Same label and message twice is one entry. */
export function addFailure(failed, label, message) {
  if (failed[label] === message) return failed
  return { ...failed, [label]: message }
}

/**
 * Forget a failure, because a retry worked.
 *
 * Without this the screen keeps apologising for something that has since
 * arrived, which teaches people to ignore the banner — and a warning nobody
 * reads is worse than no warning, because it looks like one.
 */
export function removeFailure(failed, label) {
  if (!(label in failed)) return failed
  const { [label]: _gone, ...rest } = failed
  return rest
}
