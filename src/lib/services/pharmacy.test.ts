import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpDispensingService, httpMedicinesService } from "./http/pharmacy"
import { dispensingService, medicinesService } from "./index"
import { mockDispensingService, mockMedicinesService } from "./mock/pharmacy"
import {
  INVENTORY_FILTERS, daysToExpiry, dispenseTotals, findStockShortfalls, inventorySummary, matchesInventoryFilter, medicineStatus, planDispense,
} from "./pharmacyHelpers"
import { PHARMACY_OPERATIONS, pharmacyContractStatus } from "./pharmacyContract"
import { loadShared } from "./reference/cache"
import type { DispenseInput, MedicineInput } from "./types"

// Frontend-only unit tests with controlled data. They verify the UI-facing contract of the mock adapters and that the
// real-backend adapters send nothing while the contract is unconfirmed. None of them says anything about the real
// backend. (Screen rendering — loading, error, empty — is verified in a browser, not here.)

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const KEYS = ["medicines.list", "medicines.create", "medicines.update", "medicines.adjustStock", "dispensing.list", "dispensing.create"] as const
const medsSnapshot = structuredClone(MEDICINES)
const dispSnapshot = structuredClone(DISPENSE_RECORDS)
const labSnapshot = JSON.stringify(LAB_ORDERS)
const imgSnapshot = JSON.stringify(IMAGING_ORDERS)
beforeEach(() => {
  MEDICINES.splice(0, MEDICINES.length, ...structuredClone(medsSnapshot))
  DISPENSE_RECORDS.splice(0, DISPENSE_RECORDS.length, ...structuredClone(dispSnapshot))
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) ENDPOINTS[k] = null
})

const stockOf = (id: number) => MEDICINES.find((m) => m.id === id)!.stock
const medInput: MedicineInput = { name: "Test Syrup", generic: "Testamol", category: "Analgesic", batchNo: "TS-1", expiry: "2027-06-30", stock: 40, saleRate: 100, reorderLevel: 5 }
const dispense: DispenseInput = {
  patientId: "2", doctorId: "2", discountPct: 10, gstPct: 5, paymentMode: "Cash", notes: "after food",
  lines: [
    { medicineId: "2", quantity: 10, discountPct: 0, includedInPackage: false, instructions: "tid" }, // Panadol 4 × 10 = 40
    { medicineId: "1", quantity: 2, discountPct: 10, includedInPackage: false }, // Augmentin 28 × 2 = 56 − 10% = 50.4
  ],
}

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any inventory or dispensing operation", () => {
    for (const k of KEYS) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("sends no request and reports 'awaiting the backend contract' for every operation", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpMedicinesService.list({ search: "x" }),
      httpMedicinesService.create(medInput),
      httpMedicinesService.update("1", medInput),
      httpMedicinesService.adjustStock("1", { direction: "Add", quantity: 5 }),
      httpDispensingService.list({ patientId: "1" }),
      httpDispensingService.create(dispense),
    ]
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    // hypothetical paths, test-only
    ENDPOINTS["medicines.list"] = { method: "GET", path: "/medicines" }
    ENDPOINTS["medicines.create"] = { method: "POST", path: "/medicines" }
    ENDPOINTS["medicines.adjustStock"] = { method: "POST", path: "/medicines/:id/stock" }
    ENDPOINTS["dispensing.list"] = { method: "GET", path: "/dispenses" }
    ENDPOINTS["dispensing.create"] = { method: "POST", path: "/dispenses" }
    await expect(httpMedicinesService.list()).rejects.toThrow(/query parameters/)
    await expect(httpMedicinesService.create(medInput)).rejects.toThrow(/request payload/)
    await expect(httpMedicinesService.adjustStock("1", { direction: "Remove", quantity: 1 })).rejects.toThrow(/request payload/)
    await expect(httpDispensingService.list()).rejects.toThrow(/query parameters/)
    await expect(httpDispensingService.create(dispense)).rejects.toThrow(/request payload/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not read or guess a response while the mapping is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: ULID, name: "X" }], total: 1 }), { headers: { "content-type": "application/json" } })))
    ENDPOINTS["medicines.list"] = { method: "GET", path: "/medicines" } // hypothetical path, test-only
    // the query mapper is pending, so the request is never even sent, let alone parsed
    await expect(httpMedicinesService.list()).rejects.toThrow(/query parameters/)
  })

  it("the HTTP adapters can never fall back to demo data: they import nothing from src/data or the mock adapters", () => {
    const dir = join(__dirname, "http")
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    expect(files).toContain("pharmacy.ts")
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8")
      expect(source, file).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
    }
  })
})

