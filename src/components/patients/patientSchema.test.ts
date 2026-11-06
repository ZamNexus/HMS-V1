import { describe, expect, it } from "vitest"
import { patientSchema } from "./patientSchema"

const valid = { name: "Ayesha Khan", dob: "1990-01-01", gender: "Female", bloodGroup: "A+", phone: "0300-1234567" }
const issues = (v: unknown) => {
  const r = patientSchema.safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
}

describe("patient form validation (unchanged from the original form)", () => {
  it("accepts a minimal valid patient", () => {
    expect(patientSchema.safeParse(valid).success).toBe(true)
  })
  it("requires a name of at least 2 characters", () => {
    expect(issues({ ...valid, name: "A" })).toEqual(["name: Full name must be at least 2 characters"])
  })
  it("requires a date of birth", () => {
    expect(issues({ ...valid, dob: "" })).toEqual(["dob: Date of birth is required"])
  })
  it("enforces the 03XX-XXXXXXX phone format", () => {
    for (const bad of ["03001234567", "0300-123456", "0400-1234567", ""]) expect(issues({ ...valid, phone: bad })).toEqual(["phone: Format: 03XX-XXXXXXX"])
  })
  it("validates email only when provided", () => {
    expect(patientSchema.safeParse({ ...valid, email: "" }).success).toBe(true)
    expect(issues({ ...valid, email: "not-an-email" })).toEqual(["email: Enter a valid email address"])
  })
  it("limits remarks to 500 characters and restricts gender", () => {
    expect(issues({ ...valid, remarks: "x".repeat(501) })).toHaveLength(1)
    expect(issues({ ...valid, gender: "Unknown" })).toHaveLength(1)
  })
})
