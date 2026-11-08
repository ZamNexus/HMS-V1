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

// ─── ICD-10 diagnosis codes (chunk S11) ─────────────────────────────────────────────────
/** One row of the shared, read-only ICD-10 list. The list is the same for every hospital and loaded by operations: never edited through the API. */
export interface IcdCodeRecord {
  id: string
  code: string
  name: string
  category: string | null
}
export type IcdListOptions = ListOptions
export interface IcdService {
  /** Search by diagnosis name OR code prefix, paged on the server. */
  list(opts?: IcdListOptions): Promise<ListResult<IcdCodeRecord>>
}

// ─── Staff users, admin view (Master Data / Admin, chunk S9) ─────────────────────────────
// Separate from UsersService on purpose: that one is the demo's shape (a password typed into the form, "send reset"), while the API generates a
// temporary password, keeps a doctor profile on the user and has sign-out-everywhere. The temporary password is returned ONCE and is never stored.
/** Roles an admin may assign (the API also has "super_admin", which is never assigned from here). */
export const API_USER_ROLES = ["admin", "doctor", "receptionist", "billing", "lab_tech", "pharmacist", "nurse", "radiographer"] as const
export interface DoctorProfileRecord {
  specialization: string
  qualifications: string
  pmcRegNo: string
  /** Exact money text, two decimals ("1500.00"). */
  consultationFee: string
  commissionPct: number | null
  photoUrl: string | null
  notes: string
}
export interface DoctorProfileInput {
  specialization?: string
  qualifications?: string
  pmcRegNo?: string
  /** Money text as typed or read ("1500", "1500.50"): normalised to two decimals when sent, never turned into a float. */
  consultationFee: string
  commissionPct?: number
  notes?: string
}
/** PATCH /users/{id}/doctor-profile: only what changed. A commission cannot be emptied once set (the API has no null for it): send 0. */
export type DoctorProfilePatch = Partial<DoctorProfileInput>
export interface UserAdminRecord {
  id: string
  username: string
  email: string | null
  name: string
  phone: string | null
  cnic: string | null
  address: string | null
  city: string | null
  joiningDate: string | null
  /** Backend role code ("super_admin" included, display only). */
  role: string
  active: boolean
  mustChangePassword: boolean
  locked: boolean
  lastLoginAt: string | null
  createdAt: string
  doctorProfile: DoctorProfileRecord | null
}
export interface UserAdminListOptions extends ListOptions {
  role?: string
  /** true = only active, false = only inactive, undefined = both. */
  active?: boolean
}
export interface UserCreateInput {
  username: string
  email?: string
  role: string
  name: string
  phone?: string
  cnic?: string
  address?: string
  city?: string
  joiningDate?: string
  doctorProfile?: DoctorProfileInput
}
/** PATCH /users/{id}: only what changed; `null` clears an optional field. */
export interface UserPatch {
  username?: string
  email?: string | null
  role?: string
  name?: string
  phone?: string | null
  cnic?: string | null
  address?: string | null
  city?: string | null
  joiningDate?: string | null
  doctorProfile?: DoctorProfileInput
}
export interface UserCreated {
  user: UserAdminRecord
  /** Shown to the admin once; the caller must not keep or log it. */
  temporaryPassword: string
}
export interface UserAdminService {
  list(opts?: UserAdminListOptions): Promise<ListResult<UserAdminRecord>>
  create(input: UserCreateInput): Promise<UserCreated>
  update(id: string, patch: UserPatch): Promise<UserAdminRecord>
  /** Edit a doctor's profile and fee (PATCH /users/{id}/doctor-profile); a NOT_A_DOCTOR 422 if the user is not one. Sends only what changed. */
  updateDoctorProfile(id: string, patch: DoctorProfilePatch): Promise<UserAdminRecord>
  /** Deactivating also ends the user's sessions on the server. */
  setActive(id: string, active: boolean): Promise<UserAdminRecord>
  /** A new temporary password, returned once (never for one's own account: USE_CHANGE_PASSWORD). */
  resetPassword(id: string): Promise<string>
  signOutEverywhere(id: string): Promise<void>
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
  /** API only: the exact money text from the server ("1500.00"). */
  feeText?: string
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
  BedStatus, DispenseLine, Gender, DispenseRecord, EcgUltrasoundTest, Encounter, EncounterType, ImagingOrder, LabOrder, LabOrderStatus, LabOrderTest, LabTest, LabTestCategory, Medicine,
  PanelBillingMode, PanelType, Patient, PatientStatus, PaymentMode, PaymentStatus, PrescriptionItem, Vitals, Ward,
} from "@/types"

export type PatientRecord = Omit<Patient, "id" | "panelId"> & {
  /** Opaque backend identifier (the API uses ULID strings). */
  id: string
  /** Organisation/panel id as an opaque string; null = self-pay. */
  panelId: string | null
  /** Record version (the API's `updatedAt`), sent back as `expectedUpdatedAt` so a concurrent edit is refused. Absent in mock mode. */
  version?: string
  // ── Fields only the real API returns (handoff 8.3). The demo model has none of them. ──
  /** True when the date of birth was estimated from an age: show "~45 yrs". */
  dobEstimated?: boolean
  /** The date of death (YYYY-MM-DD), null when alive. A deceased patient stays viewable but cannot be given a new encounter. */
  deceasedOn?: string | null
  archived?: boolean
  admitted?: boolean
  lastVisitDate?: string | null
  /** The outstanding balance as exact money text ("1500.00"). null = the caller lacks billing.read; absent on a single-patient answer. */
  balance?: string | null
  primaryPanelName?: string
  /** The catalogued guardian relation's id (the name is in `guardianRelation`). */
  guardianRelationId?: string | null
  /** The detail answer's coverages: at most one primary and one secondary panel, with their member details. */
  coverages?: PatientCoverage[]
}

/** One panel a patient is covered by (handoff 8.3: at most one primary and one secondary). Empty text means "not given". */
export interface PatientCoverage {
  panelId: string
  panelName?: string
  priority: "primary" | "secondary"
  memberNo: string
  principalMemberName: string
  principalRelation: string
  /** YYYY-MM-DD or "". */
  validFrom: string
  validTo: string
  /** Whether the panel's benefits apply today (returned by the API, never sent). */
  benefitsApply?: boolean
}

/** The age to register instead of a date of birth (exactly one of the two is sent). */
export interface PatientEstimatedAge { value: number; unit: "years" | "months" }

/** A possible duplicate found by phone or CNIC (archived patients are included so they can be restored instead of registered twice). */
export interface DuplicateMatch {
  id: string
  mrNo: string
  name: string
  fatherName: string
  gender: Gender
  dob: string
  phone: string
  cnic: string
  deceasedOn: string | null
  archived: boolean
  matchedOn: string[]
}

/**
 * Fields a user enters. MR number, age and registration date are deliberately NOT inputs: the server issues the MR number on save, and age is
 * derived from the date of birth (or the estimated age).
 */
export type PatientInput = Omit<PatientRecord, "id" | "mrNo" | "age" | "registrationDate" | "dobEstimated" | "deceasedOn" | "archived" | "admitted" | "lastVisitDate" | "balance" | "primaryPanelName"> & {
  /** Instead of `dob` when the date of birth is unknown. Exactly one of `dob` and `estimatedAge` is sent on create. */
  estimatedAge?: PatientEstimatedAge | null
  /** Send the register anyway choice after a `409 POSSIBLE_DUPLICATE` the staff member has reviewed. */
  acknowledgeDuplicates?: boolean
}

export interface PatientListOptions extends ListOptions {
  /** Only patients with this status (the demo). The real API maps "ipd" / "active" to `admitted`; "inactive" is replaced by `includeArchived`. */
  status?: PatientStatus
  gender?: Gender
  /** Patients with coverage under this panel. */
  panelId?: string
  /** true = no coverage (self-pay), false = some coverage. */
  selfPay?: boolean
  /** Registration date range (YYYY-MM-DD). */
  registeredFrom?: string
  registeredTo?: string
  /** Archived patients come back too (the API has no archived-only filter). */
  includeArchived?: boolean
}

export interface PatientsService {
  list(opts?: PatientListOptions): Promise<ListResult<PatientRecord>>
  get(id: string, signal?: AbortSignal): Promise<PatientRecord>
  create(input: PatientInput): Promise<PatientRecord>
  /**
   * API: PATCH /patients/{id} with ONLY the fields that differ from `base` (the record the form was loaded with) and its version as
   * `expectedUpdatedAt`; nothing is sent when nothing differs (the base is returned). `base` is required against the API.
   */
  update(id: string, input: PatientInput, base?: PatientRecord): Promise<PatientRecord>
  /** Archive (API: POST /patients/{id}/archive). Nothing is deleted: the record is kept in full and can be restored. */
  remove(id: string): Promise<void>
  /** Brings an archived patient back (API: POST /patients/{id}/restore). */
  restore(id: string): Promise<PatientRecord>
  /** Patients (archived ones too) sharing this phone number or CNIC (API: GET /patients/duplicates). */
  duplicates(query: { phone?: string; cnic?: string; signal?: AbortSignal }): Promise<DuplicateMatch[]>
  /** A death outside an admission (API: POST /patients/{id}/record-death). An admitted patient is recorded through discharge as expired. */
  recordDeath(id: string, deceasedOn: string): Promise<PatientRecord>
  /** Reverses a recorded death (API: POST /patients/{id}/revoke-death). */
  revokeDeath(id: string): Promise<PatientRecord>
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
  /** Percentages (not money): plain numbers. The API sends and accepts them as decimal strings. */
  commissionPct: number
  discountPct: number
  /** patient_pays: the patient pays and the panel is only tracked; panel_billed: covered charges go to the panel. */
  billingMode: PanelBillingMode
  active: boolean
}

