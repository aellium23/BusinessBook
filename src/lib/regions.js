// Which region a country sits in.
//
// The lists were inline in one form, used to populate a dropdown and nothing
// else, which meant nothing could ask the question the other way round: given a
// partner in Chile, which region is that? Without an answer, every quick form
// opened on Europe and offered a Chilean distributor a list of European
// countries to pick their own from.

export const COUNTRIES_BY_REGION = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA:    ['UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Egypt','Morocco','Algeria','Tunisia','South Africa','Israel','Jordan','Iraq','Nigeria','Kenya','Ghana','Other MEA'],
  LATAM:  ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Costa Rica','Panama','El Salvador','Guatemala','Ecuador','Bolivia','Venezuela','Dominican Republic','Other LATAM'],
  APAC:   ['Japan','China','South Korea','Australia','India','Singapore','Malaysia','Thailand','Indonesia','Vietnam','New Zealand','Other APAC'],
  NA:     ['USA','Canada','Other NA'],
}

const REGION_OF = Object.fromEntries(
  Object.entries(COUNTRIES_BY_REGION).flatMap(([region, countries]) =>
    countries.map(c => [c.toLowerCase(), region])
  )
)

/**
 * The region a country belongs to, or null when it is not one we sell in.
 *
 * Null rather than a default: "Europe" as a fallback is how a Chilean partner
 * ended up filing Chilean business under Europe, and a wrong region is worse
 * than a blank one because nobody goes back to check a field that looks filled.
 */
export function regionOf(country) {
  if (!country) return null
  return REGION_OF[String(country).trim().toLowerCase()] || null
}

/** The countries to offer for a region, empty for one we do not know. */
export function countriesOf(region) {
  return COUNTRIES_BY_REGION[region] || []
}
