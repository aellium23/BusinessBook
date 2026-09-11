// Saving a deal's product lines without throwing away what you cannot see.
//
// `saveDealProducts` deleted every line of a deal and reinserted them. For our
// own people that is harmless — they write the cost back on the way in. For a
// partner it destroyed it: the cost columns are forced to null on INSERT for
// anybody who may not read them (SEC-04), so a partner opening a deal WE quoted
// and pressing save wiped our cost off every line of it. Not by writing over it,
// which the guard stops. By deleting the row that held it.
//
// The fix uses machinery that was already there. That same guard, on UPDATE,
// puts the old cost BACK:
//
//   if tg_op = 'INSERT' then new.cost_price := null;
//   else                     new.cost_price := old.cost_price;
//
// So a line that is updated in place keeps our cost, whoever saves it, without
// anybody needing permission to read it. The only thing that had to change was
// the delete.
//
// This is the part worth testing on its own: which incoming line is which
// existing row.

/**
 * Match what is being saved against what is already stored.
 *
 * Rows are matched by `id` where the caller has one — the full form reads lines
 * back and knows their ids — and otherwise by `product_id`, because the quick
 * deal builds its lines from the products picked and never sees a row id. Each
 * existing row is claimed at most once, so two lines of the same product do not
 * both land on the first row.
 *
 * A line with neither is new, which is the honest reading: the caller cannot
 * say which row it was, so it is not any of them.
 *
 * @param existing rows already stored: `{ id, product_id }`
 * @param incoming rows to save, optionally carrying `id`
 * @returns `{ updates: [{ id, row }], inserts: [row], deleteIds: [id] }`
 */
export function reconcileLines(existing, incoming) {
  const rows = [...(existing || [])]
  const claimed = new Set()

  const claimById = (id) => {
    if (id === undefined || id === null) return null
    const hit = rows.find(r => r.id === id && !claimed.has(r.id))
    if (hit) claimed.add(hit.id)
    return hit || null
  }
  const claimByProduct = (productId) => {
    if (productId === undefined || productId === null) return null
    const hit = rows.find(r => r.product_id === productId && !claimed.has(r.id))
    if (hit) claimed.add(hit.id)
    return hit || null
  }

  const updates = []
  const inserts = []

  // Two passes, because id is the stronger claim: a line that names its row
  // must get that row even if an earlier line of the same product would have
  // taken it first.
  const byId = new Map()
  for (const line of incoming || []) {
    const hit = claimById(line.id)
    if (hit) byId.set(line, hit)
  }
  for (const line of incoming || []) {
    const { id: _drop, ...row } = line
    const hit = byId.get(line) || claimByProduct(line.product_id)
    if (hit) updates.push({ id: hit.id, row })
    else inserts.push(row)
  }

  return {
    updates,
    inserts,
    // Only what is genuinely gone. Deleting a row is the one action here that
    // loses information nobody can get back.
    deleteIds: rows.filter(r => !claimed.has(r.id)).map(r => r.id),
  }
}
