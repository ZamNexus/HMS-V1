import { isUlid } from "@/lib/api/convert"
import type { QueryParams } from "@/lib/api/client"
import type { ListResult } from "../types"

// Small, strict readers for backend JSON. Every mapper uses these so a response that does not match
// docs/openapi.json fails loudly (a TypeError naming the field) instead of rendering blank, NaN or wrong data.
// Messages carry field names only — never values — so nothing sensitive reaches a log or a toast.

export type Obj = Record<string, unknown>

export function asObj(raw: unknown, what: string): Obj {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new TypeError(`Unexpected response: ${what} is not an object.`)
  return raw as Obj
}

export function reqStr(o: Obj, key: string, what: string): string {
  const v = o[key]
  if (typeof v !== "string") throw new TypeError(`Unexpected response: ${what}.${key} is not a string.`)
  return v
}

// ── Spec mismatch tolerance ──
// docs/openapi.json types many single-text fields as `array of string` (see docs/SPEC_BUGS_FOR_BACKEND.md). The list DTOs type the
// same fields `string | null`, so this is almost certainly a spec-generation bug, but what the real server sends is unconfirmed.
// A mapper therefore accepts a string, null, undefined or "" and, if an ARRAY arrives, uses its first element (an empty array means
// "empty") and warns once per DTO.field per page load. Anything else still throws.
const warnedMismatches = new Set<string>()
export function warnSpecMismatch(dto: string, field: string): void {
  const key = `${dto}.${field}`
  if (warnedMismatches.has(key)) return
  warnedMismatches.add(key)
  console.warn(`spec mismatch: ${key} arrived as array`)
}
/** Test helper: forget which mismatches were already reported (a new page load does this naturally). */
export function resetSpecMismatchWarnings(): void {
  warnedMismatches.clear()
}

/** Unwraps a value the spec types as an array but that is a single value; returns the value to read as a plain string. */
function unwrapSingle(v: unknown, dto: string, field: string): unknown {
  if (!Array.isArray(v)) return v
  warnSpecMismatch(dto, field)
  return v.length === 0 ? undefined : v[0]
}

/**
 * Optional text. `dto` is the schema name used in the mismatch warning (defaults to `what`). Accepts string / null / undefined / "";
 * an array is read as its first element. Nothing else is accepted (a number or object throws).
 */
export function optStr(o: Obj, key: string, what: string, dto: string = what): string | undefined {
  const v = unwrapSingle(o[key], dto, key)
  if (v === null || v === undefined) return undefined
  if (typeof v !== "string") throw new TypeError(`Unexpected response: ${what}.${key} is not a string or null.`)
  return v
}

export function reqBool(o: Obj, key: string, what: string): boolean {
  const v = o[key]
  if (typeof v !== "boolean") throw new TypeError(`Unexpected response: ${what}.${key} is not a boolean.`)
  return v
}

export function reqInt(o: Obj, key: string, what: string): number {
  const v = o[key]
  if (typeof v !== "number" || !Number.isInteger(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not an integer.`)
  return v
}

export function reqUlid(o: Obj, key: string, what: string): string {
  const v = o[key]
  if (!isUlid(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a valid id.`)
  return v
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function reqDate(o: Obj, key: string, what: string): string {
  const v = o[key]
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a YYYY-MM-DD date.`)
  return v
}
export function optDate(o: Obj, key: string, what: string): string | undefined {
  return o[key] === null || o[key] === undefined ? undefined : reqDate(o, key, what)
}

export function reqEnum<T extends string>(o: Obj, key: string, what: string, allowed: readonly T[]): T {
  const v = o[key]
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not one of the documented values.`)
  return v as T
}

/** A decimal STRING such as "12.50" (percentages and money travel as strings). Numbers are rejected on purpose. */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
export function optDecimalString(o: Obj, key: string, what: string, dto: string = what): string | undefined {
  const v = unwrapSingle(o[key], dto, key)
  if (v === null || v === undefined) return undefined
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v
}

// ── Paging ──
export const MAX_PER_PAGE = 100

/** Backend list query: `page` (1-based) and `perPage` (1–100). Larger requests are a programming error, not silently cut. */
export function pageQuery(page: number | undefined, pageSize: number | undefined): QueryParams {
  if (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PER_PAGE)) {
    throw new RangeError(`pageSize must be an integer from 1 to ${MAX_PER_PAGE}.`)
  }
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) throw new RangeError("page must be an integer of at least 1.")
  return { page, perPage: pageSize }
}

/** `{ data: [...], meta: { total, ... } }` -> ListResult. */
export function parsePage<T>(raw: unknown, what: string, parseItem: (item: unknown) => T): ListResult<T> {
  const o = asObj(raw, what)
  if (!Array.isArray(o.data)) throw new TypeError(`Unexpected response: ${what}.data is not an array.`)
  const total = reqInt(asObj(o.meta, `${what}.meta`), "total", `${what}.meta`)
  if (total < 0) throw new TypeError(`Unexpected response: ${what}.meta.total is negative.`)
  return { items: o.data.map(parseItem), total }
}
