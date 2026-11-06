// Frontend-owned contracts for the Users / Roles / Doctors screens.
//
// These are the shapes the UI works with. They are NOT the wire format: the
// backend's real request/response shapes are translated to and from these in
// ./http/mappers.ts once the API Reference is final. Screens depend only on
// these types and the service interfaces below, never on mock data or on raw
// backend payloads.

/** Options accepted by every list call. */
export interface ListOptions {
  search?: string
  /** 1-based. */
  page?: number
  pageSize?: number
  signal?: AbortSignal
}

/**
 * Placeholder for the GET /auth/me result. The API Reference says only that it returns
 * the signed-in user's permissions; the real field names and types are UNCONFIRMED
 * (requires the OpenAPI schema). Extend this when parseCurrentUser is implemented.
 * Absent / unknown permissions grant nothing.
 */
export interface CurrentUser {
  permissions?: string[]
}

export interface ListResult<T> {
  items: T[]
  /** Total matching records (may exceed items.length once pagination exists). */
  total: number
}

// ─── Users ──────────────────────────────────────────────────────

export interface UserRecord {
  /** Opaque backend identifier (the API uses ULID strings). */
  id: string
  name: string
  email: string
  /** Backend role code. Never assumed to be one of a fixed set. */
  role: string
  /** Display label, when the backend supplies one. */
  roleLabel?: string
  phone?: string
  cnic?: string
  active: boolean
  /** Display-ready text; the mapper formats whatever the backend sends. */
  lastLogin?: string
}

export interface UserInput {
  name: string
  email: string
  role: string
  phone?: string
  cnic?: string
  active: boolean
  /** Required on create; omitted on edit unless the password is being changed. */
  password?: string
}

export interface UsersService {
  list(opts?: ListOptions): Promise<ListResult<UserRecord>>
  create(input: UserInput): Promise<UserRecord>
  update(id: string, input: UserInput): Promise<UserRecord>
  /** Activate / deactivate without touching other fields. */
  setActive(id: string, active: boolean): Promise<UserRecord>
  /**
   * UI-only requirement (the screen has a "Reset password" action). NOT covered by the provided
   * API documentation: only the mock adapter implements it; the HTTP adapter reports "awaiting contract".
   */
  sendPasswordReset(id: string): Promise<void>
}

// ─── Roles ──────────────────────────────────────────────────────

export interface RoleOption {
  /** Backend role code, sent back unchanged when assigning a role. */
  value: string
  label: string
}

/**
 * Source of the options in the user form's Role picker. UI-only requirement: the provided
 * documentation describes no roles listing, so only the mock adapter returns options and the
 * HTTP adapter reports "awaiting contract" (the picker then shows that, never invented roles).
 */
export interface RolesService {
  list(signal?: AbortSignal): Promise<RoleOption[]>
}

// ─── Doctors ────────────────────────────────────────────────────

export interface DoctorRecord {
  id: string
  name: string
  specialization: string
  qualifications: string
  pmcRegNo: string
  sharePct?: number
  fee: number
  phone: string
  email?: string
  cnic?: string
  city?: string
  address?: string
  country?: string
  active: boolean
  /** Three-letter day names: "Mon" … "Sun". */
  availableDays: string[]
  /** "HH:mm" */
  hoursFrom: string
  hoursTo: string
  notes?: string
  photoUrl?: string
}

export type DoctorInput = Omit<DoctorRecord, "id">

export interface DoctorsService {
  list(opts?: ListOptions): Promise<ListResult<DoctorRecord>>
  create(input: DoctorInput): Promise<DoctorRecord>
  update(id: string, input: DoctorInput): Promise<DoctorRecord>
}

// ─── Patients ───────────────────────────────────────────────────
// Legacy UI model (src/types/index.ts) with string ids at the service boundary. The legacy model
// still uses numeric ids/panel ids; the mock adapter converts, and shared screens that still need
// numeric ids go through ./patientHelpers.ts (which refuses non-numeric ids instead of guessing).

import type {
  BedStatus, DispenseLine, DispenseRecord, EcgUltrasoundTest, Encounter, EncounterType, ImagingOrder, LabOrder, LabOrderStatus, LabOrderTest, LabTest, LabTestCategory, Medicine,
  PanelType, Patient, PatientStatus, PaymentMode, PaymentStatus, PrescriptionItem, Vitals, Ward,
} from "@/types"

export type PatientRecord = Omit<Patient, "id" | "panelId"> & {
  /** Opaque backend identifier (the API uses ULID strings). */
  id: string
  /** Organisation/panel id as an opaque string; null = self-pay. */
  panelId: string | null
}

/**
 * Fields a user enters. MR number, age and registration date are deliberately NOT inputs: whether the
 * backend assigns them is unconfirmed (CONTRACT REQUIRED), so the UI never sends them.
 */
export type PatientInput = Omit<PatientRecord, "id" | "mrNo" | "age" | "registrationDate">

export interface PatientListOptions extends ListOptions {
  /** Only patients with this status. Whether (and how) the backend filters by status is unconfirmed. */
  status?: PatientStatus
}

export interface PatientsService {
  list(opts?: PatientListOptions): Promise<ListResult<PatientRecord>>
  get(id: string, signal?: AbortSignal): Promise<PatientRecord>
  create(input: PatientInput): Promise<PatientRecord>
  update(id: string, input: PatientInput): Promise<PatientRecord>
  /** The patient form has a "Delete Patient" action. Whether the backend deletes, deactivates or forbids it is unconfirmed. */
  remove(id: string): Promise<void>
}

// ─── Shared reference data: organisations (panels) and guardian relations ─────────────
// Used by the patient form. Whether these are independent backend resources, part of the
// settings/catalogs area or nested in patient responses is UNCONFIRMED, so they have no endpoint
// keys: only the mock adapter works and the HTTP adapter reports "awaiting the backend contract".

