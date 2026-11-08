import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/client"
import { classifyCreateError, disabledModuleOf, isModuleDisabled } from "./createOutcome"
import { NotConnectedError } from "./errors"
import { bankAccountCreatePayload, bankAccountListQuery, bankAccountUpdatePayload, parseBankAccount, parseBankAccountList } from "./http/bankAccounts"
import { expenseCategoryListQuery, expenseCategoryPayload, parseExpenseCategory, parseExpenseCategoryList } from "./http/expenseCategories"
import { AUDIT_ENTITY_TYPE, fieldLabel, itemHistoryQuery, parseAuditEntry, parseAuditPage } from "./http/itemHistory"
import { schemaOf, validate } from "./http/specValidate"
import type { ItemHistorySubject } from "./types"

// Expense categories (S12), bank accounts (S13) and Item History (D8) follow the PROPOSED contract (docs/openapi.draft.json). Every fixture and every
// payload below is validated against that file, so the code and the proposal cannot drift apart.

const D = { source: "draft" } as const
const ID = "01HZX000000000000000000800"
const AT = "2026-11-07T10:00:00.000Z"
const root = join(__dirname, "../../..")

describe("expense categories (S12)", () => {
  const WIRE = { id: ID, name: "Utilities", active: true, createdAt: AT }
  it("reads a category and a page; the fixtures match the proposed contract", () => {
    expect(validate(WIRE, schemaOf("ExpenseCategoryResponseDto_Output", "draft"), D)).toEqual([])
    expect(parseExpenseCategory(WIRE)).toEqual({ id: ID, name: "Utilities", active: true, createdAt: AT })
    const page = { data: [WIRE], meta: { page: 1, perPage: 10, total: 11, totalPages: 2 } }
    expect(validate(page, schemaOf("ExpenseCategoryPageDto_Output", "draft"), D)).toEqual([])
    expect(parseExpenseCategoryList(page).total).toBe(11)
  })
  it("refuses a category missing its flag or with a bad id", () => {
    expect(() => parseExpenseCategory({ ...WIRE, active: undefined })).toThrow(TypeError)
    expect(() => parseExpenseCategory({ ...WIRE, id: "7" })).toThrow(TypeError)
  })
  it("list query: server-side paging, search, active; perPage at most 100", () => {
    expect(expenseCategoryListQuery({ page: 2, pageSize: 10, search: " util ", active: false })).toEqual({ page: 2, perPage: 10, search: "util", active: false })
    expect(() => expenseCategoryListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
  it("the body is the trimmed name (2 to 80 characters) and matches the proposed create and update bodies", () => {
    const body = expenseCategoryPayload({ name: "  Utilities " })
    expect(body).toEqual({ name: "Utilities" })
    expect(validate(body, schemaOf("CreateExpenseCategoryDto", "draft"), D)).toEqual([])
    expect(validate(body, schemaOf("UpdateExpenseCategoryDto", "draft"), D)).toEqual([])
    expect(() => expenseCategoryPayload({ name: "x" })).toThrow(RangeError)
    expect(() => expenseCategoryPayload({ name: "x".repeat(81) })).toThrow(RangeError)
  })
})

describe("bank accounts (S13)", () => {
  const WIRE = { id: ID, bankName: "HBL", accountTitle: "Citi Clinic", accountNo: "PK36 SCBL 0000 0011 2345 6702", branch: null, active: true, createdAt: AT }
  it("reads an account (a null branch is empty text) and a page; fixtures match the proposed contract", () => {
    expect(validate(WIRE, schemaOf("BankAccountResponseDto_Output", "draft"), D)).toEqual([])
    expect(parseBankAccount(WIRE)).toEqual({ id: ID, bankName: "HBL", accountTitle: "Citi Clinic", accountNo: "PK36 SCBL 0000 0011 2345 6702", branch: "", active: true })
    expect(parseBankAccount({ ...WIRE, branch: "Main Branch" }).branch).toBe("Main Branch")
    const page = { data: [WIRE], meta: { page: 1, perPage: 10, total: 1, totalPages: 1 } }
    expect(validate(page, schemaOf("BankAccountPageDto_Output", "draft"), D)).toEqual([])
    expect(parseBankAccountList(page).items).toHaveLength(1)
  })
  it("list query: server-side paging, search, active", () => {
    expect(bankAccountListQuery({ page: 1, pageSize: 10, search: " hbl ", active: true })).toEqual({ page: 1, perPage: 10, search: "hbl", active: true })
    expect(() => bankAccountListQuery({ pageSize: 500 })).toThrow(RangeError)
  })
  it("create body: the handoff's { bankName, accountTitle, accountNo, branch? }; an empty branch is left out; matches the proposed contract", () => {
    const body = bankAccountCreatePayload({ bankName: " HBL ", accountTitle: " Citi Clinic ", accountNo: " 0123-4567 ", branch: "" })
    expect(body).toEqual({ bankName: "HBL", accountTitle: "Citi Clinic", accountNo: "0123-4567" })
    expect(validate(body, schemaOf("CreateBankAccountDto", "draft"), D)).toEqual([])
    expect(bankAccountCreatePayload({ bankName: "HBL", accountTitle: "Citi", accountNo: "12345", branch: "Main" }).branch).toBe("Main")
  })
  it("refuses before any request: short fields, a bad account number, an inactive create", () => {
    const ok = { bankName: "HBL", accountTitle: "Citi Clinic", accountNo: "12345", branch: "" }
    expect(() => bankAccountCreatePayload({ ...ok, bankName: "H" })).toThrow(RangeError)
    expect(() => bankAccountCreatePayload({ ...ok, accountNo: "12" })).toThrow(RangeError)
    expect(() => bankAccountCreatePayload({ ...ok, accountNo: "12#45" })).toThrow(RangeError)
    expect(() => bankAccountCreatePayload({ ...ok, active: false })).toThrow(NotConnectedError)
  })
  it("update body is ONLY the changed fields; an emptied branch is null; matches the proposed contract", () => {
    const body = bankAccountUpdatePayload({ accountTitle: "New Title", branch: "  " })
    expect(body).toEqual({ accountTitle: "New Title", branch: null })
    expect(validate(body, schemaOf("UpdateBankAccountDto", "draft"), D)).toEqual([])
    expect(() => bankAccountUpdatePayload({})).toThrow(RangeError)
  })
})

describe("Item History (D8)", () => {
  const SUBJECTS = Object.keys(AUDIT_ENTITY_TYPE) as ItemHistorySubject[]
  it("every record kind maps to the handoff's entityType, and the set is exactly the proposed contract's enum", () => {
    const enumValues = (schemaOf("AuditEntityType", "draft") as { enum: string[] }).enum
    expect(SUBJECTS).toHaveLength(13)
    expect(Object.values(AUDIT_ENTITY_TYPE).sort()).toEqual([...enumValues].sort())
    expect(AUDIT_ENTITY_TYPE.serviceCatalogItem).toBe("service_catalog_item") // handoff 9
    expect(AUDIT_ENTITY_TYPE.clinicSettings).toBe("clinic_settings")
  })
  it("the request is entityType + entityId (a ULID) + paging, perPage at most 100", () => {
    expect(itemHistoryQuery({ subject: "labTest", id: ID })).toEqual({ entityType: "lab_test", entityId: ID, page: undefined, perPage: 100 })
    expect(itemHistoryQuery({ subject: "doctor", id: ID, page: 2, pageSize: 25 })).toMatchObject({ entityType: "doctor", page: 2, perPage: 25 })
    expect(() => itemHistoryQuery({ subject: "ward", id: "12" })).toThrow(TypeError)
    expect(() => itemHistoryQuery({ subject: "ward", id: ID, pageSize: 101 })).toThrow(RangeError)
  })
  const UPDATED = { id: ID, occurredAt: AT, action: "updated", actor: { id: ID, name: "Dr Admin" }, changes: { rate: { from: "1500.00", to: "1800.00" }, active: { from: true, to: false }, dailyRate: { from: null, to: "3500.00" } } }
  const CREATED = { id: "01HZX000000000000000000801", occurredAt: AT, action: "created", actor: null, changes: null }
  it("fixtures match the proposed contract", () => {
    expect(validate({ data: [UPDATED, CREATED], meta: { page: 1, perPage: 100, total: 2, totalPages: 1 } }, schemaOf("AuditEntryPageDto_Output", "draft"), D)).toEqual([])
  })
  it("an update lists each change as 'Field: from -> to'; booleans read Yes/No; null reads (empty)", () => {
    const e = parseAuditEntry(UPDATED)
    expect(e).toMatchObject({ id: ID, at: AT, action: "Updated", actor: "Dr Admin" })
    expect(e.details.split("\n")).toEqual(["Rate: 1500.00 → 1800.00", "Active: Yes → No", "Daily rate: (empty) → 3500.00"])
  })
  it("a change by the system shows 'System'; a creation has no details", () => {
    expect(parseAuditEntry(CREATED)).toMatchObject({ action: "Created", actor: "System", details: "" })
  })
  it("an unknown action is shown as sent; a list or object value is never rendered", () => {
    expect(parseAuditEntry({ ...CREATED, action: "archived" }).action).toBe("archived")
    expect(parseAuditEntry({ ...CREATED, action: "updated", changes: { parameters: { from: ["a"], to: { b: 1 } } } }).details).toBe("Parameters: (see record) → (see record)")
  })
  it("reads a page; refuses an entry without an id or action", () => {
    expect(parseAuditPage({ data: [UPDATED], meta: { page: 1, perPage: 100, total: 130, totalPages: 2 } }).total).toBe(130)
    expect(() => parseAuditEntry({ ...UPDATED, id: "x" })).toThrow(TypeError)
    expect(() => parseAuditEntry({ ...UPDATED, action: undefined })).toThrow(TypeError)
  })
  it("fieldLabel makes readable names", () => {
    expect(fieldLabel("dailyRate")).toBe("Daily rate")
    expect(fieldLabel("pmc_reg_no")).toBe("Pmc reg no")
  })
  it("the button is shown only against the API and only with audit.read (handoff 5), and values are rendered as text", () => {
    const src = readFileSync(join(root, "src/components/shared/ItemHistoryButton.tsx"), "utf8")
    expect(src).toContain('dataSource !== "api" || !can("audit.read")')
    expect(src).not.toMatch(/dangerouslySetInnerHTML/)
    expect(readFileSync(join(root, "src/components/shared/ItemHistoryView.tsx"), "utf8")).not.toMatch(/dangerouslySetInnerHTML/)
  })
  it("every Phase 4 list and screen has the button", () => {
    const where: [string, string][] = [
      ["src/components/masterdata/ServicesTab.tsx", 'subject="serviceCatalogItem"'], ["src/components/masterdata/LabTestsTab.tsx", 'subject="labTest"'],
      ["src/components/masterdata/ImagingTestsTab.tsx", 'subject="imagingTest"'], ["src/components/masterdata/PanelsTab.tsx", 'subject="panel"'],
      ["src/components/masterdata/GuardianRelationsTab.tsx", 'subject="guardianRelation"'], ["src/components/masterdata/WardsTab.tsx", 'subject="ward"'],
      ["src/components/masterdata/WardsTab.tsx", 'subject="bed"'], ["src/components/masterdata/ExpenseCategoriesTab.tsx", 'subject="expenseCategory"'],
      ["src/components/masterdata/BankAccountsTab.tsx", 'subject="bankAccount"'], ["src/components/admin/UsersAdmin.tsx", 'subject="user"'],
      ["src/components/admin/DoctorsAdmin.tsx", 'subject="doctor"'], ["src/components/masterdata/ClinicSettingsTab.tsx", 'subject="clinicSettings"'],
    ]
    for (const [file, needle] of where) expect(readFileSync(join(root, file), "utf8"), `${file} ${needle}`).toContain(needle)
  })
})

describe("422 MODULE_DISABLED (handoff 8.1)", () => {
  const refused = (details: unknown, status = 422, code = "MODULE_DISABLED") =>
    new ApiError({ status, code, message: "The laboratory is switched off.", requestId: "req-9", body: { statusCode: status, code, message: "The laboratory is switched off.", requestId: "req-9", path: "/api/v1/lab-orders", timestamp: AT, details } as never })
  it("is recognised only as a 422 with that code", () => {
    expect(isModuleDisabled(refused({ module: "lab" }))).toBe(true)
    expect(isModuleDisabled(refused({ module: "lab" }, 409))).toBe(false)
    expect(isModuleDisabled(refused({}, 422, "MODULE_IN_USE"))).toBe(false)
    expect(isModuleDisabled(new Error("x"))).toBe(false)
  })
  it("names the department from details.module, shows the backend's own message, and keeps the support reference", () => {
    expect(disabledModuleOf(refused({ module: "ipd" }))).toBe("Inpatient (IPD)")
    expect(classifyCreateError(refused({ module: "lab" }))).toMatchObject({
      kind: "failed", code: "MODULE_DISABLED", heading: "The Laboratory department is switched off", message: "The laboratory is switched off.", requestId: "req-9",
    })
  })
  it("falls back to the generic heading when the server does not name a known department", () => {
    for (const details of [undefined, {}, { module: "unknown" }, [], { module: 3 }]) {
      expect(disabledModuleOf(refused(details))).toBeNull()
      expect(classifyCreateError(refused(details))).toMatchObject({ heading: "That department is switched off", message: "The laboratory is switched off." })
    }
  })
  it("every write wrapper re-reads the settings when a department turns out to be switched off", () => {
    const src = readFileSync(join(root, "src/lib/services/index.ts"), "utf8")
    expect(src).toContain('if (isModuleDisabled(err)) void invalidateFamily("settings")')
  })
})

describe("doctors: availability and the inline register dialog", () => {
  it("a doctor's weekly schedule (handoff 8.4 and 8.11) is read when the row carries it, never rejected, and a row without one has no days", async () => {
    const { parseDoctorSummary } = await import("./http/doctorPicker")
    const wire = { id: ID, name: "Dr Ayesha", specialization: "ENT", qualifications: "MBBS", consultationFee: "1500.00", schedule: { days: ["mon", "tue"], from: "09:00", to: "17:00", slotMinutes: 15 } }
    expect(parseDoctorSummary(wire)).toMatchObject({ id: ID, name: "Dr Ayesha", feeText: "1500.00", availableDays: ["Mon", "Tue"], hoursFrom: "09:00", hoursTo: "17:00" })
    const plain: Record<string, unknown> = { ...wire }
    delete plain.schedule
    expect(parseDoctorSummary(plain)).toMatchObject({ id: ID, availableDays: [], hoursFrom: "", hoursTo: "" })
    expect(parseDoctorSummary({ ...wire, schedule: "mon-fri" })).toMatchObject({ id: ID, availableDays: [] }) // an unreadable schedule is ignored, not an error
  })
  it("API mode points to Admin > Doctors instead of an inline form that could only fail; the demo keeps its form", () => {
    const src = readFileSync(join(root, "src/components/shared/QuickAddDoctorDialog.tsx"), "utf8")
    expect(src).toContain('dataSource === "api" ? <ApiModeNotice')
    expect(src).toContain('href="/admin/doctors"')
    expect(src).toContain("function MockQuickAddDoctorDialog")
  })
})
