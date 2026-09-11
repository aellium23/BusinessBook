import { useState, useCallback, useMemo } from 'react'
import { logger } from '../lib/logger'
import { readResult, addFailure, removeFailure } from '../lib/loadFailures'

/**
 * What did not load, kept where the screen can say so.
 *
 * The reasoning is in `src/lib/loadFailures.js`, which holds the part that can
 * be tested without a DOM. This is the React half: one label per thing being
 * read, and a banner that names whatever is missing.
 *
 *   const { failed, load, fail } = useLoadFailures()
 *   supabase.from('budget').select('*')
 *     .then(load('the budget', data => setBudget(data || [])))
 *     .catch(fail('the budget'))
 *   ...
 *   <LoadFailureBanner failed={failed} t={t} />
 *
 * The label is what the reader is told is missing, so it names the thing rather
 * than the table: "the budget", not `budget`.
 */
export function useLoadFailures() {
  const [failed, setFailed] = useState({})

  const mark = useCallback((label, message) => {
    logger.error('Load failed', { what: label, error: message })
    setFailed(f => addFailure(f, label, message))
  }, [])

  /** Wraps a `.then` handler: runs it on success, records the failure instead. */
  const load = useCallback((label, handler) => (res) => {
    const r = readResult(res)
    if (!r.ok) { mark(label, r.message); return }
    setFailed(f => removeFailure(f, label))
    return handler ? handler(r.data) : undefined
  }, [mark])

  /** For the `.catch` — the network dropping, rather than the query failing. */
  const fail = useCallback((label) => (e) => {
    mark(label, e?.message || String(e))
  }, [mark])

  const labels = useMemo(() => Object.keys(failed), [failed])

  return { failed, labels, anyFailed: labels.length > 0, load, fail }
}

/**
 * One line, naming what is missing.
 *
 * Deliberately not a full-page error: the rest of the screen is usually fine and
 * hiding it would cost more than it saves. What it must not do is let a figure
 * built on a failed read pass as a figure.
 */
export function LoadFailureBanner({ failed, t, className = '' }) {
  const labels = Object.keys(failed || {})
  if (labels.length === 0) return null
  const template = t?.('load_failed') || 'Could not load {what} — what is on screen is incomplete.'
  return (
    <p role="status" className={`text-micro text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 ${className}`}>
      {template.replace('{what}', labels.join(', '))}
    </p>
  )
}