export interface OrganisationRecord {
  /** Opaque id; legacy mock data uses numeric ids, converted to strings at this boundary. */
  id: string
  name: string
  type: PanelType
  contactPerson: string
  phone: string
  commissionPct: number
  active: boolean
}

export type OrganisationInput = Omit<OrganisationRecord, "id">

export interface OrganisationsService {
  list(opts?: ListOptions): Promise<ListResult<OrganisationRecord>>
  create(input: OrganisationInput): Promise<OrganisationRecord>
}

export interface GuardianRelationRecord {
  id: string
  name: string
  remarks?: string
  active: boolean
}

export type GuardianRelationInput = Omit<GuardianRelationRecord, "id">

export interface GuardianRelationsService {
  list(opts?: ListOptions): Promise<ListResult<GuardianRelationRecord>>
  create(input: GuardianRelationInput): Promise<GuardianRelationRecord>
}

// ─── Encounters (OPD/IPD visits) and wards/beds ──────────────────────────────────────
// The documentation only states that encounters, wards and beds are "already covered" on the backend; it
// gives NO endpoints, schemas, statuses, discharge rules or server-generated-field rules. Everything below is
// a frontend-facing boundary only; each mapper is CONTRACT REQUIRED (see the handoff document).
//
// Ids are opaque strings. Legacy mock screens (billing, lab, imaging, pharmacy, reports) still use numeric
// ids, converted only through legacyNumericId() — never guessed.

export type EncounterRecord = Omit<Encounter, "id" | "patientId" | "doctorId"> & {
  id: string
  patientId: string
  doctorId: string
  /** Opaque ward id; `ward` stays the display name. Whether the backend references wards by id or name is unconfirmed. */
  wardId?: string
}

/**
 * What the new-encounter wizard collects. Deliberately absent (server-generated or derived — CONTRACT REQUIRED
 * which): encounter number (encId), date/time, status, net total, balance.
 */
export interface EncounterInput {
  patientId: string
  doctorId: string
  type: EncounterType
  tokenNo?: number
  wardId?: string
  bedNo?: string
  admissionType?: "Emergency" | "Planned"
  priority: "Normal" | "Urgent"
  chiefComplaint: string
  history?: string
  onExamination?: string
  diagnosis: string
  clinicalNotes?: string
  advisedBy?: string
  referredBy?: string
  vitals: Vitals
  prescription: PrescriptionItem[]
  generalInstructions?: string
  followUpDate?: string
  fee: number
  discount: number
  discountType: "flat" | "percent"
  paymentStatus: PaymentStatus
  paymentMode: PaymentMode
  /** Only meaningful for a partial payment. */
  amountReceived?: number
}

export interface DischargeInput {
  dischargeDate: string
  dischargeDiagnosis: string
  dischargeSummary?: string
  conditionOnDischarge: string
  followUpDate?: string
  followUpInstructions?: string
}

export interface DischargeResult {
  encounter: EncounterRecord
  /** true/false when known; null when the backend does not say (the UI then makes no claim about the bed). */
  bedReleased: boolean | null
}

export interface EncounterListOptions extends ListOptions {
  type?: EncounterType
  /** Inclusive YYYY-MM-DD bounds on the encounter date. */
  dateFrom?: string
  dateTo?: string
  patientId?: string
}

export interface EncountersService {
  /** Newest first — the list screen no longer re-sorts, so the adapter/mapper must guarantee this order. */
  list(opts?: EncounterListOptions): Promise<ListResult<EncounterRecord>>
  get(id: string, signal?: AbortSignal): Promise<EncounterRecord>
  create(input: EncounterInput): Promise<EncounterRecord>
  discharge(id: string, input: DischargeInput): Promise<DischargeResult>
}

export interface BedRecord {
  bedNo: string
  status: BedStatus
  patientId: string | null
  since: string | null
}

export interface WardRecord {
  id: string
  name: string
  type: Ward["type"]
  beds: BedRecord[]
}

export interface WardsService {
  list(opts?: ListOptions): Promise<ListResult<WardRecord>>
}

// ─── Laboratory: diagnostics catalog (T1) and lab orders (T2) ───────────────────────────
// The Task List describes the backend's intended behaviour for T1/T2 but publishes NO endpoints, schemas,
// pagination or server-generated-field rules, so everything below is a frontend-facing boundary only; each
// mapper is CONTRACT REQUIRED (see the handoff document). Documented workflow facts the boundary respects:
// statuses run Pending → Collected → In Progress → Completed → Delivered; the server auto-flags results against
// the normal ranges and assigns lab numbers; a second doctor verifies before printing (ADR-0051).
//
// Ids are opaque strings; legacy mock screens still use numeric ids, converted only via legacyNumericId().

export type LabTestRecord = Omit<LabTest, "id"> & { id: string }

/** What the catalog screens let a user enter. Parameters / narrative / units are not editable in the current UI. */
export interface LabTestInput {
  code: string
  name: string
  category: LabTestCategory
  rate: number
  turnaroundHours: number
}

export interface LabTestListOptions extends ListOptions {
  category?: LabTestCategory
}

export interface LabTestsService {
  list(opts?: LabTestListOptions): Promise<ListResult<LabTestRecord>>
  create(input: LabTestInput): Promise<LabTestRecord>
  update(id: string, input: LabTestInput): Promise<LabTestRecord>
}

export type EcgUltrasoundTestRecord = Omit<EcgUltrasoundTest, "id"> & { id: string }
export type EcgUltrasoundTestInput = Omit<EcgUltrasoundTestRecord, "id">

/** ECG / ultrasound catalog entries (the "ECG/Ultrasound" master-data tab, including its active switch). */
export interface EcgUltrasoundTestsService {
  list(opts?: ListOptions): Promise<ListResult<EcgUltrasoundTestRecord>>
  create(input: EcgUltrasoundTestInput): Promise<EcgUltrasoundTestRecord>
  update(id: string, input: EcgUltrasoundTestInput): Promise<EcgUltrasoundTestRecord>
}

