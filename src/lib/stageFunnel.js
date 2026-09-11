// The pipeline in five frames.
//
// One row per stage, counted and valued the way every other screen in this app
// values a deal: the sum of the monthly columns, falling back to value_total
// for a deal that has no monthly spread, converted at the rate stored on the
// deal, and never counting an intercompany mirror.
//
// Lost is deliberately absent from the five. It is not a stage of a funnel, it
// is the exit from one, and putting it in a row of photographs alongside the
// others would suggest a deal passes through it on the way somewhere. It is
// reported separately, where it reads as what it is.
//
// The weighted figure is the forecast convention already in `constants`: Lead
// 10 %, Pipeline 30 %, Offer 60 %, BackLog and Invoiced 100 %. It is what the
// stage is worth to a forecast, not what it is worth if it lands.

import { WEIGHTS } from '../constants'
import { dealValue } from './dealValue'

export { dealValue }

/** The five frames, in the order a deal moves through them. */
export const FUNNEL_STAGES = ['Lead', 'Pipeline', 'Offer Presented', 'BackLog', 'Invoiced']

/**
 * The funnel.
 *
 * @param deals  rows from `deals`
 * @param bu     optional business unit
 */
export function stageFunnel(deals, { bu = '' } = {}) {
  const empty = () => ({ count: 0, value: 0, weighted: 0 })
  const byStage = Object.fromEntries(FUNNEL_STAGES.map(s => [s, empty()]))
  const lost = empty()

  for (const d of deals || []) {
    if (d.is_intercompany_mirror) continue
    if (bu && d.bu !== bu) continue

    const value = dealValue(d)
    const bucket = d.stage === 'Lost' ? lost : byStage[d.stage]
    if (!bucket) continue   // a stage this funnel does not draw

    bucket.count += 1
    bucket.value = round(bucket.value + value)
    bucket.weighted = round(bucket.weighted + value * (WEIGHTS[d.stage] ?? 0))
  }

  const stages = FUNNEL_STAGES.map(stage => ({ stage, ...byStage[stage] }))
  const open = stages.filter(s => s.stage !== 'Invoiced')

  return {
    stages,
    lost,
    total: {
      // Everything still to happen, and what a forecast makes of it.
      openCount: open.reduce((s, x) => s + x.count, 0),
      openValue: round(open.reduce((s, x) => s + x.value, 0)),
      weighted: round(open.reduce((s, x) => s + x.weighted, 0)),
      invoiced: byStage.Invoiced.value,
      invoicedCount: byStage.Invoiced.count,
    },
  }
}

/**
 * How much of one stage reaches the next.
 *
 * Counted on deals rather than on money: a conversion rate is about how many
 * conversations survive, and one large deal would otherwise make a bad month
 * look like a good one. Null where the stage before it is empty — a rate out of
 * nothing is not 0 %, it is unknown.
 */
export function conversion(stages) {
  return stages.map((s, i) => {
    if (i === 0) return { ...s, fromPrevious: null }
    const prev = stages[i - 1]
    return {
      ...s,
      fromPrevious: prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : null,
    }
  })
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
