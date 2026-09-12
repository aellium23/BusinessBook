/**
 * The one selector the dashboard has, used by all three profiles.
 *
 * There were three, and they disagreed. An admin got a big pair of buttons
 * (Summary · Details) with a row of small pills underneath (Products · Reps ·
 * Clients · Funnel); a distributor got two pills; a rep got two pills I added
 * myself, copied from the distributor's, which already did not match the
 * admin's. Three shapes for one question — which view do I want — and the third
 * was mine.
 *
 * Worse than inconsistent, the admin's was wrong. All six buttons wrote to the
 * same variable, so once the funnel became the opening view the big pair at the
 * top showed BOTH options unlit with a small pill lit below it. The most
 * prominent thing on the screen did not say what you were looking at.
 *
 * So: one row, one lit option, always. Where a profile has more than four views
 * the row scrolls sideways rather than wrapping into a second line that shifts
 * everything below it.
 */
export default function ViewPicker({ options, value, onChange, label }) {
  const visible = (options || []).filter(Boolean)
  if (visible.length < 2) return null

  return (
    <div role="tablist" aria-label={label}
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
      {visible.map(o => {
        const Icon = o.icon
        const active = value === o.id
        return (
          <button key={o.id} type="button" role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            /* min-h-tap: these used to be px-2.5 py-1, about 26px tall, which
               on a phone is a target you miss. */
            className={`min-h-tap shrink-0 px-3 py-1.5 rounded-full text-xs font-medium
              flex items-center gap-1.5 transition-colors ${
              active
                ? 'bg-navy text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {Icon && <Icon size={13}/>} <span className="whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
