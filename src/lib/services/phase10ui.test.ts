import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  isSubstitute, PM_EXPIRY_LABEL, PM_LEVEL_LABEL, PM_MOVEMENT_LABEL, PM_TABS, PM_TAB_LABEL, draftForRx, draftProblem, emptyDraft, expiryClass, levelClass, linesToSend, outOfStockNames, returnable, shortages, wholeQuantity,
} from "@/components/pharmacy/pmUi"
import { PM_LEVELS, PM_MOVEMENT_TYPES } from "./http/pharmacyApi"
import type { PmPrescriptionLine } from "./types"

// Phase 10 screens: the rules behind the dispense screen, the labels, and the wiring. Pure logic is tested directly; the rest is checked in the source.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const rxLine = (over: Partial<PmPrescriptionLine> = {}): PmPrescriptionLine => ({
  id: "rx1", medicineText: "Paracetamol 500 mg", medicine: { id: "m1", name: "Paracetamol 500 mg", active: true }, dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", instructions: null, prescribed: 9, dispensed: 4, remaining: 5, ...over,
})

describe("whole-number quantities", () => {
  it("only digits are a quantity: no decimals, signs, spaces inside, or empty", () => {
    expect(wholeQuantity("8")).toBe(8)
    expect(wholeQuantity(" 12 ")).toBe(12)
    for (const bad of ["", "8.5", "-1", "+3", "abc", "1,000", "1e3", "99999999"]) expect(wholeQuantity(bad), bad).toBeNull()
  })
})

describe("the dispense lines", () => {
  it("a prescription line starts with the doctor's medicine (if still active), the quantity that remains and the dose as instructions", () => {
    const d = draftForRx(rxLine(), 7)
    expect(d).toMatchObject({ key: 7, medicineId: "m1", medicineName: "Paracetamol 500 mg", quantity: "5", prescriptionLineId: "rx1", instructions: "1 tab TDS 3 days", rx: { text: "Paracetamol 500 mg", remaining: 5 } })
  })
  it("a deactivated or free-text medicine is NOT preselected: the pharmacist chooses; nothing remaining starts empty", () => {
    expect(draftForRx(rxLine({ medicine: { id: "m1", name: "X", active: false } }), 1).medicineId).toBe("")
    expect(draftForRx(rxLine({ medicine: null }), 1)).toMatchObject({ medicineId: "", medicineName: "", prescriptionLineId: "rx1" })
    expect(draftForRx(rxLine({ remaining: 0 }), 1).quantity).toBe("")
    expect(draftForRx(rxLine({ remaining: null, prescribed: null }), 1).quantity).toBe("")
  })
  it("a substitute medicine is an UNLINKED line (handoff 8.9); the doctor's own pick, and a choice for a free-text line, stay linked", () => {
    const own = { ...draftForRx(rxLine(), 1), quantity: "5" }
    const substitute = { ...own, key: 2, medicineId: "m9", medicineName: "Panadol" }
    const free = { ...draftForRx(rxLine({ medicine: null }), 3), medicineId: "m8", medicineName: "Syrup", quantity: "1" }
    expect(isSubstitute(own)).toBe(false)
    expect(isSubstitute(substitute)).toBe(true)
    expect(isSubstitute(free)).toBe(false)
    expect(linesToSend([own, substitute, free]).map((l) => l.prescriptionLineId)).toEqual(["rx1", undefined, "rx1"])
  })
  it("only lines with a medicine and a quantity above zero are sent; a substitute is an unlinked line; empty instructions are left out", () => {
    const a = { ...draftForRx(rxLine(), 1), quantity: "5" }
    const sub = { ...emptyDraft(2), medicineId: "m2", medicineName: "Panadol", quantity: "3", instructions: "  " }
    const skipped = { ...draftForRx(rxLine({ id: "rx2" }), 3), medicineId: "m3", quantity: "0" }
    const blank = emptyDraft(4)
    expect(linesToSend([a, sub, skipped, blank])).toEqual([
      { medicineId: "m1", quantity: 5, prescriptionLineId: "rx1", instructions: "1 tab TDS 3 days" },
      { medicineId: "m2", quantity: 3, prescriptionLineId: undefined, instructions: undefined },
    ])
  })
  it("a line is flagged when the quantity is not a whole number or has no medicine, and an untouched blank line is not a problem", () => {
    expect(draftProblem(emptyDraft(1))).toBeNull()
    expect(draftProblem({ ...emptyDraft(1), medicineId: "m", quantity: "2.5" })).toMatch(/whole number/)
    expect(draftProblem({ ...emptyDraft(1), quantity: "3" })).toMatch(/Choose the medicine/)
    expect(draftProblem({ ...emptyDraft(1), medicineId: "m", quantity: "3" })).toBeNull()
    expect(draftProblem({ ...emptyDraft(1), medicineId: "m", quantity: "" })).toBeNull()
  })
})

