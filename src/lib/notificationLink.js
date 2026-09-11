// Where a notification points.
//
// Every notification this app raises carries a link_type and a link_id, and
// until now nothing read them: clicking one marked it read and left you where
// you were, which taught people that clicking was pointless and left five
// answered discount requests sitting unopened.
//
// It lives here rather than beside the bell because the bell imports the
// notifications hook, the hook imports Supabase, and Supabase refuses to load
// without credentials — a rule nobody can load is a rule nobody tests.

/**
 * The route one notification opens, or null when it opens nothing.
 *
 * Null rather than a guess: a link that lands on the wrong page is worse than a
 * row that simply does not move, because the reader believes they have seen the
 * thing it was about.
 */
export function targetOf(n) {
  if (!n?.link_id) return null
  switch (n.link_type) {
    // Straight into the deal's own card, which is where an answered discount
    // can actually be accepted or countered.
    case 'deal':      return `/deals?deal=${encodeURIComponent(n.link_id)}`
    case 'quotation': return '/quotations'
    case 'task':      return '/tasks'
    case 'tender':    return '/tenders'
    default:          return null
  }
}
