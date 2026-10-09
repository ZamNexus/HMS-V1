import { describe, expect, it } from "vitest"
import { encounterBillBreakdown, patientBillBreakdown, type BillBreakdown } from "./billingAggregate"
import { ENCOUNTERS } from "@/data/encounters"
import { PATIENTS } from "@/data/patients"

// Invariant tests over the seed data rather than exact amounts, so they keep
// holding when demo data changes. Revisit when billing moves to the backend.

function partsTotal(b: BillBreakdown) {
  return b.consultation + b.services + b.lab + b.imaging + b.medicine
}

describe("encounterBillBreakdown", () => {
  it("has seed encounters to check", () => {
    expect(ENCOUNTERS.length).toBeGreaterThan(0)
  })

  it.each(ENCOUNTERS.map((e) => [e.encId, e.id] as const))("%s: total is the sum of its parts and balance is never negative", (_encId, id) => {
    const b = encounterBillBreakdown(id)
    expect(b.total).toBeCloseTo(partsTotal(b), 6)
    expect(b.balance).toBeGreaterThanOrEqual(0)
    expect(b.balance).toBeCloseTo(Math.max(0, b.total - b.received), 6)
  })

  it("returns all zeros for an unknown encounter", () => {
    const b = encounterBillBreakdown(-1)
    expect(Object.values(b).every((v) => v === 0)).toBe(true)
  })
})

describe("patientBillBreakdown", () => {
  it.each(PATIENTS.map((p) => [p.mrNo, p.id] as const))("%s: covers at least every linked encounter", (_mrNo, id) => {
    const b = patientBillBreakdown(id)
    const perEncounter = ENCOUNTERS.filter((e) => e.patientId === id).map((e) => encounterBillBreakdown(e.id))
    const encounterTotal = perEncounter.reduce((s, e) => s + e.total, 0)

    expect(b.total).toBeCloseTo(partsTotal(b), 6)
    // Standalone invoices/orders can only add to what the encounters already account for
    expect(b.total).toBeGreaterThanOrEqual(encounterTotal - 1e-6)
    expect(b.balance).toBeGreaterThanOrEqual(0)
  })

  it("returns all zeros for an unknown patient", () => {
    const b = patientBillBreakdown(-1)
    expect(Object.values(b).every((v) => v === 0)).toBe(true)
  })
})
