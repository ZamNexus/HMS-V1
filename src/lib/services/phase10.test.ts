import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setAccessToken } from "@/lib/api/client"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { classifyCreateError } from "./createOutcome"
import {
  adjustPayload, dispenseListQuery, dispensePayload, httpPharmacyApiService, medicineCreatePayload, medicineListQuery, medicinePatchPayload, movementListQuery, parseBatchReceipt, parseDispense, parseDispenseList,
  parseMedicine, parseMedicineDetail, parseMedicineList, parseMovementList, parsePrescription, parseSlip, receivePayload, returnPayload, writeOffPayload,
} from "./http/pharmacyApi"
import { mockPharmacyApiService } from "./mock/pharmacyApi"
import { schemaOf, validate } from "./http/specValidate"

// Phase 10 service layer (handoff 8.9): medicines, batches, stock movements, prescriptions, dispenses and returns. Fixtures and payloads are validated AGAINST docs/openapi.json first.
// Stock is batches and every figure is the server's: nothing is summed here. Every write is ONE request. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const ID = (c: string) => `01HZX${c.repeat(21)}`
const MED = ID("A"), BATCH = ID("B"), PAT = ID("C"), ENC = ID("D"), DOC = ID("E"), USER = ID("F"), LINE = ID("G"), DSP = ID("H"), RXL = ID("J"), MED2 = ID("K")
const NOW = "2026-11-07T10:00:00.000Z"
const LENIENT = { lenientStringArrays: true } as const // the spec types several single texts as arrays (a spec bug)
const who = { id: USER, name: "Pharmacist" }
const stock = (over: Record<string, unknown> = {}) => ({ onHand: 120, expired: 0, nearestExpiry: "2027-03-31", level: "in_stock", expiry: null, saleValue: "6000.00", ...over })
const medicine = (over: Record<string, unknown> = {}) => ({ id: MED, name: "Paracetamol 500 mg", generic: "Paracetamol", category: "Analgesic", unit: "tablet", saleRate: "5.00", gstPct: "0", discountPct: "0", reorderLevel: 50, active: true, stock: stock(), createdAt: NOW, ...over })
const batch = (over: Record<string, unknown> = {}) => ({ id: BATCH, batchNo: "B-1001", expiryDate: "2027-03-31", receivedDate: "2026-10-01", quantityReceived: 200, quantityRemaining: 120, purchaseRate: "3.00", supplier: "Medico", expired: false, ...over })
const detail = (over: Record<string, unknown> = {}) => ({ ...medicine(), batches: [batch()], ...over })
const dline = (over: Record<string, unknown> = {}) => ({
  id: LINE, medicineId: MED, name: "Paracetamol 500 mg", prescriptionLineId: RXL, requested: 10, dispensed: 8, returned: 0, unitRate: "5.00", gstPct: "0", standingDiscountPct: "0", discountPct: "0", instructions: "1 tab TDS",
  batches: [{ batchId: BATCH, batchNo: "B-1001", expiryDate: "2027-03-31", quantity: 8 }], returns: [], charge: { id: ID("R"), invoiceId: ID("M"), total: "40.00", received: "0.00", paid: false }, allowedActions: ["return"], ...over,
})
const dispense = (over: Record<string, unknown> = {}) => ({
  id: DSP, dispenseNo: "DSP-2026-0009", patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, counterCustomer: null, encounter: { id: ENC, encId: "OPD-2026-0012" }, doctor: { id: DOC, name: "Dr Imran" }, remarks: null, dispensedAt: NOW,
  dispensedBy: who, invoice: { id: ID("M"), invoiceNo: "INV-2026-0007" }, lines: [dline()], ...over,
})
const page = (data: unknown[]) => ({ data, meta: { page: 1, perPage: 10, total: data.length, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string, details?: unknown) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/dispenses", timestamp: NOW, details })
function stub(responses: Array<Response | Error>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    if (r instanceof Error) throw r
    return r.clone()
  }))
  return calls
}