export type LabOrderTestRecord = Omit<LabOrderTest, "testId"> & { testId: string }

export type LabOrderRecord = Omit<LabOrder, "id" | "patientId" | "doctorId" | "encounterId" | "tests"> & {
  id: string
  patientId: string
  doctorId: string
  encounterId: string | null
  tests: LabOrderTestRecord[]
}

export interface LabOrderTestInput {
  testId: string
  discountPct: number
  gstPct: number
  includedInPackage: boolean
}

/**
 * What the new-order form collects. Deliberately absent (server-generated or derived — CONTRACT REQUIRED which):
 * lab number, sample id, date/time, status, line charges, total, payment status.
 */
export interface LabOrderInput {
  patientId: string
  encounterId?: string
  doctorId: string
  priority: "Normal" | "Urgent"
  sampleType: string
  clinicalNotes?: string
  tests: LabOrderTestInput[]
  flatDiscount: number
  paymentMode: PaymentMode
}

/**
 * Result entry. Flags are NOT an input: the Task List says the server auto-flags against the normal ranges, so the
 * UI sends values only (its live flag preview is a display aid; the saved order is authoritative).
 */
export interface LabResultEntryInput {
  tests: {
    testId: string
    /** Parameter values for parameter tests, or a single value for a single-result test. */
    results?: { parameter: string; result: string }[]
    narrativeResult?: string
  }[]
  pathologistRemarks?: string
  /** Display name of the signed-in user. Whether the backend derives this itself is CONTRACT REQUIRED. */
  performedBy?: string
  /** Free-text today. The decided rule (ADR-0051) is that a second doctor verifies — how that is captured is CONTRACT REQUIRED. */
  verifiedBy?: string
  markComplete: boolean
}

export interface LabOrderListOptions extends ListOptions {
  status?: LabOrderStatus
  patientId?: string
}

export interface LabOrdersService {
  /** Newest first — the list screen does not re-sort. */
  list(opts?: LabOrderListOptions): Promise<ListResult<LabOrderRecord>>
  get(id: string, signal?: AbortSignal): Promise<LabOrderRecord>
  create(input: LabOrderInput): Promise<LabOrderRecord>
  /** Mark Collected / Start Processing / Mark Delivered. Legal moves only; whether the backend has one route or several is CONTRACT REQUIRED. */
  transition(id: string, to: LabOrderStatus): Promise<LabOrderRecord>
  enterResults(id: string, input: LabResultEntryInput): Promise<LabOrderRecord>
}

// ─── Imaging (T3) ───────────────────────────────────────────────────────────────────────
// The Task List describes T3 as "the same DiagnosticOrder with type = imaging", reusing T2's service with a
// narrative-only result path and its own sequence (X-Ray numbers), the same status flow as lab, and a report
// "signed by the reporting doctor alone" (ADR-0052). ECG and ultrasound are billed through imaging orders. It
// publishes NO endpoints, schemas, pagination or server-generated-field rules, so this is a frontend boundary
// only; every mapper is CONTRACT REQUIRED (see the handoff document). Image upload waits on T13 (file storage).
//
// Ids are opaque strings; the legacy mock screens still use numeric ids, converted only via legacyNumericId().

export type ImagingOrderTestRecord = LabOrderTestRecord

export type ImagingOrderRecord = Omit<ImagingOrder, "id" | "patientId" | "doctorId" | "encounterId" | "tests"> & {
  id: string
  patientId: string
  doctorId: string
  encounterId: string | null
  tests: ImagingOrderTestRecord[]
}

/**
 * What the new-order form collects. Deliberately absent (server-generated or derived — CONTRACT REQUIRED which):
 * the X-Ray number, date/time, status, line charges and total. The form's "Date/Time" input has never been saved.
 */
export interface ImagingOrderInput {
  patientId: string
  encounterId?: string
  doctorId: string
  tests: LabOrderTestInput[]
  flatDiscount: number
  paymentMode: PaymentMode
  /** The form's "Remarks / Notes"; today it is stored on every test line. */
  notes?: string
}

/**
 * Narrative report entry (the Task List: "results are narrative"). Signing is deliberately NOT modelled: the decided
 * rule is that the reporting doctor signs alone (ADR-0052), but how the reporting doctor is identified/captured, and
 * whether a signature is a separate step, is CONTRACT REQUIRED. No screen enters reports today.
 */
export interface ImagingReportInput {
  tests: { testId: string; narrativeResult: string }[]
}

export interface ImagingOrderListOptions extends ListOptions {
  status?: LabOrderStatus
  patientId?: string
}

export interface ImagingOrdersService {
  /** Newest first — the list screen does not re-sort. */
  list(opts?: ImagingOrderListOptions): Promise<ListResult<ImagingOrderRecord>>
  get(id: string, signal?: AbortSignal): Promise<ImagingOrderRecord>
  create(input: ImagingOrderInput): Promise<ImagingOrderRecord>
  /** Start Processing / Mark Completed / Mark Delivered. Whether the backend has one route or several is CONTRACT REQUIRED. */
  transition(id: string, to: LabOrderStatus): Promise<ImagingOrderRecord>
  enterReport(id: string, input: ImagingReportInput): Promise<ImagingOrderRecord>
}

// ─── Pharmacy: inventory (T4) and dispensing (T5) ───────────────────────────────────────
// The Task List describes T4 as "medicine CRUD, receive stock as a batch, write-off and adjustment, and a stock view with
// low-stock and near-expiry filters" (schema: Medicine plus MedicineBatch — received, remaining, expiry, purchase rate,
// write-off; ADR-0017), and T5 as "dispense from an encounter's prescription or walk-in, FEFO batch allocation inside a
// transaction, refusal on short stock, charges posted, and returns/voids" (schema: DispenseRecord, DispenseLine,
// DispenseLineBatchAllocation; "there's no dispense number field; discount and GST would sit on the charges"). It
// publishes NO endpoints, request/response schemas, pagination or server-generated-field rules, so everything below is a
// frontend-facing boundary only; each mapper is CONTRACT REQUIRED (see the handoff document).
//
// The current screens model ONE batch per medicine (batch number, expiry and stock on the medicine itself) and have no
// returns, voids, write-off or "receive stock as a batch" — those are documented backend features with no UI yet.
//
// Ids are opaque strings; legacy mock screens still use numeric ids, converted only via legacyNumericId().

