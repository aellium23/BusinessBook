import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Lines come from the shared view; cost comes from the guarded one.
 *
 * The join has to survive three things, and each of them is a state the app is
 * genuinely in at some point: the cost view not existing yet (between the
 * deploy and the migration), the reader not being entitled to cost (every
 * partner, always), and a line the cost view has nothing to say about.
 *
 * None of them may lose a line. Losing lines here empties a quote.
 */

let lines, costs
vi.mock('../supabase', () => {
  const q = table => {
    const r = table === 'deal_products_v' ? lines : costs
    const b = {
      select: () => b,
      eq: () => (table === 'deal_products_cost' ? Promise.resolve(r) : b),
      order: () => Promise.resolve(r),
    }
    return b
  }
  return { supabase: { from: q } }
})

const { dealLines } = await import('../dealLines')

beforeEach(() => {
  lines = { data: [{ id: 'a', product_id: 'p1' }, { id: 'b', product_id: 'p2' }], error: null }
  costs = { data: [{ id: 'a', cost_price: 65, margin_pct: 53.8 }], error: null }
})

describe('joining cost onto a deal’s lines', () => {
  it('puts cost on the line it belongs to', async () => {
    const { data } = await dealLines('d1')
    expect(data.find(l => l.id === 'a')).toMatchObject({ cost_price: 65, margin_pct: 53.8 })
  })

  it('keeps a line the cost view says nothing about', async () => {
    const { data } = await dealLines('d1')
    expect(data).toHaveLength(2)
    expect(data.find(l => l.id === 'b').cost_price).toBeUndefined()
  })

  it('keeps every line when the cost view does not exist yet', async () => {
    // Between the deploy and the migration. The lines are the quote; losing
    // them to a missing view would empty it.
    costs = { data: null, error: { message: 'relation does not exist' } }
    const { data, error } = await dealLines('d1')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })

  it('keeps every line for a reader with no right to cost', async () => {
    // Every partner, every time: the guard returns nothing, not an error.
    costs = { data: [], error: null }
    const { data } = await dealLines('d1')
    expect(data).toHaveLength(2)
  })

  it('passes the error through when the lines themselves cannot be read', async () => {
    // This one IS a failure, and must not read as a deal with no products.
    lines = { data: null, error: { message: 'permission denied' } }
    const { data, error } = await dealLines('d1')
    expect(data).toBeNull()
    expect(error.message).toBe('permission denied')
  })
})
