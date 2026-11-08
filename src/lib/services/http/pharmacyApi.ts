import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { isUlid } from "@/lib/api/convert"
import type { MoneyString } from "@/lib/api/types"
import type {
  ListResult, PharmacyApiService, PmAdjustInput, PmBatch, PmBatchReceipt, PmDispense, PmDispenseInput, PmDispenseLine, PmDispenseListOptions, PmDispenseRow, PmExpiry, PmLevel, PmMedicine, PmMedicineDetail,
  PmMedicineInput, PmMedicineListOptions, PmMedicinePatch, PmMovement, PmMovementListOptions, PmMovementType, PmPayMode, PmPrescription, PmPrescriptionLine, PmReceiveInput, PmReturn, PmReturnInput, PmSlip,
  PmStock, PmWriteOffInput,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optStr, pageQuery, parsePage, reqBool, reqEnum, reqStr, reqUlid, type Obj } from "./wire"

// Pharmacy (handoff 8.9; docs/openapi.json Medicine*/Batch*/StockMovement*/Dispense*/PrescriptionDispensing). Stock is batches; the server computes every level and figure
// (`stock` on each medicine) and first-expire-first-out: the browser never sums batches. Quantities are whole numbers, money and percentages are decimal strings kept as sent.
// Every write is ONE request (no idempotency keys on the server).

export const PM_LEVELS: readonly PmLevel[] = ["in_stock", "low", "out_of_stock"]
export const PM_MOVEMENT_TYPES: readonly PmMovementType[] = ["received", "dispensed", "returned", "written_off", "adjusted"]
export const PM_PAY_MODES: readonly PmPayMode[] = ["cash", "card", "bank_transfer"]
export const PM_LIMITS = {
  name: 120, generic: 120, category: 60, unit: 30, search: 100, batchNo: 40, supplier: 120, reason: { min: 3, max: 500 }, lines: 40, instructions: 300, remarks: 500, counterCustomer: 120, reference: 60,
} as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
const PERCENT_RE = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/
const SORT_RE = /^[A-Za-z]+:(asc|desc)$/

// ── Reading ──

