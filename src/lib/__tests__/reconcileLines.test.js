import { describe, it, expect } from 'vitest'
import { reconcileLines } from '../reconcileLines'

/**
 * Saving a deal used to delete every line and put them back.
 *
 * For our own people that is harmless — the cost is rewritten on the way in.
 * For a partner it destroyed it: cost is forced to null on INSERT for anybody
 * who may not read it, so a partner opening a deal WE quoted and pressing save
 * wiped our cost off every line. Not by writing over it, which the guard stops.
 * By deleting the row that held it.
 *
 * Updating in place keeps it, because the same guard puts the old cost back on
 * UPDATE. All of which rests on getting the matching right, which is this.
 */
describe('matching what is being saved against what is stored', () => {
  it('updates rather than replaces, so nothing is deleted to be re-created', () => {
    const existing = [{ id: 'r1', product_id: 'p1' }, { id: 'r2', product_id: 'p2' }]
    const r = reconcileLines(existing, [
      { product_id: 'p1', net_price: 100 },
      { product_id: 'p2', net_price: 200 },
    ])
    expect(r.updates.map(u => u.id)).toEqual(['r1', 'r2'])
    expect(r.inserts).toEqual([])
    // The whole point: no delete, so no INSERT, so the cost guard never fires.
    expect(r.deleteIds).toEqual([])
  })

  it('prefers the row a line names over one that merely matches its product', () => {
    const existing = [{ id: 'r1', product_id: 'p1' }, { id: 'r2', product_id: 'p1' }]
    // The second line names r1. It must get r1, even though the first line
    // would have claimed it on product alone.
    const r = reconcileLines(existing, [
      { product_id: 'p1' },
      { id: 'r1', product_id: 'p1' },
    ])
    expect(r.updates.find(u => u.id === 'r1')).toBeTruthy()
    expect(r.updates).toHaveLength(2)
    expect(r.deleteIds).toEqual([])
  })

  it('does not let two lines of one product land on the same row', () => {
    const existing = [{ id: 'r1', product_id: 'p1' }]
    const r = reconcileLines(existing, [
      { product_id: 'p1', quantity: 1 },
      { product_id: 'p1', quantity: 2 },
    ])
    expect(r.updates).toHaveLength(1)
    expect(r.inserts).toHaveLength(1)
  })

  it('inserts a line that names no row and matches no product', () => {
    const r = reconcileLines([{ id: 'r1', product_id: 'p1' }], [
      { product_id: 'p1' },
      { product_id: null, product_name: 'Custom work' },
    ])
    expect(r.updates.map(u => u.id)).toEqual(['r1'])
    expect(r.inserts).toEqual([{ product_id: null, product_name: 'Custom work' }])
  })

  it('deletes only what was actually taken off the quote', () => {
    const existing = [
      { id: 'r1', product_id: 'p1' },
      { id: 'r2', product_id: 'p2' },
      { id: 'r3', product_id: 'p3' },
    ]
    const r = reconcileLines(existing, [{ product_id: 'p2' }])
    expect(r.updates.map(u => u.id)).toEqual(['r2'])
    expect(r.deleteIds.sort()).toEqual(['r1', 'r3'])
  })

  it('strips the id from what is written, because it addresses the row', () => {
    const r = reconcileLines([{ id: 'r1', product_id: 'p1' }], [
      { id: 'r1', product_id: 'p1', net_price: 50 },
    ])
    expect(r.updates[0].row).toEqual({ product_id: 'p1', net_price: 50 })
  })

  it('treats a deal with no lines yet as all inserts', () => {
    const r = reconcileLines([], [{ product_id: 'p1' }, { product_id: 'p2' }])
    expect(r.inserts).toHaveLength(2)
    expect(r.updates).toEqual([])
    expect(r.deleteIds).toEqual([])
  })

  it('empties a deal that had its last line removed', () => {
    const r = reconcileLines([{ id: 'r1', product_id: 'p1' }], [])
    expect(r.deleteIds).toEqual(['r1'])
    expect(r.updates).toEqual([])
    expect(r.inserts).toEqual([])
  })

  it('survives being handed nothing at all', () => {
    expect(reconcileLines(null, null)).toEqual({ updates: [], inserts: [], deleteIds: [] })
  })
})