describe("pharmacy contract status (what the screens may offer in API mode)", () => {
  it("API mode with every endpoint unset: pending, all six operations missing, none available", () => {
    const c = pharmacyContractStatus("api")
    expect(c.pending).toBe(true)
    expect([...c.missing]).toEqual([...PHARMACY_OPERATIONS])
    expect(PHARMACY_OPERATIONS.some((op) => c.can(op))).toBe(false)
  })

  it("mock mode is never pending: every operation is available", () => {
    const c = pharmacyContractStatus("mock")
    expect(c.pending).toBe(false)
    expect(c.missing).toEqual([])
    expect(PHARMACY_OPERATIONS.every((op) => c.can(op))).toBe(true)
  })

  it("an operation becomes available only when its own endpoint is configured; the rest stay blocked", () => {
    // hypothetical path, test-only: used on a copy of the table, never on the shipped one
    const table = { ...ENDPOINTS, "medicines.list": { method: "GET" as const, path: "/hypothetical" } }
    const c = pharmacyContractStatus("api", table)
    expect(c.can("medicines.list")).toBe(true)
    expect(c.can("dispensing.create")).toBe(false)
    expect(c.pending).toBe(true)
    expect(c.missing).not.toContain("medicines.list")
    const all = Object.fromEntries(PHARMACY_OPERATIONS.map((op) => [op, { method: "GET" as const, path: "/hypothetical" }]))
    expect(pharmacyContractStatus("api", { ...ENDPOINTS, ...all }).pending).toBe(false)
  })

  it("the Pharmacy screen reads no demo array and no mock adapter directly (only the services)", () => {
    const source = readFileSync(join(__dirname, "../../app/(dashboard)/pharmacy/[tab]/PharmacyHub.tsx"), "utf8")
    expect(source).not.toMatch(/\bMEDICINES\b|\bDISPENSE_RECORDS\b|\/mock\//)
  })
})

describe("mock inventory (T4): list", () => {
  it("returns string-id records with the full total, and searches by name or generic", async () => {
    const all = await mockMedicinesService.list()
    expect(all.total).toBe(MEDICINES.length)
    expect(all.items.every((m) => typeof m.id === "string")).toBe(true)
    expect((await mockMedicinesService.list({ search: "panadol" })).items.map((m) => m.id)).toEqual(["2"])
    expect((await mockMedicinesService.list({ search: "paracetamol" })).items.map((m) => m.name)).toContain("Panadol 500mg")
    expect((await mockMedicinesService.list({ search: "zzzz-no-match" })).total).toBe(0)
  })

  it("pages, keeping the full total", async () => {
    const page = await mockMedicinesService.list({ page: 2, pageSize: 10 })
    expect(page.items).toHaveLength(Math.min(10, MEDICINES.length - 10))
    expect(page.total).toBe(MEDICINES.length)
  })
})

describe("mock inventory (T4): create and update", () => {
  it("creates a medicine in the shared array with the dialog's old demo defaults", async () => {
    const before = MEDICINES.length
    const m = await mockMedicinesService.create(medInput)
    expect(MEDICINES).toHaveLength(before + 1)
    expect(m.id).toBe(String(MEDICINES.at(-1)!.id))
    expect(MEDICINES.at(-1)).toMatchObject({ name: "Test Syrup", batchNo: "TS-1", stock: 40, saleRate: 100, unit: "Tablet", purchaseRate: 60, reorderLevel: 5 })
  })

  it("validates the required fields and stores nothing", async () => {
    const before = MEDICINES.length
    await expect(mockMedicinesService.create({ ...medInput, name: " ", batchNo: "", expiry: "", saleRate: 0 })).rejects.toMatchObject({
      status: 400, body: { details: [{ path: "name" }, { path: "batchNo" }, { path: "expiry" }, { path: "saleRate" }] },
    })
    expect(MEDICINES).toHaveLength(before)
  })

  it("updates the editable fields and keeps the rest; unknown ids (a ULID included) are 404", async () => {
    const before = MEDICINES[0]
    const m = await mockMedicinesService.update("1", { ...medInput, name: "Augmentin 1g" })
    expect(m).toMatchObject({ id: "1", name: "Augmentin 1g", batchNo: "TS-1", stock: 40 })
    expect(MEDICINES[0]).toMatchObject({ unit: before.unit, purchaseRate: before.purchaseRate, supplier: before.supplier })
    for (const id of ["99999", ULID, "nope"]) await expect(mockMedicinesService.update(id, medInput)).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock inventory (T4): stock adjustment", () => {
  it("adds and removes, and floors the stock at zero (as the dialog always did)", async () => {
    const start = stockOf(2)
    expect((await mockMedicinesService.adjustStock("2", { direction: "Add", quantity: 25 })).stock).toBe(start + 25)
    expect((await mockMedicinesService.adjustStock("2", { direction: "Remove", quantity: 5, reason: "damaged" })).stock).toBe(start + 20)
    expect((await mockMedicinesService.adjustStock("2", { direction: "Remove", quantity: 99999 })).stock).toBe(0)
    expect(stockOf(2)).toBe(0)
  })

  it("rejects a zero, negative or non-numeric quantity without changing stock, and unknown ids are 404", async () => {
    const start = stockOf(2)
    for (const quantity of [0, -3, NaN]) {
      await expect(mockMedicinesService.adjustStock("2", { direction: "Add", quantity })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "quantity" }] } })
    }
    expect(stockOf(2)).toBe(start)
    await expect(mockMedicinesService.adjustStock(ULID, { direction: "Add", quantity: 1 })).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock dispensing (T5): list", () => {
  it("returns string ids, newest first, with the full total", async () => {
    const { items, total } = await mockDispensingService.list()
    expect(total).toBe(DISPENSE_RECORDS.length)
    expect(items.every((d) => typeof d.id === "string" && typeof d.patientId === "string" && d.lines.every((l) => typeof l.medicineId === "string"))).toBe(true)
    const times = items.map((d) => new Date(d.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("filters by patient, searches by dispense number, and pages", async () => {
    const target = DISPENSE_RECORDS[0]
    expect((await mockDispensingService.list({ patientId: String(target.patientId) })).items.every((d) => d.patientId === String(target.patientId))).toBe(true)
    expect((await mockDispensingService.list({ search: target.disNo.toLowerCase() })).items.map((d) => d.disNo)).toContain(target.disNo)
    expect((await mockDispensingService.list({ search: "zzzz-no-match" })).total).toBe(0)
    const page = await mockDispensingService.list({ page: 2, pageSize: 5 })
    expect(page.items).toHaveLength(5)
    expect(page.total).toBe(DISPENSE_RECORDS.length)
  })
})

describe("mock dispensing (T5): create", () => {
  it("creates a record with server-style fields, totals, and shares state with legacy readers", async () => {
    const before = DISPENSE_RECORDS.length
    const d = await mockDispensingService.create(dispense)
    expect(DISPENSE_RECORDS).toHaveLength(before + 1)
    expect(d.id).toBe(String(DISPENSE_RECORDS.at(-1)!.id))
    expect(d.disNo).toMatch(/^DIS-\d{4}-\d{4}$/)
    expect(d).toMatchObject({ patientId: "2", doctorId: "2", encounterId: null, paymentMode: "Cash", discountPct: 10, gstPct: 5, notes: "after food", dispensedBy: "Omar Farooq" })
    expect(d.lines.map((l) => [l.medicineId, l.prescribedQty, l.dispensedQty])).toEqual([["2", 10, 10], ["1", 2, 2]])
    expect(d.subtotal).toBeCloseTo(90.4)
    expect(d.netPayable).toBeCloseTo((90.4 * 0.9) * 1.05)
    expect(DISPENSE_RECORDS.at(-1)).toMatchObject({ patientId: 2, doctorId: 2, lines: [{ medicineId: 2 }, { medicineId: 1 }] })
  })

  it("numbers records in sequence", async () => {
    const a = await mockDispensingService.create(dispense)
    const b = await mockDispensingService.create(dispense)
    expect(Number(b.disNo.slice(-4))).toBe(Number(a.disNo.slice(-4)) + 1)
  })

  it("links an existing encounter, and rejects an unknown one", async () => {
    const enc = String(DISPENSE_RECORDS[0].encounterId)
    expect((await mockDispensingService.create({ ...dispense, encounterId: enc })).encounterId).toBe(enc)
    await expect(mockDispensingService.create({ ...dispense, encounterId: "99999" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "encounterId" }] } })
  })

  it("the doctor is optional", async () => {
    const d = await mockDispensingService.create({ ...dispense, doctorId: undefined })
    expect(d.doctorId).toBeUndefined()
  })

  it("does not touch laboratory or imaging data", async () => {
    await mockDispensingService.create(dispense)
    expect(JSON.stringify(LAB_ORDERS)).toBe(labSnapshot)
    expect(JSON.stringify(IMAGING_ORDERS)).toBe(imgSnapshot)
  })
})

describe("mock dispensing (T5): stock consistency and quantity rules", () => {
  it("deducts exactly the dispensed quantity from the shared inventory", async () => {
    const [panadol, augmentin] = [stockOf(2), stockOf(1)]
    await mockDispensingService.create(dispense)
    expect(stockOf(2)).toBe(panadol - 10)
    expect(stockOf(1)).toBe(augmentin - 2)
  })

  it("dispensing exactly the stock on hand succeeds and leaves zero", async () => {
    expect(stockOf(4)).toBe(8)
    const d = await mockDispensingService.create({ ...dispense, lines: [{ medicineId: "4", quantity: 8, discountPct: 0, includedInPackage: false }] })
    expect(d.lines[0]).toMatchObject({ prescribedQty: 8, dispensedQty: 8, total: 8 * 9 })
    expect(stockOf(4)).toBe(0)
  })

  it("the same medicine on two rows draws on one shelf: both rows are dispensed in full when the total fits", async () => {
    const d = await mockDispensingService.create({
      ...dispense,
      lines: [
        { medicineId: "4", quantity: 5, discountPct: 0, includedInPackage: false },
        { medicineId: "4", quantity: 3, discountPct: 0, includedInPackage: false },
      ],
    })
    expect(d.lines.map((l) => [l.prescribedQty, l.dispensedQty])).toEqual([[5, 5], [3, 3]])
    expect(stockOf(4)).toBe(0)
  })

  describe("refusal on short stock (Task List T5: \"refusal on short stock\")", () => {
    const shortBy = (medicineId: string, quantity: number) => ({ medicineId, quantity, discountPct: 0, includedInPackage: false })
    const refused = async (lines: DispenseInput["lines"]) => {
      const records = DISPENSE_RECORDS.length
      const stock = MEDICINES.map((m) => [m.id, m.stock])
      const snapshot = JSON.stringify(DISPENSE_RECORDS)
      const err = await mockDispensingService.create({ ...dispense, lines }).then(() => null, (e: unknown) => e)
      expect(err, "the dispense must be refused").toMatchObject({ status: 400, message: expect.stringMatching(/insufficient stock/i) })
      // nothing stored, no stock moved for ANY medicine
      expect(DISPENSE_RECORDS).toHaveLength(records)
      expect(JSON.stringify(DISPENSE_RECORDS)).toBe(snapshot)
      expect(MEDICINES.map((m) => [m.id, m.stock])).toEqual(stock)
      return err as { body: { details: { path: string; message: string }[] } }
    }

    it("refuses a single line that asks for more than is in stock, instead of dispensing the shelf", async () => {
      expect(stockOf(4)).toBe(8)
      const err = await refused([shortBy("4", 20)])
      expect(err.body.details).toEqual([{ path: "lines.0.quantity", message: expect.stringMatching(/20 requested, 8 in stock/) }])
    })

    it("refuses one more than is in stock, but accepts exactly the stock", async () => {
      await refused([shortBy("4", 9)])
      await expect(mockDispensingService.create({ ...dispense, lines: [shortBy("4", 8)] })).resolves.toBeDefined()
    })

    it("refuses a medicine that is already out of stock", async () => {
      MEDICINES[MEDICINES.findIndex((m) => m.id === 4)].stock = 0
      await refused([shortBy("4", 1)])
    })

    it("refuses the WHOLE dispense when only the second line is short: the first line's stock is not deducted", async () => {
      const panadol = stockOf(2)
      const err = await refused([shortBy("2", 10), shortBy("4", 99)])
      expect(err.body.details.map((d) => d.path)).toEqual(["lines.1.quantity"])
      expect(stockOf(2)).toBe(panadol)
    })

    it("refuses when the same medicine on two rows adds up to more than the shelf, flagging the row that crosses the line", async () => {
      const err = await refused([shortBy("4", 6), shortBy("4", 6)])
      expect(err.body.details).toEqual([{ path: "lines.1.quantity", message: expect.stringMatching(/6 requested, 2 in stock/) }])
    })

    it("reports every short line, not just the first", async () => {
      const err = await refused([shortBy("4", 99), shortBy("2", 10), shortBy("1", 99999)])
      expect(err.body.details.map((d) => d.path)).toEqual(["lines.0.quantity", "lines.2.quantity"])
    })

    it("a refused dispense does not consume a dispense number", async () => {
      const highest = Math.max(...DISPENSE_RECORDS.map((d) => Number(d.disNo.slice(-4))))
      await refused([shortBy("4", 99)])
      const a = await mockDispensingService.create(dispense)
      expect(Number(a.disNo.slice(-4))).toBe(highest + 1)
    })

    it("sufficient stock is unaffected: it succeeds and deducts every line", async () => {
      const [panadol, augmentin] = [stockOf(2), stockOf(1)]
      const d = await mockDispensingService.create(dispense)
      expect(d.lines.every((l) => l.dispensedQty === l.prescribedQty)).toBe(true)
      expect(stockOf(2)).toBe(panadol - 10)
      expect(stockOf(1)).toBe(augmentin - 2)
    })

    it("invalid medicine ids and quantities cause no partial stock change, even after a valid first line", async () => {
      const stock = MEDICINES.map((m) => m.stock)
      const records = DISPENSE_RECORDS.length
      const bad: DispenseInput["lines"][number][] = [
        shortBy("99999", 1), shortBy(ULID, 1), shortBy("007", 1), shortBy("2", 0), shortBy("2", -4), shortBy("2", NaN), shortBy("2", Infinity),
      ]
      for (const b of bad) {
        await expect(mockDispensingService.create({ ...dispense, lines: [shortBy("2", 10), b] })).rejects.toMatchObject({ status: 400 })
      }
      expect(MEDICINES.map((m) => m.stock)).toEqual(stock)
      expect(DISPENSE_RECORDS).toHaveLength(records)
    })
  })

  it("a package line is dispensed (stock leaves) but charged nothing", async () => {
    const start = stockOf(2)
    const d = await mockDispensingService.create({ ...dispense, discountPct: 0, gstPct: 0, lines: [{ medicineId: "2", quantity: 5, discountPct: 0, includedInPackage: true }] })
    expect(d.lines[0]).toMatchObject({ dispensedQty: 5, total: 0 })
    expect(d.netPayable).toBe(0)
    expect(stockOf(2)).toBe(start - 5)
  })

  it("rejects a zero, negative or non-numeric quantity and changes nothing", async () => {
    const before = DISPENSE_RECORDS.length
    const stock = stockOf(2)
    for (const quantity of [0, -1, NaN]) {
      await expect(
        mockDispensingService.create({ ...dispense, lines: [{ medicineId: "2", quantity, discountPct: 0, includedInPackage: false }] })
      ).rejects.toMatchObject({ status: 400, body: { details: [{ path: "lines.0.quantity" }] } })
    }
    expect(DISPENSE_RECORDS).toHaveLength(before)
    expect(stockOf(2)).toBe(stock)
  })

  it("never coerces a non-numeric id: it rejects and stores nothing, with stock untouched", async () => {
    const before = DISPENSE_RECORDS.length
    const stock = MEDICINES.map((m) => m.stock)
    await expect(mockDispensingService.create({ ...dispense, patientId: ULID })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "patientId" }] } })
    await expect(mockDispensingService.create({ ...dispense, doctorId: "007" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "doctorId" }] } })
    await expect(mockDispensingService.create({ ...dispense, encounterId: ULID })).rejects.toMatchObject({ status: 400 })
    await expect(mockDispensingService.create({ ...dispense, lines: [{ ...dispense.lines[0], medicineId: ULID }] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "lines.0.medicineId" }] } })
    await expect(mockDispensingService.create({ ...dispense, lines: [{ ...dispense.lines[0], medicineId: "99999" }] })).rejects.toMatchObject({ status: 400 })
    await expect(mockDispensingService.create({ ...dispense, lines: [] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "lines" }] } })
    // a bad second line must not leave the first line's stock deducted
    await expect(mockDispensingService.create({ ...dispense, lines: [dispense.lines[0], { ...dispense.lines[0], medicineId: ULID }] })).rejects.toMatchObject({ status: 400 })
    expect(DISPENSE_RECORDS).toHaveLength(before)
    expect(MEDICINES.map((m) => m.stock)).toEqual(stock)
  })
})

