import { describe, expect, it } from "vitest"
import type { HospitalSettings } from "@/lib/session/hospital"
import { parseModuleState } from "./http/settings"
import { schemaOf, validate } from "./http/specValidate"
import { diffSettings, settingsFormOf, settingsUpdatePayload, validateSettingsForm } from "./settingsHelpers"

const LOADED: HospitalSettings = {
  hospitalCode: "H1", nameEn: "Citi Clinic", nameUr: null, address: "Street 1", phone: null, email: null, tagline: null, printHeader: null, defaultCity: "Lahore",
  defaultCountry: "Pakistan", timezone: "Asia/Karachi", currencyCode: "PKR", fiscalYearStart: "july", today: "2026-11-07", updatedAt: "2026-11-07T01:00:00.000Z",
}

describe("Clinic Settings form (S1)", () => {
  it("shows a missing optional value as an empty box", () => {
    const f = settingsFormOf(LOADED)
    expect(f.nameUr).toBe("")
    expect(f.fiscalYearStart).toBe("july")
    expect(f.defaultCity).toBe("Lahore")
  })

  it("diff carries only fields whose trimmed text changed; the currency is upper-cased", () => {
    const original = settingsFormOf(LOADED)
    expect(diffSettings(original, { ...original })).toEqual({})
    expect(diffSettings(original, { ...original, nameEn: "  Citi Clinic  " })).toEqual({})
    expect(diffSettings(original, { ...original, phone: " 0511111111 ", currencyCode: "usd" })).toEqual({ phone: "0511111111", currencyCode: "USD" })
    expect(diffSettings(original, { ...original, address: "" })).toEqual({ address: "" })
  })

  it("checks lengths, email, time zone, currency and month before anything is sent", () => {
    const ok = settingsFormOf(LOADED)
    expect(validateSettingsForm(ok)).toEqual({})
    const bad = validateSettingsForm({ ...ok, nameEn: "A", email: "not-an-email", timezone: "Mars/Base", currencyCode: "Rs.", defaultCountry: " ", tagline: "x".repeat(201), fiscalYearStart: "smarch" })
    expect(Object.keys(bad).sort()).toEqual(["currencyCode", "defaultCountry", "email", "fiscalYearStart", "nameEn", "tagline", "timezone"])
    expect(validateSettingsForm({ ...ok, email: "", fiscalYearStart: "" })).toEqual({})
    expect(validateSettingsForm({ ...ok, currencyCode: " pkr " })).toEqual({})
  })
})

describe("PATCH /settings body (S1)", () => {
  it("is ONLY the changed fields plus expectedUpdatedAt, and matches the contract", () => {
    const body = settingsUpdatePayload({ phone: "0511111111", nameUr: "" }, LOADED.updatedAt)
    expect(body).toEqual({ phone: "0511111111", nameUr: "", expectedUpdatedAt: LOADED.updatedAt })
    expect(validate(body, schemaOf("UpdateSettingsDto"))).toEqual([])
  })

  it("an empty optional field is sent as '' (clears it); the financial-year start too", () => {
    expect(settingsUpdatePayload({ fiscalYearStart: "" }, LOADED.updatedAt)).toMatchObject({ fiscalYearStart: "" })
    expect(validate(settingsUpdatePayload({ fiscalYearStart: "april", email: "" }, LOADED.updatedAt), schemaOf("UpdateSettingsDto"))).toEqual([])
  })

  it("never sends a required field empty, nothing at all, or without the loaded version", () => {
    expect(() => settingsUpdatePayload({ nameEn: " " }, LOADED.updatedAt)).toThrow(RangeError)
    expect(() => settingsUpdatePayload({ currencyCode: "" }, LOADED.updatedAt)).toThrow(RangeError)
    expect(() => settingsUpdatePayload({}, LOADED.updatedAt)).toThrow(RangeError)
    expect(() => settingsUpdatePayload({ phone: "1" }, "")).toThrow(RangeError)
  })
})

describe("module state (S2)", () => {
  it("reads ModuleStateDto", () => {
    expect(parseModuleState({ module: "lab", enabled: true, enabledAt: "2026-11-07T01:00:00.000Z" })).toEqual({ module: "lab", enabled: true, enabledAt: "2026-11-07T01:00:00.000Z" })
    expect(parseModuleState({ module: "ipd", enabled: false, enabledAt: null }).enabledAt).toBeNull()
  })
  it("refuses an unknown module or a non-boolean switch", () => {
    expect(() => parseModuleState({ module: "dental", enabled: true, enabledAt: null })).toThrow(TypeError)
    expect(() => parseModuleState({ module: "lab", enabled: "yes", enabledAt: null })).toThrow(TypeError)
    expect(() => parseModuleState(null)).toThrow(TypeError)
  })
})