/** What a create sends. discountPct and billingMode default on the server (0 and patient_pays) when left out. */
export type OrganisationInput = Omit<OrganisationRecord, "id" | "discountPct" | "billingMode"> & Partial<Pick<OrganisationRecord, "discountPct" | "billingMode">>
/** What an update sends: ONLY the fields that changed (the API's PATCH). An empty text clears contactPerson / phone. */
export type OrganisationPatch = Partial<Omit<OrganisationRecord, "id" | "active">>

export interface OrganisationsService {
  list(opts?: ListOptions): Promise<ListResult<OrganisationRecord>>
  create(input: OrganisationInput): Promise<OrganisationRecord>
  get(id: string, signal?: AbortSignal): Promise<OrganisationRecord>
  update(id: string, patch: OrganisationPatch): Promise<OrganisationRecord>
  /** POST /panels/{id}/deactivate or /reactivate. Nothing is ever deleted. */
  setActive(id: string, active: boolean): Promise<OrganisationRecord>
}

export interface GuardianRelationRecord {
  id: string
  name: string
  remarks?: string
  active: boolean
}

export type GuardianRelationInput = Omit<GuardianRelationRecord, "id">
/** What an update sends: ONLY the fields that changed. An empty remarks text clears it. */
export type GuardianRelationPatch = Partial<Pick<GuardianRelationRecord, "name" | "remarks">>