describe("pharmacy helpers", () => {
  const NOW = Date.parse("2026-06-15T00:00:00Z")
  const med = (over: Partial<{ expiry: string; stock: number; reorderLevel: number }> = {}) => ({ expiry: "2027-01-01", stock: 100, reorderLevel: 20, ...over })

  it("status: expiry beats stock, out of stock beats expiring soon, expiring soon beats low stock", () => {
    expect(medicineStatus(med(), NOW).label).toBe("In Stock")
    expect(medicineStatus(med({ stock: 5 }), NOW).label).toBe("Low Stock")
    expect(medicineStatus(med({ stock: 20 }), NOW).label).toBe("In Stock") // not below the reorder level
    expect(medicineStatus(med({ stock: 0 }), NOW).label).toBe("Out of Stock")
    expect(medicineStatus(med({ expiry: "2026-07-01" }), NOW)).toMatchObject({ label: "Expiring Soon", days: 16 })
    expect(medicineStatus(med({ expiry: "2026-07-01", stock: 5 }), NOW).label).toBe("Expiring Soon")
    expect(medicineStatus(med({ expiry: "2026-07-01", stock: 0 }), NOW).label).toBe("Out of Stock")
    expect(medicineStatus(med({ expiry: "2026-01-01", stock: 0 }), NOW).label).toBe("Expired")
    expect(daysToExpiry("2026-06-16", NOW)).toBe(1)
  })

  it("filters match the screen's rules", () => {
    expect([...INVENTORY_FILTERS]).toEqual(["All", "Low Stock", "Out of Stock", "Expiring Soon", "Expired"])
    expect(matchesInventoryFilter(med({ stock: 0 }), "Low Stock", NOW)).toBe(false) // out of stock is not "low"
    expect(matchesInventoryFilter(med({ stock: 5 }), "Low Stock", NOW)).toBe(true)
    expect(matchesInventoryFilter(med({ stock: 0 }), "Out of Stock", NOW)).toBe(true)
    expect(matchesInventoryFilter(med({ expiry: "2026-07-15" }), "Expiring Soon", NOW)).toBe(true) // exactly 30 days
    expect(matchesInventoryFilter(med({ expiry: "2026-07-16" }), "Expiring Soon", NOW)).toBe(false)
    expect(matchesInventoryFilter(med({ expiry: "2026-06-01" }), "Expiring Soon", NOW)).toBe(false)
    expect(matchesInventoryFilter(med({ expiry: "2026-06-01" }), "Expired", NOW)).toBe(true)
    expect(matchesInventoryFilter(med({ expiry: "2020-01-01" }), "All", NOW)).toBe(true)
  })

  it("the header summary counts items, values stock at the sale rate, and counts low / expiring", () => {
    const items = [{ ...med({ stock: 10 }), saleRate: 5 }, { ...med({ stock: 5 }), saleRate: 2 }, { ...med({ expiry: "2026-07-01" }), saleRate: 1 }]
    expect(inventorySummary(items, NOW)).toEqual({ totalItems: 3, inventoryValue: 10 * 5 + 5 * 2 + 100, lowStock: 2, expiringSoon: 1 })
    expect(inventorySummary([], NOW)).toEqual({ totalItems: 0, inventoryValue: 0, lowStock: 0, expiringSoon: 0 })
  })

  it("planDispense charges and dispenses what was asked for (it never trims to the shelf) and skips unknown medicines", () => {
    const facts: Record<string, { name: string; stock: number; saleRate: number }> = { a: { name: "A", stock: 5, saleRate: 10 } }
    const lines = planDispense(
      [
        { medicineId: "a", qty: 4, discountPct: 0, includedInPackage: false },
        { medicineId: "a", qty: 4, discountPct: 50, includedInPackage: false },
        { medicineId: "zzz", qty: 1, discountPct: 0, includedInPackage: false },
      ],
      (id) => facts[id]
    )
    expect(lines.map((l) => [l.prescribedQty, l.dispensedQty, l.total])).toEqual([[4, 4, 40], [4, 4, 20]])
    expect(lines[1]).toMatchObject({ medicineName: "A" })
    expect(planDispense([{ medicineId: "a", qty: -3, discountPct: 0, includedInPackage: false }], (id) => facts[id])[0].dispensedQty).toBe(0)
  })

  it("findStockShortfalls flags rows beyond the shelf, sharing one shelf across rows of the same medicine", () => {
    const facts: Record<string, { name: string; stock: number }> = { a: { name: "A", stock: 5 }, b: { name: "B", stock: 0 } }
    const of = (id: string) => facts[id]
    expect(findStockShortfalls([{ medicineId: "a", qty: 5 }], of)).toEqual([])
    expect(findStockShortfalls([{ medicineId: "a", qty: 6 }], of)).toEqual([{ rowIndex: 0, medicineId: "a", medicineName: "A", requested: 6, available: 5 }])
    // 3 + 3 > 5: the second row crosses the line and sees only what the first left
    expect(findStockShortfalls([{ medicineId: "a", qty: 3 }, { medicineId: "a", qty: 3 }], of)).toEqual([
      { rowIndex: 1, medicineId: "a", medicineName: "A", requested: 3, available: 2 },
    ])
    expect(findStockShortfalls([{ medicineId: "b", qty: 1 }], of)).toEqual([{ rowIndex: 0, medicineId: "b", medicineName: "B", requested: 1, available: 0 }])
    // not shortfalls: no medicine chosen, unknown medicine, zero / negative / NaN quantity (separate validation errors)
    expect(findStockShortfalls([{ medicineId: null, qty: 9 }, { medicineId: "zzz", qty: 9 }, { medicineId: "a", qty: 0 }, { medicineId: "a", qty: -1 }, { medicineId: "a", qty: NaN }], of)).toEqual([])
    // row index is the index in the array passed in, so a leading empty row keeps the numbering aligned with the form
    expect(findStockShortfalls([{ medicineId: null, qty: 1 }, { medicineId: "a", qty: 9 }], of)[0].rowIndex).toBe(1)
  })

  it("dispenseTotals applies the flat discount and then GST", () => {
    const lines = [{ dispensedQty: 10, unitRate: 4, total: 40 }, { dispensedQty: 2, unitRate: 28, total: 50.4 }]
    const t = dispenseTotals(lines, 10, 5)
    expect(t.grossTotal).toBe(96)
    expect(t.subtotal).toBeCloseTo(90.4)
    expect(t.netPayable).toBeCloseTo(90.4 * 0.9 * 1.05)
    expect(dispenseTotals(lines, 0, 0).netPayable).toBeCloseTo(90.4)
    expect(dispenseTotals(lines, 200, 0).netPayable).toBe(0)
    expect(dispenseTotals([], 10, 5).netPayable).toBe(0)
  })
})

describe("shared cache invalidation", () => {
  it("stock-changing mutations drop the cached medicines; failed ones do not", async () => {
    const loader = vi.fn(async () => "m")
    const warm = () => loadShared("medicines", loader, 60_000)
    await warm()
    await expect(medicinesService.adjustStock("2", { direction: "Add", quantity: 0 })).rejects.toBeDefined()
    await expect(dispensingService.create({ ...dispense, patientId: ULID })).rejects.toBeDefined()
    await expect(dispensingService.create({ ...dispense, lines: [{ ...dispense.lines[0], quantity: 99999 }] })).rejects.toMatchObject({ status: 400 }) // refused on short stock
    await warm()
    expect(loader.mock.calls.length).toBe(1)
    await medicinesService.adjustStock("2", { direction: "Add", quantity: 1 })
    await warm()
    expect(loader.mock.calls.length).toBe(2)
    await dispensingService.create(dispense)
    await warm()
    expect(loader.mock.calls.length).toBe(3)
    await medicinesService.create(medInput)
    await warm()
    await medicinesService.update("1", medInput)
    await warm()
    expect(loader.mock.calls.length).toBe(5)
  })
})