export type MedicineRecord = Omit<Medicine, "id"> & { id: string }

/**
 * What the Add / Edit Medicine dialog collects. Deliberately absent: unit, purchase rate and supplier — the dialog has no
 * such fields (the mock adapter keeps its old defaults for a new medicine; nothing here invents them for the backend).
 */
export interface MedicineInput {
  name: string
  generic: string
  category: string
  batchNo: string
  expiry: string
  stock: number
  saleRate: number
  reorderLevel: number
}

/** The "Adjust Stock" dialog: add or remove a quantity, with an optional reason. */
export interface StockAdjustmentInput {
  direction: "Add" | "Remove"
  quantity: number
  /** Collected by the dialog but not stored by the mock (the demo medicine has no place for it). */
  reason?: string
}

export interface MedicinesService {
  list(opts?: ListOptions): Promise<ListResult<MedicineRecord>>
  create(input: MedicineInput): Promise<MedicineRecord>
  update(id: string, input: MedicineInput): Promise<MedicineRecord>
  /** Whether this maps to "receive stock as a batch", "adjustment" or "write-off" on the backend is CONTRACT REQUIRED. */
  adjustStock(id: string, input: StockAdjustmentInput): Promise<MedicineRecord>
}

export type DispenseLineRecord = Omit<DispenseLine, "medicineId"> & { medicineId: string }

export type DispensingRecord = Omit<DispenseRecord, "id" | "patientId" | "encounterId" | "doctorId" | "lines"> & {
  id: string
  patientId: string
  encounterId: string | null
  doctorId?: string
  lines: DispenseLineRecord[]
}

export interface DispenseLineInput {
  medicineId: string
  /** The quantity asked for (prescribed). What is actually dispensed is decided by the stock rules — CONTRACT REQUIRED. */
  quantity: number
  instructions?: string
  discountPct: number
  includedInPackage: boolean
}

/**
 * What the Dispense form collects. Deliberately absent (server-generated or derived — CONTRACT REQUIRED which): the
 * dispense number, date/time, per-line dispensed quantity / unit rate / total, subtotal, net payable, batch allocation,
 * and "dispensed by" (the demo form never asked; the mock supplies a demo name, the backend may take it from the token).
 */
export interface DispenseInput {
  patientId: string
  encounterId?: string
  doctorId?: string
  lines: DispenseLineInput[]
  discountPct: number
  gstPct: number
  paymentMode: PaymentMode
  notes?: string
}

export interface DispenseListOptions extends ListOptions {
  patientId?: string
}

export interface DispensingService {
  /** Newest first — the History screen does not re-sort. */
  list(opts?: DispenseListOptions): Promise<ListResult<DispensingRecord>>
  create(input: DispenseInput): Promise<DispensingRecord>
}

// ─── Billing, Expenses (T6), Bank accounts and transactions (T7) — Phase 4H ─────────────────────────────────────
// The Task List says consultation and services billing, payments, receipts and the Revenue / Daily Transactions /
// Patient Balances reports are "already covered, no task needed" on the backend, and that T6 (Expenses) and T7 (Bank) are
// "In review" as PR #17 — NOT merged. Neither the Task List nor the API Reference overview publishes a route or a schema
// for any of it, so every operation here is CONTRACT REQUIRED (all endpoint keys null).
//
// Money is a decimal STRING in every record and input in this section (the documented wire convention: "1500.00"). The
// UI never turns it into a float for arithmetic: see ./moneyMath.ts. Percentages (discount %, GST %) are decimal strings too.
// Ids are opaque strings. Dates are YYYY-MM-DD, instants ISO-8601 UTC, as documented.

import type { MoneyString } from "@/lib/api/types"

/** Task List T6: "mode Cash/Bank". */
export type ExpenseMode = "Cash" | "Bank"
/** Task List T7: "a cash movement type (deposit or withdrawal) that feeds the dashboard cash flow". */
export type CashMovement = "deposit" | "withdrawal"
export type DiscountType = "flat" | "percent"

// Invoices. Server-generated or derived — CONTRACT REQUIRED which — and therefore absent from every *Input: the invoice /
// receipt number, the date, the subtotal, the net total, the balance and the status.
export interface ConsultationInvoiceRecord {
  id: string
  invoiceNo: string
  encounterId: string | null
  patientId: string
  doctorId: string
  date: string
  fee: MoneyString
  includedInPackage?: boolean
  subtotal: MoneyString
  discountType: DiscountType
  /** A money amount when discountType is "flat", a percentage when "percent". */
  discount: string
  gstPct?: string
  netTotal: MoneyString
  paymentMode: PaymentMode
  creditCardAmount?: MoneyString
  amountReceived: MoneyString
  balance: MoneyString
  referenceNo?: string
  notes?: string
  /** UI status values (paid / unpaid / partial). Whether the backend uses these is unconfirmed (mapper CONTRACT REQUIRED). */
  status: PaymentStatus
}

export interface ConsultationInvoiceInput {
  patientId: string
  encounterId?: string
  doctorId: string
  fee: MoneyString
  includedInPackage: boolean
  discountType: DiscountType
  discount: string
  gstPct: string
  paymentMode: PaymentMode
  creditCardAmount?: MoneyString
  amountReceived: MoneyString
  notes?: string
}

