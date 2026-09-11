// Reading numbers back from a form, where "empty" and "zero" are different
// answers and the language does not agree.
//
// `parseFloat(null) || 0` is 0. So is `parseFloat('') || 0`, and so is
// `parseFloat('abc') || 0`. On a quantity that is harmless. On a cost it is the
// difference between "this line costs us nothing to deliver" and "nobody has
// told us what it costs" — and the second one, written as a zero, comes back as
// a margin of 100%. BR-061.
//
// Every screen in this app has been taught to refuse that lie. The save path
// was writing it.

/**
 * A finite number, or null. Never a zero standing in for an empty box.
 *
 * A real zero survives: `0` and `'0'` are somebody saying nothing, deliberately.
 */
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