describe("short stock and returns", () => {
  it("a line the server only part-filled is listed (dispensed against requested); a full line is not", () => {
    expect(shortages({ lines: [{ name: "A", requested: 10, dispensed: 8 }, { name: "B", requested: 5, dispensed: 5 }] } as never)).toEqual([{ name: "A", requested: 10, dispensed: 8 }])
    expect(shortages({ lines: [] } as never)).toEqual([])
  })
  it("what can still be returned is what was dispensed minus what came back, never below zero", () => {
    expect(returnable({ dispensed: 8, returned: 3 })).toBe(5)
    expect(returnable({ dispensed: 8, returned: 8 })).toBe(0)
    expect(returnable({ dispensed: 2, returned: 5 })).toBe(0)
  })
  it("the lines of an OUT_OF_STOCK refusal are shown by name whatever shape the backend sends (strings or objects with a name), and ignored otherwise", () => {
    expect(outOfStockNames({ lines: ["Amoxicillin", { name: "Brufen", medicineId: "x" }, { medicineId: "y" }, 7] })).toEqual(["Amoxicillin", "Brufen"])
    expect(outOfStockNames({ lines: "nope" })).toEqual([])
    expect(outOfStockNames(undefined)).toEqual([])
    expect(outOfStockNames([1, 2])).toEqual([])
  })
})

describe("labels", () => {
  it("every server level, movement type and tab has a label; the badges separate the levels", () => {
    for (const l of PM_LEVELS) expect(PM_LEVEL_LABEL[l]).toBeTruthy()
    for (const m of PM_MOVEMENT_TYPES) expect(PM_MOVEMENT_LABEL[m]).toBeTruthy()
    for (const t of PM_TABS) expect(PM_TAB_LABEL[t]).toBeTruthy()
    expect(PM_EXPIRY_LABEL.expired).toBeTruthy()
    expect(PM_EXPIRY_LABEL.expiring).toBeTruthy()
    expect(new Set([levelClass("in_stock"), levelClass("low"), levelClass("out_of_stock")]).size).toBe(3)
    expect(expiryClass("expired")).not.toBe(expiryClass("expiring"))
  })
})

describe("the screens are wired as the handoff says", () => {
  it("the pharmacy page shows the new hub in API mode and keeps the demo's own page otherwise", () => {
    const src = read("src/app/(dashboard)/pharmacy/[tab]/PharmacyHub.tsx")
    expect(src).toContain('pmDataSource === "api"')
    expect(src).toContain("<PharmacyApiHub tab=")
    expect(src).toContain("<MockPharmacyPage />")
  })
  it("the inventory shows only the server's stock figures: no summing of batches or quantities anywhere in the pharmacy components", () => {
    for (const f of ["MedicinesTab", "MedicineDialogs", "DispenseScreen", "DispenseHistoryTab", "SlipAndReturn", "PharmacyApiHub"]) {
      const code = read(`src/components/pharmacy/${f}.tsx`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      expect(code, f).not.toMatch(/\.reduce\(|addMoney|subMoney|sumMoney|parseFloat|toFixed/)
    }
    expect(read("src/components/pharmacy/pmUi.ts")).not.toMatch(/\.reduce\(/)
  })
  it("every pharmacy write goes through the single-request dialog or the submit guard; none retries", () => {
    for (const f of ["MedicineDialogs", "SlipAndReturn"]) expect(read(`src/components/pharmacy/${f}.tsx`), f).toContain("BillingActionDialog")
    const dispense = read("src/components/pharmacy/DispenseScreen.tsx")
    expect(dispense).toContain("useSubmitGuard")
    expect(dispense).toContain("pharmacyApiService.dispense(")
    expect(dispense).not.toMatch(/retry|setTimeout/)
  })
  it("permissions: stock changes need pharmacy.stock, dispensing and returns pharmacy.dispense; the dispense screen says so instead of asking the server", () => {
    expect(read("src/components/pharmacy/MedicinesTab.tsx")).toContain('can("pharmacy.stock")')
    expect(read("src/components/pharmacy/MedicineDialogs.tsx")).toContain('can("pharmacy.stock")')
    expect(read("src/components/pharmacy/DispenseScreen.tsx")).toContain('can("pharmacy.dispense")')
    expect(read("src/components/pharmacy/DispenseScreen.tsx")).toContain("Dispensing is not shown to your role")
  })
  it("the hub hides the Dispense tab from a user without pharmacy.dispense (handoff 5: hide what the user can never do)", () => {
    const src = read("src/components/pharmacy/PharmacyApiHub.tsx")
    expect(src).toContain('t !== "dispense" || can("pharmacy.dispense")')
    expect(src).toContain("{tabs.map((t) => {")
  })
  it("a patient's payment goes through billing (the bill opens from the result); a counter sale is paid in the same step; a print is read fresh", () => {
    const dispense = read("src/components/pharmacy/DispenseScreen.tsx")
    expect(dispense).toContain("InvoiceDetailDialog")
    expect(dispense).toContain("payment: { mode: payMode, reference }")
    expect(read("src/components/pharmacy/SlipAndReturn.tsx")).toContain("gcTime: 0")
  })
  it("worklists and registers: the inventory is a 15 s worklist, server-paged (10); the search text stays out of the address bar", () => {
    const med = read("src/components/pharmacy/MedicinesTab.tsx")
    expect(med).toContain("...CACHE_CLASSES.worklist")
    expect(med).toContain("const PAGE_SIZE = 10")
    for (const f of ["MedicinesTab", "DispenseHistoryTab"]) expect(read(`src/components/pharmacy/${f}.tsx`), f).not.toMatch(/url\.set\(\{[^}]*search/)
  })
})