export interface ServicesInvoiceLineRecord {
  id: string
  name: string
  rate: MoneyString
  qty: number
  /** Percentage as a decimal string. */
  discountPct: string
  amount: MoneyString
}

export interface ServicesInvoiceRecord {
  id: string
  invoiceNo: string
  encounterId: string | null
  patientId: string
  doctorId: string | null
  date: string
  vitals?: { bp: string; sugar: string; weight: string; temperature: string }
  lines: ServicesInvoiceLineRecord[]
  subtotal: MoneyString
  discountType: DiscountType
  discount: string
  gstPct: string
  netTotal: MoneyString
  paymentMode: PaymentMode
  amountReceived: MoneyString
  balance: MoneyString
  status: PaymentStatus
}

/** A line as the form collects it. How a line references the services catalogue (id or name) is CONTRACT REQUIRED. */
export interface ServicesInvoiceLineInput {
  name: string
  rate: MoneyString
  qty: number
  discountPct: string
}

export interface ServicesInvoiceInput {
  patientId: string
  encounterId?: string
  doctorId?: string
  vitals?: { bp: string; sugar: string; weight: string; temperature: string }
  lines: ServicesInvoiceLineInput[]
  discountType: DiscountType
  discount: string
  gstPct: string
  paymentMode: PaymentMode
  amountReceived: MoneyString
  notes?: string
}

export interface BillingListOptions extends ListOptions {
  patientId?: string
}

export interface ConsultationInvoicesService {
  list(opts?: BillingListOptions): Promise<ListResult<ConsultationInvoiceRecord>>
  create(input: ConsultationInvoiceInput): Promise<ConsultationInvoiceRecord>
}

export interface ServicesInvoicesService {
  list(opts?: BillingListOptions): Promise<ListResult<ServicesInvoiceRecord>>
  create(input: ServicesInvoiceInput): Promise<ServicesInvoiceRecord>
}

export interface BillingPaymentRecord {
  id: string
  receiptNo: string
  patientId: string
  date: string
  amount: MoneyString
  mode: PaymentMode
  /** "Advance" or an invoice number, as typed. Whether the backend links a payment to an invoice id is unconfirmed. */
  against: string
  referenceNo?: string
  notes?: string
  receivedBy: string
}

/** receiptNo and receivedBy are server-side / derived — CONTRACT REQUIRED which — so they are not input. */
export interface BillingPaymentInput {
  patientId: string
  date: string
  amount: MoneyString
  mode: PaymentMode
  against?: string
  referenceNo?: string
}

export interface PaymentsService {
  list(opts?: BillingListOptions): Promise<ListResult<BillingPaymentRecord>>
  create(input: BillingPaymentInput): Promise<BillingPaymentRecord>
}

export type BillingReceiptType = "Advance Deposit" | "Refund" | "Credit Note"

export interface BillingReceiptRecord {
  id: string
  receiptNo: string
  patientId: string
  type: BillingReceiptType
  amount: MoneyString
  date: string
  balanceRemaining: MoneyString
  notes?: string
}

export interface BillingReceiptInput {
  patientId: string
  type: BillingReceiptType
  amount: MoneyString
  date: string
}

export interface ReceiptsService {
  list(opts?: BillingListOptions): Promise<ListResult<BillingReceiptRecord>>
  create(input: BillingReceiptInput): Promise<BillingReceiptRecord>
}

// Expenses (T6: "expense head CRUD; expense create, list and void; totals by period and head").
export interface ExpenseCategoryRecord {
  id: string
  name: string
}

export interface ExpenseCategoryInput {
  name: string
}

export interface ExpenseCategoriesService {
  list(opts?: ListOptions): Promise<ListResult<ExpenseCategoryRecord>>
  create(input: ExpenseCategoryInput): Promise<ExpenseCategoryRecord>
  update(id: string, input: ExpenseCategoryInput): Promise<ExpenseCategoryRecord>
  /** The Master Data screen offers delete; T6 says "expense head CRUD". Whether the backend deletes, deactivates or refuses a used head is unknown. */
  remove(id: string): Promise<void>
}

export interface ExpenseRecord {
  id: string
  date: string
  categoryId: string
  categoryName: string
  description: string
  amount: MoneyString
  mode: ExpenseMode
  /** Shown by the screen; derived by the backend or sent by the client is CONTRACT REQUIRED, so it is not input. */
  enteredBy: string
}

export interface ExpenseInput {
  date: string
  categoryId: string
  description: string
  amount: MoneyString
  mode: ExpenseMode
}

export interface ExpenseTotals {
  total: MoneyString
  byCategory: { categoryId: string; categoryName: string; total: MoneyString }[]
}

export interface ExpensesService {
  list(opts?: ListOptions): Promise<ListResult<ExpenseRecord>>
  create(input: ExpenseInput): Promise<ExpenseRecord>
  /** Task List: "totals by period and head" come from the backend; the screen does not add rows up itself in API mode. */
  totals(opts?: { dateFrom?: string; dateTo?: string; signal?: AbortSignal }): Promise<ExpenseTotals>
}

// Bank accounts and transactions (T7: "account CRUD, transaction entry, a statement with running balance, and cash
// deposit/withdrawal linked to the day close").
export interface BankAccountRecord {
  id: string
  bankName: string
  accountTitle: string
  accountNo: string
  branch: string
  active: boolean
}

export interface BankAccountInput {
  bankName: string
  accountTitle: string
  accountNo: string
  branch: string
  active?: boolean
}

export interface BankAccountsService {
  list(opts?: ListOptions): Promise<ListResult<BankAccountRecord>>
  create(input: BankAccountInput): Promise<BankAccountRecord>
  update(id: string, input: BankAccountInput): Promise<BankAccountRecord>
}

export interface BankTransactionRecord {
  id: string
  date: string
  description: string
  debit: MoneyString
  credit: MoneyString
  /** Display name of the account the transaction belongs to. */
  bank: string
  bankAccountId?: string
  referenceNo?: string
  cashMovement?: CashMovement
}

