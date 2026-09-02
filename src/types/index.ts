// ─── Auth & Users ───────────────────────────────────────────────

export type Role =
  | "admin"
  | "doctor"
  | "receptionist"
  | "billing"
  | "lab_tech"
  | "pharmacist"
  | "nurse"

export interface User {
  id: number
  name: string
  email: string
  password: string
  role: Role
  spec: string | null
  fee: number | null
  avatar: string
  phone?: string
  cnic?: string
  active?: boolean
  lastLogin?: string
  joiningDate?: string
}

export interface Doctor {
  userId: number
  name: string
  specialization: string
  qualifications: string
  pmcRegNo: string
  fee: number
  phone: string
  email?: string
  availableDays: string[]
  hoursFrom: string
  hoursTo: string
  notes?: string
  photoUrl?: string
}

// ─── Patients ───────────────────────────────────────────────────

export type Gender = "Male" | "Female" | "Other"
export type PatientStatus = "active" | "ipd" | "inactive"
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-" | "Unknown"

export interface Patient {
  id: number
  mrNo: string
  name: string
  fatherName: string
  dob: string
  age: number
  gender: Gender
  phone: string
  emergencyContact?: string
  address: string
  area?: string
  city: string
  bloodGroup: BloodGroup
  cnic: string
  guardianRelation: string
  panelId: number | null
  referredBy?: string
  remarks?: string
  status: PatientStatus
  registrationDate: string
  photoUrl?: string
}

// ─── Organisations / Panels ─────────────────────────────────────

export type PanelType = "Insurance" | "Corporate" | "Government" | "Other"

export interface Panel {
  id: number
  name: string
  type: PanelType
  contactPerson: string
  phone: string
  commissionPct: number
  active: boolean
}

// ─── Wards & Beds ────────────────────────────────────────────────

export type BedStatus = "available" | "occupied" | "maintenance"

export interface Bed {
  bedNo: string
  status: BedStatus
  patientId: number | null
  since: string | null
}

export interface Ward {
  id: number
  name: string
  type: "General" | "Private" | "ICU" | "Children"
  beds: Bed[]
}

// ─── Encounters ──────────────────────────────────────────────────

export type EncounterType = "OPD" | "IPD"
export type EncounterStatus = "open" | "discharged" | "cancelled"
export type PaymentStatus = "paid" | "unpaid" | "partial"
export type PaymentMode = "Cash" | "Card" | "Bank Transfer" | "Cheque" | "Insurance" | "On Account"

export interface Vitals {
  bp: string
  pulse: string
  temp: string
  weight: string
  height?: string
  spo2: string
  rbs: string
}

export interface PrescriptionItem {
  medicine: string
  dose: string
  route: string
  frequency: string
  duration: string
  instructions: string
}

export interface Encounter {
  id: number
  encId: string
  patientId: number
  type: EncounterType
  doctorId: number
  date: string
  tokenNo?: number
  ward?: string
  bedNo?: string
  admissionType?: "Emergency" | "Planned"
  priority: "Normal" | "Urgent"
  chiefComplaint: string
  history?: string
  onExamination?: string
  diagnosis: string
  clinicalNotes?: string
  vitals: Vitals
  prescription: PrescriptionItem[]
  generalInstructions?: string
  followUpDate?: string
  fee: number
  discount: number
  discountType: "flat" | "percent"
  netTotal: number
  paymentStatus: PaymentStatus
  paymentMode: PaymentMode
  amountReceived?: number
  balance?: number
  status: EncounterStatus
  dischargeDate?: string
  dischargeDiagnosis?: string
  dischargeSummary?: string
  conditionOnDischarge?: string
}

// ─── Medicines / Pharmacy ────────────────────────────────────────

export interface Medicine {
  id: number
  name: string
  generic: string
  category: string
  batchNo: string
  expiry: string
  stock: number
  unit: string
  purchaseRate: number
  saleRate: number
  reorderLevel: number
  supplier?: string
  remarks?: string
}

export interface DispenseLine {
  medicineId: number
  medicineName: string
  prescribedQty: number
  dispensedQty: number
  unitRate: number
  total: number
  instructions?: string
}

export interface DispenseRecord {
  id: number
  disNo: string
  patientId: number
  encounterId: number | null
  date: string
  lines: DispenseLine[]
  subtotal: number
  discountPct: number
  netPayable: number
  paymentMode: PaymentMode
  dispensedBy: string
  notes?: string
}

// ─── Laboratory ──────────────────────────────────────────────────