const num = (o: Obj, key: string, what: string): number => {
  const v = o[key]
  if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a number.`)
  return v
}
const optNum = (o: Obj, key: string, what: string): number | null => (o[key] === null || o[key] === undefined ? null : num(o, key, what))
const decimal = (o: Obj, key: string, what: string): string => {
  const v = o[key]
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v
}
const money = (o: Obj, key: string, what: string): MoneyString => decimal(o, key, what) as MoneyString
const instant = (o: Obj, key: string, what: string): string => {
  const v = reqStr(o, key, what)
  if (Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a date-time.`)
  return v
}
const dateOf = (o: Obj, key: string, what: string): string => {
  const v = reqStr(o, key, what)
  if (!DATE_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a date.`)
  return v
}
const optDateOf = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : dateOf(o, key, what))
const nullableStr = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : reqStr(o, key, what))
/** A single nullable text. The spec types several of these "array of string" (a spec bug, like elsewhere): a string, null or a one-element array is accepted. */
const text = (o: Obj, key: string, what: string, dto: string): string | null => optStr(o, key, what, dto) ?? null
const person = (raw: unknown, what: string) => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), name: reqStr(o, "name", what) } }
const named = (raw: unknown, what: string) => person(raw, what)
const optRef = <T>(raw: unknown, f: (r: unknown) => T): T | null => (raw === null || raw === undefined ? null : f(raw))
const list = <T>(raw: unknown, what: string, item: (x: unknown, w: string) => T): T[] => {
  if (!Array.isArray(raw)) throw new TypeError(`Unexpected response: ${what} is not an array.`)
  return raw.map((x, i) => item(x, `${what}[${i}]`))
}
const patientRef = (raw: unknown, what: string) => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what) } }
const visitRef = (raw: unknown, what: string) => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), encId: reqStr(o, "encId", what) } }

function stockOf(raw: unknown, what: string): PmStock {
  const o = asObj(raw, what)
  const expiry: PmExpiry = o.expiry === null || o.expiry === undefined ? null : reqEnum(o, "expiry", what, ["expired", "expiring"] as const)
  return { onHand: num(o, "onHand", what), expired: num(o, "expired", what), nearestExpiry: optDateOf(o, "nearestExpiry", what), level: reqEnum(o, "level", what, PM_LEVELS), expiry, saleValue: money(o, "saleValue", what) }
}
export function parseBatch(raw: unknown, what = "batch", dto = "MedicineDetailDto_Output"): PmBatch {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), batchNo: reqStr(o, "batchNo", what), expiryDate: dateOf(o, "expiryDate", what), receivedDate: dateOf(o, "receivedDate", what), quantityReceived: num(o, "quantityReceived", what),
    quantityRemaining: num(o, "quantityRemaining", what), purchaseRate: money(o, "purchaseRate", what), supplier: text(o, "supplier", what, dto), expired: reqBool(o, "expired", what),
  }
}
export function parseBatchReceipt(raw: unknown, what = "batch"): PmBatchReceipt {
  const o = asObj(raw, what)
  return { ...parseBatch(raw, what, "BatchResponseDto_Output"), medicine: named(o.medicine, `${what}.medicine`) }
}
export function parseMedicine(raw: unknown, what = "medicine"): PmMedicine {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), name: reqStr(o, "name", what), generic: nullableStr(o, "generic", what), category: nullableStr(o, "category", what), unit: nullableStr(o, "unit", what), saleRate: money(o, "saleRate", what),
    gstPct: decimal(o, "gstPct", what), discountPct: decimal(o, "discountPct", what), reorderLevel: num(o, "reorderLevel", what), active: reqBool(o, "active", what), stock: stockOf(o.stock, `${what}.stock`), createdAt: instant(o, "createdAt", what),
  }
}
export function parseMedicineList(raw: unknown): ListResult<PmMedicine> {
  return parsePage(raw, "medicines", (item) => parseMedicine(item, "medicines[]"))
}
export function parseMedicineDetail(raw: unknown, what = "medicine"): PmMedicineDetail {
  const o = asObj(raw, what)
  return { ...parseMedicine(raw, what), batches: list(o.batches, `${what}.batches`, (b, w) => parseBatch(b, w)) }
}
export function parseMovement(raw: unknown, what = "movement"): PmMovement {
  const o = asObj(raw, what)
  const batch = asObj(o.batch, `${what}.batch`)
  return {
    id: reqUlid(o, "id", what), type: reqEnum(o, "type", what, PM_MOVEMENT_TYPES), quantity: num(o, "quantity", what), reason: nullableStr(o, "reason", what), occurredAt: instant(o, "occurredAt", what), medicine: named(o.medicine, `${what}.medicine`),
    batch: { id: reqUlid(batch, "id", `${what}.batch`), batchNo: reqStr(batch, "batchNo", `${what}.batch`), expiryDate: dateOf(batch, "expiryDate", `${what}.batch`) }, by: person(o.by, `${what}.by`),
    dispense: optRef(o.dispense, (d) => { const dobj = asObj(d, `${what}.dispense`); return { id: reqUlid(dobj, "id", `${what}.dispense`), dispenseNo: reqStr(dobj, "dispenseNo", `${what}.dispense`) } }),
  }
}
export function parseMovementList(raw: unknown): ListResult<PmMovement> {
  return parsePage(raw, "stock movements", (item) => parseMovement(item, "movements[]"))
}
export function parsePrescription(raw: unknown, what = "prescription"): PmPrescription {
  const o = asObj(raw, what)
  return {
    encounter: visitRef(o.encounter, `${what}.encounter`), patient: patientRef(o.patient, `${what}.patient`), doctor: person(o.doctor, `${what}.doctor`),
    lines: list(o.lines, `${what}.lines`, (l, w): PmPrescriptionLine => {
      const lo = asObj(l, w)
      const med = optRef(lo.medicine, (m) => { const mo = asObj(m, `${w}.medicine`); return { id: reqUlid(mo, "id", `${w}.medicine`), name: reqStr(mo, "name", `${w}.medicine`), active: reqBool(mo, "active", `${w}.medicine`) } })
      return { id: reqUlid(lo, "id", w), medicineText: reqStr(lo, "medicineText", w), medicine: med, dose: nullableStr(lo, "dose", w), route: nullableStr(lo, "route", w), frequency: nullableStr(lo, "frequency", w), duration: nullableStr(lo, "duration", w),
        instructions: nullableStr(lo, "instructions", w), prescribed: optNum(lo, "prescribed", w), dispensed: num(lo, "dispensed", w), remaining: optNum(lo, "remaining", w) }
    }),
  }
}
export function parseDispenseRow(raw: unknown, what = "dispense"): PmDispenseRow {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), dispenseNo: reqStr(o, "dispenseNo", what), patient: optRef(o.patient, (p) => patientRef(p, `${what}.patient`)), counterCustomer: nullableStr(o, "counterCustomer", what),
    encounter: optRef(o.encounter, (e) => visitRef(e, `${what}.encounter`)), dispensedAt: instant(o, "dispensedAt", what), dispensedBy: person(o.dispensedBy, `${what}.dispensedBy`),
    lines: list(o.lines, `${what}.lines`, (l, w) => { const lo = asObj(l, w); return { name: reqStr(lo, "name", w), quantity: num(lo, "quantity", w) } }), total: money(o, "total", what), received: money(o, "received", what),
  }
}
export function parseDispenseList(raw: unknown): ListResult<PmDispenseRow> {
  return parsePage(raw, "dispenses", (item) => parseDispenseRow(item, "dispenses[]"))
}
function returnOf(raw: unknown, what: string): PmReturn {
  const o = asObj(raw, what)
  return { id: reqUlid(o, "id", what), quantity: num(o, "quantity", what), reason: reqStr(o, "reason", what), restocked: reqBool(o, "restocked", what), returnedAt: instant(o, "returnedAt", what), returnedBy: person(o.returnedBy, `${what}.returnedBy`) }
}
function dispenseLineOf(raw: unknown, what: string): PmDispenseLine {
  const o = asObj(raw, what)
  const charge = optRef(o.charge, (c) => { const co = asObj(c, `${what}.charge`); return { id: reqUlid(co, "id", `${what}.charge`), invoiceId: reqUlid(co, "invoiceId", `${what}.charge`), total: money(co, "total", `${what}.charge`), received: money(co, "received", `${what}.charge`), paid: reqBool(co, "paid", `${what}.charge`) } })
  if (!Array.isArray(o.allowedActions)) throw new TypeError(`Unexpected response: ${what}.allowedActions is not an array.`)
  return {
    id: reqUlid(o, "id", what), medicineId: reqUlid(o, "medicineId", what), name: reqStr(o, "name", what), prescriptionLineId: nullableStr(o, "prescriptionLineId", what), requested: num(o, "requested", what), dispensed: num(o, "dispensed", what),
    returned: num(o, "returned", what), unitRate: money(o, "unitRate", what), gstPct: decimal(o, "gstPct", what), standingDiscountPct: decimal(o, "standingDiscountPct", what), discountPct: decimal(o, "discountPct", what), instructions: nullableStr(o, "instructions", what),
    batches: list(o.batches, `${what}.batches`, (b, w) => { const bo = asObj(b, w); return { batchId: reqUlid(bo, "batchId", w), batchNo: reqStr(bo, "batchNo", w), expiryDate: dateOf(bo, "expiryDate", w), quantity: num(bo, "quantity", w) } }),
    returns: list(o.returns, `${what}.returns`, returnOf), charge, allowedActions: o.allowedActions.filter((a): a is "return" => a === "return"),
  }
}
export function parseDispense(raw: unknown, what = "dispense"): PmDispense {
  const o = asObj(raw, what)
  const dto = "DispenseResponseDto_Output"
  return {
    id: reqUlid(o, "id", what), dispenseNo: reqStr(o, "dispenseNo", what), patient: optRef(o.patient, (p) => patientRef(p, `${what}.patient`)), counterCustomer: text(o, "counterCustomer", what, dto), encounter: optRef(o.encounter, (e) => visitRef(e, `${what}.encounter`)),
    doctor: optRef(o.doctor, (d) => person(d, `${what}.doctor`)), remarks: text(o, "remarks", what, dto), dispensedAt: instant(o, "dispensedAt", what), dispensedBy: person(o.dispensedBy, `${what}.dispensedBy`),
    invoice: optRef(o.invoice, (i) => { const io = asObj(i, `${what}.invoice`); return { id: reqUlid(io, "id", `${what}.invoice`), invoiceNo: reqStr(io, "invoiceNo", `${what}.invoice`) } }), lines: list(o.lines, `${what}.lines`, dispenseLineOf),
  }
}
export function parseSlip(raw: unknown, what = "slip"): PmSlip {
  const o = asObj(raw, what)
  const h = asObj(o.hospital, `${what}.hospital`)
  const dto = "DispenseSlipDto_Output"
  return {
    hospital: { name: reqStr(h, "name", `${what}.hospital`), address: nullableStr(h, "address", `${what}.hospital`), phone: nullableStr(h, "phone", `${what}.hospital`), email: nullableStr(h, "email", `${what}.hospital`), printHeader: nullableStr(h, "printHeader", `${what}.hospital`) },
    dispenseNo: reqStr(o, "dispenseNo", what), dispensedAt: instant(o, "dispensedAt", what), customer: reqStr(o, "customer", what), mrNo: text(o, "mrNo", what, dto), encounterNo: text(o, "encounterNo", what, dto), doctor: text(o, "doctor", what, dto),
    dispensedBy: reqStr(o, "dispensedBy", what),
    lines: list(o.lines, `${what}.lines`, (l, w) => { const lo = asObj(l, w); return { name: reqStr(lo, "name", w), quantity: num(lo, "quantity", w), instructions: nullableStr(lo, "instructions", w), batches: list(lo.batches, `${w}.batches`, (b, bw) => { const bo = asObj(b, bw); return { batchNo: reqStr(bo, "batchNo", bw), expiryDate: dateOf(bo, "expiryDate", bw) } }), total: money(lo, "total", w) } }),
    total: money(o, "total", what), received: money(o, "received", what), remarks: text(o, "remarks", what, dto),
  }
}

// ── Writing the request ──

const needUlid = (value: string, label: string): string => {
  if (!isUlid(value)) throw new RangeError(`The ${label} is not valid.`)
  return value
}
function boundedText(value: string | undefined, max: number, label: string): string | undefined {
  const t = value?.trim()
  if (!t) return undefined
  if (t.length > max) throw new RangeError(`${label} is at most ${max} characters.`)
  return t
}
function amountText(text: string | undefined, label: string): string {
  const t = (text ?? "").trim()
  if (!AMOUNT_RE.test(t)) throw new RangeError(`${label} must be an amount with at most two decimals.`)
  return t
}
function percentText(text: string | undefined, label: string): string {
  const t = (text ?? "").trim()
  if (!PERCENT_RE.test(t)) throw new RangeError(`${label} must be 0 to 100 with at most two decimals.`)
  return t
}
function wholeNumber(value: number, label: string, min: number, max = 1_000_000): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be a whole number from ${min} to ${max}.`)
  return value
}
function reasonText(text: string): string {
  const t = (text ?? "").trim()
  if (t.length < PM_LIMITS.reason.min || t.length > PM_LIMITS.reason.max) throw new RangeError(`The reason is ${PM_LIMITS.reason.min} to ${PM_LIMITS.reason.max} characters.`)
  return t
}
function validDate(value: string, label: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) throw new RangeError(`${label} must be a date (YYYY-MM-DD).`)
  return value
}

