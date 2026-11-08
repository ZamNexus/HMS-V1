// A series for a chart or a sparkline, found WITHOUT assuming field names (Phase 13): the handoff names `revenue.last7Days`, `patientFlow.last7Days` and the daily revenue report but
// not the shape of their items. A series is a list whose items are numbers (or number text), or records with one day (YYYY-MM-DD) and exactly one number or number text beside it.
// The value stays the text the server sent; it is never added or rounded here.

export interface SeriesPoint { label: string; value: string }
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const NUMERIC = /^-?\d+(\.\d+)?$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function seriesOf(v: unknown): SeriesPoint[] | null {
  const list = Array.isArray(v) ? v : isRecord(v) ? Object.values(v).find((x) => Array.isArray(x)) : undefined
  if (!Array.isArray(list) || list.length === 0) return null
  const out: SeriesPoint[] = []
  for (const item of list) {
    if (typeof item === "number" || (typeof item === "string" && NUMERIC.test(item))) { out.push({ label: String(out.length + 1), value: String(item) }); continue }
    if (!isRecord(item)) return null
    const dayKey = Object.keys(item).find((k) => typeof item[k] === "string" && ISO_DAY.test(item[k] as string))
    const numKeys = Object.keys(item).filter((k) => k !== dayKey && (typeof item[k] === "number" || (typeof item[k] === "string" && NUMERIC.test(item[k] as string))))
    if (!dayKey || numKeys.length !== 1) return null
    out.push({ label: item[dayKey] as string, value: String(item[numKeys[0]]) })
  }
  return out
}
