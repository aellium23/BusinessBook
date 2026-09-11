import { describe, it, expect, vi } from 'vitest'
import { readResult, addFailure, removeFailure } from '../loadFailures'

/**
 * The thing this exists to stop is a figure built on a failed read passing as a
 * figure. Every test below is a version of that.
 */
describe('reading a Supabase response honestly', () => {
  /**
   * The one that mattered, and the reason the fix is shaped this way.
   *
   * A Supabase query does NOT reject on a query error — it resolves with
   * `{ data: null, error }` — so the `.catch(() => {})` that looks like the bug
   * almost never runs. The swallowing was `data || []` in the `.then`, with the
   * error sitting unread in the same object.
   */
  it('finds the error where it actually is: in the response', () => {
    const resolved = { data: null, error: { message: 'permission denied' } }

    // What every one of the forty-one sites did with exactly this response.
    const setBudget = vi.fn()
    ;(({ data }) => setBudget(data || []))(resolved)
    expect(setBudget).toHaveBeenCalledWith([])   // a page of zeros, out of an error

    expect(readResult(resolved)).toEqual({ ok: false, message: 'permission denied' })
  })

  it('passes real data through', () => {
    expect(readResult({ data: [1, 2], error: null })).toEqual({ ok: true, data: [1, 2] })
  })

  /** Empty is an answer, and must not be apologised for. */
  it('tells an empty table from a failed read, which is the whole point', () => {
    expect(readResult({ data: [], error: null })).toEqual({ ok: true, data: [] })
  })

  it('survives a response that is not one', () => {
    expect(readResult(undefined)).toEqual({ ok: true, data: undefined })
    expect(readResult({ error: 'boom' })).toEqual({ ok: false, message: 'boom' })
  })
})

describe('what the screen is told is missing', () => {
  it('names each failure once', () => {
    let f = {}
    f = addFailure(f, 'the budget', 'a')
    f = addFailure(f, 'the SLAs', 'b')
    f = addFailure(f, 'the budget', 'a')
    expect(Object.keys(f).sort()).toEqual(['the SLAs', 'the budget'])
  })

  it('does not churn state when the same failure repeats', () => {
    const f = addFailure({}, 'the budget', 'a')
    expect(addFailure(f, 'the budget', 'a')).toBe(f)
  })

  /**
   * A banner that keeps apologising for something that has since arrived teaches
   * people to ignore it — and a warning nobody reads is worse than none, because
   * it looks like one.
   */
  it('forgets a failure once the retry works', () => {
    const f = addFailure({}, 'the budget', 'timeout')
    expect(removeFailure(f, 'the budget')).toEqual({})
    const untouched = { 'the SLAs': 'b' }
    expect(removeFailure(untouched, 'the budget')).toBe(untouched)
  })
})
