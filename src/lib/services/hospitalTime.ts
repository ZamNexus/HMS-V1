// Late entries (handoff 8.5: check-in, vitals and discharge times "default to now, and may be at most 7 days back, never in the future") are typed as a date
// and a time on the HOSPITAL's clock and must reach the API as an exact instant. The browser's own zone is irrelevant, so the conversion uses the
// hospital's IANA zone from GET /settings.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The zone's offset from UTC in milliseconds at a given instant (positive east of Greenwich). */
function offsetMs(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(timestamp))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - timestamp
}

/** "2026-11-07" + "09:30" on the hospital's clock -> "2026-11-07T04:30:00.000Z"; null when the date, time or zone is not usable. */
export function hospitalInstant(date: string, time: string, timeZone: string): string | null {
  const d = DATE_RE.exec(date)
  const t = TIME_RE.exec(time)
  if (!d || !t) return null
  try {
    const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
    if (Number.isNaN(wall)) return null
    let instant = wall - offsetMs(wall, timeZone)
    instant = wall - offsetMs(instant, timeZone) // a second pass settles a daylight-saving change between the guess and the answer
    return new Date(instant).toISOString()
  } catch {
    return null // an unknown time zone
  }
}

/** An instant as the hospital's wall clock: { date: "2026-11-07", time: "09:30" }. */
export function hospitalWallClock(iso: string, timeZone: string): { date: string; time: string } | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  try {
    const wall = new Date(ms + offsetMs(ms, timeZone)).toISOString()
    return { date: wall.slice(0, 10), time: wall.slice(11, 16) }
  } catch {
    return null
  }
}