export interface GuardianRelationsService {
  list(opts?: ListOptions): Promise<ListResult<GuardianRelationRecord>>
  create(input: GuardianRelationInput): Promise<GuardianRelationRecord>
  get(id: string, signal?: AbortSignal): Promise<GuardianRelationRecord>
  update(id: string, patch: GuardianRelationPatch): Promise<GuardianRelationRecord>
  /** POST /guardian-relations/{id}/deactivate or /reactivate. Nothing is ever deleted. */
  setActive(id: string, active: boolean): Promise<GuardianRelationRecord>
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

// ─── Wards and beds setup (Master Data, chunk S8) ───────────────────────────────────────
// Separate from WardsService on purpose: that one feeds the IPD admission screens (chunks E7/E8), which need every bed of every ward, while the
// API's ward LIST carries only bed counts (the beds come with one ward's detail). This is the admin view of the same wards.
export const API_WARD_TYPES = ["general", "private", "icu", "children"] as const
export type ApiWardType = (typeof API_WARD_TYPES)[number]
export interface WardBedRecord {
  id: string
  bedNo: string
  /** "occupied" is derived by the server from admissions; "maintenance" is set by the bed-maintenance action (chunk E13), not here. */
  state: BedStatus
  /** false = retired. */
  active: boolean
}
export interface WardAdminRecord {
  id: string
  name: string
  type: ApiWardType
  /** Exact money text, two decimals ("3500.00"). */
  dailyRate: string
  active: boolean
  bedCount: number
  occupiedCount: number
  availableCount: number
  /** Present only on a ward's detail (GET /wards/{id}) and after create / update. */
  beds?: WardBedRecord[]
}
export interface WardAdminListOptions extends ListOptions {
  type?: ApiWardType
  /** true = only active, false = only inactive, undefined = both. */
  active?: boolean
}
export interface WardCreateInput {
  name: string
  type: ApiWardType
  /** Money text as typed or read; normalised to two decimals when sent. */
  dailyRate: string
  /** Bed numbers created together with the ward, in one call. */
  beds: string[]
}
export type WardPatch = Partial<Pick<WardCreateInput, "name" | "type" | "dailyRate">>
export interface WardAdminService {
  list(opts?: WardAdminListOptions): Promise<ListResult<WardAdminRecord>>
  get(id: string, signal?: AbortSignal): Promise<WardAdminRecord>
  create(input: WardCreateInput): Promise<WardAdminRecord>
  /** Sends ONLY what changed. */
  update(id: string, patch: WardPatch): Promise<WardAdminRecord>
  /** Refused while patients are still in the ward (WARD_OCCUPIED). */
  setActive(id: string, active: boolean): Promise<WardAdminRecord>
  addBed(wardId: string, bedNo: string): Promise<WardBedRecord>
  renameBed(bedId: string, bedNo: string): Promise<WardBedRecord>
  /** Retire / reactivate; refused while occupied (BED_OCCUPIED). */
  setBedActive(bedId: string, active: boolean): Promise<WardBedRecord>
}

// ─── Laboratory: diagnostics catalog (T1) and lab orders (T2) ───────────────────────────
// The Task List describes the backend's intended behaviour for T1/T2 but publishes NO endpoints, schemas,
// pagination or server-generated-field rules, so everything below is a frontend-facing boundary only; each
// mapper is CONTRACT REQUIRED (see the handoff document). Documented workflow facts the boundary respects:
// statuses run Pending → Collected → In Progress → Completed → Delivered; the server auto-flags results against
// the normal ranges and assigns lab numbers; a second doctor verifies before printing (ADR-0051).
//
// Ids are opaque strings; legacy mock screens still use numeric ids, converted only via legacyNumericId().

/** A normal band or critical limits; either end may be absent. */
export interface LabBand {
  low?: number
  high?: number
}
/** One measured parameter as the API keeps it: ranges are "any" (one band for everyone) or "male" + "female". */
export interface LabParameterSpec {
  key: string
  name: string
  unit?: string
  decimals?: number
  ranges?: { any?: LabBand; male?: LabBand; female?: LabBand }
  critical?: LabBand
}
/** The API's lab categories (imaging tests are a separate catalogue). */
export const API_LAB_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Microbiology"] as const
export const API_SPECIMEN_TYPES = ["EDTA whole blood", "Serum", "Citrate plasma", "Fluoride plasma", "Heparin plasma", "Urine", "Stool", "Swab", "Sputum", "CSF", "Other body fluid"] as const
export type LabTestRecord = Omit<LabTest, "id"> & {
  id: string
  /** API only: the exact money text from the server ("800.00"). `rate` (a number) exists only for the demo-shaped screens: API screens use this. */
  rateText?: string
  /** API only: absent in the demo data. */
  specimenType?: string
  gstPct?: number
  discountPct?: number
  active?: boolean
  /** API only: the full parameter definitions (the legacy `parameters` is a lossy summary of them). */
  specs?: LabParameterSpec[]
}

/** What the catalog screens let a user enter. Parameters / narrative / units are not editable in the current UI. */
export interface LabTestInput {
  code: string
  name: string
  category: LabTestCategory
  rate: number
  /** Exact money text; when present it is what is sent (the number above is for the demo-shaped screens only). */
  rateText?: string
  turnaroundHours: number
  /** Required by the API (the demo ignores them). */
  specimenType?: string
  gstPct?: number
  discountPct?: number
  narrative?: boolean
  specs?: LabParameterSpec[]
}
/** PATCH /lab-tests/{id}: only what changed. `specs` replaces the whole parameter list. */
export type LabTestPatch = Partial<Pick<LabTestInput, "code" | "name" | "category" | "rate" | "rateText" | "turnaroundHours" | "specimenType" | "gstPct" | "discountPct" | "narrative" | "specs">>

export interface LabTestListOptions extends ListOptions {
  category?: LabTestCategory
  specimenType?: string
  /** true = only active, false = only inactive, undefined = both. */
  active?: boolean
}

export interface LabTestsService {
  list(opts?: LabTestListOptions): Promise<ListResult<LabTestRecord>>
  create(input: LabTestInput): Promise<LabTestRecord>
  update(id: string, input: LabTestInput): Promise<LabTestRecord>
  /** Sends ONLY what changed. */
  patch(id: string, patch: LabTestPatch): Promise<LabTestRecord>
  /** Deactivate / reactivate (nothing is deleted). */
  setActive(id: string, active: boolean): Promise<LabTestRecord>
}

/** The API's imaging modalities (one catalogue for X-ray, ultrasound, Doppler, echo, ECG, CT, MRI and other). */
export const API_MODALITIES = ["X-Ray", "Ultrasound", "Doppler", "Echocardiography", "ECG", "CT", "MRI", "Other"] as const
export type EcgUltrasoundTestRecord = Omit<EcgUltrasoundTest, "id"> & {
  id: string
  /** API only: the exact money text from the server ("1500.00"); `fee` (a number) is for the demo-shaped screens. `fee` is the API's `rate`. */
  feeText?: string
  /** API only: absent in the demo data. */
  modality?: string
  gstPct?: number
  discountPct?: number
  turnaroundHours?: number
  reportRequired?: boolean
  reportTemplate?: string
}
export type EcgUltrasoundTestInput = Omit<EcgUltrasoundTestRecord, "id">
/** PATCH /imaging-tests/{id}: only what changed. */
export type ImagingTestPatch = Partial<Pick<EcgUltrasoundTestRecord, "code" | "name" | "modality" | "fee" | "feeText" | "gstPct" | "discountPct" | "turnaroundHours" | "reportRequired" | "reportTemplate">>
export interface ImagingTestListOptions extends ListOptions {
  modality?: string
  /** true = only active, false = only inactive, undefined = both. */
  active?: boolean
}

/** ECG / ultrasound catalog entries (the "ECG/Ultrasound" master-data tab, including its active switch). */
export interface EcgUltrasoundTestsService {
  list(opts?: ImagingTestListOptions): Promise<ListResult<EcgUltrasoundTestRecord>>
  create(input: EcgUltrasoundTestInput): Promise<EcgUltrasoundTestRecord>
  update(id: string, input: EcgUltrasoundTestInput): Promise<EcgUltrasoundTestRecord>
  /** Sends ONLY what changed. */
  patch(id: string, patch: ImagingTestPatch): Promise<EcgUltrasoundTestRecord>
  /** Deactivate / reactivate (nothing is deleted). */
  setActive(id: string, active: boolean): Promise<EcgUltrasoundTestRecord>
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
  /** API only (always present there): a deactivated category cannot be picked for a new expense. */
  active?: boolean
  createdAt?: string
}

export interface ExpenseCategoryInput {
  name: string
}

export interface ExpenseCategoryListOptions extends ListOptions {
  /** true = only active (pickers), false = only deactivated, undefined = both (the admin screen). */
  active?: boolean
}

export interface ExpenseCategoriesService {
  list(opts?: ExpenseCategoryListOptions): Promise<ListResult<ExpenseCategoryRecord>>
  create(input: ExpenseCategoryInput): Promise<ExpenseCategoryRecord>
  update(id: string, input: ExpenseCategoryInput): Promise<ExpenseCategoryRecord>
  /** The demo deletes; the API DEACTIVATES (handoff 9: "deactivate, never delete"). */
  remove(id: string): Promise<void>
  /** Deactivate / reactivate (API). */
  setActive(id: string, active: boolean): Promise<ExpenseCategoryRecord>
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

export interface BankAccountListOptions extends ListOptions {
  /** true = only active (forms that pick an account), false = only deactivated, undefined = both. */
  active?: boolean
}
/** PATCH /bank-accounts/{id}: only what changed; an emptied branch clears it. */
export type BankAccountPatch = Partial<Pick<BankAccountInput, "bankName" | "accountTitle" | "accountNo" | "branch">>

export interface BankAccountsService {
  list(opts?: BankAccountListOptions): Promise<ListResult<BankAccountRecord>>
  create(input: BankAccountInput): Promise<BankAccountRecord>
  update(id: string, input: BankAccountInput): Promise<BankAccountRecord>
  /** Sends ONLY what changed. */
  patch(id: string, patch: BankAccountPatch): Promise<BankAccountRecord>
  /** Deactivate / reactivate (nothing is deleted). */
  setActive(id: string, active: boolean): Promise<BankAccountRecord>
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
export type ServiceCatalogRecord = Omit<ServiceCatalogItem, "id"> & {
  id: string
  /** API only: the exact money text from the server ("1500.00"); `rate` (a number) is for the demo-shaped screens. When present it is what is sent. */
  rateText?: string
}
/** What the Add / Edit Service dialog collects. `active` is the Active switch (the Task List calls it "deactivate"). */
export type ServiceCatalogInput = Omit<ServiceCatalogRecord, "id">

export interface ServiceCatalogListOptions extends ListOptions {
  category?: string
  /** true = only active, false = only inactive, undefined = both. */
  active?: boolean
}

/** Only the fields that changed (PATCH /services/{id}). The API keeps no local name, remarks or barcode. */
export type ServiceCatalogPatch = Partial<Pick<ServiceCatalogRecord, "code" | "name" | "category" | "rate" | "rateText" | "gstPct" | "discountPct">>

export interface ServiceCatalogService {
  list(opts?: ServiceCatalogListOptions): Promise<ListResult<ServiceCatalogRecord>>
  create(input: ServiceCatalogInput): Promise<ServiceCatalogRecord>
  /** Full replace of the editable fields (the demo tab). The API screens use `patch`. */
  update(id: string, input: ServiceCatalogInput): Promise<ServiceCatalogRecord>
  /** Sends ONLY what changed. */
  patch(id: string, patch: ServiceCatalogPatch): Promise<ServiceCatalogRecord>
  /** Deactivate / reactivate (nothing is ever deleted). */
  setActive(id: string, active: boolean): Promise<ServiceCatalogRecord>
}

// ─── Item History (T12) ──────────────────────────────────────────

/**
 * What the Item History button is asked about. The Task List says the read endpoint is "filtered by entity type and ID", but it does
 * not list the entity-type values, so the frontend names the SUBJECT (what the screen is showing) and leaves the translation to the
 * backend's entity-type value to the pending request mapper. Only the services catalogue has an Item History button today.
 */
export type ItemHistorySubject =
  | "serviceCatalogItem" | "labTest" | "imagingTest" | "medicine" | "panel" | "guardianRelation" | "expenseCategory" | "bankAccount" | "ward" | "bed"
  | "user" | "doctor" | "clinicSettings"

export interface ItemHistoryQuery {
  subject: ItemHistorySubject
  /** The record's opaque id (a ULID in API mode). For a doctor it is the user's id; for the clinic settings the hospital's id. */
  id: string
  page?: number
  pageSize?: number
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

// ─── Appointments and doctor schedules (Phase 6, handoff 8.4) ───────────────────────────────

export type AppointmentStatus = "requested" | "confirmed" | "completed" | "cancelled" | "no_show"
/** What the API will let the caller do with an appointment right now. The screen shows exactly these buttons, nothing it would refuse. */
export type AppointmentAction = "confirm" | "reschedule" | "cancel" | "no_show" | "check_in"
export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

/** Who did something to an appointment, and when (both null while it has not happened). */
export interface AppointmentActorRef { id: string; name: string }

export interface AppointmentRecord {
  id: string
  /** The number issued on booking, for example "APT-2026-0012". */
  appointmentNo: string
  status: AppointmentStatus
  /** The day (YYYY-MM-DD) and start time (HH:MM) in the HOSPITAL's time zone. */
  date: string
  time: string
  startsAt: string
  endsAt: string
  durationMinutes: number
  patient: { id: string; mrNo: string; name: string; phone: string }
  doctor: { id: string; name: string }
  notes: string
  /** The doctor's hours were changed after booking and no longer cover this time. It is never moved or cancelled automatically. */
  outsideSchedule: boolean
  /** The visit opened from this appointment at check-in. */
  encounter: { id: string; encId: string } | null
  bookedAt: string
  bookedBy: AppointmentActorRef | null
  confirmedAt: string | null
  confirmedBy: AppointmentActorRef | null
  cancelledAt: string | null
  cancelledBy: AppointmentActorRef | null
  cancelReason: string | null
  noShowAt: string | null
  noShowBy: AppointmentActorRef | null
  allowedActions: AppointmentAction[]
}

export interface AppointmentListOptions extends ListOptions {
  /** One day (YYYY-MM-DD), or a range with dateFrom / dateTo. */
  date?: string
  dateFrom?: string
  dateTo?: string
  doctorId?: string
  patientId?: string
  status?: AppointmentStatus
}

export type SlotState = "free" | "booked" | "passed"
export interface SlotRecord { time: string; startsAt: string; state: SlotState }
export interface SlotsResult { doctorId: string; date: string; slotMinutes: number; slots: SlotRecord[] }

/** A doctor's weekly appointment hours. `days: []` takes the doctor off appointments. `from` / `to` are null until a schedule has been set. */
export interface ScheduleRecord { doctorId: string; days: WeekDay[]; from: string | null; to: string | null; slotMinutes: number }
export interface ScheduleInput { days: WeekDay[]; from: string; to: string; slotMinutes: number }

export interface AppointmentBookInput {
  patientId: string
  doctorId: string
  date: string
  time: string
  notes?: string
  /** Book it already confirmed instead of "requested". */
  confirmed?: boolean
}
/** Reschedule: only what changes. `time` must be a free slot start of the doctor on `date`. */
export interface AppointmentReschedulePatch { doctorId?: string; date?: string; time?: string; notes?: string }

export interface AppointmentsService {
  list(opts?: AppointmentListOptions): Promise<ListResult<AppointmentRecord>>
  get(id: string, signal?: AbortSignal): Promise<AppointmentRecord>
  book(input: AppointmentBookInput): Promise<AppointmentRecord>
  reschedule(id: string, patch: AppointmentReschedulePatch): Promise<AppointmentRecord>
  confirm(id: string): Promise<AppointmentRecord>
  cancel(id: string, reason: string): Promise<AppointmentRecord>
  noShow(id: string): Promise<AppointmentRecord>
}

export interface DoctorScheduleService {
  get(doctorId: string, signal?: AbortSignal): Promise<ScheduleRecord>
  /** Replaces the whole weekly schedule. Booked appointments are never moved or cancelled. */
  set(doctorId: string, input: ScheduleInput): Promise<ScheduleRecord>
  /** The day's slots, each free, booked or passed. None on a day the doctor does not work. */
  slots(doctorId: string, date: string, signal?: AbortSignal): Promise<SlotsResult>
}

// ─── Encounters, vitals, clinical record, admissions and the bed board (Phase 7, handoff 8.5) ───────────────────────────────
// API-shaped models. The prototype's single wizard record (EncounterRecord above) mixed the visit, vitals, the doctor's record and the bill; the API
// splits them into separate calls made by the role that owns each step, so these types are separate too. The demo keeps using EncounterRecord.

export type VisitType = "opd" | "ipd"
export type VisitStatus = "open" | "closed" | "discharged" | "cancelled"
export type VisitPriority = "normal" | "urgent"
export type AdmissionKind = "emergency" | "planned"
export type DischargeCondition = "recovered" | "improved" | "stable" | "left_against_medical_advice" | "expired"
export type BedState = "available" | "occupied" | "maintenance"

export interface VisitPatientRef { id: string; mrNo: string; name: string; gender: Gender; dob: string; dobEstimated: boolean; deceasedOn: string | null }
export interface VisitBedRef { id: string; bedNo: string; wardName: string }

/** One row of the encounter list, the OPD queue and a patient's Visits tab. */
export interface VisitSummary {
  id: string
  /** The number issued at check-in, for example "OPD-2026-0012". */
  encId: string
  type: VisitType
  status: VisitStatus
  startedAt: string
  /** The day (YYYY-MM-DD) in the hospital's zone. */
  date: string
  tokenNo: number | null
  priority: VisitPriority
  patient: VisitPatientRef
  doctor: { id: string; name: string }
  appointment: { id: string; appointmentNo: string } | null
  bed: VisitBedRef | null
  primaryDiagnosis: string | null
  /** A visit from an earlier day with an incomplete record: it stays open and is on the doctor's to-finish list. */
  pending: boolean
  archived: boolean
}

export interface BedAssignment { bedId: string; bedNo: string; wardId: string; wardName: string; assignedAt: string; releasedAt: string | null }

export interface VitalsReading {
  id: string
  recordedAt: string
  recordedBy: { id: string; name: string }
  bpSystolic: number | null
  bpDiastolic: number | null
  pulse: number | null
  temperatureF: number | null
  weightKg: number | null
  heightCm: number | null
  spo2: number | null
  rbs: number | null
  /** Derived by the server from weight and height. */
  bmi: number | null
}

export interface ClinicalDiagnosis { id: string; icdCode: { id: string; code: string } | null; text: string; isPrimary: boolean }
export interface PrescriptionLine {
  id: string
  medicineId: string | null
  medicineText: string
  dose: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: number | null
  instructions: string | null
}
export interface DischargeInfo { summary: string | null; condition: DischargeCondition; followUpInstructions: string | null; diagnoses: ClinicalDiagnosis[] }

/** The doctor's record. The API sends `clinical: null` to roles that may not read it (the front desk). */
export interface ClinicalRecord {
  chiefComplaint: string | null
  historyOfIllness: string | null
  examinationFindings: string | null
  clinicalNotes: string | null
  generalInstructions: string | null
  followUpDate: string | null
  diagnoses: ClinicalDiagnosis[]
  prescription: PrescriptionLine[]
  latestVitals: VitalsReading | null
  /** Chief complaint and a primary diagnosis exist: the visit can be closed. */
  recordComplete: boolean
  discharge: DischargeInfo | null
}

export interface VisitDetail extends VisitSummary {
  admissionType: AdmissionKind | null
  advisedBy: string | null
  referredBy: string | null
  reason: string | null
  closedAt: string | null
  dischargedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  archivedAt: string | null
  bedHistory: BedAssignment[]
  clinical: ClinicalRecord | null
  /** Sent back as `expectedUpdatedAt` by the correction and the clinical-record save. */
  updatedAt: string
  createdAt: string
}

export interface VisitListOptions extends ListOptions {
  type?: VisitType
  status?: VisitStatus
  doctorId?: string
  /** Inclusive YYYY-MM-DD bounds on the visit's day. */
  dateFrom?: string
  dateTo?: string
  admitted?: boolean
  pending?: boolean
  includeArchived?: boolean
  patientId?: string
  /** For example "tokenNo:asc" for a doctor's queue. The server default is "startedAt:desc". */
  sort?: string
}
export interface PatientVisitsOptions extends ListOptions { type?: VisitType; status?: VisitStatus; includeArchived?: boolean }

export interface CheckInInput {
  patientId: string
  doctorId: string
  priority?: VisitPriority
  advisedBy?: string
  referredBy?: string
  reason?: string
  /** At most 7 days back and never in the future (an ISO instant). Omitted = now. */
  startedAt?: string
  /** Check-in from an appointment: the visit opens and the appointment completes. */
  appointmentId?: string
}
export interface AdmitInput extends Omit<CheckInInput, "appointmentId"> { bedId: string; admissionType: AdmissionKind }
/** Correct the check-in or admission details: only what changes. `null` clears advisedBy / referredBy / reason. */
export interface CheckInCorrection {
  doctorId?: string
  priority?: VisitPriority
  advisedBy?: string | null
  referredBy?: string | null
  reason?: string | null
  startedAt?: string
  admissionType?: AdmissionKind
}

/** One vitals reading. Every number is optional, at least one is needed; `recordedAt` defaults to now. */
export interface VitalsInput {
  recordedAt?: string
  bpSystolic?: number
  bpDiastolic?: number
  pulse?: number
  temperatureF?: number
  weightKg?: number
  heightCm?: number
  spo2?: number
  rbs?: number
}

export interface DiagnosisInput { icdCodeId?: string; text?: string; isPrimary: boolean }
/** A line keeps its `id` on every save; a line without one is new, and a line left out is removed. */
export interface PrescriptionLineInput {
  id?: string
  medicineId?: string
  medicineText?: string
  dose?: string
  route?: string
  frequency?: string
  duration?: string
  quantity?: number
  instructions?: string
}
/** The doctor's record, saved WHOLE. */
export interface ClinicalRecordInput {
  chiefComplaint?: string | null
  historyOfIllness?: string | null
  examinationFindings?: string | null
  clinicalNotes?: string | null
  generalInstructions?: string | null
  followUpDate?: string | null
  diagnoses: DiagnosisInput[]
  prescription: PrescriptionLineInput[]
}

export interface ProgressNote { id: string; note: string; writtenAt: string; author: { id: string; name: string } }

export interface VisitDischargeInput {
  /** At most 7 days back, never in the future. Omitted = now. */
  dischargedAt?: string
  diagnoses: DiagnosisInput[]
  dischargeSummary?: string
  conditionOnDischarge: DischargeCondition
  followUpDate?: string
  followUpInstructions?: string
}

export interface VisitsService {
  list(opts?: VisitListOptions): Promise<ListResult<VisitSummary>>
  get(id: string, signal?: AbortSignal): Promise<VisitDetail>
  /** A patient's visits, newest first (the Visits and History tabs). */
  forPatient(patientId: string, opts?: PatientVisitsOptions): Promise<ListResult<VisitSummary>>
  checkInOpd(input: CheckInInput): Promise<VisitDetail>
  admit(input: AdmitInput): Promise<VisitDetail>
  correctCheckIn(id: string, patch: CheckInCorrection, expectedUpdatedAt: string): Promise<VisitDetail>
  vitals(id: string, signal?: AbortSignal): Promise<VitalsReading[]>
  recordVitals(id: string, input: VitalsInput): Promise<VitalsReading>
  saveClinicalRecord(id: string, input: ClinicalRecordInput, expectedUpdatedAt: string): Promise<VisitDetail>
  close(id: string): Promise<VisitDetail>
  notes(id: string, signal?: AbortSignal): Promise<ProgressNote[]>
  addNote(id: string, note: string): Promise<ProgressNote>
  transfer(id: string, bedId: string): Promise<VisitDetail>
  discharge(id: string, input: VisitDischargeInput): Promise<VisitDetail>
  cancel(id: string, reason: string): Promise<VisitDetail>
  reopen(id: string, reason: string): Promise<VisitDetail>
  archive(id: string): Promise<VisitDetail>
  restore(id: string): Promise<VisitDetail>
}

export interface BoardBed {
  id: string
  bedNo: string
  state: BedState
  occupant: { encounterId: string; encId: string; since: string; patient: { id: string; mrNo: string; name: string } } | null
}
export interface BoardWard { id: string; name: string; type: "general" | "private" | "icu" | "children"; dailyRate: string; beds: BoardBed[] }

export interface BedBoardService {
  /** Every active bed of every active ward: available, occupied (with the patient) or under maintenance. */
  occupancy(signal?: AbortSignal): Promise<BoardWard[]>
  /** Take a bed out of use (true) or return it to use (false). */
  setMaintenance(bedId: string, underMaintenance: boolean): Promise<void>
}

// ─── Billing (Phase 8; handoff 8.6, docs/openapi.json InvoiceDetailDto / InvoicePageDto / AccountDto) ───
// Every amount is a decimal STRING exactly as the server sent it. The browser never adds, subtracts or compares them: paid, partial, unpaid and every balance
// are derived on the server (handoff 8.6).

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "voided"
export type ChargeSourceType = "consultation" | "service" | "diagnostic" | "pharmacy" | "room"
export type ChargePayer = "patient" | "panel" | "counter"

export interface InvoicePatientRef {
  id: string
  mrNo: string
  name: string
}

/** The visit an invoice belongs to. `status` is only on the invoice detail. */
export interface InvoiceVisitRef {
  id: string
  encId: string
  type: VisitType
  status: VisitStatus | null
}

/** A row of the billing hub (GET /invoices). A counter sale has `patient: null` and a `counterCustomer` name. */
export interface InvoiceSummary {
  id: string
  invoiceNo: string
  issuedAt: string
  status: InvoiceStatus
  patient: InvoicePatientRef | null
  counterCustomer: string | null
  encounter: InvoiceVisitRef | null
  total: MoneyString
  discount: MoneyString
  received: MoneyString
  balance: MoneyString
  sourceTypes: ChargeSourceType[]
}

export interface InvoiceTotals {
  gross: MoneyString
  discount: MoneyString
  net: MoneyString
  gst: MoneyString
  total: MoneyString
  received: MoneyString
  balance: MoneyString
  patientBalance: MoneyString
  panelBalance: MoneyString
}

export interface InvoiceCharge {
  id: string
  sourceType: ChargeSourceType
  description: string
  rate: MoneyString
  /** A decimal string, as sent (a quantity is not money). */
  qty: string
  gross: MoneyString
  discountAmount: MoneyString
  /** A decimal string, as sent. */
  discountPct: string
  netAmount: MoneyString
  gstPct: string
  gstAmount: MoneyString
  totalAmount: MoneyString
  received: MoneyString
  outstanding: MoneyString
  payer: ChargePayer
  panel: { id: string; name: string } | null
  chargedAt: string
  serviceDate: string | null
  voided: boolean
  voidedAt: string | null
  voidedReason: string | null
}

export interface InvoiceDetail {
  id: string
  invoiceNo: string
  issuedAt: string
  status: InvoiceStatus
  patient: InvoicePatientRef | null
  counterCustomer: string | null
  encounter: InvoiceVisitRef | null
  totals: InvoiceTotals
  charges: InvoiceCharge[]
  voidedAt: string | null
  voidedReason: string | null
}

export interface InvoiceListOptions {
  search?: string
  patientId?: string
  encounterId?: string
  status?: InvoiceStatus
  sourceType?: ChargeSourceType
  /** OPD or IPD visits only (handoff 8.6: `encounterType`; docs/openapi.json does not list it yet). */
  encounterType?: VisitType
  /** YYYY-MM-DD on the hospital's calendar. */
  dateFrom?: string
  dateTo?: string
  sort?: string
  page?: number
  pageSize?: number
}

/** What a patient or a panel owes (`outstanding`) and the unused credit they hold (`credit`). */
export interface AccountBalance {
  outstanding: MoneyString
  credit: MoneyString
}

export interface BillingService extends BillingWriteService {
  listInvoices(options?: InvoiceListOptions, signal?: AbortSignal): Promise<ListResult<InvoiceSummary>>
  getInvoice(id: string, signal?: AbortSignal): Promise<InvoiceDetail>
  /** The visit's bill (one visit has one invoice). */
  invoiceForEncounter(encounterId: string, signal?: AbortSignal): Promise<InvoiceDetail>
  patientAccount(patientId: string, signal?: AbortSignal): Promise<AccountBalance>
  panelAccount(panelId: string, signal?: AbortSignal): Promise<AccountBalance>
}

// ─── Billing, write side and registers (Phase 8, B3 to B8; handoff 8.6) ───
// Every amount a user types is sent as a string; the browser never computes a total, a balance or an allocation. The server answers with the new state.

export type ReceiptMode = "cash" | "card" | "bank_transfer" | "cheque" | "insurance" | "on_account"
export type ReceiptType = "payment" | "advance" | "refund" | "credit_note"

/** Who paid or was paid: a patient, a panel (organisation), or a counter sale (a walk-in with no patient). */
export type ReceiptPayer =
  | { kind: "patient"; id: string; mrNo: string; name: string }
  | { kind: "panel"; id: string; name: string }
  | { kind: "counter"; invoiceId: string; name: string }

export interface ReceiptHospital {
  name: string
  nameUr: string | null
  address: string | null
  phone: string | null
  printHeader: string | null
  currencyCode: string
}

/** A row of the payments register (GET /payments). */
export interface PaymentRow {
  id: string
  receiptNo: string
  type: ReceiptType
  /** Null for a credit note (no money moves). */
  mode: ReceiptMode | null
  amount: MoneyString
  receivedAt: string
  payer: ReceiptPayer
  invoice: { id: string; invoiceNo: string } | null
  receivedBy: { id: string; name: string }
  reference: string | null
  notes: string | null
}

/** A receipt: the answer to a payment, advance, refund or credit note, and what GET /payments/{id} returns for a reprint. */
export interface Receipt extends PaymentRow {
  hospital: ReceiptHospital
  /** What the payment settled, charge by charge, as the server allocated it. */
  settled: { chargeId: string; invoiceNo: string; description: string; amount: MoneyString }[]
  /** Any excess kept as credit for the patient. */
  keptAsCredit: MoneyString
  /** The payer's account after this payment. */
  account: AccountBalance
}

/** A row of the Daily Transactions register (GET /charges). */
export interface ChargeRegisterRow {
  id: string
  chargedAt: string
  serviceDate: string | null
  sourceType: ChargeSourceType
  description: string
  patient: InvoicePatientRef | null
  counterCustomer: string | null
  invoice: { id: string; invoiceNo: string }
  doctor: { id: string; name: string } | null
  panel: { id: string; name: string } | null
  payer: ChargePayer
  totalAmount: MoneyString
  received: MoneyString
  outstanding: MoneyString
  voided: boolean
}

export interface DiscountInput {
  type: "amount" | "percent"
  /** A decimal string typed by the user. */
  value: string
}
export interface ChargeLineInput {
  serviceId: string
  /** Defaults to 1 on the server. */
  qty?: string
  /** An own rate: needs billing.write. */
  rate?: string
  /** An own discount: needs billing.write. */
  discount?: DiscountInput
}
export interface NewInvoiceInput {
  patientId: string
  /** Without a visit it is a stand-alone (walk-in) invoice. */
  encounterId?: string
  charges: ChargeLineInput[]
}
export interface PaymentAllocationInput {
  chargeId: string
  amount: string
}
export interface PaymentInput {
  /** Exactly one of patientId and panelId. */
  patientId?: string
  panelId?: string
  invoiceId?: string
  amount: string
  mode: ReceiptMode
  reference?: string
  notes?: string
  allocations?: PaymentAllocationInput[]
  /** Overpaying is refused (OVERPAYMENT) unless the excess is to be kept as an advance. */
  excessAsAdvance?: boolean
}
export interface AdvanceInput {
  patientId: string
  amount: string
  mode: ReceiptMode
  reference?: string
  notes?: string
}
export interface ApplyCreditInput {
  invoiceId?: string
  amount?: string
}
export interface AppliedCredit {
  applied: MoneyString
  account: AccountBalance
}
export interface RefundInput {
  patientId?: string
  panelId?: string
  amount: string
  mode: ReceiptMode
  reference?: string
  reason: string
}
export interface CreditNoteInput {
  patientId?: string
  panelId?: string
  invoiceId?: string
  amount: string
  allocations?: PaymentAllocationInput[]
  reason: string
}
export interface PaymentListOptions {
  type?: ReceiptType
  mode?: ReceiptMode
  patientId?: string
  panelId?: string
  invoiceId?: string
  receivedBy?: string
  dateFrom?: string
  dateTo?: string
  sort?: string
  page?: number
  pageSize?: number
}
export interface ChargeListOptions {
  sourceType?: ChargeSourceType
  /** Handoff 8.11 (Financial Statistics): only lab or only imaging charges. */
  diagnosticType?: "lab" | "imaging"
  /** Handoff 8.11: one imaging modality (the X-Rays / ECG / Ultrasound tabs). */
  modality?: "X-Ray" | "ECG" | "Ultrasound"
  patientId?: string
  doctorId?: string
  panelId?: string
  payer?: ChargePayer
  includeVoided?: boolean
  dateFrom?: string
  dateTo?: string
  sort?: string
  page?: number
  pageSize?: number
}

/** The write side of billing. Each method is ONE request; a write is never re-sent. */
export interface BillingWriteService {
  createInvoice(input: NewInvoiceInput): Promise<InvoiceDetail>
  addCharges(invoiceId: string, charges: ChargeLineInput[]): Promise<InvoiceDetail>
  discountInvoice(invoiceId: string, discount: DiscountInput, reason: string): Promise<InvoiceDetail>
  voidInvoice(invoiceId: string, reason: string): Promise<InvoiceDetail>
  voidCharge(chargeId: string, reason: string): Promise<InvoiceDetail>
  recordPayment(input: PaymentInput): Promise<Receipt>
  recordAdvance(input: AdvanceInput): Promise<Receipt>
  applyCredit(patientId: string, input: ApplyCreditInput): Promise<AppliedCredit>
  refund(input: RefundInput): Promise<Receipt>
  creditNote(input: CreditNoteInput): Promise<Receipt>
  getReceipt(id: string, signal?: AbortSignal): Promise<Receipt>
  listPayments(options?: PaymentListOptions, signal?: AbortSignal): Promise<ListResult<PaymentRow>>
  listCharges(options?: ChargeListOptions, signal?: AbortSignal): Promise<ListResult<ChargeRegisterRow>>
}

// ─── Laboratory and imaging orders (Phase 9; handoff 8.7 and 8.8, docs/openapi.json LabOrder*/ImagingOrder*) ───
// API-shaped, separate from the demo's single-record LabOrderRecord / ImagingOrderRecord. An order has specimens (lab) and tests; every level carries the
// `allowedActions` the server computed for THIS user and THIS state: the screens show exactly those buttons and nothing else.

export type DxStatus = "pending" | "collected" | "in_progress" | "completed" | "delivered" | "cancelled"
export type DxPriority = "routine" | "urgent"
export type DxFulfillment = "internal" | "external_referral"
export type DxTestStatus = "ordered" | "entered" | "verified" | "cancelled" | "performed"
/** A result flag against the patient's sex. `null` = no flag (no reference range). */
export type DxFlag = "normal" | "high" | "low" | "critical" | null
export type DxSpecimenType = "EDTA whole blood" | "Serum" | "Citrate plasma" | "Fluoride plasma" | "Heparin plasma" | "Urine" | "Stool" | "Swab" | "Sputum" | "CSF" | "Other body fluid"
export type DxModality = "X-Ray" | "Ultrasound" | "Doppler" | "Echocardiography" | "ECG" | "CT" | "MRI" | "Other"

export type DxLabOrderAction = "add_test" | "deliver" | "write_remarks" | "archive" | "restore"
export type DxSpecimenAction = "collect" | "reject"
export type DxLabTestAction = "cancel" | "enter_result" | "verify" | "amend"
export type DxImagingOrderAction = "add_test" | "deliver" | "archive" | "restore"
export type DxImagingTestAction = "cancel" | "perform" | "write_report" | "sign" | "amend"

export interface DxPerson {
  id: string
  name: string
}
export interface DxPatientRef {
  id: string
  mrNo: string
  name: string
}
export interface DxVisitRef {
  id: string
  encId: string
}
export interface DxCharge {
  id: string
  invoiceId: string
  total: MoneyString
  received: MoneyString
  paid: boolean
}

/** A row of a lab list or worklist (GET /lab-orders). */
export interface LabOrderRow {
  id: string
  orderNo: string
  status: DxStatus
  priority: DxPriority
  fulfillment: DxFulfillment
  orderedAt: string
  patient: DxPatientRef
  encounter: DxVisitRef | null
  referringDoctor: string
  tests: { name: string; status: DxTestStatus }[]
  /** How many tubes are still to be drawn. */
  toCollect: number
  /** Any verified or entered result flagged critical: shown first and loud. */
  hasCritical: boolean
  archived: boolean
}
export interface ImagingOrderRow {
  id: string
  orderNo: string
  status: DxStatus
  priority: DxPriority
  fulfillment: DxFulfillment
  orderedAt: string
  patient: DxPatientRef
  encounter: DxVisitRef | null
  referringDoctor: string
  tests: { name: string; modality: DxModality; status: DxTestStatus }[]
  toPerform: number
  toReport: number
  archived: boolean
}

export interface DxResultParameter {
  key: string
  name: string
  unit: string | null
  value: string
  flag: DxFlag
  normalRange: string | null
}
export interface DxResult {
  version: number
  parameters: DxResultParameter[]
  narrative: string | null
  enteredBy: DxPerson
  enteredAt: string
  /** A result is FINAL only when `verifiedAt` is set. */
  verifiedBy: DxPerson | null
  verifiedAt: string | null
}
export interface DxLabAmendment {
  version: number
  reason: string
  amendedBy: DxPerson
  amendedAt: string
  /** What the result said before the amendment, shown beside the corrected values. */
  previous: { parameters: Omit<DxResultParameter, "key">[]; narrative: string | null }
}
export interface DxSpecimen {
  id: string
  specimenNo: string
  specimenType: DxSpecimenType
  status: "pending" | "collected" | "rejected"
  collectedAt: string | null
  collectedBy: DxPerson | null
  rejectedAt: string | null
  rejectedReason: string | null
  replacesSpecimenId: string | null
  allowedActions: DxSpecimenAction[]
}
export interface DxLabTest {
  id: string
  testId: string
  name: string
  rate: MoneyString
  specimenId: string | null
  status: DxTestStatus
  result: DxResult | null
  amendments: DxLabAmendment[]
  charge: DxCharge | null
  cancelledAt: string | null
  cancelledReason: string | null
  allowedActions: DxLabTestAction[]
}
export interface DxLabOrder {
  id: string
  orderNo: string
  status: DxStatus
  priority: DxPriority
  fulfillment: DxFulfillment
  referredTo: string | null
  patient: DxPatientRef & { gender: "male" | "female" | "other" }
  encounter: DxVisitRef | null
  doctor: DxPerson | null
  referringDoctorText: string | null
  clinicalNotes: string | null
  pathologistRemarks: string | null
  orderedAt: string
  deliveredAt: string | null
  deliveredBy: DxPerson | null
  archived: boolean
  specimens: DxSpecimen[]
  tests: DxLabTest[]
  allowedActions: DxLabOrderAction[]
}

export interface DxImagingReport {
  version: number
  narrative: string
  writtenBy: DxPerson
  writtenAt: string
  /** A report is FINAL only when `signedAt` is set. */
  signedBy: DxPerson | null
  signedAt: string | null
}
export interface DxImagingAmendment {
  version: number
  reason: string
  amendedBy: DxPerson
  amendedAt: string
  previousNarrative: string | null
}
export interface DxImagingTest {
  id: string
  testId: string
  name: string
  modality: DxModality
  rate: MoneyString
  status: DxTestStatus
  /** False for an ECG tracing: it is done once performed. */
  reportRequired: boolean
  performedBy: DxPerson | null
  performedAt: string | null
  report: DxImagingReport | null
  /** The starting text offered when a report is written. */
  reportTemplate: string | null
  amendments: DxImagingAmendment[]
  charge: DxCharge | null
  cancelledAt: string | null
  cancelledReason: string | null
  allowedActions: DxImagingTestAction[]
}
export interface DxImagingOrder {
  id: string
  orderNo: string
  status: DxStatus
  priority: DxPriority
  fulfillment: DxFulfillment
  referredTo: string | null
  patient: DxPatientRef & { gender: "male" | "female" | "other" }
  encounter: DxVisitRef | null
  doctor: DxPerson | null
  referringDoctorText: string | null
  clinicalNotes: string | null
  orderedAt: string
  deliveredAt: string | null
  deliveredBy: DxPerson | null
  archived: boolean
  tests: DxImagingTest[]
  allowedActions: DxImagingOrderAction[]
}

/** The print payload: VERIFIED results only, plus what is still pending. */
export interface DxPrintHospital {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  printHeader: string | null
}
export interface DxPrintPatient {
  mrNo: string
  name: string
  gender: "male" | "female" | "other"
  dateOfBirth: string
  dateOfBirthEstimated: boolean
}
export interface DxLabPrint {
  hospital: DxPrintHospital
  orderNo: string
  priority: DxPriority
  orderedAt: string
  deliveredAt: string | null
  patient: DxPrintPatient
  encounterNo: string | null
  referringDoctor: string
  clinicalNotes: string | null
  pathologistRemarks: string | null
  specimens: { specimenNo: string; specimenType: DxSpecimenType; collectedAt: string }[]
  tests: {
    name: string
    amended: boolean
    amendments: { version: number; reason: string; amendedAt: string; previous: { parameters: Omit<DxResultParameter, "key">[]; narrative: string | null } }[]
    parameters: Omit<DxResultParameter, "key">[]
    narrative: string | null
    enteredBy: string
    verifiedBy: string
    verifiedAt: string
  }[]
  pending: string[]
  complete: boolean
}
export interface DxImagingPrint {
  hospital: DxPrintHospital
  orderNo: string
  priority: DxPriority
  orderedAt: string
  deliveredAt: string | null
  patient: DxPrintPatient
  encounterNo: string | null
  referringDoctor: string
  clinicalNotes: string | null
  reports: {
    name: string
    modality: DxModality
    narrative: string
    amended: boolean
    amendments: { version: number; reason: string; amendedAt: string; previousNarrative: string | null }[]
    performedBy: string | null
    performedAt: string | null
    signedBy: string
    signedAt: string
  }[]
  /** Performed but not yet signed: not printed as a result. */
  unreported: { name: string; modality: DxModality; performedBy: string; performedAt: string }[]
  pending: string[]
  complete: boolean
}

export interface DxTestLine {
  testId: string
  /** An own discount on this test: needs billing.write. */
  discount?: DiscountInput
}
export interface DxOrderInput {
  patientId: string
  encounterId?: string
  /** The ordering doctor (a user) OR the outside doctor's name, not both. */
  doctorId?: string
  referringDoctorText?: string
  priority: DxPriority
  clinicalNotes?: string
  /** Where the order is sent when the department is off (an external referral): recorded, not charged or worked. */
  referredTo?: string
  tests: DxTestLine[]
}
/** Parameters (by key) OR a narrative. */
export interface DxResultInput {
  parameters?: { key: string; value: string }[]
  narrative?: string
}
export interface DxAmendInput extends DxResultInput {
  reason: string
}
export interface DxListOptions {
  search?: string
  status?: DxStatus
  priority?: DxPriority
  fulfillment?: DxFulfillment
  patientId?: string
  encounterId?: string
  doctorId?: string
  dateFrom?: string
  dateTo?: string
  includeArchived?: boolean
  sort?: string
  page?: number
  pageSize?: number
}
export interface LabOrderListOptionsApi extends DxListOptions {
  /** The collection worklist. */
  toCollect?: boolean
}
export interface ImagingOrderListOptionsApi extends DxListOptions {
  modality?: DxModality
  toPerform?: boolean
  toReport?: boolean
}

export interface LabApiService {
  list(options?: LabOrderListOptionsApi, signal?: AbortSignal): Promise<ListResult<LabOrderRow>>
  get(id: string, signal?: AbortSignal): Promise<DxLabOrder>
  create(input: DxOrderInput): Promise<DxLabOrder>
  addTests(orderId: string, tests: DxTestLine[]): Promise<DxLabOrder>
  cancelTest(orderId: string, testId: string, reason: string): Promise<DxLabOrder>
  collect(orderId: string, specimenId: string): Promise<DxLabOrder>
  reject(orderId: string, specimenId: string, reason: string): Promise<DxLabOrder>
  enterResult(orderId: string, testId: string, input: DxResultInput): Promise<DxLabOrder>
  verify(orderId: string, testId: string): Promise<DxLabOrder>
  amend(orderId: string, testId: string, input: DxAmendInput): Promise<DxLabOrder>
  writeRemarks(orderId: string, remarks: string | null): Promise<DxLabOrder>
  deliver(orderId: string): Promise<DxLabOrder>
  report(orderId: string, signal?: AbortSignal): Promise<DxLabPrint>
  archive(orderId: string, reason: string): Promise<DxLabOrder>
  restore(orderId: string): Promise<DxLabOrder>
  /** The test definition (parameters with units and reference ranges), to build the result form. Needs catalogs.read. */
  testDefinition(testId: string, signal?: AbortSignal): Promise<LabTestRecord>
}
export interface ImagingApiService {
  list(options?: ImagingOrderListOptionsApi, signal?: AbortSignal): Promise<ListResult<ImagingOrderRow>>
  get(id: string, signal?: AbortSignal): Promise<DxImagingOrder>
  create(input: DxOrderInput): Promise<DxImagingOrder>
  addTests(orderId: string, tests: DxTestLine[]): Promise<DxImagingOrder>
  cancelTest(orderId: string, testId: string, reason: string): Promise<DxImagingOrder>
  perform(orderId: string, testId: string): Promise<DxImagingOrder>
  writeReport(orderId: string, testId: string, narrative: string): Promise<DxImagingOrder>
  sign(orderId: string, testId: string): Promise<DxImagingOrder>
  amend(orderId: string, testId: string, narrative: string, reason: string): Promise<DxImagingOrder>
  deliver(orderId: string): Promise<DxImagingOrder>
  report(orderId: string, signal?: AbortSignal): Promise<DxImagingPrint>
  archive(orderId: string, reason: string): Promise<DxImagingOrder>
  restore(orderId: string): Promise<DxImagingOrder>
}

// ─── Pharmacy (Phase 10; handoff 8.9, docs/openapi.json Medicine*/Batch*/StockMovement*/Dispense*/PrescriptionDispensing) ───
// API-shaped, separate from the demo's MedicineRecord / DispensingRecord. A medicine holds no stock of its own: stock arrives as BATCHES (one per delivery, with an expiry) and
// every change is a stock MOVEMENT. The server computes `stock` on every medicine (on hand, expired, nearest expiry, level, expiry, sale value): the screens show those and never sum
// batches. First-expire-first-out is the server's job; a line takes what is available (compare `dispensed` with `requested`).

export type PmLevel = "in_stock" | "low" | "out_of_stock"
export type PmExpiry = "expired" | "expiring" | null
export type PmMovementType = "received" | "dispensed" | "returned" | "written_off" | "adjusted"
export type PmPayMode = "cash" | "card" | "bank_transfer"

export interface PmStock {
  onHand: number
  expired: number
  nearestExpiry: string | null
  level: PmLevel
  expiry: PmExpiry
  saleValue: MoneyString
}
export interface PmBatch {
  id: string
  batchNo: string
  expiryDate: string
  receivedDate: string
  quantityReceived: number
  quantityRemaining: number
  purchaseRate: MoneyString
  supplier: string | null
  expired: boolean
}
export interface PmMedicine {
  id: string
  name: string
  generic: string | null
  category: string | null
  unit: string | null
  saleRate: MoneyString
  gstPct: string
  discountPct: string
  reorderLevel: number
  active: boolean
  stock: PmStock
  createdAt: string
}
export interface PmMedicineDetail extends PmMedicine {
  batches: PmBatch[]
}
/** The batch a delivery created, with its medicine (the answer to "receive stock"). */
export interface PmBatchReceipt extends PmBatch {
  medicine: { id: string; name: string }
}
export interface PmMovement {
  id: string
  type: PmMovementType
  /** Signed as the server sent it (a write-off or dispense is negative). */
  quantity: number
  reason: string | null
  occurredAt: string
  medicine: { id: string; name: string }
  batch: { id: string; batchNo: string; expiryDate: string }
  by: { id: string; name: string }
  dispense: { id: string; dispenseNo: string } | null
}

export interface PmPrescriptionLine {
  id: string
  medicineText: string
  /** The catalogue medicine the doctor picked; null for free text (the pharmacist chooses what to dispense). */
  medicine: { id: string; name: string; active: boolean } | null
  dose: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  instructions: string | null
  prescribed: number | null
  dispensed: number
  remaining: number | null
}
export interface PmPrescription {
  encounter: { id: string; encId: string }
  patient: { id: string; mrNo: string; name: string }
  doctor: { id: string; name: string }
  lines: PmPrescriptionLine[]
}

export interface PmDispenseRow {
  id: string
  dispenseNo: string
  patient: { id: string; mrNo: string; name: string } | null
  counterCustomer: string | null
  encounter: { id: string; encId: string } | null
  dispensedAt: string
  dispensedBy: { id: string; name: string }
  lines: { name: string; quantity: number }[]
  total: MoneyString
  received: MoneyString
}
export interface PmReturn {
  id: string
  quantity: number
  reason: string
  restocked: boolean
  returnedAt: string
  returnedBy: { id: string; name: string }
}
export interface PmDispenseLine {
  id: string
  medicineId: string
  name: string
  prescriptionLineId: string | null
  requested: number
  dispensed: number
  returned: number
  unitRate: MoneyString
  gstPct: string
  standingDiscountPct: string
  discountPct: string
  instructions: string | null
  batches: { batchId: string; batchNo: string; expiryDate: string; quantity: number }[]
  returns: PmReturn[]
  charge: { id: string; invoiceId: string; total: MoneyString; received: MoneyString; paid: boolean } | null
  allowedActions: "return"[]
}
export interface PmDispense {
  id: string
  dispenseNo: string
  patient: { id: string; mrNo: string; name: string } | null
  counterCustomer: string | null
  encounter: { id: string; encId: string } | null
  doctor: { id: string; name: string } | null
  remarks: string | null
  dispensedAt: string
  dispensedBy: { id: string; name: string }
  invoice: { id: string; invoiceNo: string } | null
  lines: PmDispenseLine[]
}
export interface PmSlip {
  hospital: DxPrintHospital
  dispenseNo: string
  dispensedAt: string
  customer: string
  mrNo: string | null
  encounterNo: string | null
  doctor: string | null
  dispensedBy: string
  lines: { name: string; quantity: number; instructions: string | null; batches: { batchNo: string; expiryDate: string }[]; total: MoneyString }[]
  total: MoneyString
  received: MoneyString
  remarks: string | null
}

export interface PmMedicineInput {
  name: string
  generic?: string
  category?: string
  unit?: string
  /** A money text typed by the user ("120" or "120.50"). */
  saleRate: string
  gstPct?: string
  discountPct?: string
  reorderLevel?: number
}
/** Only what changed (PATCH /medicines/{id}); an empty text clears generic, category or unit. */
export type PmMedicinePatch = Partial<PmMedicineInput>
export interface PmReceiveInput {
  batchNo: string
  expiryDate: string
  quantity: number
  purchaseRate: string
  supplier?: string
  receivedDate?: string
}
export interface PmWriteOffInput {
  quantity: number
  reason: string
}
export interface PmAdjustInput {
  /** Plus or minus: a stock-take correction. */
  quantity: number
  reason: string
}
export interface PmDispenseLineInput {
  medicineId: string
  quantity: number
  /** Links a visit line; a substitute medicine is an unlinked line. */
  prescriptionLineId?: string
  instructions?: string
  discountPct?: string
}
export interface PmDispenseInput {
  /** To a patient (patientId, optionally the visit) OR a counter sale (counterCustomer + payment). */
  patientId?: string
  encounterId?: string
  doctorId?: string
  counterCustomer?: string
  remarks?: string
  lines: PmDispenseLineInput[]
  payment?: { mode: PmPayMode; reference?: string }
}
export interface PmReturnInput {
  quantity: number
  reason: string
  restock: boolean
  /** How a counter customer is refunded at once. */
  refundMode?: PmPayMode
}
export interface PmMedicineListOptions {
  search?: string
  category?: string
  level?: "low" | "out_of_stock"
  expiry?: "expiring" | "expired"
  expiringWithinDays?: number
  active?: boolean
  sort?: string
  page?: number
  pageSize?: number
}
export interface PmMovementListOptions {
  medicineId?: string
  batchId?: string
  type?: PmMovementType
  dateFrom?: string
  dateTo?: string
  sort?: string
  page?: number
  pageSize?: number
}
export interface PmDispenseListOptions {
  search?: string
  patientId?: string
  encounterId?: string
  counter?: boolean
  dateFrom?: string
  dateTo?: string
  sort?: string
  page?: number
  pageSize?: number
}

export interface PharmacyApiService {
  listMedicines(options?: PmMedicineListOptions, signal?: AbortSignal): Promise<ListResult<PmMedicine>>
  getMedicine(id: string, signal?: AbortSignal): Promise<PmMedicineDetail>
  createMedicine(input: PmMedicineInput): Promise<PmMedicineDetail>
  updateMedicine(id: string, patch: PmMedicinePatch): Promise<PmMedicineDetail>
  setMedicineActive(id: string, active: boolean): Promise<PmMedicineDetail>
  receiveStock(medicineId: string, input: PmReceiveInput): Promise<PmBatchReceipt>
  writeOff(batchId: string, input: PmWriteOffInput): Promise<PmBatchReceipt>
  adjust(batchId: string, input: PmAdjustInput): Promise<PmBatchReceipt>
  movements(options?: PmMovementListOptions, signal?: AbortSignal): Promise<ListResult<PmMovement>>
  prescription(encounterId: string, signal?: AbortSignal): Promise<PmPrescription>
  dispense(input: PmDispenseInput): Promise<PmDispense>
  listDispenses(options?: PmDispenseListOptions, signal?: AbortSignal): Promise<ListResult<PmDispenseRow>>
  getDispense(id: string, signal?: AbortSignal): Promise<PmDispense>
  slip(id: string, signal?: AbortSignal): Promise<PmSlip>
  returnLine(dispenseId: string, lineId: string, input: PmReturnInput): Promise<PmDispense>
}

// ─── Reports (Phase 11; handoff 8.11, docs/openapi.json RevenueReport / CollectionsReport / OutstandingReport / PatientBalance*) ───
// Every figure is computed by the server and kept as the exact text it sent; the browser never adds, rounds or re-derives a report figure.

export type RpSourceType = "consultation" | "service" | "diagnostic" | "pharmacy" | "room"
export type RpCollectMode = "cash" | "card" | "bank_transfer" | "cheque" | "insurance" | "on_account"
export interface RpPeriod { dateFrom: string; dateTo: string }
export interface RpPerson { id: string; name: string }
export interface RpRevenue {
  period: RpPeriod
  grossRevenue: string
  creditNotes: string
  netRevenue: string
  gstCollected: string
  discountsGiven: string
  voided: string
  bySource: { sourceType: RpSourceType; charges: number; revenue: string; gst: string }[]
  byDoctor: { doctor: RpPerson; charges: number; revenue: string; commission: string }[]
  byPanel: { panel: RpPerson; charges: number; revenue: string; commission: string }[]
}
export interface RpCollections {
  period: RpPeriod
  received: string
  refunded: string
  net: string
  byMode: { mode: RpCollectMode; received: string; refunded: string }[]
  byCollector: { user: RpPerson; receipts: number; received: string; refunded: string }[]
}
export interface RpAging { days0to30: string; days31to60: string; days61to90: string; over90: string }
export interface RpOutstanding {
  asOf: string
  patients: { total: string; aging: RpAging }
  panels: { total: string; aging: RpAging }
  byPanel: { panel: RpPerson; outstanding: string }[]
}
export interface RpPatientBalance { patient: { id: string; mrNo: string; name: string; phone: string }; outstanding: string; oldestUnpaid: string }
export interface RpPatientBalanceOptions { page?: number; pageSize?: number }
export interface ReportsApiService {
  revenue(period: RpPeriod, signal?: AbortSignal): Promise<RpRevenue>
  collections(period: RpPeriod, signal?: AbortSignal): Promise<RpCollections>
  outstanding(signal?: AbortSignal): Promise<RpOutstanding>
  outstandingPatients(options?: RpPatientBalanceOptions, signal?: AbortSignal): Promise<ListResult<RpPatientBalance>>
  // The reports whose answers the handoff describes in words only (8.11): returned as received and shown as sent. Each takes the same period as the typed reports.
  dailySummary(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  opd(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  demographics(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  lab(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  pharmacy(period: RpPeriod, options?: RpExpiryOption, signal?: AbortSignal): Promise<unknown>
  financialSummary(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  revenueDaily(period: RpPeriod, options?: RpRevenueDailyOptions, signal?: AbortSignal): Promise<unknown>
  cashFlow(query: RpCashFlowQuery, signal?: AbortSignal): Promise<unknown>
  expensesReport(period: RpPeriod, signal?: AbortSignal): Promise<unknown>
  prescriptions(options?: RpPrescriptionOptions, signal?: AbortSignal): Promise<RpPrescriptionPage>
  dashboard(signal?: AbortSignal): Promise<DashboardApiData>
}

// ─── Accounts, dashboard and the remaining reports (Phase 13; handoff 8.10 and 8.11) ───
// The handoff fixes the routes, permissions, parameters and request bodies of these, and the dashboard's field names, but NOT the fields of most answers. So the types below hold
// only what the handoff itself names (an expense's date, category, description, amount, mode, bank account and reference are the fields it sends; a dashboard section's counters are the
// fields it lists) and every record keeps the answer as received in `raw`. Where the handoff gives no fields at all (the report bodies) the answer is typed `unknown` and shown as sent.

export type AcMode = "cash" | "bank_transfer" | "cheque" | "card"
export type AcBankKind = "opening_balance" | "deposit" | "withdrawal" | "other_credit" | "other_debit"
export interface AcRef { id: string | null; name: string | null }
export interface AcExpense {
  id: string
  date: string
  description: string
  amount: string
  mode: string
  category: AcRef
  bankAccount: AcRef | null
  referenceNo: string | null
  voided: boolean
  voidReason: string | null
  updatedAt: string | null
  raw: Record<string, unknown>
}
export interface AcExpenseListOptions {
  dateFrom?: string
  dateTo?: string
  categoryId?: string
  mode?: AcMode
  bankAccountId?: string
  search?: string
  includeVoided?: boolean
  sort?: string
  page?: number
  pageSize?: number
}
export interface AcExpensePage { items: AcExpense[]; total: number; totalAmount: string | null }
export interface AcExpenseInput { date: string; categoryId: string; description: string; amount: string; mode: AcMode; bankAccountId?: string; referenceNo?: string }
export interface AcExpenseEdit { date: string; categoryId: string; description: string; amount: string; referenceNo: string }
export interface AcBankTx {
  id: string
  bankAccountId: string | null
  date: string
  kind: string
  amount: string
  description: string
  referenceNo: string | null
  voided: boolean
  raw: Record<string, unknown>
}
export interface AcBankTxInput { bankAccountId: string; date: string; kind: AcBankKind; amount: string; description: string; referenceNo?: string }
export interface AcStatementOptions { dateFrom: string; dateTo: string }
/** A bank statement as received: opening, entries with a running balance, closing (the handoff's words); the recognised parts are null when the answer does not carry them. */
export interface AcStatement { raw: unknown; opening: string | null; closing: string | null; entries: Record<string, unknown>[] | null }
export interface AcDrawer { isSet: boolean; amount: string | null; date: string | null; raw: unknown }
export interface AcDrawerInput { amount: string; date: string }
export interface AccountsApiService {
  listExpenses(options?: AcExpenseListOptions, signal?: AbortSignal): Promise<AcExpensePage>
  getExpense(id: string, signal?: AbortSignal): Promise<AcExpense>
  createExpense(input: AcExpenseInput): Promise<AcExpense>
  updateExpense(base: AcExpense, edit: AcExpenseEdit): Promise<AcExpense>
  voidExpense(id: string, reason: string): Promise<AcExpense>
  bankBalances(signal?: AbortSignal): Promise<unknown>
  bankStatement(accountId: string, options: AcStatementOptions, signal?: AbortSignal): Promise<AcStatement>
  createBankTransaction(input: AcBankTxInput): Promise<AcBankTx>
  getBankTransaction(id: string, signal?: AbortSignal): Promise<AcBankTx>
  voidBankTransaction(id: string, reason: string): Promise<AcBankTx>
  drawerOpening(signal?: AbortSignal): Promise<AcDrawer>
  setDrawerOpening(input: AcDrawerInput): Promise<AcDrawer>
}

/** The dashboard (GET /dashboard, handoff 8.11): each section is null when the user may not see it. Counters are whole numbers, money is text, a series keeps its text. */
export interface DashSeriesPoint { label: string; value: string }
export interface DashboardApiData {
  visits: { today: number | null; yesterday: number | null; mine: number | null } | null
  admitted: { total: number | null; male: number | null; female: number | null; other: number | null } | null
  lab: { pending: number | null; doneToday: number | null } | null
  imaging: { pending: number | null; doneToday: number | null } | null
  pharmacy: { dispensedToday: number | null; dispensedYesterday: number | null; lowStock: number | null } | null
  revenue: { today: string | null; yesterday: string | null; last7Days: DashSeriesPoint[] | null } | null
  patientFlow: { last7Days: DashSeriesPoint[] | null; total: number | null } | null
  raw: unknown
}
export interface RpExpiryOption { expiringWithinDays?: number }
export interface RpRevenueDailyOptions { sourceType?: RpSourceType }
export interface RpCashFlowQuery { date?: string; dateFrom?: string; dateTo?: string }
export interface RpPrescriptionOptions { dateFrom?: string; dateTo?: string; patientId?: string; doctorId?: string; medicineId?: string; search?: string; page?: number; pageSize?: number }
export interface RpPrescriptionPage { items: Record<string, unknown>[]; total: number }