export function medicineCreatePayload(input: PmMedicineInput): Schemas["CreateMedicineDto"] {
  const name = input.name?.trim()
  if (!name) throw new RangeError("The medicine needs a name.")
  if (name.length > PM_LIMITS.name) throw new RangeError(`The name is at most ${PM_LIMITS.name} characters.`)
  const body: Schemas["CreateMedicineDto"] = { name, saleRate: amountText(input.saleRate, "The sale rate") }
  const generic = boundedText(input.generic, PM_LIMITS.generic, "The generic name"), category = boundedText(input.category, PM_LIMITS.category, "The category"), unit = boundedText(input.unit, PM_LIMITS.unit, "The unit")
  if (generic) body.generic = generic
  if (category) body.category = category
  if (unit) body.unit = unit
  if (input.gstPct?.trim()) body.gstPct = percentText(input.gstPct, "GST")
  if (input.discountPct?.trim()) body.discountPct = percentText(input.discountPct, "The standing discount")
  if (input.reorderLevel !== undefined) body.reorderLevel = wholeNumber(input.reorderLevel, "The reorder level", 0)
  return body
}
/** PATCH: only what changed. An emptied generic, category or unit is sent as null (cleared). */
export function medicinePatchPayload(patch: PmMedicinePatch): Schemas["UpdateMedicineDto"] {
  const body: Schemas["UpdateMedicineDto"] = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name || name.length > PM_LIMITS.name) throw new RangeError(`The name is 1 to ${PM_LIMITS.name} characters.`)
    body.name = name
  }
  for (const [key, max, label] of [["generic", PM_LIMITS.generic, "The generic name"], ["category", PM_LIMITS.category, "The category"], ["unit", PM_LIMITS.unit, "The unit"]] as const) {
    if (patch[key] !== undefined) body[key] = boundedText(patch[key], max, label) ?? null
  }
  if (patch.saleRate !== undefined) body.saleRate = amountText(patch.saleRate, "The sale rate")
  if (patch.gstPct !== undefined) body.gstPct = percentText(patch.gstPct, "GST")
  if (patch.discountPct !== undefined) body.discountPct = percentText(patch.discountPct, "The standing discount")
  if (patch.reorderLevel !== undefined) body.reorderLevel = wholeNumber(patch.reorderLevel, "The reorder level", 0)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing changed.")
  return body
}
export function receivePayload(input: PmReceiveInput): Schemas["ReceiveStockDto"] {
  const batchNo = input.batchNo?.trim()
  if (!batchNo || batchNo.length > PM_LIMITS.batchNo) throw new RangeError(`The batch number is 1 to ${PM_LIMITS.batchNo} characters.`)
  const body: Schemas["ReceiveStockDto"] = { batchNo, expiryDate: validDate(input.expiryDate, "The expiry date"), quantity: wholeNumber(input.quantity, "The quantity", 1), purchaseRate: amountText(input.purchaseRate, "The purchase rate") }
  const supplier = boundedText(input.supplier, PM_LIMITS.supplier, "The supplier")
  if (supplier) body.supplier = supplier
  if (input.receivedDate) body.receivedDate = validDate(input.receivedDate, "The received date")
  return body
}
export function writeOffPayload(input: PmWriteOffInput): Schemas["WriteOffStockDto"] {
  return { quantity: wholeNumber(input.quantity, "The quantity", 1), reason: reasonText(input.reason) }
}
export function adjustPayload(input: PmAdjustInput): Schemas["AdjustStockDto"] {
  const q = wholeNumber(input.quantity, "The adjustment", -1_000_000)
  if (q === 0) throw new RangeError("The adjustment cannot be zero.")
  return { quantity: q, reason: reasonText(input.reason) }
}
/** To a patient (patientId, optionally the visit and doctor) OR a counter sale (counterCustomer + payment). A patient's payment goes through billing, so it is not sent here. */
export function dispensePayload(input: PmDispenseInput): Schemas["CreateDispenseDto"] {
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new RangeError("Add at least one medicine.")
  if (input.lines.length > PM_LIMITS.lines) throw new RangeError(`At most ${PM_LIMITS.lines} lines at a time.`)
  const counter = input.counterCustomer?.trim()
  if (!input.patientId === !counter) throw new RangeError("Dispense to a patient or to a counter customer, not both and not neither.")
  const lines = input.lines.map((l, i) => {
    const line: Schemas["CreateDispenseDto"]["lines"][number] = { medicineId: needUlid(l.medicineId, "medicine"), quantity: wholeNumber(l.quantity, `Line ${i + 1}: the quantity`, 1, 10_000) }
    if (l.prescriptionLineId) line.prescriptionLineId = needUlid(l.prescriptionLineId, "prescription line")
    const instructions = boundedText(l.instructions, PM_LIMITS.instructions, `Line ${i + 1}: the instructions`)
    if (instructions) line.instructions = instructions
    if (l.discountPct?.trim()) line.discountPct = percentText(l.discountPct, `Line ${i + 1}: the discount`)
    return line
  })
  const body: Schemas["CreateDispenseDto"] = { lines }
  if (input.patientId) {
    body.patientId = needUlid(input.patientId, "patient")
    if (input.encounterId) body.encounterId = needUlid(input.encounterId, "visit")
    if (input.doctorId) body.doctorId = needUlid(input.doctorId, "doctor")
  } else {
    if ((counter as string).length > PM_LIMITS.counterCustomer) throw new RangeError(`The customer's name is at most ${PM_LIMITS.counterCustomer} characters.`)
    body.counterCustomer = counter as string
    if (!input.payment) throw new RangeError("A counter sale is paid in the same step: choose how.")
    if (!PM_PAY_MODES.includes(input.payment.mode)) throw new RangeError("The payment mode is cash, card or bank transfer.")
    const reference = boundedText(input.payment.reference, PM_LIMITS.reference, "The reference")
    body.payment = reference ? { mode: input.payment.mode, reference } : { mode: input.payment.mode }
  }
  const remarks = boundedText(input.remarks, PM_LIMITS.remarks, "The remarks")
  if (remarks) body.remarks = remarks
  return body
}
export function returnPayload(input: PmReturnInput): Schemas["ReturnDispenseLineDto"] {
  const body: Schemas["ReturnDispenseLineDto"] = { quantity: wholeNumber(input.quantity, "The quantity", 1, 10_000), reason: reasonText(input.reason), restock: input.restock === true }
  if (input.refundMode) {
    if (!PM_PAY_MODES.includes(input.refundMode)) throw new RangeError("The refund mode is cash, card or bank transfer.")
    body.refundMode = input.refundMode
  }
  return body
}

