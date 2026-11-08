import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { NotConnectedError } from "../errors"
import { asObj, optDecimalString, optStr, pageQuery, parsePage, reqBool, reqEnum, reqStr, reqUlid } from "./wire"
import type { GuardianRelationPatch, OrganisationPatch,
  GuardianRelationInput,
  GuardianRelationRecord,
  OrganisationInput,
  OrganisationRecord,
  CashFlowData,
  DailyCheckupRevenuePoint,
  DashboardRevenuePoint,
  DashboardSummaryData,
  DashboardUpNextRow,
  DashboardVisitsData,
  FinancialStatisticsSummaryData,
  StatisticsRecordsData,
  AccountsPaymentsReportData,
  AccountsReceiptsReportData,
  DailySummaryReportData,
  DailyTransactionsReportData,
  DemographicsReportData,
  ExpenseTrendPoint,
  LabReportData,
  OpdStatisticsReportData,
  OrganisationBalancesReportData,
  PatientAccountSummaryReportData,
  PatientBalancesReportData,
  PharmacyReportData,
  PrescriptionHistoryReportData,
  RevenueReportData,
  BillSummary,
  BankStatementRow,
  BankTransactionInput,
  BankTransactionRecord,
  BillingListOptions,
  BillingPaymentInput,
  BillingPaymentRecord,
  BillingReceiptInput,
  BillingReceiptRecord,
  ConsultationInvoiceInput,
  ConsultationInvoiceRecord,
  ExpenseInput,
  ExpenseRecord,
  ExpenseTotals,
  ServicesInvoiceInput,
  ServicesInvoiceRecord,
  CurrentUser,
  DoctorInput,
  DischargeInput,
  DischargeResult,
  DoctorRecord,
  EncounterInput,
  EncounterListOptions,
  DispenseInput,
  DispenseListOptions,
  DispensingRecord,
  EncounterRecord,
  ImagingOrderInput,
  ImagingOrderListOptions,
  ImagingOrderRecord,
  ImagingReportInput,
  ListOptions,
  LabOrderInput,
  LabOrderListOptions,
  LabOrderRecord,
  LabResultEntryInput,
  ListResult,
  MedicineInput,
  MedicineRecord,
  StockAdjustmentInput,
  UserInput,
  UserRecord,
  WardRecord,
} from "../types"

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND CONNECTION POINT 2 of 2 — wire <-> UI mappers.
//
// Each function below translates between the backend's real request/response
// JSON (from the HMS API Reference) and the UI types in ../types.ts. They are
// deliberately unimplemented: the wire shapes are not confirmed, and guessing
// field names would silently show wrong data. Replace each `pending(...)` body
// with the real mapping; nothing else needs to change.
//
// Rules for the implementer:
//  - Declare the backend's response types (UserWire, DoctorWire, ...) in this
//    file, separate from the UI types, and map from them.
//  - Validate/narrow `raw` (it is `unknown`); throw on shapes you don't expect.
//  - Never put passwords, tokens or cookies in thrown messages or logs.
//  - Money/dates follow src/lib/api/types.ts conventions (money = decimal string).
//  - If the API has no server-side paging/search, return {} from the *ListQuery
//    functions and slice/filter inside parse*List instead.
// ─────────────────────────────────────────────────────────────────────────────

function pending(what: string): never {
  throw new NotConnectedError(what)
}

type ListParams = Pick<ListOptions, "search" | "page" | "pageSize">

// ── Current user ──
/**
 * GET /auth/me -> AuthUserDto (docs/openapi.json). Only the permission list is read: `permissions` is an array of
 * permission names such as "patients.read". Unknown names are kept (a newer backend may add some), a missing or
 * non-array list is rejected so permissions stay unknown (grant nothing) instead of silently becoming empty.
 * Nothing calls this yet: wiring navigation to permissions is a separate decision (auth/roles are out of scope here).
 */
export function parseCurrentUser(raw: unknown): CurrentUser {
  const o = asObj(raw, "auth/me")
  if (!Array.isArray(o.permissions) || !o.permissions.every((p) => typeof p === "string")) {
    throw new TypeError("Unexpected response: auth/me.permissions is not a list of strings.")
  }
  return { permissions: [...new Set(o.permissions as string[])] }
}

