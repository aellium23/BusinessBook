import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A column you filter on is a column you use.
 *
 * `requestsForDeal` filtered on deal_id and did not select it, so every row it
 * handed back carried `deal_id: undefined`. Nothing complained until a
 * distributor answered a counter-offer: the new request was built from that row
 * and written with a null deal, and the partner was told "null value in column
 * deal_id violates not-null constraint" for the crime of negotiating.
 *
 * These tests read the select the module actually issues, so the field cannot
 * quietly go missing again.
 */

const calls = []

vi.mock('../supabase', () => {
  const builder = () => {
    const b = {
      select: s => { calls.push({ op: 'select', value: s }); return b },
      eq: () => b, in: () => b, order: () => b, insert: () => b,
    }
    return b
  }
  return {
    supabase: {
      from: () => builder(),
      rpc: (name, args) => { calls.push({ op: 'rpc', name, args }); return Promise.resolve({}) },
    },
  }
})

const { requestsForDeal, openRequestsFor, askAgain, acceptCounter, requestState } =
  await import('../discountRequests')

beforeEach(() => { calls.length = 0 })

const selected = () => calls.find(c => c.op === 'select').value.split(/,\s*/)

describe('what a read of a discount request brings back', () => {
  it('selects the deal it belongs to, which is what it is filtered on', () => {
    requestsForDeal('deal-1')
    expect(selected()).toContain('deal_id')
  })

  it('brings back everything the screens read off a row', () => {
    requestsForDeal('deal-1')
    const cols = selected()
    for (const field of ['id', 'product_id', 'requested_pct', 'approved_pct', 'status',
                         'requested_by', 'response_note', 'value_at_risk', 'route',
                         'channel', 'scope', 'brand', 'supplier_code']) {
      expect(cols).toContain(field)
    }
  })

  it('asks for the same columns whichever way the rows are fetched', () => {
    requestsForDeal('deal-1')
    const perDeal = selected()
    calls.length = 0
    openRequestsFor('user-1')
    const mine = selected()
    for (const field of perDeal) expect(mine).toContain(field)
  })

  it('carries the client along on the dashboard read, so a row can be named', () => {
    openRequestsFor('user-1')
    expect(calls[0].value).toContain('deals!inner(client, stage)')
  })
})

describe('answering a counter-offer', () => {
  it('asks again through the function, which knows the deal without being told', () => {
    // The browser had been building the new row itself, from a row whose
    // deal_id it had never fetched.
    askAgain({ id: 'req-1' }, '15', 'competitor at 18')
    expect(calls[0]).toMatchObject({
      op: 'rpc', name: 'ask_discount_again',
      args: { p_request_id: 'req-1', p_pct: 15, p_note: 'competitor at 18' },
    })
  })

  it('sends a number, not the string a text input gives it', () => {
    askAgain({ id: 'req-1' }, '7.5', 'x')
    expect(calls[0].args.p_pct).toBe(7.5)
  })

  it('turns an unreadable percentage into zero, which the function refuses', () => {
    askAgain({ id: 'req-1' }, '', 'x')
    expect(calls[0].args.p_pct).toBe(0)
  })

  it('accepts through its own function', () => {
    acceptCounter('req-2')
    expect(calls[0]).toMatchObject({ op: 'rpc', name: 'accept_counter_offer' })
  })
})

describe('what a request is waiting for', () => {
  it('names each state in one word the screen can colour', () => {
    expect(requestState({ status: 'counter' })).toBe('counter')
    expect(requestState({ status: 'approved' })).toBe('approved')
    expect(requestState({ status: 'rejected' })).toBe('rejected')
    expect(requestState({ status: 'to_request' })).toBe('unfiled')
    expect(requestState({ status: 'pending' })).toBe('pending')
  })

  it('treats anything it does not recognise as still waiting', () => {
    // Better to show a request as open than to show it as settled.
    expect(requestState({ status: 'something_new' })).toBe('pending')
  })
})
