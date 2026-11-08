// Hospital settings and department switches (GET /settings, GET /settings/modules), loaded once after sign-in (MD section 5 and 6, cache class
// "session"). They decide how money and times are shown and what "today" is: never the browser's currency, time zone or clock (MD section 4).
import { asObj, optStr, reqEnum, reqStr, type Obj } from "@/lib/services/http/wire"
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
import type { ModuleName, ModuleSwitches } from "./permissions"

export interface HospitalSettings {
  hospitalCode: string
  nameEn: string
  nameUr: string | null
  address: string | null
  phone: string | null
  email: string | null
  tagline: string | null
  printHeader: string | null
  defaultCity: string | null
  defaultCountry: string
  /** IANA name, e.g. "Asia/Karachi": the zone every instant is shown in. */
  timezone: string
  /** ISO 4217, e.g. "PKR". */
  currencyCode: string
  /** Lower-case month name the financial year starts in, or null when not set. */
  fiscalYearStart: string | null
  /** The hospital's calendar day "YYYY-MM-DD" at the time of the request: the only source of "today". */
  today: string
  /** The loaded version: sent back as expectedUpdatedAt when the admin saves Clinic Settings (chunk S1). */
  updatedAt: string
}

export const MODULE_NAMES: readonly ModuleName[] = ["pharmacy", "lab", "imaging", "ipd"]

/** GET /settings. The JSON types most text fields as "array of string" (spec bug); the readers tolerate that with one warning per field. */
export function parseSettings(raw: unknown): HospitalSettings {
  const o: Obj = asObj(raw, "settings")
  const dto = "SettingsResponseDto_Output"
  const timezone = reqStr(o, "timezone", "settings")
  if (!isValidTimezone(timezone)) throw new TypeError("Unexpected response: settings.timezone is not a time zone this browser knows.")
  const today = reqStr(o, "today", "settings")
  if (!isIsoDate(today)) throw new TypeError("Unexpected response: settings.today is not a date.")
  const currencyCode = reqStr(o, "currencyCode", "settings")
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new TypeError("Unexpected response: settings.currencyCode is not a currency code.")
  return {
    hospitalCode: reqStr(o, "hospitalCode", "settings"),
    nameEn: reqStr(o, "nameEn", "settings"),
    nameUr: optStr(o, "nameUr", "settings", dto) ?? null,
    address: optStr(o, "address", "settings", dto) ?? null,
    phone: optStr(o, "phone", "settings", dto) ?? null,
    email: optStr(o, "email", "settings", dto) ?? null,
    tagline: optStr(o, "tagline", "settings", dto) ?? null,
    printHeader: optStr(o, "printHeader", "settings", dto) ?? null,
    defaultCity: optStr(o, "defaultCity", "settings", dto) ?? null,
    defaultCountry: reqStr(o, "defaultCountry", "settings"),
    timezone,
    currencyCode,
    fiscalYearStart: optStr(o, "fiscalYearStart", "settings", dto) ?? null,
    today,
    updatedAt: reqStr(o, "updatedAt", "settings"),
  }
}

/** GET /settings/modules -> the four switches. A module the server does not list counts as off (nothing is assumed on). */
export function parseModules(raw: unknown): Record<ModuleName, boolean> {
  const o = asObj(raw, "settings/modules")
  if (!Array.isArray(o.data)) throw new TypeError("Unexpected response: settings/modules.data is not a list.")
  const out: Record<ModuleName, boolean> = { pharmacy: false, lab: false, imaging: false, ipd: false }
  for (const item of o.data) {
    const m = asObj(item, "settings/modules.data[]")
    const name = reqEnum(m, "module", "settings/modules.data[]", MODULE_NAMES)
    if (typeof m.enabled !== "boolean") throw new TypeError("Unexpected response: settings/modules.data[].enabled is not a boolean.")
    out[name] = m.enabled
  }
  return out
}

/** GET /public/hospital?host= -> { code, name } (HospitalBrandingDto_Output). */
export function parseHospitalBranding(raw: unknown): { code: string; name: string } {
  const o = asObj(raw, "public hospital")
  return { code: reqStr(o, "code", "public hospital"), name: reqStr(o, "name", "public hospital") }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * A money string such as "1250.50" in the hospital's currency. The amount is handed to Intl as TEXT, never turned into a JS number, so no
 * rounding or float error can enter (Intl formats the decimal digits exactly).
 */
export function formatMoney(amount: string, currencyCode: string, locale = "en-PK"): string {
  // the API's money strings have at most 2 decimals; more would be rounded away by the fixed 2-digit format, so refuse them instead
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) throw new TypeError("formatMoney: the amount is not a money string with at most 2 decimals.")
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Intl.NumberFormat accepts a decimal string (ES2023 / NumberFormat v3) and formats it exactly
  return formatter.format(amount as unknown as number)
}

/**
 * The calendar day (YYYY-MM-DD) it is NOW in the hospital's time zone. Used ONLY to notice that the hospital's midnight has passed since GET /settings was read (the value shown to
 * users is always the server's `today`, re-read when this says the day changed): the browser's clock decides WHEN to ask, never WHAT the date is.
 */
export function dateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** An ISO-8601 UTC instant shown in the hospital's time zone (not the browser's). */
export function formatInstant(iso: string, timezone: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }, locale = "en-GB"): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) throw new TypeError("formatInstant: not a valid instant.")
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date)
}

export function modulesOrNull(modules: Record<ModuleName, boolean> | undefined): ModuleSwitches {
  return modules ?? null
}
