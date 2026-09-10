// What granting this discount does — to them and to us.
//
// A partner asks for a discount on what they pay us. Two things move, in
// opposite directions, and an approver who can only see one of them is deciding
// blind:
//
//   their margin  rises, because their cost falls
//   our revenue   falls, by exactly the same amount
//
// The second is the whole cost of the decision and it has never been on the
// card. The first is the reason to say yes, and it could not be worked out at
// all until the deal started recording what the end customer pays.
//
// There is deliberately no "our margin" here. On a CWM line no cost is imputed —
// R&D, support and the datacentre exist whether or not one more deal closes —
// so our revenue IS the number that moves, and inventing a margin against a
// cost we decided not to allocate would be worse than showing nothing.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * @param transfer          what the partner pays us today, before this discount
 * @param endCustomerPrice  what their customer pays
 * @param requestedPct      the discount being asked for, off their price
 */
export function approvalImpact({ transfer, endCustomerPrice, requestedPct }) {
  const cost = num(transfer)
  const sell = num(endCustomerPrice)
  const pct = Math.min(100, Math.max(0, num(requestedPct) ?? 0))

  // Both halves have to be known. One of them alone says nothing about a margin.
  const known = cost !== null && cost > 0 && sell !== null && sell > 0
  if (!known) {
    return { known: false, pct, ourRevenue: cost ?? 0, ourRevenueIfGranted: cost ?? 0, given: 0 }
  }

  const newCost = round(cost * (1 - pct / 100))
  return {
    known: true,
    pct,
    // Ours: revenue now, revenue after, and the difference — which is what the
    // approval costs, in money rather than in percent.
    ourRevenue: round(cost),
    ourRevenueIfGranted: newCost,
    given: round(cost - newCost),
    // Theirs: the margin they have now and the one they are asking for.
    partnerMargin: round(sell - cost),
    partnerMarginPct: pct1((sell - cost) / sell * 100),
    partnerMarginIfGranted: round(sell - newCost),
    partnerMarginPctIfGranted: pct1((sell - newCost) / sell * 100),
    endCustomerPrice: round(sell),
    // A partner selling under what they pay is not asking for margin, they are
    // asking to lose less — and that is a different conversation.
    underwater: sell < cost,
  }
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
function pct1(n) { return Math.round((n + Number.EPSILON) * 10) / 10 }
