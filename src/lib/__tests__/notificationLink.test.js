import { describe, it, expect } from 'vitest'
import { targetOf } from '../notificationLink'

const n = (o = {}) => ({ link_type: 'deal', link_id: 'abc-123', ...o })

describe('where a notification takes you', () => {
  it('opens the deal card, which is where a discount can be answered', () => {
    expect(targetOf(n())).toBe('/deals?deal=abc-123')
  })

  it('routes the other kinds to their own pages', () => {
    expect(targetOf(n({ link_type: 'quotation' }))).toBe('/quotations')
    expect(targetOf(n({ link_type: 'task' }))).toBe('/tasks')
    expect(targetOf(n({ link_type: 'tender' }))).toBe('/tenders')
  })

  it('goes nowhere rather than somewhere wrong', () => {
    // A link that lands on the wrong page is worse than one that does not move:
    // the reader believes they have seen the thing it was about.
    expect(targetOf(n({ link_type: 'something_new' }))).toBeNull()
    expect(targetOf(n({ link_id: null }))).toBeNull()
    expect(targetOf(null)).toBeNull()
  })

  it('escapes the id, so a malformed one cannot rewrite the query', () => {
    expect(targetOf(n({ link_id: 'a&stage=Lost' }))).toBe('/deals?deal=a%26stage%3DLost')
  })
})
