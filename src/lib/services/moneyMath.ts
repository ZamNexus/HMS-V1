import type { MoneyString } from "@/lib/api/types"

// Exact decimal arithmetic on money STRINGS ("1500.00"), the documented wire convention. Nothing here goes through
// floating point: values are held as integer minor units (BigInt, scale 2). The scale (2) follows the single documented
// example ("1500.00") — the real per-field scale is CONTRACT REQUIRED. A value with more than two decimals, or anything
// that is not a plain decimal string, throws instead of being rounded silently.
//
// These helpers exist for (a) the mock adapters and the form previews, which reproduce the demo rules the screens always
// used, and (b) display. They are NOT a source of truth for any posted amount: totals, balances and statuses that matter
// come from the backend once its contract is known.

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/
const HUNDRED = BigInt(100)
const ZERO = BigInt(0)

function toMinor(value: string): bigint {
  if (typeof value !== "string" || !MONEY_RE.test(value)) throw new TypeError(`Expected a money value as a decimal string with at most two decimals, got ${JSON.stringify(value)}.`)
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".")
  const minor = BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0"))
  return negative ? -minor : minor
}

function fromMinor(minor: bigint): MoneyString {
  const negative = minor < ZERO
  const abs = negative ? -minor : minor
  const text = `${abs / HUNDRED}.${(abs % HUNDRED).toString().padStart(2, "0")}`
  return negative && abs !== ZERO ? `-${text}` : text
}

export const isMoneyString = (value: unknown): value is MoneyString => typeof value === "string" && MONEY_RE.test(value)

export function addMoney(a: MoneyString, b: MoneyString): MoneyString {
  return fromMinor(toMinor(a) + toMinor(b))
}

export function subMoney(a: MoneyString, b: MoneyString): MoneyString {
  return fromMinor(toMinor(a) - toMinor(b))
}

export function sumMoney(values: readonly MoneyString[]): MoneyString {
  return fromMinor(values.reduce((sum, v) => sum + toMinor(v), ZERO))
}

/** -1, 0 or 1. */
export function compareMoney(a: MoneyString, b: MoneyString): number {
  const d = toMinor(a) - toMinor(b)
  return d < ZERO ? -1 : d > ZERO ? 1 : 0
}

export const isPositiveMoney = (value: MoneyString) => toMinor(value) > ZERO
export const isZeroMoney = (value: MoneyString) => toMinor(value) === ZERO

/** Negative results become "0.00" (the screens' `Math.max(0, …)`). */
export function floorAtZero(value: MoneyString): MoneyString {
  return toMinor(value) < ZERO ? "0.00" : value
}

/**
 * `amount × percent / 100`, rounded half away from zero to two decimals. `percent` is a decimal string such as "12.5".
 * The rounding rule is a demo/preview rule (the legacy screens did not round at all); the backend's rule is CONTRACT REQUIRED.
 */
export function percentOfMoney(amount: MoneyString, percent: string): MoneyString {
  if (typeof percent !== "string" || !MONEY_RE.test(percent)) throw new TypeError(`Expected a percentage as a decimal string, got ${JSON.stringify(percent)}.`)
  const product = toMinor(amount) * toMinor(percent) // minor × (percent × 100)
  const divisor = HUNDRED * HUNDRED
  const half = divisor / BigInt(2)
  const rounded = product < ZERO ? -((-product + half) / divisor) : (product + half) / divisor
  return fromMinor(rounded)
}

/**
 * `numerator / denominator × 100` as a decimal string with one decimal ("9.9", "-4.2"), rounded half away from zero, or null when the
 * denominator is zero. Exact (integer arithmetic). A demo / preview rule — the backend's definition of "change" is CONTRACT REQUIRED.
 */
export function ratioPercent(numerator: MoneyString, denominator: MoneyString): string | null {
  const n = toMinor(numerator)
  const d = toMinor(denominator)
  if (d === ZERO) return null
  const negative = (n < ZERO) !== (d < ZERO) && n !== ZERO
  const absN = n < ZERO ? -n : n
  const absD = d < ZERO ? -d : d
  const tenths = (absN * BigInt(2000) + absD) / (absD * BigInt(2)) // round(|n| × 1000 / |d|)
  const text = `${tenths / BigInt(10)}.${(tenths % BigInt(10)).toString()}`
  return negative && tenths !== ZERO ? `-${text}` : text
}

/** `quantity × rate` for a whole or fractional quantity given as a decimal string. */
export function multiplyMoney(rate: MoneyString, quantity: string): MoneyString {
  return percentOfMoney(rate, scaleUp(quantity)) // rate × (quantity × 100) / 100
}
function scaleUp(quantity: string): string {
  if (typeof quantity !== "string" || !MONEY_RE.test(quantity)) throw new TypeError(`Expected a quantity as a decimal string, got ${JSON.stringify(quantity)}.`)
  return fromMinor(toMinor(quantity) * HUNDRED)
}

/**
 * Converts a legacy `number` from the demo data / a numeric form field to a money string. ONLY for the mock boundary and
 * form fields (the legacy UI types are `number`); rounds to two decimals and rejects NaN / Infinity. Real backend values
 * never pass through here — they are already strings.
 */
export function moneyFromNumber(value: number): MoneyString {
  if (!Number.isFinite(value)) throw new TypeError("Expected a finite number.")
  return fromMinor(BigInt(Math.round(value * 100)))
}

/**
 * A number typed into a numeric form field -> a money string, or null when it is not exactly representable with at most two
 * decimals (so a third decimal is a validation error, never silently rounded) or is not finite.
 */
export function moneyFromInputNumber(value: number): MoneyString | null {
  if (!Number.isFinite(value)) return null
  const scaled = value * 100
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return null
  return fromMinor(BigInt(Math.round(scaled)))
}

/** Text typed into a field ("1500", "1500.5") -> a normalised money string ("1500.00"), or null when empty / invalid. */
export function normalizeMoneyInput(text: string): MoneyString | null {
  const trimmed = text.trim()
  if (!MONEY_RE.test(trimmed)) return null
  return fromMinor(toMinor(trimmed))
}

// The symbol shown before an amount: "Rs." for the Pakistani rupee (the default and the demo), the hospital's three-letter code for any other currency (set once the settings are read).
let symbol = "Rs."
export function setMoneyCurrency(code: string | null | undefined): void { symbol = !code || code === "PKR" ? "Rs." : code }
export function moneySymbol(): string { return symbol }

/** Display text without floating point: "Rs. 1,500" for whole amounts, "Rs. 1,500.50" when there are paisa. */
export function formatMoneyString(value: MoneyString): string {
  const minor = toMinor(value)
  const negative = minor < ZERO
  const abs = negative ? -minor : minor
  const whole = (abs / HUNDRED).toLocaleString("en-PK")
  const cents = abs % HUNDRED
  return `${symbol} ${negative ? "-" : ""}${whole}${cents === ZERO ? "" : `.${cents.toString().padStart(2, "0")}`}` // sign after the symbol, as formatCurrency always showed it
}