describe("fixtures are what the specification says", () => {
  it("medicines (with and without batches), a batch, a stock movement, a prescription, a dispense, a list row and a slip validate against their schemas", () => {
    expect(validate(page([medicine(), medicine({ id: MED2, name: "Amoxicillin", stock: stock({ onHand: 0, level: "out_of_stock", nearestExpiry: null, saleValue: "0.00" }) })]), schemaOf("MedicinePageDto_Output"), LENIENT)).toEqual([])
    expect(validate(detail(), schemaOf("MedicineDetailDto_Output"), LENIENT)).toEqual([])
    expect(validate({ ...batch(), medicine: { id: MED, name: "Paracetamol 500 mg" } }, schemaOf("BatchResponseDto_Output"))).toEqual([])
    expect(validate(page([{ id: ID("N"), type: "dispensed", quantity: -8, reason: null, occurredAt: NOW, medicine: { id: MED, name: "Paracetamol 500 mg" }, batch: { id: BATCH, batchNo: "B-1001", expiryDate: "2027-03-31" }, by: who, dispense: { id: DSP, dispenseNo: "DSP-2026-0009" } }]), schemaOf("StockMovementPageDto_Output"), LENIENT)).toEqual([])
    expect(validate({ encounter: { id: ENC, encId: "OPD-2026-0012" }, patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, doctor: { id: DOC, name: "Dr Imran" }, lines: [{ id: RXL, medicineText: "Paracetamol 500 mg", medicine: { id: MED, name: "Paracetamol 500 mg", active: true }, dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", instructions: null, prescribed: 9, dispensed: 4, remaining: 5 }] }, schemaOf("PrescriptionDispensingDto_Output"), LENIENT)).toEqual([])
    expect(validate(dispense(), schemaOf("DispenseResponseDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([{ id: DSP, dispenseNo: "DSP-2026-0009", patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, counterCustomer: null, encounter: null, dispensedAt: NOW, dispensedBy: who, lines: [{ name: "Paracetamol", quantity: 8 }], total: "40.00", received: "40.00" }]), schemaOf("DispensePageDto_Output"), LENIENT)).toEqual([])
    expect(validate({ hospital: { name: "City Hospital", address: null, phone: null, email: null, printHeader: null }, dispenseNo: "DSP-2026-0009", dispensedAt: NOW, customer: "Ayesha Khan", mrNo: "MR-2026-0042", encounterNo: null, doctor: "Dr Imran", dispensedBy: "Pharmacist", lines: [{ name: "Paracetamol", quantity: 8, instructions: null, batches: [{ batchNo: "B-1001", expiryDate: "2027-03-31" }], total: "40.00" }], total: "40.00", received: "0.00", remarks: null }, schemaOf("DispenseSlipDto_Output"), LENIENT)).toEqual([])
  })
})

describe("parsing: the server's figures are kept as sent", () => {
  it("a medicine keeps its stock summary and money as strings; the detail adds its batches", () => {
    const m = parseMedicine(medicine({ stock: stock({ level: "low", expiry: "expiring", onHand: 12 }) }))
    expect(m).toMatchObject({ name: "Paracetamol 500 mg", saleRate: "5.00", reorderLevel: 50, active: true, stock: { onHand: 12, level: "low", expiry: "expiring", saleValue: "6000.00", nearestExpiry: "2027-03-31" } })
    expect(parseMedicine(medicine({ stock: stock({ expiry: null, nearestExpiry: null }) })).stock).toMatchObject({ expiry: null, nearestExpiry: null })
    expect(parseMedicineList(page([medicine(), medicine({ id: MED2 })])).total).toBe(2)
    const d = parseMedicineDetail(detail({ batches: [batch(), batch({ id: ID("P"), batchNo: "B-0900", expired: true, quantityRemaining: 5 })] }))
    expect(d.batches).toHaveLength(2)
    expect(d.batches[1]).toMatchObject({ batchNo: "B-0900", expired: true, quantityRemaining: 5, purchaseRate: "3.00" })
  })
  it("the spec bug is tolerated: single texts typed as arrays arrive as a string, null or a one-element array", () => {
    expect(parseBatchReceipt({ ...batch(), supplier: ["Medico"], medicine: { id: MED, name: "x" } }).supplier).toBe("Medico")
    expect(parseBatchReceipt({ ...batch(), supplier: [], medicine: { id: MED, name: "x" } }).supplier).toBeNull()
    expect(parseDispense(dispense({ counterCustomer: ["Walk-in Ali"], remarks: ["For travel"], patient: null, encounter: null })).counterCustomer).toBe("Walk-in Ali")
    const s = parseSlip({ hospital: { name: "City", address: null, phone: null, email: null, printHeader: null }, dispenseNo: "D", dispensedAt: NOW, customer: "A", mrNo: ["MR-1"], encounterNo: [], doctor: ["Dr I"], dispensedBy: "P", lines: [], total: "0.00", received: "0.00", remarks: [] })
    expect(s).toMatchObject({ mrNo: "MR-1", encounterNo: null, doctor: "Dr I", remarks: null })
  })
  it("a dispense line keeps requested, dispensed, returned, the batches it came from and only the 'return' action", () => {
    const l = parseDispense(dispense({ lines: [dline({ requested: 10, dispensed: 8, allowedActions: ["return", "teleport"] })] })).lines[0]
    expect(l).toMatchObject({ requested: 10, dispensed: 8, returned: 0, unitRate: "5.00", allowedActions: ["return"], batches: [{ batchNo: "B-1001", expiryDate: "2027-03-31", quantity: 8 }] })
    expect(l.charge).toMatchObject({ total: "40.00", paid: false })
    expect(parseDispense(dispense({ lines: [dline({ charge: null, allowedActions: [] })] })).lines[0].charge).toBeNull()
  })
  it("a prescription keeps prescribed, dispensed and remaining (null when open-ended) and the catalogue medicine when the doctor picked one", () => {
    const rx = parsePrescription({ encounter: { id: ENC, encId: "OPD-2026-0012" }, patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, doctor: { id: DOC, name: "Dr Imran" }, lines: [
      { id: RXL, medicineText: "Paracetamol 500 mg", medicine: { id: MED, name: "Paracetamol 500 mg", active: true }, dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", instructions: null, prescribed: 9, dispensed: 4, remaining: 5 },
      { id: ID("Q"), medicineText: "Some syrup", medicine: null, dose: null, route: null, frequency: null, duration: null, instructions: null, prescribed: null, dispensed: 0, remaining: null },
    ] })
    expect(rx.lines[0]).toMatchObject({ prescribed: 9, dispensed: 4, remaining: 5, medicine: { active: true } })
    expect(rx.lines[1]).toMatchObject({ medicine: null, prescribed: null, remaining: null })
  })
  it("movements keep the sign the server sent, the batch and the dispense they belong to", () => {
    const m = parseMovementList(page([{ id: ID("N"), type: "written_off", quantity: -5, reason: "Damaged", occurredAt: NOW, medicine: { id: MED, name: "P" }, batch: { id: BATCH, batchNo: "B-1001", expiryDate: "2027-03-31" }, by: who, dispense: null }]))
    expect(m.items[0]).toMatchObject({ type: "written_off", quantity: -5, reason: "Damaged", dispense: null })
    expect(parseDispenseList(page([{ id: DSP, dispenseNo: "D", patient: null, counterCustomer: "Walk-in Ali", encounter: null, dispensedAt: NOW, dispensedBy: who, lines: [{ name: "P", quantity: 2 }], total: "10.00", received: "10.00" }])).items[0]).toMatchObject({ counterCustomer: "Walk-in Ali", patient: null })
  })
  it("a number where money should be, an unknown level or a missing field is refused, never coerced", () => {
    expect(() => parseMedicine(medicine({ saleRate: 5 }))).toThrow(/decimal/)
    expect(() => parseMedicine(medicine({ stock: stock({ level: "plenty" }) }))).toThrow()
    expect(() => parseMedicine(medicine({ stock: stock({ onHand: "120" }) }))).toThrow(/number/)
    expect(() => parseMedicineDetail({ ...medicine() })).toThrow()
    expect(() => parseDispense({ ...dispense(), lines: undefined })).toThrow()
  })
})

describe("payloads are what the specification's DTOs say", () => {
  it("every payload validates against its DTO", () => {
    expect(validate(medicineCreatePayload({ name: "Paracetamol", generic: "Paracetamol", category: "Analgesic", unit: "tablet", saleRate: "5", gstPct: "0", discountPct: "10", reorderLevel: 50 }), schemaOf("CreateMedicineDto"))).toEqual([])
    expect(validate(medicinePatchPayload({ saleRate: "6.50", generic: "", reorderLevel: 20 }), schemaOf("UpdateMedicineDto"))).toEqual([])
    expect(validate(receivePayload({ batchNo: "B-1002", expiryDate: "2027-06-30", quantity: 100, purchaseRate: "3.2", supplier: "Medico", receivedDate: "2026-11-07" }), schemaOf("ReceiveStockDto"))).toEqual([])
    expect(validate(writeOffPayload({ quantity: 5, reason: "Damaged in storage" }), schemaOf("WriteOffStockDto"))).toEqual([])
    expect(validate(adjustPayload({ quantity: -3, reason: "Stock-take correction" }), schemaOf("AdjustStockDto"))).toEqual([])
    expect(validate(dispensePayload({ patientId: PAT, encounterId: ENC, doctorId: DOC, remarks: "x", lines: [{ medicineId: MED, quantity: 8, prescriptionLineId: RXL, instructions: "1 tab TDS", discountPct: "5" }] }), schemaOf("CreateDispenseDto"))).toEqual([])
    expect(validate(dispensePayload({ counterCustomer: "Walk-in Ali", lines: [{ medicineId: MED, quantity: 2 }], payment: { mode: "cash", reference: "R-1" } }), schemaOf("CreateDispenseDto"))).toEqual([])
    expect(validate(returnPayload({ quantity: 2, reason: "Wrong medicine", restock: true, refundMode: "cash" }), schemaOf("ReturnDispenseLineDto"))).toEqual([])
  })
  it("a patch sends only what changed, an emptied generic/category/unit is null, and nothing changed is refused", () => {
    expect(medicinePatchPayload({ saleRate: "6" })).toEqual({ saleRate: "6" })
    expect(medicinePatchPayload({ generic: "  ", category: "Antibiotic" })).toEqual({ generic: null, category: "Antibiotic" })
    expect(() => medicinePatchPayload({})).toThrow(/Nothing changed/)
  })
  it("a patient dispense carries the visit and no payment; a counter sale carries the customer and the payment (and nothing else)", () => {
    expect(dispensePayload({ patientId: PAT, lines: [{ medicineId: MED, quantity: 1 }] })).toEqual({ lines: [{ medicineId: MED, quantity: 1 }], patientId: PAT })
    expect(dispensePayload({ counterCustomer: " Walk-in Ali ", lines: [{ medicineId: MED, quantity: 1 }], payment: { mode: "card" } })).toEqual({ lines: [{ medicineId: MED, quantity: 1 }], counterCustomer: "Walk-in Ali", payment: { mode: "card" } })
  })
  it("input the server would refuse is refused first, with no request", () => {
    expect(() => medicineCreatePayload({ name: " ", saleRate: "5" })).toThrow(/name/)
    expect(() => medicineCreatePayload({ name: "X", saleRate: "-5" })).toThrow(RangeError)
    expect(() => medicineCreatePayload({ name: "X", saleRate: "5.123" })).toThrow(RangeError)
    expect(() => medicineCreatePayload({ name: "X", saleRate: "5", gstPct: "101" })).toThrow(RangeError)
    expect(() => medicineCreatePayload({ name: "X", saleRate: "5", reorderLevel: 1.5 })).toThrow(RangeError)
    expect(() => receivePayload({ batchNo: "", expiryDate: "2027-06-30", quantity: 1, purchaseRate: "1" })).toThrow(RangeError)
    expect(() => receivePayload({ batchNo: "B", expiryDate: "30/06/2027", quantity: 1, purchaseRate: "1" })).toThrow(RangeError)
    expect(() => receivePayload({ batchNo: "B", expiryDate: "2027-06-30", quantity: 0, purchaseRate: "1" })).toThrow(RangeError)
    expect(() => receivePayload({ batchNo: "B", expiryDate: "2027-06-30", quantity: 1.5, purchaseRate: "1" })).toThrow(RangeError)
    expect(() => writeOffPayload({ quantity: 0, reason: "Damaged" })).toThrow(RangeError)
    expect(() => writeOffPayload({ quantity: 1, reason: "no" })).toThrow(RangeError)
    expect(() => adjustPayload({ quantity: 0, reason: "Stock-take" })).toThrow(/cannot be zero/)
    expect(() => dispensePayload({ lines: [{ medicineId: MED, quantity: 1 }] })).toThrow(/not both and not neither/)
    expect(() => dispensePayload({ patientId: PAT, counterCustomer: "A", lines: [{ medicineId: MED, quantity: 1 }] })).toThrow(/not both/)
    expect(() => dispensePayload({ counterCustomer: "A", lines: [{ medicineId: MED, quantity: 1 }] })).toThrow(/paid in the same step/)
    expect(() => dispensePayload({ counterCustomer: "A", lines: [{ medicineId: MED, quantity: 1 }], payment: { mode: "cheque" as never } })).toThrow(RangeError)
    expect(() => dispensePayload({ patientId: PAT, lines: [] })).toThrow(/at least one/)
    expect(() => dispensePayload({ patientId: PAT, lines: [{ medicineId: MED, quantity: 0 }] })).toThrow(RangeError)
    expect(() => dispensePayload({ patientId: PAT, lines: [{ medicineId: "nope", quantity: 1 }] })).toThrow(RangeError)
    expect(() => dispensePayload({ patientId: PAT, lines: Array.from({ length: 41 }, () => ({ medicineId: MED, quantity: 1 })) })).toThrow(RangeError)
    expect(() => returnPayload({ quantity: 0, reason: "Wrong", restock: true })).toThrow(RangeError)
    expect(() => returnPayload({ quantity: 1, reason: "no", restock: true })).toThrow(RangeError)
  })
  it("list queries send only what is set and refuse bad values", () => {
    expect(medicineListQuery({ page: 1, pageSize: 10, search: " para ", level: "low", expiry: "expiring", expiringWithinDays: 60, active: true, category: "Analgesic" })).toEqual({ page: 1, perPage: 10, search: "para", level: "low", expiry: "expiring", expiringWithinDays: 60, active: true, category: "Analgesic" })
    expect(movementListQuery({ medicineId: MED, type: "dispensed", dateFrom: "2026-11-01" })).toEqual({ page: undefined, perPage: undefined, medicineId: MED, type: "dispensed", dateFrom: "2026-11-01" })
    expect(dispenseListQuery({ counter: true, patientId: PAT })).toEqual({ page: undefined, perPage: undefined, counter: true, patientId: PAT })
    expect(() => medicineListQuery({ level: "in_stock" as never })).toThrow(RangeError)
    expect(() => medicineListQuery({ expiringWithinDays: 0 })).toThrow(RangeError)
    expect(() => movementListQuery({ type: "stolen" as never })).toThrow(RangeError)
    expect(() => dispenseListQuery({ dateFrom: "2026-11-07", dateTo: "2026-11-01" })).toThrow(RangeError)
    expect(() => medicineListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})

describe("HTTP adapter: exact requests, ONE per write", () => {
  it("every call is its own request with the documented method and path", async () => {
    const batchBody = { ...batch(), supplier: null, medicine: { id: MED, name: "Paracetamol 500 mg" } }
    const calls = stub([
      json(page([medicine()])), json(detail()), json(detail(), 201), json(detail()), json(detail()), json(detail()), json(batchBody, 201), json(batchBody), json(batchBody), json(page([])), json({ encounter: { id: ENC, encId: "E" }, patient: { id: PAT, mrNo: "M", name: "A" }, doctor: { id: DOC, name: "D" }, lines: [] }),
      json(dispense(), 201), json(page([])), json(dispense()), json({ hospital: { name: "H", address: null, phone: null, email: null, printHeader: null }, dispenseNo: "D", dispensedAt: NOW, customer: "A", mrNo: [], encounterNo: [], doctor: [], dispensedBy: "P", lines: [], total: "0.00", received: "0.00", remarks: [] }), json(dispense()),
    ])
    await httpPharmacyApiService.listMedicines({ page: 1, pageSize: 10, level: "low" })
    await httpPharmacyApiService.getMedicine(MED)
    await httpPharmacyApiService.createMedicine({ name: "X", saleRate: "5" })
    await httpPharmacyApiService.updateMedicine(MED, { saleRate: "6" })
    await httpPharmacyApiService.setMedicineActive(MED, false)
    await httpPharmacyApiService.setMedicineActive(MED, true)
    await httpPharmacyApiService.receiveStock(MED, { batchNo: "B-2", expiryDate: "2027-06-30", quantity: 10, purchaseRate: "3" })
    await httpPharmacyApiService.writeOff(BATCH, { quantity: 1, reason: "Damaged" })
    await httpPharmacyApiService.adjust(BATCH, { quantity: -1, reason: "Stock-take" })
    await httpPharmacyApiService.movements({ medicineId: MED })
    await httpPharmacyApiService.prescription(ENC)
    await httpPharmacyApiService.dispense({ patientId: PAT, lines: [{ medicineId: MED, quantity: 2 }] })
    await httpPharmacyApiService.listDispenses({ counter: false })
    await httpPharmacyApiService.getDispense(DSP)
    await httpPharmacyApiService.slip(DSP)
    await httpPharmacyApiService.returnLine(DSP, LINE, { quantity: 1, reason: "Wrong medicine", restock: true })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/v1/medicines?page=1&perPage=10&level=low", `GET /api/v1/medicines/${MED}`, "POST /api/v1/medicines", `PATCH /api/v1/medicines/${MED}`, `POST /api/v1/medicines/${MED}/deactivate`, `POST /api/v1/medicines/${MED}/reactivate`,
      `POST /api/v1/medicines/${MED}/batches`, `POST /api/v1/medicine-batches/${BATCH}/write-off`, `POST /api/v1/medicine-batches/${BATCH}/adjust`, `GET /api/v1/stock-movements?medicineId=${MED}`, `GET /api/v1/encounters/${ENC}/prescription`,
      "POST /api/v1/dispenses", "GET /api/v1/dispenses?counter=false", `GET /api/v1/dispenses/${DSP}`, `GET /api/v1/dispenses/${DSP}/slip`, `POST /api/v1/dispenses/${DSP}/lines/${LINE}/return`,
    ])
    expect(calls[3].body).toEqual({ saleRate: "6" })
    expect(calls[4].body).toBeUndefined()
    expect(calls[11].body).toEqual({ lines: [{ medicineId: MED, quantity: 2 }], patientId: PAT })
  })
  it("a refused dispense keeps its code and is sent exactly once (OUT_OF_STOCK, INSUFFICIENT_STOCK, BATCH_EXPIRED, MEDICINE_INACTIVE, PRESCRIPTION_FULFILLED, 409 MEDICINE_NAME_TAKEN)", async () => {
    for (const [status, code] of [[422, "OUT_OF_STOCK"], [422, "INSUFFICIENT_STOCK"], [422, "BATCH_EXPIRED"], [422, "MEDICINE_INACTIVE"], [422, "PRESCRIPTION_FULFILLED"], [403, "FORBIDDEN"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused", code === "OUT_OF_STOCK" ? { lines: [{ medicineId: MED }] } : undefined), status)])
      await expect(httpPharmacyApiService.dispense({ patientId: PAT, lines: [{ medicineId: MED, quantity: 1 }] })).rejects.toMatchObject({ status, code })
      expect(calls, code).toHaveLength(1)
    }
    const taken = stub([json(errorBody(409, "MEDICINE_NAME_TAKEN", "taken"), 409)])
    await expect(httpPharmacyApiService.createMedicine({ name: "X", saleRate: "5" })).rejects.toMatchObject({ status: 409, code: "MEDICINE_NAME_TAKEN" })
    expect(taken).toHaveLength(1)
  })
  it("a dispense whose network drops is never sent again; an accepted but unreadable one is 'saved'", async () => {
    const dropped = stub([new TypeError("Failed to fetch")])
    await expect(httpPharmacyApiService.dispense({ patientId: PAT, lines: [{ medicineId: MED, quantity: 1 }] })).rejects.toBeTruthy()
    expect(dropped).toHaveLength(1)
    const unreadable = stub([new Response("<html>ok</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err = await httpPharmacyApiService.dispense({ patientId: PAT, lines: [{ medicineId: MED, quantity: 1 }] }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err).kind).toBe("saved-unreadable")
    expect(unreadable).toHaveLength(1)
    const rcv = stub([new Response("<html>ok</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err2 = await httpPharmacyApiService.receiveStock(MED, { batchNo: "B", expiryDate: "2027-06-30", quantity: 1, purchaseRate: "1" }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err2).kind).toBe("saved-unreadable")
    expect(rcv).toHaveLength(1)
  })
  it("a bad value is refused before any request", async () => {
    const calls = stub([json(dispense())])
    await expect(httpPharmacyApiService.dispense({ lines: [] })).rejects.toBeInstanceOf(RangeError)
    await expect(httpPharmacyApiService.writeOff(BATCH, { quantity: 0, reason: "Damaged" })).rejects.toBeInstanceOf(RangeError)
    await expect(httpPharmacyApiService.getMedicine("nope")).rejects.toBeInstanceOf(RangeError)
    await expect(httpPharmacyApiService.returnLine(DSP, "nope", { quantity: 1, reason: "Wrong", restock: true })).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
})

describe("wiring", () => {
  it("the 16 new keys are the documented routes; the demo's old keys stay unset", () => {
    expect(ENDPOINTS["pharmacyApi.receive"]).toEqual({ method: "POST", path: "/medicines/:id/batches" })
    expect(ENDPOINTS["pharmacyApi.writeOff"]).toEqual({ method: "POST", path: "/medicine-batches/:id/write-off" })
    expect(ENDPOINTS["pharmacyApi.prescription"]).toEqual({ method: "GET", path: "/encounters/:id/prescription" })
    expect(ENDPOINTS["pharmacyApi.return"]).toEqual({ method: "POST", path: "/dispenses/:id/lines/:lineId/return" })
    expect(Object.keys(ENDPOINTS).filter((k) => k.startsWith("pharmacyApi.") && ENDPOINTS[k as keyof typeof ENDPOINTS])).toHaveLength(16)
    for (const k of ["medicines.list", "medicines.adjustStock", "dispensing.list", "dispensing.create"] as const) expect(ENDPOINTS[k]).toBeNull()
  })
  it("every pharmacy write refreshes the pharmacy lists; dispense and return also refresh the bill, hub lists, accounts and registers", () => {
    const src = read("src/lib/services/index.ts")
    expect(src).toContain('"pharmacyApi", PHARMACY_WRITES')
    expect(src).toContain('["invoice", "invoices", "account", "charges", "payments"] as const).reduce<PharmacyApiService>')
    for (const m of ["createMedicine", "updateMedicine", "setMedicineActive", "receiveStock", "writeOff", "adjust", "dispense", "returnLine"]) expect(src, m).toContain(`"${m}"`)
  })
  it("the demo has no API-shaped pharmacy: every call says so, with no request", async () => {
    const calls = stub([json({})])
    await expect(mockPharmacyApiService.listMedicines()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockPharmacyApiService.dispense({ lines: [] })).rejects.toBeInstanceOf(NotConnectedError)
    expect(calls).toHaveLength(0)
  })
  it("no stock or money is summed or parsed into a number in the pharmacy reader", () => {
    const code = read("src/lib/services/http/pharmacyApi.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/addMoney|subMoney|sumMoney|compareMoney|parseFloat|toFixed|\.reduce\(/)
  })
})