function commonQuery(options: { dateFrom?: string; dateTo?: string; sort?: string }, q: QueryParams): void {
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = options[key]
    if (v) { if (!DATE_RE.test(v)) throw new RangeError("Dates are YYYY-MM-DD."); q[key] = v }
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new RangeError("The start date is after the end date.")
  if (options.sort) { if (!SORT_RE.test(options.sort)) throw new RangeError("The sort is not valid."); q.sort = options.sort }
}
export function medicineListQuery(options: PmMedicineListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  const search = options.search?.trim()
  if (search) { if (search.length > PM_LIMITS.search) throw new RangeError(`The search is at most ${PM_LIMITS.search} characters.`); q.search = search }
  if (options.category?.trim()) q.category = options.category.trim()
  if (options.level) { if (options.level !== "low" && options.level !== "out_of_stock") throw new RangeError("The stock level is low or out of stock."); q.level = options.level }
  if (options.expiry) { if (options.expiry !== "expiring" && options.expiry !== "expired") throw new RangeError("The expiry filter is expiring or expired."); q.expiry = options.expiry }
  if (options.expiringWithinDays !== undefined) q.expiringWithinDays = wholeNumber(options.expiringWithinDays, "The number of days", 1, 3650)
  if (options.active !== undefined) q.active = options.active
  commonQuery(options, q)
  return q
}
export function movementListQuery(options: PmMovementListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  if (options.medicineId) q.medicineId = needUlid(options.medicineId, "medicine")
  if (options.batchId) q.batchId = needUlid(options.batchId, "batch")
  if (options.type) { if (!PM_MOVEMENT_TYPES.includes(options.type)) throw new RangeError("The movement type is not valid."); q.type = options.type }
  commonQuery(options, q)
  return q
}
export function dispenseListQuery(options: PmDispenseListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  const search = options.search?.trim()
  if (search) { if (search.length > PM_LIMITS.search) throw new RangeError(`The search is at most ${PM_LIMITS.search} characters.`); q.search = search }
  if (options.patientId) q.patientId = needUlid(options.patientId, "patient")
  if (options.encounterId) q.encounterId = needUlid(options.encounterId, "visit")
  if (options.counter !== undefined) q.counter = options.counter
  commonQuery(options, q)
  return q
}

