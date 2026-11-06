// Small pure helpers behind the report screens (unit-tested; no React, no data access). They reproduce rules the demo screens already
// used. NONE is a documented backend rule: the Task List documents the age bands and the gender split for Patient Demographics and
// little else — see the handoff document. Aggregation belongs to the backend; these serve the mock adapter and the screens' presentation.

/** The Task List documents "the age bands 0–12, 13–18, 19–30, 31–45, 46–60, 60+". The screen has always put 61+ in the last band. */
export const AGE_BANDS = [
  { label: "0–12", min: 0, max: 12 }, { label: "13–18", min: 13, max: 18 }, { label: "19–30", min: 19, max: 30 },
  { label: "31–45", min: 31, max: 45 }, { label: "46–60", min: 46, max: 60 }, { label: "60+", min: 61, max: 200 },
] as const

export function ageBandOf(age: number): string | null {
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.label ?? null
}

export type AgedBucket = "0-30" | "31-60" | "61-90" | "90+"
export const AGED_BUCKETS: readonly AgedBucket[] = ["0-30", "31-60", "61-90", "90+"]

/** The Aged Receivables buckets by days since the invoice date (demo rule; the backend's definition is CONTRACT REQUIRED). */
export function agedBucketOf(daysOutstanding: number): AgedBucket {
  if (daysOutstanding <= 30) return "0-30"
  if (daysOutstanding <= 60) return "31-60"
  if (daysOutstanding <= 90) return "61-90"
  return "90+"
}

/** Whole days between two instants, truncated toward zero (date-fns `differenceInDays` without the dependency). */
export function wholeDaysBetween(later: number, earlier: number): number {
  return Math.trunc((later - earlier) / 86_400_000)
}

/** "YYYY-MM-DD" for an instant (UTC), used for the 7-day trend labels. */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The screen's "credit" rule: any payment mode other than Cash. */
export const isCreditMode = (mode: string) => mode !== "Cash"
