// Local-calendar "today" as YYYY-MM-DD. Uses the device's LOCAL date (getFullYear/
// Month/Date), not UTC, so day-boundary comparisons against stored dates flip at the
// user's midnight — not UTC's. (toISOString() is UTC and rolls the day early/late for
// users away from UTC, which mis-timed stay expiry/hide near midnight.)
export function getLocalYMD(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