// ── Service: every write is ONE request ──

const idParam = (id: string) => ({ id: needUlid(id, "record") })

export const httpPharmacyApiService: PharmacyApiService = {
  async listMedicines(options, signal) { return parseMedicineList(await callEndpoint<unknown>("pharmacyApi.list", { query: () => medicineListQuery(options), signal })) },
  async getMedicine(id, signal) { return parseMedicineDetail(await callEndpoint<unknown>("pharmacyApi.get", { params: idParam(id), signal })) },
  createMedicine(input) { return createAndParse("pharmacyApi.create", { body: () => medicineCreatePayload(input) }, (raw) => parseMedicineDetail(raw), "medicine") },
  // Every write below goes through createAndParse: a 2xx whose answer cannot be read means it HAPPENED (stock written off, a return recorded): SavedButUnreadable, refresh, never a second try.
  async updateMedicine(id, patch) { return createAndParse("pharmacyApi.update", { params: idParam(id), body: () => medicinePatchPayload(patch) }, (raw) => parseMedicineDetail(raw), "medicine") },
  async setMedicineActive(id, active) { return createAndParse(active ? "pharmacyApi.reactivate" : "pharmacyApi.deactivate", { params: idParam(id) }, (raw) => parseMedicineDetail(raw), "medicine") },
  receiveStock(medicineId, input) { return createAndParse("pharmacyApi.receive", { params: idParam(medicineId), body: () => receivePayload(input) }, (raw) => parseBatchReceipt(raw), "batch") },
  async writeOff(batchId, input) { return createAndParse("pharmacyApi.writeOff", { params: idParam(batchId), body: () => writeOffPayload(input) }, (raw) => parseBatchReceipt(raw), "write-off") },
  async adjust(batchId, input) { return createAndParse("pharmacyApi.adjust", { params: idParam(batchId), body: () => adjustPayload(input) }, (raw) => parseBatchReceipt(raw), "adjustment") },
  async movements(options, signal) { return parseMovementList(await callEndpoint<unknown>("pharmacyApi.movements", { query: () => movementListQuery(options), signal })) },
  async prescription(encounterId, signal) { return parsePrescription(await callEndpoint<unknown>("pharmacyApi.prescription", { params: idParam(encounterId), signal })) },
  dispense(input) { return createAndParse("pharmacyApi.dispense", { body: () => dispensePayload(input) }, (raw) => parseDispense(raw), "dispense") },
  async listDispenses(options, signal) { return parseDispenseList(await callEndpoint<unknown>("pharmacyApi.dispenses", { query: () => dispenseListQuery(options), signal })) },
  async getDispense(id, signal) { return parseDispense(await callEndpoint<unknown>("pharmacyApi.dispenseGet", { params: idParam(id), signal })) },
  async slip(id, signal) { return parseSlip(await callEndpoint<unknown>("pharmacyApi.slip", { params: idParam(id), signal })) },
  async returnLine(dispenseId, lineId, input) { return createAndParse("pharmacyApi.return", { params: { id: needUlid(dispenseId, "dispense"), lineId: needUlid(lineId, "line") }, body: () => returnPayload(input) }, (raw) => parseDispense(raw), "return") },
}