/** One statement row. The running balance is the BACKEND's ("a statement with running balance"); the screen never derives it in API mode. */
export interface BankStatementRow {
  transaction: BankTransactionRecord
  balance: MoneyString
}

/** What the Record Transfer dialog collects. Which side of the ledger a deposit / withdrawal lands on is CONTRACT REQUIRED. */
export interface BankTransactionInput {
  date: string
  bankAccountId: string
  direction: "Deposit" | "Withdrawal"
  amount: MoneyString
  description: string
  referenceNo?: string
}

export interface BankTransactionsService {
  statement(opts?: ListOptions): Promise<ListResult<BankStatementRow>>
  create(input: BankTransactionInput): Promise<BankTransactionRecord>
}

// ─── Reports (T8 reports from existing data, T9 reports after new modules) — Phase 4I ───────────────────────────────
// The Task List splits the twelve report screens: T8 (status "Next", design round first — NOT started) = Daily Summary counts,
// OPD Statistics, Patient Demographics, Prescription History, Lists; T9 (depends on T2, T5, T6, T7) = Laboratory, Pharmacy,
// Expenses, Accounts; and "already covered, no task needed" = Revenue, Daily Transactions, Patient Balances. It publishes NO
// route, request parameter or response schema for any of them, so every operation below is CONTRACT REQUIRED (all endpoint keys
// null) and every model is a frontend-owned boundary: the shape the screen needs, NOT an API contract. Aggregates (totals,
// balances, counts, percentages, buckets) are the BACKEND's to compute; the screens render what the service returns and never
// add records up themselves. Money is a decimal string (MoneyString); ids are opaque strings; dates YYYY-MM-DD, instants ISO UTC.

import type { ServiceCatalogItem } from "@/types"

export interface DailySummaryReportData {
  newPatients: number
  opdEncounters: number
  ipdAdmissions: number
  discharges: number
  consultationRevenue: MoneyString
  labRevenue: MoneyString
  pharmacyRevenue: MoneyString
  totalRevenue: MoneyString
  doctorWise: { doctorId: string; patients: number; revenue: MoneyString }[]
  /** The footer of the doctor-wise table, so the screen never adds the rows up itself. */
  doctorWiseTotals: { patients: number; revenue: MoneyString }
  /** Percentages of payments by mode. */
  paymentModeShare: { cash: number; card: number; insurance: number }
}

export interface OpdStatisticsReportData {
  totalEncounters: number
  dailyCounts: { date: string; count: number }[]
  topDiagnoses: { diagnosis: string; count: number }[]
  newVsReturning: { newPatients: number; returning: number }
  doctorPerformance: { doctorId: string; patients: number; averageFee: MoneyString; total: MoneyString }[]
}

export interface RevenueReportData {
  trend: { date: string; consultation: MoneyString; lab: MoneyString; pharmacy: MoneyString }[]
  breakdown: { label: string; current: MoneyString; previous: MoneyString; changePct: string | null }[]
  total: MoneyString
  unpaid: { invoiceNo: string; patientId: string; type: "Consultation" | "Services"; amount: MoneyString; paid: MoneyString; balance: MoneyString; date: string; daysOverdue: number }[]
  totalOutstanding: MoneyString
  aged: { bucket: "0-30" | "31-60" | "61-90" | "90+"; amount: MoneyString }[]
}

export interface LabReportData {
  categoryVolume: { category: string; count: number }[]
  pendingOver24h: { labNo: string }[]
  topTests: { testName: string; count: number; revenue: MoneyString }[]
  turnaround: { category: string; averageHours: number; targetHours: number; onTime: boolean }[]
}

export interface PharmacyReportData {
  topDispensed: { medicineName: string; quantity: number; revenue: MoneyString }[]
  lowStock: { medicineId: string; name: string; stock: number; reorderLevel: number }[]
  expiringSoon: { medicineId: string; name: string; batchNo: string; stock: number; daysLeft: number }[]
}

export interface ExpenseTrendPoint {
  date: string
  amount: MoneyString
}

export interface DemographicsReportData {
  totalPatients: number
  gender: { name: string; count: number }[]
  ageBands: { label: string; count: number }[]
  coverage: { name: string; count: number }[]
  areas: { area: string; count: number }[]
  /** YYYY-MM. */
  monthlyRegistrations: { month: string; count: number }[]
}

export interface BalanceRow {
  patientId: string
  totalBilled: MoneyString
  received: MoneyString
  balance: MoneyString
}

export interface PatientBalancesReportData {
  rows: BalanceRow[]
  totalOutstanding: MoneyString
}

export interface OrganisationBalancesReportData {
  rows: { organisationId: string | null; name: string; patientCount: number; totalBilled: MoneyString; received: MoneyString; balance: MoneyString }[]
}

export interface PatientAccountSummaryReportData {
  rows: BalanceRow[]
  totals: { totalBilled: MoneyString; received: MoneyString; balance: MoneyString }
}

export interface AccountsPaymentsReportData {
  rows: BillingPaymentRecord[]
  /** Total of ALL payments (not just this page). */
  total: MoneyString
  count: number
}

export interface AccountsReceiptsReportData {
  rows: BillingReceiptRecord[]
  total: MoneyString
  count: number
}

export type DailyTransactionType = "Checkup" | "Admission/Services" | "Lab Slips" | "X-Rays" | "Pharmacy"

export interface DailyTransactionRow {
  key: string
  date: string
  type: DailyTransactionType
  refNo: string
  patientId: string
  doctorId: string | null
  amount: MoneyString
  mode: PaymentMode
  status: string
}

/** The register's criteria. Whether (and how) the backend filters by each is CONTRACT REQUIRED. "Credit" means any mode other than Cash (the screen's rule). */
export interface DailyTransactionsFilter {
  dateFrom: string
  dateTo: string
  dataType: "All" | DailyTransactionType
  cashCredit: "All" | "Cash" | "Credit"
  doctorId?: string
  patientId?: string
  organisationId?: string
  signal?: AbortSignal
}

