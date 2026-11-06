import type { MoneyString, Ulid } from "./types"

// Boundary helpers between the documented wire conventions (ids are ULID strings,
// money is a decimal string such as "1500.00") and the UI, which still uses
// `number` for money in its legacy domain types (src/types/index.ts).
//
// Mappers (src/lib/services/http/mappers.ts) call these at the edge so that:
//  - UI components never see a MoneyString, and
//  - a malformed backend value fails loudly instead of rendering NaN.
// They do not reformat dates or instants; those stay ISO strings until a screen needs display text.

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/ // Crockford base32, no I L O U
const MONEY_RE = /^-?\d+(\.\d+)?$/

export function isUlid(value: unknown): value is Ulid {
  return typeof value === "string" && ULID_RE.test(value)
}

/** "1500.00" -> 1500. Throws on anything that isn't a plain decimal string (numbers are rejected on purpose). */
export function parseMoney(value: unknown): number {
  if (typeof value !== "string" || !MONEY_RE.test(value)) {
    throw new TypeError("Expected a money value as a decimal string.")
  }
  return Number(value)
}

/**
 * 1500 -> "1500.00". Two decimal places follows the documented example ("1500.00");
 * confirm the exact scale per field in the OpenAPI spec before relying on it.
 */
export function formatMoney(value: number): MoneyString {
  if (!Number.isFinite(value)) throw new TypeError("Expected a finite number.")
  return value.toFixed(2)
}