// ── Users ──
/** Query string for users.list: search text and 1-based page / pageSize. */
export function userListQuery(params: ListParams): QueryParams {
  void params
  return pending("users.list query parameters (search / pagination)")
}
export function parseUserList(raw: unknown): ListResult<UserRecord> {
  void raw
  return pending("users.list response mapping")
}
export function parseUser(raw: unknown): UserRecord {
  void raw
  return pending("user response mapping")
}
export function userPayload(input: UserInput): unknown {
  void input
  return pending("users.create/update request payload")
}
export function userActivePayload(active: boolean): unknown {
  void active
  return pending("users.setActive request payload")
}

// ── Doctors ──
// NOTE: `DoctorInput.photoUrl` is a browser data URL today (PhotoUpload). File storage (T13) is not
// built, so the mapper must NOT send it as base64 inside the doctor payload; omit it until the
// documented upload mechanism exists.
export function parseDoctor(raw: unknown): DoctorRecord {
  void raw
  return pending("doctor response mapping")
}
export function doctorPayload(input: DoctorInput): unknown {
  void input
  return pending("doctors.create/update request payload")
}

// ── Patients: moved to ./patientMap (Phase 5). Re-exported so older imports keep working. ──
export {
  CNIC_RE, PATIENT_LIMITS, PHONE_RE, coverageSetOf, duplicateMatchesOf, duplicateQuery, parseDuplicateMatches, parsePatient, parsePatientList,
  patientCreatePayload, patientHasChanges, patientListQuery, patientUpdatePayload, recordDeathPayload,
  type CreatePatientBody, type RecordDeathBody, type UpdatePatientBody,
} from "./patientMap"

// ── Organisations (panels) and guardian relations: CONNECTED in Phase 5A (PanelPageDto / GuardianRelationPageDto) ──
const trimmed = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t ? t : undefined
}
const PANEL_TYPE_FROM_WIRE = { insurance: "Insurance", corporate: "Corporate", government: "Government", other: "Other" } as const
const PANEL_TYPE_TO_WIRE: Record<string, "insurance" | "corporate" | "government" | "other"> = { Insurance: "insurance", Corporate: "corporate", Government: "government", Other: "other" }

export function referenceListQuery(params: ListParams): QueryParams {
  return { ...pageQuery(params.page, params.pageSize), search: params.search || undefined }
}

export function parseOrganisation(raw: unknown, dto = "PanelResponseDto_Output"): OrganisationRecord {
  const o = asObj(raw, "panel")
  return {
    id: reqUlid(o, "id", "panel"),
    name: reqStr(o, "name", "panel"),
    type: PANEL_TYPE_FROM_WIRE[reqEnum(o, "type", "panel", ["insurance", "corporate", "government", "other"])],
    contactPerson: optStr(o, "contactPerson", "panel", dto) ?? "",
    phone: optStr(o, "phone", "panel", dto) ?? "",
    // commissionPct travels as a decimal string (or null); the UI shows it as a plain number.
    commissionPct: Number(optDecimalString(o, "commissionPct", "panel", dto) ?? "0"),
    discountPct: Number(optDecimalString(o, "discountPct", "panel", dto) ?? "0"),
    billingMode: reqEnum(o, "billingMode", "panel", ["patient_pays", "panel_billed"]),
    active: reqBool(o, "active", "panel"),
  }
}
export function parseOrganisationList(raw: unknown): ListResult<OrganisationRecord> {
  return parsePage(raw, "panels", (item) => parseOrganisation(item, "PanelPageDto_Output"))
}
/** POST /panels (CreatePanelDto). `active` is not a create field: a panel is created active, so creating an inactive one is refused. */
export type CreatePanelBody = Schemas["CreatePanelDto"]
export type UpdatePanelBody = Schemas["UpdatePanelDto"]
export type CreateGuardianRelationBody = Schemas["CreateGuardianRelationDto"]
export type UpdateGuardianRelationBody = Schemas["UpdateGuardianRelationDto"]

export function organisationPayload(input: OrganisationInput): CreatePanelBody {
  if (!input.active) throw new NotConnectedError("creating an inactive panel (the API creates panels active; deactivate is a separate call)")
  if (!Number.isFinite(input.commissionPct) || input.commissionPct < 0) throw new RangeError("Commission must be zero or more.")
  const type = PANEL_TYPE_TO_WIRE[input.type]
  if (!type) throw new TypeError("Unsupported organisation type.")
  const body: CreatePanelBody = { name: input.name.trim(), type, commissionPct: String(input.commissionPct) }
  if (trimmed(input.contactPerson)) body.contactPerson = trimmed(input.contactPerson)
  if (trimmed(input.phone)) body.phone = trimmed(input.phone)
  if (input.discountPct !== undefined) body.discountPct = percentString(input.discountPct, "Discount")
  if (input.billingMode !== undefined) body.billingMode = input.billingMode
  return body
}