export interface DailyTransactionsReportData {
  rows: DailyTransactionRow[]
  totals: { count: number; total: MoneyString; cash: MoneyString; credit: MoneyString }
}

export interface PrescriptionHistoryRow {
  key: string
  encId: string
  date: string
  patientId: string
  doctorId: string
  medicine: string
  dose: string
  frequency: string
  duration: string
}

export interface PrescriptionHistoryReportData {
  rows: PrescriptionHistoryRow[]
  total: number
}

export interface ReportOptions {
  signal?: AbortSignal
}

export interface ReportsService {
  dailySummary(opts?: ReportOptions): Promise<DailySummaryReportData>
  dailyTransactions(filter: DailyTransactionsFilter): Promise<DailyTransactionsReportData>
  opdStatistics(opts?: ReportOptions): Promise<OpdStatisticsReportData>
  revenue(opts?: ReportOptions): Promise<RevenueReportData>
  laboratory(opts?: ReportOptions): Promise<LabReportData>
  pharmacy(opts?: ReportOptions): Promise<PharmacyReportData>
  expenseTrend(opts?: ReportOptions): Promise<ExpenseTrendPoint[]>
  demographics(opts?: ReportOptions): Promise<DemographicsReportData>
  patientBalances(opts?: ReportOptions): Promise<PatientBalancesReportData>
  organisationBalances(opts?: ReportOptions): Promise<OrganisationBalancesReportData>
  patientAccountSummary(opts?: ReportOptions): Promise<PatientAccountSummaryReportData>
  accountsPayments(opts?: ListOptions): Promise<AccountsPaymentsReportData>
  accountsReceipts(opts?: ListOptions): Promise<AccountsReceiptsReportData>
  /** `search` matches patient, doctor or medicine (the screen's rule); newest first. */
  prescriptionHistory(opts?: ListOptions): Promise<PrescriptionHistoryReportData>
}

// ─── Dashboard (T10) and Financial Statistics (T11) — Phase 4J ────────────────────────────────────────────────────
// Task List: T10 "Dashboard — the tiles change by role: today's patients, admitted (IPD), revenue today, pending lab reports,
// pending orders, low stock, dispensed today, completed today, my patients. Building one summary endpoint avoids nine separate
// calls." (depends on T2, T5 for some tiles; no decision recorded). T11 "Financial Statistics — Revenue by category for a period:
// consultation, services, laboratory, X-Ray, medicines, plus receipts, payments and expenses. It extends GET /reports/revenue. ECG
// and ultrasound are now ordered and charged through imaging orders (T3), so that tab can be filled from them." (depends on T2, T3,
// T5, T6; no decision recorded). The dashboard's Cash Flow ships in PR #17 (in review, NOT merged) with T6 / T7. NO route, parameter
// or response schema is published for any of it, so every operation below is CONTRACT REQUIRED (all keys null) and every model is a
// frontend-owned boundary — the shape the screen needs, not an API contract. The backend owns every aggregate: the screens render
// what the service returns and never add records up themselves.

/** The nine documented tiles. Which are returned for which role is CONTRACT REQUIRED; the screen still chooses by its UI role hint. */
export interface DashboardSummaryData {
  todaysPatients: number
  admittedIpd: number
  revenueToday: MoneyString
  pendingLabReports: number
  pendingOrders: number
  lowStockItems: number
  dispensedToday: number
  completedToday: number
  myPatients: number
  /** Display notes under a tile ("+3 from yesterday"). NOT documented anywhere — demo decoration the old screen hard-coded. */
  notes?: Partial<Record<"todaysPatients" | "admittedIpd" | "revenueToday" | "dispensedToday", string>>
}

export interface DashboardVisitPoint {
  label: string
  count: number
}

export interface DashboardVisitsData {
  points: DashboardVisitPoint[]
  /** Shown in the chart caption, so the screen never adds the points up itself. */
  total: number
}

export interface DashboardRevenuePoint {
  date: string
  amount: MoneyString
}

export interface DashboardUpNextRow {
  time: string
  patientName: string
  mrNo: string
  /** Set when the patient could be resolved, so the row can link to the patient record. */
  patientId: string | null
  doctorName: string
  type: string
  status: string
}

/**
 * The Financial Statistics "Cash Flow". The Task List documents only that cash expenses come out of the one cash drawer per hospital,
 * "worked out day by day from an opening amount set once (expenses plan D7)", and that cash deposits / withdrawals link to the day
 * close and feed the dashboard cash flow. It does NOT define the lines, what counts as cash, or the period — so these lines are the
 * demo screen's, and the backend owns every value, including the opening amount.
 */
export interface CashFlowData {
  opening: MoneyString
  closing: MoneyString
  cashIn: { cashSales: MoneyString; cashReceipts: MoneyString; drawnFromBank: MoneyString; total: MoneyString }
  cashOut: { cashExpenses: MoneyString; cashPayments: MoneyString; depositInBank: MoneyString; total: MoneyString }
}

export interface DashboardService {
  summary(opts?: ReportOptions): Promise<DashboardSummaryData>
  weeklyVisits(opts?: ReportOptions): Promise<DashboardVisitsData>
  revenueTrend(opts?: ReportOptions): Promise<DashboardRevenuePoint[]>
  upNext(opts?: ReportOptions): Promise<DashboardUpNextRow[]>
  cashFlow(opts?: ReportOptions): Promise<CashFlowData>
}

export interface FinancialSummaryRow {
  label: string
  value: MoneyString
  count: number
  cash: MoneyString
  credit: MoneyString
  opd: MoneyString
  ipd: MoneyString
}