export type LabTestCategory =
  | "Haematology"
  | "Biochemistry"
  | "Serology"
  | "Urine Analysis"
  | "Cardiology"
  | "Radiology"

export interface LabTestParameter {
  parameter: string
  unit: string
  normalLow: number
  normalHigh: number
}

export interface LabTest {
  id: number
  code: string
  name: string
  category: LabTestCategory
  rate: number
  unit: string
  normalRange: string
  turnaroundHours: number
  parameters?: LabTestParameter[]
  narrative?: boolean
}

export type LabOrderStatus = "Pending" | "Collected" | "In Progress" | "Completed" | "Delivered"

export interface LabResultParam {
  parameter: string
  result: string
  unit: string
  normalRange: string
  flag: "Normal" | "High" | "Low" | "Critical" | ""
}

export interface LabOrderTest {
  testId: number
  testName: string
  charges: number
  discountPct: number
  gstPct: number
  results?: LabResultParam[]
  narrativeResult?: string
  remarks?: string
}

export interface LabOrder {
  id: number
  labNo: string
  patientId: number
  encounterId: number | null
  doctorId: number
  date: string
  priority: "Normal" | "Urgent"
  sampleType?: string
  sampleId?: string
  collectedBy?: string
  clinicalNotes?: string
  tests: LabOrderTest[]
  discount: number
  total: number
  paymentStatus: PaymentStatus
  status: LabOrderStatus
  pathologistRemarks?: string
  performedBy?: string
  verifiedBy?: string
}

// ─── Imaging ─────────────────────────────────────────────────────

export interface ImagingOrder {
  id: number
  xrNo: string
  patientId: number
  encounterId: number | null
  doctorId: number
  date: string
  tests: LabOrderTest[]
  discount: number
  total: number
  paymentMode: PaymentMode
  status: LabOrderStatus
}

// ─── Billing ─────────────────────────────────────────────────────

export interface LineItem {
  id: string
  name: string
  rate: number
  qty: number
  discountPct: number
  amount: number
}

export interface ConsultationInvoice {
  id: number
  invoiceNo: string
  encounterId: number | null
  patientId: number
  doctorId: number
  date: string
  fee: number
  additionalCharges?: { description: string; amount: number }[]
  subtotal: number
  discountType: "flat" | "percent"
  discount: number
  netTotal: number
  paymentMode: PaymentMode
  amountReceived: number
  balance: number
  referenceNo?: string
  notes?: string
  status: PaymentStatus
}

export interface ServicesInvoice {
  id: number
  invoiceNo: string
  encounterId: number | null
  patientId: number
  doctorId: number | null
  date: string
  vitals?: { bp: string; sugar: string; weight: string; temperature: string }
  lines: LineItem[]
  subtotal: number
  discountType: "flat" | "percent"
  discount: number
  gstPct: number
  netTotal: number
  paymentMode: PaymentMode
  amountReceived: number
  balance: number
  status: PaymentStatus
}

export interface PaymentRecord {
  id: number
  receiptNo: string
  patientId: number
  date: string
  amount: number
  mode: PaymentMode
  against: string
  referenceNo?: string
  notes?: string
  receivedBy: string
}

export type ReceiptType = "Advance Deposit" | "Refund" | "Credit Note"

export interface ReceiptRecord {
  id: number
  receiptNo: string
  patientId: number
  type: ReceiptType
  amount: number
  date: string
  balanceRemaining: number
  notes?: string
}

export interface Expense {
  id: number
  date: string
  category: string
  description: string
  amount: number
  mode: "Cash" | "Bank"
  enteredBy: string
}

export interface BankTransaction {
  id: number
  date: string
  description: string
  debit: number
  credit: number
  bank: string
  referenceNo?: string
}

// ─── Master Data ─────────────────────────────────────────────────

export interface ServiceCatalogItem {
  id: number
  code: string
  name: string
  category: string
  rate: number
  active: boolean
}

export interface GuardianRelationItem {
  id: number
  name: string
  remarks?: string
  active: boolean
}

export interface EcgUltrasoundTest {
  id: number
  code: string
  name: string
  fee: number
  remarks?: string
  active: boolean
}

export interface Disease {
  id: number
  icdCode: string
  name: string
  category: string
}

export interface AuditLogEntry {
  id: number
  user: string
  action: string
  module: string
  recordId: string
  timestamp: string
}

export interface ClinicSettings {
  nameEn: string
  nameUr: string
  address: string
  phone: string
  email: string
  tagline: string
  printHeader: string
  currencySymbol: string
  defaultCity: string
  timezone: string
  fiscalYearStart: string
}