/** A percentage as the decimal string the API takes (not a float formatted by the browser). */
function percentString(value: number, label: string): string {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be zero or more.`)
  return String(value)
}

/**
 * PATCH /panels/{id} (UpdatePanelDto): ONLY the fields in `patch` (the caller passes what changed). "" clears contactPerson / phone
 * (the API: null or "" clears an optional field).
 */
export function organisationUpdatePayload(patch: OrganisationPatch): UpdatePanelBody {
  const body: UpdatePanelBody = {}
  if (patch.name !== undefined) body.name = patch.name.trim()
  if (patch.type !== undefined) {
    const wire = PANEL_TYPE_TO_WIRE[patch.type]
    if (!wire) throw new TypeError("Unsupported organisation type.")
    body.type = wire
  }
  if (patch.contactPerson !== undefined) body.contactPerson = trimmed(patch.contactPerson) ?? ""
  if (patch.phone !== undefined) body.phone = trimmed(patch.phone) ?? ""
  if (patch.commissionPct !== undefined) body.commissionPct = percentString(patch.commissionPct, "Commission")
  if (patch.discountPct !== undefined) body.discountPct = percentString(patch.discountPct, "Discount")
  if (patch.billingMode !== undefined) body.billingMode = patch.billingMode
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export function parseGuardianRelation(raw: unknown, dto = "GuardianRelationResponseDto_Output"): GuardianRelationRecord {
  const o = asObj(raw, "guardian relation")
  return { id: reqUlid(o, "id", "guardian relation"), name: reqStr(o, "name", "guardian relation"), remarks: optStr(o, "remarks", "guardian relation", dto), active: reqBool(o, "active", "guardian relation") }
}
export function parseGuardianRelationList(raw: unknown): ListResult<GuardianRelationRecord> {
  return parsePage(raw, "guardian relations", (item) => parseGuardianRelation(item, "GuardianRelationPageDto_Output"))
}
/** POST /guardian-relations (CreateGuardianRelationDto). Same rule as panels for `active`. */
export function guardianRelationPayload(input: GuardianRelationInput): CreateGuardianRelationBody {
  if (!input.active) throw new NotConnectedError("creating an inactive guardian relation (the API creates them active)")
  const body: CreateGuardianRelationBody = { name: input.name.trim() }
  if (trimmed(input.remarks)) body.remarks = trimmed(input.remarks)
  return body
}

/** PATCH /guardian-relations/{id} (UpdateGuardianRelationDto): only what changed; "" clears the remarks. */
export function guardianRelationUpdatePayload(patch: GuardianRelationPatch): UpdateGuardianRelationBody {
  const body: UpdateGuardianRelationBody = {}
  if (patch.name !== undefined) body.name = patch.name.trim()
  if (patch.remarks !== undefined) body.remarks = trimmed(patch.remarks) ?? ""
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

// ── Encounters + wards/beds (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// The documentation only says encounters, wards and beds are "already covered"; nothing else is known.
// Questions the implementer must answer from the spec (also listed in the handoff document):
//  - ids: are patientId / doctorId / wardId ULIDs? (use isUlid; never Number() them)
//  - statuses: map the backend's encounter statuses to "open" | "discharged" | "cancelled" or extend the UI type
//  - which of encId, token number, date/time, netTotal, balance does the server generate / recompute?
//  - are wards and beds referenced by id or by name; does creating an IPD encounter allocate the bed, and does discharge release it?
//  - money fields are decimal strings: use parseMoney / formatMoney
//  - list order must be newest first; supply the query parameters for type, date range, patientId, search and paging
export function encounterListQuery(params: Pick<EncounterListOptions, "search" | "type" | "dateFrom" | "dateTo" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("encounters.list query parameters (search / type / date range / patient / pagination / sort)")
}
export function parseEncounterList(raw: unknown): ListResult<EncounterRecord> {
  void raw
  return pending("encounters.list response mapping")
}
export function parseEncounter(raw: unknown): EncounterRecord {
  void raw
  return pending("encounter response mapping")
}
export function encounterPayload(input: EncounterInput): unknown {
  void input
  return pending("encounters.create request payload")
}
export function dischargePayload(input: DischargeInput): unknown {
  void input
  return pending("encounters.discharge request payload")
}
export function parseDischargeResult(raw: unknown): DischargeResult {
  void raw
  return pending("encounters.discharge response mapping")
}
export function wardListQuery(params: Pick<ListOptions, "page" | "pageSize">): QueryParams {
  void params
  return pending("wards.list query parameters")
}
export function parseWardList(raw: unknown): ListResult<WardRecord> {
  void raw
  return pending("wards.list response mapping")
}

// ── Laboratory T1 (catalog) + T2 (orders) (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// The Task List describes the backend but publishes no routes or schemas. Questions for the implementer
// (also in the handoff document):
//  - ids: are test / order / patient / doctor / encounter ids ULIDs? (isUlid; never Number() them)
//  - catalog: how are parameters (unit, normal low/high) and the narrative flag represented? Can the UI create/edit
//    them? Is there a deactivate for lab tests (the Task List says CRUD *and deactivate*; the UI has no active flag)?
//  - money (rate, fee, charges, total) are decimal strings: parseMoney / formatMoney
//  - which fields does the server generate: lab number, sample id, date/time, status, line charges, totals, payment status?
//  - result flags are server-generated (High/Low/Critical); map them to the UI's "Normal" | "High" | "Low" | "Critical" | ""
//  - how are status transitions and result entry/verification exposed (one route or several; who may verify)?
//  - list order must be newest first; supply the query parameters for status, patient, search and paging
export function labOrderListQuery(params: Pick<LabOrderListOptions, "search" | "status" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("labOrders.list query parameters (search / status / patient / pagination / sort)")
}
export function parseLabOrderList(raw: unknown): ListResult<LabOrderRecord> {
  void raw
  return pending("labOrders.list response mapping")
}
export function parseLabOrder(raw: unknown): LabOrderRecord {
  void raw
  return pending("lab order response mapping")
}
export function labOrderPayload(input: LabOrderInput): unknown {
  void input
  return pending("labOrders.create request payload")
}
export function labTransitionPayload(to: LabOrderRecord["status"]): unknown {
  void to
  return pending("labOrders.transition request payload")
}
export function labResultsPayload(input: LabResultEntryInput): unknown {
  void input
  return pending("labOrders.enterResults request payload")
}

// ── Imaging T3 (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// The Task List says an imaging order is "the same DiagnosticOrder with type = imaging" and that the build reuses
// T2's service with a narrative-only result path and its own sequence. It publishes no routes or schemas.
// Questions for the implementer (also in the handoff document):
//  - are imaging orders served by T2's routes (with a type filter / field) or their own routes?
//  - which catalog do imaging orders pick from — lab tests in the Radiology/Cardiology categories (as the UI does
//    today), the ECG/ultrasound catalog, or a dedicated imaging catalog? ("ECG and ultrasound are billed through imaging orders")
//  - which fields does the server generate: X-Ray number (its own sequence), date/time, status, line charges, total?
//  - the report: narrative text per test; how is the reporting doctor identified and the report signed (ADR-0052:
//    signed by the reporting doctor alone)? Is a reporting doctor chosen by the UI or derived from the token?
//  - statuses: is "Collected" used for imaging (the UI skips it)? Which transitions are legal, and who may perform them?
//  - list order must be newest first; supply the query parameters for status, patient, search and paging
//  - image upload: waits on T13 (file storage) — no contract exists
export function imagingOrderListQuery(params: Pick<ImagingOrderListOptions, "search" | "status" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("imagingOrders.list query parameters (search / status / patient / pagination / sort)")
}
export function parseImagingOrderList(raw: unknown): ListResult<ImagingOrderRecord> {
  void raw
  return pending("imagingOrders.list response mapping")
}
export function parseImagingOrder(raw: unknown): ImagingOrderRecord {
  void raw
  return pending("imaging order response mapping")
}
export function imagingOrderPayload(input: ImagingOrderInput): unknown {
  void input
  return pending("imagingOrders.create request payload")
}
export function imagingTransitionPayload(to: ImagingOrderRecord["status"]): unknown {
  void to
  return pending("imagingOrders.transition request payload")
}
export function imagingReportPayload(input: ImagingReportInput): unknown {
  void input
  return pending("imagingOrders.enterReport request payload")
}

// ── Pharmacy T4 (inventory) + T5 (dispensing) (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// The Task List describes the backend but publishes no routes or schemas. Questions for the implementer (also in the
// handoff document):
//  - ids: are medicine / dispense / patient / doctor / encounter ids ULIDs? (isUlid; never Number() them)
//  - inventory: Medicine plus MedicineBatch (ADR-0017). How does a list row express stock, batch and expiry when a
//    medicine has several batches (the UI shows one batch number, one expiry, one stock figure)? Are low-stock and
//    near-expiry computed by the server, and with what thresholds (the UI uses stock < reorder level and 30 days)?
//  - money (purchase rate, sale rate, charges, totals) are decimal strings: parseMoney / formatMoney
//  - stock changes: how do "receive stock as a batch", "adjustment" and "write-off" map to the UI's single Add/Remove dialog?
//  - dispensing: the dispense number (the Task List says there is no number field), per-line dispensed vs prescribed
//    quantity, "refusal on short stock" (the UI dispenses what is in stock instead), FEFO allocation, who "dispensed by" is
//  - charges: discount and GST "would sit on the charges" — per line, per record, or both? Posted when?
//  - list order must be newest first; supply the query parameters for patient, search and paging
export function medicineListQuery(params: Pick<ListOptions, "search" | "page" | "pageSize">): QueryParams {
  void params
  return pending("medicines.list query parameters (search / pagination)")
}
export function parseMedicineList(raw: unknown): ListResult<MedicineRecord> {
  void raw
  return pending("medicines.list response mapping")
}
export function parseMedicine(raw: unknown): MedicineRecord {
  void raw
  return pending("medicine response mapping")
}
export function medicinePayload(input: MedicineInput): unknown {
  void input
  return pending("medicines.create/update request payload")
}
export function stockAdjustmentPayload(input: StockAdjustmentInput): unknown {
  void input
  return pending("medicines.adjustStock request payload")
}
export function dispenseListQuery(params: Pick<DispenseListOptions, "search" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("dispensing.list query parameters (search / patient / pagination / sort)")
}
export function parseDispenseList(raw: unknown): ListResult<DispensingRecord> {
  void raw
  return pending("dispensing.list response mapping")
}
export function parseDispense(raw: unknown): DispensingRecord {
  void raw
  return pending("dispense record response mapping")
}
export function dispensePayload(input: DispenseInput): unknown {
  void input
  return pending("dispensing.create request payload")
}

// ── Billing + T6 Expenses + T7 Bank (Phase 4H) (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// Questions for the implementer (also in the handoff document):
//  - money (fees, rates, amounts, balances, debit / credit, running balance) are decimal strings and STAY strings in the
//    records — never parseMoney() them into a number for arithmetic; confirm the scale per field (the UI assumes two decimals)
//  - ids are ULIDs (isUlid) — never Number() them; dates YYYY-MM-DD, instants ISO UTC
//  - invoices / payments / receipts: numbers, date, subtotal, net total, balance and status are server-side? Which status
//    values and payment modes exist (the UI uses paid / unpaid / partial and Cash / Card / Bank Transfer / Cheque / Insurance / On Account)?
//  - expenses: category by id or name? Does a Bank-mode expense name a bank account and create a bank transaction? Void semantics?
//  - bank: debit / credit direction of a deposit and a withdrawal; when cashMovement is set; the statement's running balance and its scope (per account?)
export function consultationInvoiceListQuery(params: Pick<BillingListOptions, "search" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("consultationInvoices.list query parameters")
}
export function parseConsultationInvoiceList(raw: unknown): ListResult<ConsultationInvoiceRecord> {
  void raw
  return pending("consultationInvoices.list response mapping")
}
export function parseConsultationInvoice(raw: unknown): ConsultationInvoiceRecord {
  void raw
  return pending("consultation invoice response mapping")
}
export function consultationInvoicePayload(input: ConsultationInvoiceInput): unknown {
  void input
  return pending("consultationInvoices.create request payload")
}
export function servicesInvoiceListQuery(params: Pick<BillingListOptions, "search" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("servicesInvoices.list query parameters")
}
export function parseServicesInvoiceList(raw: unknown): ListResult<ServicesInvoiceRecord> {
  void raw
  return pending("servicesInvoices.list response mapping")
}
export function parseServicesInvoice(raw: unknown): ServicesInvoiceRecord {
  void raw
  return pending("services invoice response mapping")
}
export function servicesInvoicePayload(input: ServicesInvoiceInput): unknown {
  void input
  return pending("servicesInvoices.create request payload")
}
export function paymentListQuery(params: Pick<BillingListOptions, "search" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("payments.list query parameters")
}
export function parsePaymentList(raw: unknown): ListResult<BillingPaymentRecord> {
  void raw
  return pending("payments.list response mapping")
}
export function parsePayment(raw: unknown): BillingPaymentRecord {
  void raw
  return pending("payment response mapping")
}
export function paymentPayload(input: BillingPaymentInput): unknown {
  void input
  return pending("payments.create request payload")
}
export function receiptListQuery(params: Pick<BillingListOptions, "search" | "patientId" | "page" | "pageSize">): QueryParams {
  void params
  return pending("receipts.list query parameters")
}
export function parseReceiptList(raw: unknown): ListResult<BillingReceiptRecord> {
  void raw
  return pending("receipts.list response mapping")
}
export function parseReceipt(raw: unknown): BillingReceiptRecord {
  void raw
  return pending("receipt response mapping")
}
export function receiptPayload(input: BillingReceiptInput): unknown {
  void input
  return pending("receipts.create request payload")
}
export function expenseListQuery(params: Pick<ListOptions, "search" | "page" | "pageSize">): QueryParams {
  void params
  return pending("expenses.list query parameters")
}
export function parseExpenseList(raw: unknown): ListResult<ExpenseRecord> {
  void raw
  return pending("expenses.list response mapping")
}
export function parseExpense(raw: unknown): ExpenseRecord {
  void raw
  return pending("expense response mapping")
}
export function expensePayload(input: ExpenseInput): unknown {
  void input
  return pending("expenses.create request payload")
}
export function expenseTotalsQuery(params: { dateFrom?: string; dateTo?: string }): QueryParams {
  void params
  return pending("expenses.totals query parameters (period)")
}
export function parseExpenseTotals(raw: unknown): ExpenseTotals {
  void raw
  return pending("expenses.totals response mapping")
}
export function bankStatementQuery(params: Pick<ListOptions, "search" | "page" | "pageSize">): QueryParams {
  void params
  return pending("bankTransactions.statement query parameters")
}
export function parseBankStatement(raw: unknown): ListResult<BankStatementRow> {
  void raw
  return pending("bankTransactions.statement response mapping (rows with running balance)")
}
export function parseBankTransaction(raw: unknown): BankTransactionRecord {
  void raw
  return pending("bank transaction response mapping")
}
export function bankTransactionPayload(input: BankTransactionInput): unknown {
  void input
  return pending("bankTransactions.create request payload")
}

// ── Reports (T8 / T9) + the services catalogue for the Lists report (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// The Task List describes the reports but publishes no routes, parameters or schemas. Questions for the implementer (also in the handoff):
//  - which report endpoints exist (PR #17 carries the Expenses and Accounts reports and the dashboard Cash Flow; T8 is not started)
//  - period / filter parameters per report (the screens' date pills filter nothing today); paging for the two lists
//  - money fields are decimal strings and stay strings; counts are numbers; percentages — numbers or decimal strings?
//  - who computes: totals, balances, percentages, change-vs-previous-period, aged buckets, days overdue, turnaround, new-vs-returning
//    (the demo screens used placeholder constants for some of these: see the handoff) and "credit" = any non-cash mode
//  - ids are ULIDs (isUlid) — never Number() them
export function reportQuery(what: string, params?: unknown): QueryParams {
  void params
  return pending(`${what} query parameters`)
}
export function parseDailySummaryReport(raw: unknown): DailySummaryReportData {
  void raw
  return pending("daily summary report response mapping")
}
export function parseDailyTransactionsReport(raw: unknown): DailyTransactionsReportData {
  void raw
  return pending("daily transactions report response mapping")
}
export function parseOpdStatisticsReport(raw: unknown): OpdStatisticsReportData {
  void raw
  return pending("OPD statistics report response mapping")
}
export function parseRevenueReport(raw: unknown): RevenueReportData {
  void raw
  return pending("revenue report response mapping")
}
export function parseLabReport(raw: unknown): LabReportData {
  void raw
  return pending("laboratory report response mapping")
}
export function parsePharmacyReport(raw: unknown): PharmacyReportData {
  void raw
  return pending("pharmacy report response mapping")
}
export function parseExpenseTrend(raw: unknown): ExpenseTrendPoint[] {
  void raw
  return pending("expense trend response mapping")
}
export function parseDemographicsReport(raw: unknown): DemographicsReportData {
  void raw
  return pending("patient demographics report response mapping")
}
export function parsePatientBalancesReport(raw: unknown): PatientBalancesReportData {
  void raw
  return pending("patient balances report response mapping")
}
export function parseOrganisationBalancesReport(raw: unknown): OrganisationBalancesReportData {
  void raw
  return pending("organisation balances report response mapping")
}
export function parsePatientAccountSummaryReport(raw: unknown): PatientAccountSummaryReportData {
  void raw
  return pending("patient account summary report response mapping")
}
export function parseAccountsPaymentsReport(raw: unknown): AccountsPaymentsReportData {
  void raw
  return pending("accounts payments report response mapping")
}
export function parseAccountsReceiptsReport(raw: unknown): AccountsReceiptsReportData {
  void raw
  return pending("accounts receipts report response mapping")
}
export function parsePrescriptionHistoryReport(raw: unknown): PrescriptionHistoryReportData {
  void raw
  return pending("prescription history report response mapping")
}

// ── Dashboard (T10) and Financial Statistics (T11) (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// Questions for the implementer (also in the handoff): one summary endpoint for all nine tiles, or one per tile? Does it vary by role
// (and how does the frontend learn the role — GET /auth/me permissions are not documented)? What is "today" (server clock, hospital
// timezone)? What are "pending orders", "pending lab reports", "completed today" and "dispensed today" counting? Is "my patients" the
// signed-in doctor's? T11 "extends GET /reports/revenue": what does it return today and what is the extension (period parameters,
// categories incl. ECG / ultrasound from imaging orders, receipts / payments / expenses)? The Cash Flow lines, what "cash" means, the
// period, and where the opening amount (D7) is set. Money is a decimal string and STAYS a string; counts are numbers; ids are ULIDs.
export function parseDashboardSummary(raw: unknown): DashboardSummaryData {
  void raw
  return pending("dashboard summary response mapping")
}
export function parseDashboardVisits(raw: unknown): DashboardVisitsData {
  void raw
  return pending("dashboard weekly visits response mapping")
}
export function parseDashboardRevenueTrend(raw: unknown): DashboardRevenuePoint[] {
  void raw
  return pending("dashboard revenue trend response mapping")
}
export function parseDashboardUpNext(raw: unknown): DashboardUpNextRow[] {
  void raw
  return pending("dashboard up-next response mapping")
}
export function parseCashFlow(raw: unknown): CashFlowData {
  void raw
  return pending("cash flow response mapping")
}
export function parseStatisticsSummary(raw: unknown): FinancialStatisticsSummaryData {
  void raw
  return pending("financial statistics summary response mapping")
}
export function parseStatisticsRecords(raw: unknown): StatisticsRecordsData {
  void raw
  return pending("financial statistics records response mapping")
}
export function parseDailyCheckupRevenue(raw: unknown): DailyCheckupRevenuePoint[] {
  void raw
  return pending("daily checkup revenue response mapping")
}

// ── Phase 4K: services catalogue writes, Item History (T12), bill summary (CONTRACT REQUIRED: every function below needs the OpenAPI schema) ──
// Questions for the implementer (also in the handoff):
//  * services catalogue: can the generic catalogue be created / edited / deactivated through the API (T1 documents it for lab and ECG/USG tests only)?
//    Is the rate a money string? Where do GST %, discount %, barcode, local name and remarks live (the lab tests keep them in a catalogue extension)?
//  * Item History: path, the entity-type value for a catalogue item, and what an audit-log entry holds (who, when, what changed, before/after?). Is it
//    paged? Which roles may call it — the Task List says admins only; the frontend must not infer that from a role name.
//  * bill summary: is there a per-patient / per-encounter summary, or must it come from the Patient Balances report + invoices? What does "balance" mean
//    (the demo clamps at 0 and treats imaging and pharmacy as always paid — those are demo rules, not documented ones)?
export function parseBillSummary(raw: unknown): BillSummary {
  void raw
  return pending("bill summary response mapping")
}