export interface FinancialStatisticsSummaryData {
  /** Services, Laboratory, Consultation, Medicines, X-Rays, ECG / Ultra-Sound — the order the screen shows. */
  categories: FinancialSummaryRow[]
  totalSales: Omit<FinancialSummaryRow, "label">
  payments: { value: MoneyString; count: number }
  receipts: { value: MoneyString; count: number }
  expenses: { value: MoneyString; count: number }
  banks: { value: MoneyString; count: number }
}

export type StatisticsCategory = "Services" | "Checkups" | "Lab Tests" | "Medicine" | "X-Rays" | "Receipts" | "Payments" | "Expenses"

export interface StatisticsRecordRow {
  id: string
  date: string
  /** The patient the record belongs to (the screen resolves the name), or null when the row has only a description (an expense). */
  patientId: string | null
  description?: string
  amount: MoneyString
  status: string
}

export interface StatisticsRecordsData {
  rows: StatisticsRecordRow[]
}

export interface DailyCheckupRevenuePoint {
  date: string
  amount: MoneyString
}

export interface StatisticsService {
  summary(opts?: ReportOptions): Promise<FinancialStatisticsSummaryData>
  records(category: StatisticsCategory, opts?: ReportOptions): Promise<StatisticsRecordsData>
  dailyCheckupRevenue(opts?: ReportOptions): Promise<DailyCheckupRevenuePoint[]>
}

/**
 * The services catalogue: the Lists report, the Master Data "Services Catalog" tab and the Services Invoice form's service picker.
 * `rate` stays a plain number, like the other Master Data catalogues (LabTestRecord). The Task List says only that lab and ECG/USG
 * tests are CRUD + deactivate on "the existing services catalog"; whether the generic catalogue can be created / edited / deactivated
 * through the API is CONTRACT REQUIRED, which is why create / update have their own (null) endpoint keys.
 */
export type ServiceCatalogRecord = Omit<ServiceCatalogItem, "id"> & { id: string }
/** What the Add / Edit Service dialog collects. `active` is the Active switch (the Task List calls it "deactivate"). */
export type ServiceCatalogInput = Omit<ServiceCatalogRecord, "id">

export interface ServiceCatalogListOptions extends ListOptions {
  category?: string
}

export interface ServiceCatalogService {
  list(opts?: ServiceCatalogListOptions): Promise<ListResult<ServiceCatalogRecord>>
  create(input: ServiceCatalogInput): Promise<ServiceCatalogRecord>
  update(id: string, input: ServiceCatalogInput): Promise<ServiceCatalogRecord>
}

// ─── Item History (T12) ──────────────────────────────────────────

/**
 * What the Item History button is asked about. The Task List says the read endpoint is "filtered by entity type and ID", but it does
 * not list the entity-type values, so the frontend names the SUBJECT (what the screen is showing) and leaves the translation to the
 * backend's entity-type value to the pending request mapper. Only the services catalogue has an Item History button today.
 */
export type ItemHistorySubject = "serviceCatalogItem"

export interface ItemHistoryQuery {
  subject: ItemHistorySubject
  /** The catalogue item's opaque id (a ULID in API mode). */
  id: string
  signal?: AbortSignal
}

/**
 * One row of an item's history, as the dialog shows it. FRONTEND-OWNED BOUNDARY, NOT AN API CONTRACT: the Task List does not say what an
 * audit-log entry holds. The strings are rendered verbatim — the frontend knows no action vocabulary, actor format or detail layout —
 * and `actor` is null when the source does not say who. The real mapper will adapt the audit log's fields to this once they are published.
 */
export interface ItemHistoryEntry {
  id: string
  /** ISO 8601 instant. */
  at: string
  action: string
  actor: string | null
  details: string
}

export interface ItemHistoryService {
  list(query: ItemHistoryQuery): Promise<ListResult<ItemHistoryEntry>>
}

/**
 * Invoice usage of a catalogue service: the invoice lines that carry the service. This is NOT audit history and is never converted
 * into `ItemHistoryEntry` — an invoice line proves a service was billed, not that anything about the catalogue item changed, and it has
 * no actor. It is the old Master Data "history" list, kept as a separate, explicitly labelled DEMO view: no document describes it, it
 * has no endpoint key, and the real-API adapter only reports "awaiting the backend contract". Money is an exact string.
 */
export interface ServiceUsageEntry {
  id: string
  invoiceNo: string
  /** ISO 8601 instant of the invoice. */
  at: string
  patient: string
  quantity: number
  rate: MoneyString
  amount: MoneyString
}

export interface ServiceUsageService {
  list(query: { id: string; signal?: AbortSignal }): Promise<ListResult<ServiceUsageEntry>>
}

// ─── Bill summary (patient / encounter balance panels) ──────────

/**
 * The bill roll-up the balance panels show. FRONTEND-OWNED BOUNDARY, NOT AN API CONTRACT: no document describes a per-patient or
 * per-encounter bill summary (the only documented balance data is the "Patient Balances" report, "already covered", with no route or
 * schema). The backend owns every figure — in API mode the frontend sums and subtracts nothing, and "balance" is whatever the
 * backend says it is. Exact money strings throughout.
 */
export interface BillSummary {
  consultation: MoneyString
  services: MoneyString
  laboratory: MoneyString
  imaging: MoneyString
  medicines: MoneyString
  total: MoneyString
  received: MoneyString
  balance: MoneyString
}

export interface BillSummaryService {
  forPatient(patientId: string, opts?: ReportOptions): Promise<BillSummary>
  forEncounter(encounterId: string, opts?: ReportOptions): Promise<BillSummary>
}

// ─── Notifications (top bar) ─────────────────────────────────────

/** A top-bar alert. FRONTEND-OWNED: no document describes notifications of any kind. `to` is an in-app route. */
export interface NotificationRecord {
  id: string
  title: string
  detail: string
  to: string
  tone: "warning" | "danger" | "info"
}

export interface NotificationsService {
  list(opts?: ReportOptions): Promise<NotificationRecord[]>
}
