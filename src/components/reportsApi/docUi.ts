import { isUlid } from "@/lib/api/convert"
import { toCSV } from "@/lib/csv"
import { formatMoneyString } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"

// A server document shown as received (Phase 13). The handoff names the routes, permissions and parameters of several reports but not the fields of their answers, and field names are
// not invented here: this module reads WHATEVER JSON arrives and presents it - numbers and text as tiles, a list of records as a table, a nested object as a titled section - and
// exports the same tables as CSV (handoff 8.11: "Build CSV exports on the client from the JSON"). Money is recognised by its form (a decimal string with exactly two decimals,
// the API's money format) and shown exactly as sent; a percentage ("discountPct") is not money. Nothing is added, rounded or re-derived.

export type DocRecord = Record<string, unknown>
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const MONEY = /^-?\d+\.\d{2}$/
const NOT_MONEY_KEY = /pct|percent|rate$|ratio|share/i

export const isRecord = (v: unknown): v is DocRecord => typeof v === "object" && v !== null && !Array.isArray(v)

/** "dateFrom" -> "Date from", "days0to30" -> "Days 0 to 30", "mrNo" -> "MR no". */
export function prettyKey(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
  const words = spaced.split(/\s+/).map((w) => (/^(id|mr|opd|ipd|gst|cnic)$/i.test(w) ? w.toUpperCase() : w.toLowerCase()))
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A money string by form: two decimals, and the key is not a percentage or a rate. */
export const looksLikeMoney = (key: string, v: unknown): v is string => typeof v === "string" && MONEY.test(v) && !NOT_MONEY_KEY.test(key)

/** A { id, name } reference (a doctor, a panel, a user): shown as its name. */
export function refName(v: unknown): string | null {
  if (!isRecord(v)) return null
  const name = v.name ?? v.fullName ?? v.title
  if (typeof name !== "string") return null
  const others = Object.keys(v).filter((k) => !["id", "name", "fullName", "title", "mrNo", "code"].includes(k))
  return others.length === 0 ? name : null
}

/** One value as text, exactly as sent (money in the hospital's currency format, instants in the hospital's zone). */
export function cellText(key: string, v: unknown, timezone?: string, showMoney: (m: string) => string = formatMoneyString): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString("en-PK") : String(v)
  if (typeof v === "string") {
    if (looksLikeMoney(key, v)) return showMoney(v)
    if (timezone && ISO_INSTANT.test(v)) { try { return formatInstant(v, timezone) } catch { return v } }
    return v
  }
  if (Array.isArray(v)) return v.map((x) => cellText(key, x, timezone, showMoney)).join(", ") || "—"
  const ref = refName(v)
  if (ref !== null) return ref
  if (isRecord(v)) return Object.entries(v).filter(([, x]) => x !== null && typeof x !== "object").map(([k, x]) => `${prettyKey(k)}: ${cellText(k, x, timezone, showMoney)}`).join(" · ") || "—"
  return String(v)
}

export type DocKind = "scalar" | "scalars" | "records" | "object"
/** How a value is drawn: a lone value, a list of plain values, a list of records (a table), or an object (a section). */
export function kindOf(v: unknown): DocKind {
  if (Array.isArray(v)) return v.length > 0 && v.every(isRecord) ? "records" : "scalars"
  if (isRecord(v)) return refName(v) !== null ? "scalar" : "object"
  return "scalar"
}

/** The keys of an object split into plain values (tiles) and nested parts (sections), in the order the server sent them. */
export function splitObject(o: DocRecord): { tiles: [string, unknown][]; parts: [string, unknown][] } {
  const tiles: [string, unknown][] = [], parts: [string, unknown][] = []
  for (const [k, v] of Object.entries(o)) (kindOf(v) === "scalar" || kindOf(v) === "scalars" ? tiles : parts).push([k, v])
  return { tiles, parts }
}

/** Table columns for a list of records: the keys seen in the first rows, in first-seen order, without columns that only hold ids; `priority` keys come first. */
export function columnsOf(rows: readonly DocRecord[], priority: readonly string[] = [], max = 12): string[] {
  const seen: string[] = []
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k)
  const visible = seen.filter((k) => !rows.every((r) => r[k] === null || r[k] === undefined || (typeof r[k] === "string" && isUlid(r[k]))))
  const first = priority.filter((k) => visible.includes(k))
  return [...first, ...visible.filter((k) => !first.includes(k))].slice(0, max)
}

export interface DocTable { title: string; headers: string[]; rows: string[][] }

/** Every table in a document (a list of records anywhere in it), as text: what the CSV export writes. */
export function tablesOf(data: unknown, title = "Report", timezone?: string, showMoney?: (m: string) => string): DocTable[] {
  const out: DocTable[] = []
  const visit = (v: unknown, path: string, depth: number) => {
    if (depth > 6) return
    if (kindOf(v) === "records") {
      const rows = v as DocRecord[]
      const cols = columnsOf(rows, [], 30)
      out.push({ title: path, headers: cols.map(prettyKey), rows: rows.map((r) => cols.map((c) => cellText(c, r[c], timezone, showMoney))) })
      return
    }
    if (isRecord(v) && refName(v) === null) {
      const { tiles, parts } = splitObject(v)
      if (tiles.length > 0) out.push({ title: path, headers: ["Item", "Value"], rows: tiles.map(([k, x]) => [prettyKey(k), cellText(k, x, timezone, showMoney)]) })
      for (const [k, x] of parts) visit(x, `${path} / ${prettyKey(k)}`, depth + 1)
    }
  }
  if (Array.isArray(data) || isRecord(data)) visit(data, title, 0)
  return out
}

/** The whole document as CSV text: each table under its title, separated by a blank line. Cells go through the shared CSV writer, which defuses spreadsheet formulas. */
export function documentCsv(tables: readonly DocTable[]): string {
  return tables.map((t) => toCSV([t.title], []) + "\n" + toCSV(t.headers, t.rows)).join("\n\n")
}

export { seriesOf } from "@/lib/services/http/series"
