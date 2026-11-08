// Clinic Settings (chunk S1): the form's shape, the diff against the loaded settings, the checks, and the PATCH /settings body.
// Pure functions: no network, no React. The server stays the authority; these only stop an obviously wrong value before it is sent.
import type { Schemas } from "@/lib/api/contract"
import { isValidTimezone, type HospitalSettings } from "@/lib/session/hospital"

export const FISCAL_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const

/** Every field as the text box holds it ("" = empty / not set). */
export interface SettingsForm {
  nameEn: string
  nameUr: string
  address: string
  phone: string
  email: string
  tagline: string
  printHeader: string
  defaultCity: string
  defaultCountry: string
  timezone: string
  currencyCode: string
  fiscalYearStart: string
}
export type SettingsPatch = Partial<SettingsForm>
export type UpdateSettingsBody = Schemas["UpdateSettingsDto"]

export const SETTINGS_FIELDS: readonly (keyof SettingsForm)[] = [
  "nameEn", "nameUr", "address", "phone", "email", "tagline", "printHeader", "defaultCity", "defaultCountry", "timezone", "currencyCode", "fiscalYearStart",
]
const MAX_LENGTH: Partial<Record<keyof SettingsForm, number>> = { nameEn: 160, nameUr: 160, address: 300, phone: 60, tagline: 200, printHeader: 500, defaultCity: 80 }
const FIELD_LABEL: Record<keyof SettingsForm, string> = {
  nameEn: "Clinic name (English)", nameUr: "Clinic name (Urdu)", address: "Address", phone: "Phone", email: "Email", tagline: "Tagline", printHeader: "Print header",
  defaultCity: "Default city", defaultCountry: "Default country", timezone: "Time zone", currencyCode: "Currency", fiscalYearStart: "Financial year start",
}

export function settingsFormOf(s: HospitalSettings): SettingsForm {
  return {
    nameEn: s.nameEn, nameUr: s.nameUr ?? "", address: s.address ?? "", phone: s.phone ?? "", email: s.email ?? "", tagline: s.tagline ?? "",
    printHeader: s.printHeader ?? "", defaultCity: s.defaultCity ?? "", defaultCountry: s.defaultCountry, timezone: s.timezone, currencyCode: s.currencyCode,
    fiscalYearStart: s.fiscalYearStart ?? "",
  }
}

const clean = (field: keyof SettingsForm, value: string) => (field === "currencyCode" ? value.trim().toUpperCase() : value.trim())

/** Only the fields whose (trimmed) text differs from what was loaded. */
export function diffSettings(original: SettingsForm, edited: SettingsForm): SettingsPatch {
  const patch: SettingsPatch = {}
  for (const field of SETTINGS_FIELDS) {
    const next = clean(field, edited[field])
    if (next !== original[field].trim()) patch[field] = next
  }
  return patch
}

/** { field: message } for every value that cannot be right; empty = fine to send. */
export function validateSettingsForm(form: SettingsForm): Partial<Record<keyof SettingsForm, string>> {
  const found: Partial<Record<keyof SettingsForm, string>> = {}
  for (const [field, max] of Object.entries(MAX_LENGTH) as [keyof SettingsForm, number][]) {
    if (form[field].trim().length > max) found[field] = `${FIELD_LABEL[field]} can be at most ${max} characters`
  }
  if (form.nameEn.trim().length < 2) found.nameEn = "Clinic name needs at least 2 characters"
  const email = form.email.trim()
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = "Enter a valid email address, or leave it empty"
  if (form.defaultCountry.trim() === "") found.defaultCountry = "Default country is required"
  if (!isValidTimezone(form.timezone.trim())) found.timezone = "Enter a time zone name such as Asia/Karachi"
  if (!/^[A-Z]{3}$/.test(clean("currencyCode", form.currencyCode))) found.currencyCode = "Enter a 3-letter currency code such as PKR"
  const month = form.fiscalYearStart.trim()
  if (month !== "" && !(FISCAL_MONTHS as readonly string[]).includes(month)) found.fiscalYearStart = "Choose a month"
  return found
}

/**
 * PATCH /settings (UpdateSettingsDto): ONLY the changed fields plus expectedUpdatedAt, the version the admin loaded. "" clears an optional text
 * field (and the financial-year start); a required one (name, country, time zone, currency) is never sent empty.
 */
export function settingsUpdatePayload(patch: SettingsPatch, expectedUpdatedAt: string): UpdateSettingsBody {
  const body: Record<string, string> = {}
  for (const field of SETTINGS_FIELDS) {
    const raw = patch[field]
    if (raw === undefined) continue
    const value = clean(field, raw)
    if ((field === "nameEn" || field === "defaultCountry" || field === "timezone" || field === "currencyCode") && value === "") throw new RangeError(`${FIELD_LABEL[field]} cannot be empty.`)
    body[field] = value
  }
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  if (!expectedUpdatedAt) throw new RangeError("The loaded settings version is missing.")
  body.expectedUpdatedAt = expectedUpdatedAt
  return body as UpdateSettingsBody
}
