import type { QueryParams } from "@/lib/api/client"
import { NotConnectedError } from "./errors"

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND CONNECTION POINT 1 of 2 — endpoint table.
//
// Fill in each entry ONLY from the authoritative OpenAPI specification
// (`docs/openapi.json` in the HMS-backend repo). `null` means "path/method NOT
// CONFIRMED — requires confirmation from the OpenAPI spec": the HTTP adapters
// then refuse to call the backend and the screen shows a "Backend not connected
// yet" message instead of guessing a URL.
//
// `path` is relative to the API prefix (/api/v1) and may contain `:id`.
//   e.g. { method: "PATCH", path: "/users/:id" }
//
// Do NOT infer a route from the status of an unauthenticated request (a 401,
// 403 or 404 does not prove an endpoint exists or doesn't). The keys below are
// the operations the existing screens need; whether the backend offers each one
// is unconfirmed.
// ─────────────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface Endpoint {
  method: HttpMethod
  path: string
}

export type EndpointKey =
  | "auth.me"
  | "users.list"
  | "icd.list"
  | "usersAdmin.list"
  | "usersAdmin.create"
  | "usersAdmin.update"
  | "usersAdmin.doctorProfile"
  | "usersAdmin.deactivate"
  | "usersAdmin.reactivate"
  | "usersAdmin.resetPassword"
  | "usersAdmin.signOutEverywhere"
  | "users.create"
  | "users.update"
  | "users.setActive"
  | "doctors.list"
  | "doctors.create"
  | "doctors.update"
  | "patients.list"
  | "patients.get"
  | "patients.create"
  | "patients.update"
  | "patients.delete"
  | "patients.restore"
  | "patients.duplicates"
  | "patients.recordDeath"
  | "patients.revokeDeath"
  | "schedule.get"
  | "schedule.set"
  | "slots.list"
  | "appointments.list"
  | "appointments.get"
  | "appointments.book"
  | "appointments.reschedule"
  | "appointments.confirm"
  | "appointments.cancel"
  | "appointments.noShow"
  | "visits.list"
  | "visits.get"
  | "visits.forPatient"
  | "visits.checkInOpd"
  | "visits.admit"
  | "visits.correctCheckIn"
  | "visits.vitals"
  | "visits.recordVitals"
  | "visits.saveClinicalRecord"
  | "visits.close"
  | "visits.notes"
  | "visits.addNote"
  | "visits.transfer"
  | "visits.discharge"
  | "visits.cancel"
  | "visits.reopen"
  | "visits.archive"
  | "visits.restore"
  | "beds.occupancy"
  | "beds.maintenance"
  | "invoices.list"
  | "invoices.get"
  | "invoices.forEncounter"
  | "account.patient"
  | "account.panel"
  | "invoices.create"
  | "invoices.addCharges"
  | "invoices.discount"
  | "invoices.void"
  | "charges.void"
  | "charges.list"
  | "paymentsRegister.list"
  | "paymentsRegister.get"
  | "paymentsRegister.record"
  | "advances.record"
  | "credit.apply"
  | "refunds.record"
  | "creditNotes.record"
  | "labApi.list"
  | "labApi.get"
  | "labApi.create"
  | "labApi.addTests"
  | "labApi.cancelTest"
  | "labApi.collect"
  | "labApi.reject"
  | "labApi.enterResult"
  | "labApi.verify"
  | "labApi.amend"
  | "labApi.remarks"
  | "labApi.deliver"
  | "labApi.report"
  | "labApi.archive"
  | "labApi.restore"
  | "labApi.testDefinition"
  | "imagingApi.list"
  | "imagingApi.get"
  | "imagingApi.create"
  | "imagingApi.addTests"
  | "imagingApi.cancelTest"
  | "imagingApi.perform"
  | "imagingApi.writeReport"
  | "imagingApi.sign"
  | "imagingApi.amend"
  | "imagingApi.deliver"
  | "imagingApi.report"
  | "imagingApi.archive"
  | "imagingApi.restore"
  | "pharmacyApi.list"
  | "pharmacyApi.get"
  | "pharmacyApi.create"
  | "pharmacyApi.update"
  | "pharmacyApi.deactivate"
  | "pharmacyApi.reactivate"
  | "pharmacyApi.receive"
  | "pharmacyApi.writeOff"
  | "pharmacyApi.adjust"
  | "pharmacyApi.movements"
  | "pharmacyApi.prescription"
  | "pharmacyApi.dispense"
  | "pharmacyApi.dispenses"
  | "pharmacyApi.dispenseGet"
  | "pharmacyApi.slip"
  | "pharmacyApi.return"
  | "reportsApi.revenue"
  | "reportsApi.collections"
  | "reportsApi.outstanding"
  | "reportsApi.outstandingPatients"
  // Routes only (Phase 11): the handoff (8.10, 8.11) names these but docs/openapi.json gives no response shape for them, so NO parser and NO screen uses them yet and nothing is sent.
  | "accountsApi.expenses"
  | "accountsApi.expenseCreate"
  | "accountsApi.expenseGet"
  | "accountsApi.expenseUpdate"
  | "accountsApi.expenseVoid"
  | "accountsApi.bankBalances"
  | "accountsApi.bankStatement"
  | "accountsApi.bankTxCreate"
  | "accountsApi.bankTxGet"
  | "accountsApi.bankTxVoid"
  | "accountsApi.drawerGet"
  | "accountsApi.drawerSet"
  | "reportsApi.dailySummary"
  | "reportsApi.opd"
  | "reportsApi.demographics"
  | "reportsApi.lab"
  | "reportsApi.pharmacy"
  | "reportsApi.financialSummary"
  | "reportsApi.revenueDaily"
  | "reportsApi.cashFlow"
  | "reportsApi.expenses"
  | "reportsApi.prescriptions"
  | "reportsApi.dashboard"
  | "organisations.list"
  | "organisations.create"
  | "organisations.get"
  | "organisations.update"
  | "organisations.deactivate"
  | "organisations.reactivate"
  | "guardianRelations.list"
  | "guardianRelations.create"
  | "guardianRelations.get"
  | "guardianRelations.update"
  | "guardianRelations.deactivate"
  | "guardianRelations.reactivate"
  | "settings.update"
  | "settings.moduleEnable"
  | "settings.moduleDisable"
  | "encounters.list"
  | "encounters.get"
  | "encounters.create"
  | "encounters.discharge"
  | "wards.list"
  | "wardsAdmin.list"
  | "wardsAdmin.get"
  | "wardsAdmin.create"
  | "wardsAdmin.update"
  | "wardsAdmin.deactivate"
  | "wardsAdmin.reactivate"
  | "wardsAdmin.bedAdd"
  | "wardsAdmin.bedUpdate"
  | "wardsAdmin.bedDeactivate"
  | "wardsAdmin.bedReactivate"
  | "labTests.list"
  | "labTests.create"
  | "labTests.update"
  | "labTests.deactivate"
  | "labTests.reactivate"
  | "ecgTests.list"
  | "ecgTests.create"
  | "ecgTests.update"
  | "ecgTests.deactivate"
  | "ecgTests.reactivate"
  | "labOrders.list"
  | "labOrders.get"
  | "labOrders.create"
  | "labOrders.transition"
  | "labOrders.enterResults"
  | "imagingOrders.list"
  | "imagingOrders.get"
  | "imagingOrders.create"
  | "imagingOrders.transition"
  | "imagingOrders.enterReport"
  | "medicines.list"
  | "medicines.create"
  | "medicines.update"
  | "medicines.adjustStock"
  | "dispensing.list"
  | "dispensing.create"
  | "consultationInvoices.list"
  | "consultationInvoices.create"
  | "servicesInvoices.list"
  | "servicesInvoices.create"
  | "payments.list"
  | "payments.create"
  | "receipts.list"
  | "receipts.create"
  | "expenseCategories.list"
  | "expenseCategories.create"
  | "expenseCategories.update"
  | "expenseCategories.remove"
  | "expenseCategories.reactivate"
  | "expenses.list"
  | "expenses.create"
  | "expenses.totals"
  | "bankAccounts.list"
  | "bankAccounts.create"
  | "bankAccounts.update"
  | "bankAccounts.deactivate"
  | "bankAccounts.reactivate"
  | "bankTransactions.statement"
  | "bankTransactions.create"
  | "reports.dailySummary"
  | "reports.dailyTransactions"
  | "reports.opdStatistics"
  | "reports.revenue"
  | "reports.laboratory"
  | "reports.pharmacy"
  | "reports.expenseTrend"
  | "reports.demographics"
  | "reports.patientBalances"
  | "reports.organisationBalances"
  | "reports.patientAccountSummary"
  | "reports.accountsPayments"
  | "reports.accountsReceipts"
  | "reports.prescriptionHistory"
  | "serviceCatalog.list"
  | "serviceCatalog.create"
  | "serviceCatalog.update"
  | "serviceCatalog.deactivate"
  | "serviceCatalog.reactivate"
  | "itemHistory.list"
  | "billSummary.patient"
  | "billSummary.encounter"
  | "dashboard.summary"
  | "dashboard.weeklyVisits"
  | "dashboard.revenueTrend"
  | "dashboard.upNext"
  | "dashboard.cashFlow"
  | "statistics.summary"
  | "statistics.records"
  | "statistics.dailyCheckupRevenue"

// Operations with no entry here are NOT part of the integration contract because the
// provided documentation does not cover them: user/doctor detail fetches, a roles
// listing, password reset, refresh/logout/session calls. Add a key only when the
// OpenAPI spec defines the operation AND a screen needs it.
/**
 * Routes the HANDOFF (8.10, 8.11) names but docs/openapi.json and docs/openapi.draft.json do not describe: registered as ROUTES ONLY (no parser, no screen, nothing is sent). The two guards
 * that require every configured route to be in the spec skip exactly these keys; a test fails when the spec starts describing one, so this list only ever shrinks.
 */
export const HANDOFF_ONLY_ROUTE_KEYS: readonly EndpointKey[] = [] // all 23 are in docs/openapi.json since backend PR #22 (2026-11-10)

export const ENDPOINTS: Record<EndpointKey, Endpoint | null> = {
  // The only documented endpoint (HMS API Reference overview): "GET /api/v1/auth/me returns
  // the signed-in user's permissions". The response SCHEMA is not in the overview, so
  // parseCurrentUser is still pending and nothing calls this during login.
  "auth.me": { method: "GET", path: "/auth/me" },
  "users.list": null,
  // ICD-10 diagnosis lookup (S11): read-only and shared by every hospital (decision D7).
  "icd.list": { method: "GET", path: "/icd-codes" },
  // Staff users (S9): the admin view, see UserAdminService. The demo "users.*" keys above stay null (their screen is mock-only now).
  "usersAdmin.list": { method: "GET", path: "/users" },
  "usersAdmin.create": { method: "POST", path: "/users" },
  "usersAdmin.update": { method: "PATCH", path: "/users/:id" },
  // Handoff 8.1 / 9: a doctor's profile and fee are edited here (hours are the schedule, chunk AP1), not through PATCH /users/{id}.
  "usersAdmin.doctorProfile": { method: "PATCH", path: "/users/:id/doctor-profile" },
  "usersAdmin.deactivate": { method: "POST", path: "/users/:id/deactivate" },
  "usersAdmin.reactivate": { method: "POST", path: "/users/:id/reactivate" },
  "usersAdmin.resetPassword": { method: "POST", path: "/users/:id/reset-password" },
  "usersAdmin.signOutEverywhere": { method: "POST", path: "/users/:id/sign-out-everywhere" },
  "users.create": null,
  "users.update": null,
  // May be the same route as users.update with a different body, or a dedicated route.
  "users.setActive": null,
  // Doctor picker (S10): GET /doctors returns the ACTIVE doctors (id = the user's id). Creating or editing a doctor is a staff-user action (usersAdmin.*),
  // so doctors.create / doctors.update stay null: there is no separate doctor record.
  "doctors.list": { method: "GET", path: "/doctors" },
  "doctors.create": null,
  "doctors.update": null,
  // Phase 5A — CONNECTED to docs/openapi.json (routes confirmed by the supplied list AND the spec); not yet verified live.
  // "patients.delete" is POST /patients/{id}/archive: the spec says archive is "What the screens call Inactive or Delete".
  "patients.list": { method: "GET", path: "/patients" },
  "patients.get": { method: "GET", path: "/patients/:id" },
  "patients.create": { method: "POST", path: "/patients" },
  "patients.update": { method: "PATCH", path: "/patients/:id" },
  "patients.delete": { method: "POST", path: "/patients/:id/archive" },
  "patients.restore": { method: "POST", path: "/patients/:id/restore" },
  // Phase 5 (handoff 8.3): the inline duplicate warning and a death outside an admission (patients.record_death)
  "patients.duplicates": { method: "GET", path: "/patients/duplicates" },
  "patients.recordDeath": { method: "POST", path: "/patients/:id/record-death" },
  "patients.revokeDeath": { method: "POST", path: "/patients/:id/revoke-death" },
  // Phase 6 (handoff 8.4; docs/openapi.json): doctor schedules, the slot grid and appointments. Appointments cannot be switched off (no module).
  "schedule.get": { method: "GET", path: "/doctors/:id/schedule" },
  "schedule.set": { method: "PUT", path: "/doctors/:id/schedule" },
  "slots.list": { method: "GET", path: "/doctors/:id/slots" },
  "appointments.list": { method: "GET", path: "/appointments" },
  "appointments.get": { method: "GET", path: "/appointments/:id" },
  "appointments.book": { method: "POST", path: "/appointments" },
  "appointments.reschedule": { method: "PATCH", path: "/appointments/:id" },
  "appointments.confirm": { method: "POST", path: "/appointments/:id/confirm" },
  "appointments.cancel": { method: "POST", path: "/appointments/:id/cancel" },
  "appointments.noShow": { method: "POST", path: "/appointments/:id/no-show" },
  // Phase 7 (handoff 8.5; docs/openapi.json): API-shaped encounters ("visits"), their parts and the bed board. The older `encounters.*` keys belong to the
  // prototype's single wizard record and stay unset: the demo keeps using them, and the API-mode screens use these.
  "visits.list": { method: "GET", path: "/encounters" },
  "visits.get": { method: "GET", path: "/encounters/:id" },
  "visits.forPatient": { method: "GET", path: "/patients/:id/encounters" },
  "visits.checkInOpd": { method: "POST", path: "/encounters/opd" },
  "visits.admit": { method: "POST", path: "/encounters/ipd" },
  "visits.correctCheckIn": { method: "PATCH", path: "/encounters/:id/check-in" },
  "visits.vitals": { method: "GET", path: "/encounters/:id/vitals" },
  "visits.recordVitals": { method: "POST", path: "/encounters/:id/vitals" },
  "visits.saveClinicalRecord": { method: "PUT", path: "/encounters/:id/clinical-record" },
  "visits.close": { method: "POST", path: "/encounters/:id/close" },
  "visits.notes": { method: "GET", path: "/encounters/:id/progress-notes" },
  "visits.addNote": { method: "POST", path: "/encounters/:id/progress-notes" },
  "visits.transfer": { method: "POST", path: "/encounters/:id/transfer" },
  "visits.discharge": { method: "POST", path: "/encounters/:id/discharge" },
  "visits.cancel": { method: "POST", path: "/encounters/:id/cancel" },
  "visits.reopen": { method: "POST", path: "/encounters/:id/reopen" },
  "visits.archive": { method: "POST", path: "/encounters/:id/archive" },
  "visits.restore": { method: "POST", path: "/encounters/:id/restore" },
  "beds.occupancy": { method: "GET", path: "/wards/occupancy" },
  "beds.maintenance": { method: "POST", path: "/beds/:id/maintenance" },
  // Billing, read side (Phase 8, handoff 8.6). All need billing.read. The write routes (charges, payments, discounts, voids, refunds) are connected chunk by chunk.
  "invoices.list": { method: "GET", path: "/invoices" },
  "invoices.get": { method: "GET", path: "/invoices/:id" },
  "invoices.forEncounter": { method: "GET", path: "/encounters/:id/invoice" },
  "account.patient": { method: "GET", path: "/patients/:id/account" },
  "account.panel": { method: "GET", path: "/panels/:id/account" },
  // Billing, write side and registers (Phase 8, B3 to B8, handoff 8.6). Charging needs billing.charge (an own rate or discount: billing.write), payments, advances and
  // applying credit billing.collect_payment, discounts, voids, refunds and credit notes billing.write, the registers billing.read.
  "invoices.create": { method: "POST", path: "/invoices" },
  "invoices.addCharges": { method: "POST", path: "/invoices/:id/charges" },
  "invoices.discount": { method: "POST", path: "/invoices/:id/discount" },
  "invoices.void": { method: "POST", path: "/invoices/:id/void" },
  "charges.void": { method: "POST", path: "/charges/:id/void" },
  "charges.list": { method: "GET", path: "/charges" },
  "paymentsRegister.list": { method: "GET", path: "/payments" },
  "paymentsRegister.get": { method: "GET", path: "/payments/:id" },
  "paymentsRegister.record": { method: "POST", path: "/payments" },
  "advances.record": { method: "POST", path: "/advances" },
  "credit.apply": { method: "POST", path: "/patients/:id/apply-credit" },
  "refunds.record": { method: "POST", path: "/refunds" },
  "creditNotes.record": { method: "POST", path: "/credit-notes" },
  // Laboratory and imaging orders (Phase 9, handoff 8.7 and 8.8). Placing and cancelling tests needs diagnostics.order, collecting diagnostics.collect, entering results
  // diagnostics.enter_results (and delivering a lab order), performing diagnostics.perform (and delivering an imaging order), verifying, signing and amending diagnostics.verify,
  // archiving diagnostics.archive, everything else diagnostics.read. The test definition is the catalogue (catalogs.read). The old labOrders.* / imagingOrders.* keys are the demo's.
  "labApi.list": { method: "GET", path: "/lab-orders" },
  "labApi.get": { method: "GET", path: "/lab-orders/:id" },
  "labApi.create": { method: "POST", path: "/lab-orders" },
  "labApi.addTests": { method: "POST", path: "/lab-orders/:id/tests" },
  "labApi.cancelTest": { method: "POST", path: "/lab-orders/:id/tests/:testId/cancel" },
  "labApi.collect": { method: "POST", path: "/lab-orders/:id/specimens/:specimenId/collect" },
  "labApi.reject": { method: "POST", path: "/lab-orders/:id/specimens/:specimenId/reject" },
  "labApi.enterResult": { method: "PUT", path: "/lab-orders/:id/tests/:testId/result" },
  "labApi.verify": { method: "POST", path: "/lab-orders/:id/tests/:testId/verify" },
  "labApi.amend": { method: "POST", path: "/lab-orders/:id/tests/:testId/amend" },
  "labApi.remarks": { method: "PUT", path: "/lab-orders/:id/remarks" },
  "labApi.deliver": { method: "POST", path: "/lab-orders/:id/deliver" },
  "labApi.report": { method: "GET", path: "/lab-orders/:id/report" },
  "labApi.archive": { method: "POST", path: "/lab-orders/:id/archive" },
  "labApi.restore": { method: "POST", path: "/lab-orders/:id/restore" },
  "labApi.testDefinition": { method: "GET", path: "/lab-tests/:id" },
  "imagingApi.list": { method: "GET", path: "/imaging-orders" },
  "imagingApi.get": { method: "GET", path: "/imaging-orders/:id" },
  "imagingApi.create": { method: "POST", path: "/imaging-orders" },
  "imagingApi.addTests": { method: "POST", path: "/imaging-orders/:id/tests" },
  "imagingApi.cancelTest": { method: "POST", path: "/imaging-orders/:id/tests/:testId/cancel" },
  "imagingApi.perform": { method: "POST", path: "/imaging-orders/:id/tests/:testId/perform" },
  "imagingApi.writeReport": { method: "PUT", path: "/imaging-orders/:id/tests/:testId/report" },
  "imagingApi.sign": { method: "POST", path: "/imaging-orders/:id/tests/:testId/sign" },
  "imagingApi.amend": { method: "POST", path: "/imaging-orders/:id/tests/:testId/amend" },
  "imagingApi.deliver": { method: "POST", path: "/imaging-orders/:id/deliver" },
  "imagingApi.report": { method: "GET", path: "/imaging-orders/:id/report" },
  "imagingApi.archive": { method: "POST", path: "/imaging-orders/:id/archive" },
  "imagingApi.restore": { method: "POST", path: "/imaging-orders/:id/restore" },
  // Pharmacy (Phase 10, handoff 8.9). Reading needs pharmacy.read, medicines and stock pharmacy.stock, dispensing and returns pharmacy.dispense. The old medicines.* / dispensing.* keys are the demo's.
  "pharmacyApi.list": { method: "GET", path: "/medicines" },
  "pharmacyApi.get": { method: "GET", path: "/medicines/:id" },
  "pharmacyApi.create": { method: "POST", path: "/medicines" },
  "pharmacyApi.update": { method: "PATCH", path: "/medicines/:id" },
  "pharmacyApi.deactivate": { method: "POST", path: "/medicines/:id/deactivate" },
  "pharmacyApi.reactivate": { method: "POST", path: "/medicines/:id/reactivate" },
  "pharmacyApi.receive": { method: "POST", path: "/medicines/:id/batches" },
  "pharmacyApi.writeOff": { method: "POST", path: "/medicine-batches/:id/write-off" },
  "pharmacyApi.adjust": { method: "POST", path: "/medicine-batches/:id/adjust" },
  "pharmacyApi.movements": { method: "GET", path: "/stock-movements" },
  "pharmacyApi.prescription": { method: "GET", path: "/encounters/:id/prescription" },
  "pharmacyApi.dispense": { method: "POST", path: "/dispenses" },
  "pharmacyApi.dispenses": { method: "GET", path: "/dispenses" },
  "pharmacyApi.dispenseGet": { method: "GET", path: "/dispenses/:id" },
  "pharmacyApi.slip": { method: "GET", path: "/dispenses/:id/slip" },
  "pharmacyApi.return": { method: "POST", path: "/dispenses/:id/lines/:lineId/return" },
  "reportsApi.revenue": { method: "GET", path: "/reports/revenue" },
  "reportsApi.collections": { method: "GET", path: "/reports/collections" },
  "reportsApi.outstanding": { method: "GET", path: "/reports/outstanding" },
  "reportsApi.outstandingPatients": { method: "GET", path: "/reports/outstanding/patients" },
  // Routes only (Phase 11): see the key list above. The demo-shaped keys (expenses.*, bankTransactions.*, reports.*, dashboard.*, statistics.*) stay null: their payload builders guess fields.
  "accountsApi.expenses": { method: "GET", path: "/expenses" },
  "accountsApi.expenseCreate": { method: "POST", path: "/expenses" },
  "accountsApi.expenseGet": { method: "GET", path: "/expenses/:id" },
  "accountsApi.expenseUpdate": { method: "PATCH", path: "/expenses/:id" },
  "accountsApi.expenseVoid": { method: "POST", path: "/expenses/:id/void" },
  "accountsApi.bankBalances": { method: "GET", path: "/bank-balances" },
  "accountsApi.bankStatement": { method: "GET", path: "/bank-accounts/:id/statement" },
  "accountsApi.bankTxCreate": { method: "POST", path: "/bank-transactions" },
  "accountsApi.bankTxGet": { method: "GET", path: "/bank-transactions/:id" },
  "accountsApi.bankTxVoid": { method: "POST", path: "/bank-transactions/:id/void" },
  "accountsApi.drawerGet": { method: "GET", path: "/cash-drawer/opening" },
  "accountsApi.drawerSet": { method: "PUT", path: "/cash-drawer/opening" },
  "reportsApi.dailySummary": { method: "GET", path: "/reports/daily-summary" },
  "reportsApi.opd": { method: "GET", path: "/reports/opd" },
  "reportsApi.demographics": { method: "GET", path: "/reports/demographics" },
  "reportsApi.lab": { method: "GET", path: "/reports/lab" },
  "reportsApi.pharmacy": { method: "GET", path: "/reports/pharmacy" },
  "reportsApi.financialSummary": { method: "GET", path: "/reports/financial-summary" },
  "reportsApi.revenueDaily": { method: "GET", path: "/reports/revenue/daily" },
  "reportsApi.cashFlow": { method: "GET", path: "/reports/cash-flow" },
  "reportsApi.expenses": { method: "GET", path: "/reports/expenses" },
  "reportsApi.prescriptions": { method: "GET", path: "/prescriptions" },
  "reportsApi.dashboard": { method: "GET", path: "/dashboard" },
  // Organisations are the API's "panels"; guardian relations keep their name.
  "organisations.list": { method: "GET", path: "/panels" },
  "organisations.create": { method: "POST", path: "/panels" },
  "organisations.get": { method: "GET", path: "/panels/:id" },
  "organisations.update": { method: "PATCH", path: "/panels/:id" },
  "organisations.deactivate": { method: "POST", path: "/panels/:id/deactivate" },
  "organisations.reactivate": { method: "POST", path: "/panels/:id/reactivate" },
  "guardianRelations.list": { method: "GET", path: "/guardian-relations" },
  "guardianRelations.create": { method: "POST", path: "/guardian-relations" },
  "guardianRelations.get": { method: "GET", path: "/guardian-relations/:id" },
  "guardianRelations.update": { method: "PATCH", path: "/guardian-relations/:id" },
  "guardianRelations.deactivate": { method: "POST", path: "/guardian-relations/:id/deactivate" },
  "guardianRelations.reactivate": { method: "POST", path: "/guardian-relations/:id/reactivate" },
  // Clinic Settings (GET /settings and /settings/modules are read by src/lib/session/useHospital.ts); module switches are one POST per direction.
  "settings.update": { method: "PATCH", path: "/settings" },
  "settings.moduleEnable": { method: "POST", path: "/settings/modules/:module/enable" },
  "settings.moduleDisable": { method: "POST", path: "/settings/modules/:module/disable" },
  // Encounters + wards/beds: the documentation says only that they are "already covered" on the backend.
  // CONTRACT REQUIRED for every operation (paths, methods, schemas, statuses, discharge, bed allocation).
  "encounters.list": null,
  "encounters.get": null,
  "encounters.create": null,
  "encounters.discharge": null,
  "wards.list": null,
  // Wards and beds setup (S8): the Master Data admin view (see WardAdminService). "wards.list" above stays null until the IPD admission chunks (E7/E8)
  // connect the pickers, which need beds per ward.
  "wardsAdmin.list": { method: "GET", path: "/wards" },
  "wardsAdmin.get": { method: "GET", path: "/wards/:id" },
  "wardsAdmin.create": { method: "POST", path: "/wards" },
  "wardsAdmin.update": { method: "PATCH", path: "/wards/:id" },
  "wardsAdmin.deactivate": { method: "POST", path: "/wards/:id/deactivate" },
  "wardsAdmin.reactivate": { method: "POST", path: "/wards/:id/reactivate" },
  "wardsAdmin.bedAdd": { method: "POST", path: "/wards/:id/beds" },
  "wardsAdmin.bedUpdate": { method: "PATCH", path: "/beds/:id" },
  "wardsAdmin.bedDeactivate": { method: "POST", path: "/beds/:id/deactivate" },
  "wardsAdmin.bedReactivate": { method: "POST", path: "/beds/:id/reactivate" },
  // Laboratory T1 (catalog) + T2 (orders): the Task List describes the backend but publishes no routes or schemas.
  // CONTRACT REQUIRED for every operation (the catalog may share routes with the generic services catalog).
  // Lab tests catalogue (S6): connected to docs/openapi.json.
  "labTests.list": { method: "GET", path: "/lab-tests" },
  "labTests.create": { method: "POST", path: "/lab-tests" },
  "labTests.update": { method: "PATCH", path: "/lab-tests/:id" },
  "labTests.deactivate": { method: "POST", path: "/lab-tests/:id/deactivate" },
  "labTests.reactivate": { method: "POST", path: "/lab-tests/:id/reactivate" },
  // Imaging tests catalogue (S7): the API's /imaging-tests; the key keeps the demo name "ecgTests" (ECG/ultrasound tab).
  "ecgTests.list": { method: "GET", path: "/imaging-tests" },
  "ecgTests.create": { method: "POST", path: "/imaging-tests" },
  "ecgTests.update": { method: "PATCH", path: "/imaging-tests/:id" },
  "ecgTests.deactivate": { method: "POST", path: "/imaging-tests/:id/deactivate" },
  "ecgTests.reactivate": { method: "POST", path: "/imaging-tests/:id/reactivate" },
  "labOrders.list": null,
  "labOrders.get": null,
  "labOrders.create": null,
  "labOrders.transition": null,
  "labOrders.enterResults": null,
  // Imaging T3: "the same DiagnosticOrder with type = imaging" — the Task List publishes no routes or schemas, and
  // whether imaging shares T2's routes (with a type filter) or has its own is CONTRACT REQUIRED.
  "imagingOrders.list": null,
  "imagingOrders.get": null,
  "imagingOrders.create": null,
  "imagingOrders.transition": null,
  "imagingOrders.enterReport": null,
  // Pharmacy T4 (inventory) + T5 (dispensing): the Task List describes the backend but publishes no routes or schemas.
  // CONTRACT REQUIRED for every operation (stock receive / adjustment / write-off may be separate routes).
  "medicines.list": null,
  "medicines.create": null,
  "medicines.update": null,
  "medicines.adjustStock": null,
  "dispensing.list": null,
  "dispensing.create": null,
  // Billing + T6 Expenses + T7 Bank (Phase 4H). The Task List calls consultation / services billing, payments and receipts
  // "already covered" and T6 / T7 "In review" (PR #17, not merged); NO route or schema for any of it is published in the
  // Task List or in the API Reference overview. CONTRACT REQUIRED for every operation — none may be inferred from REST
  // conventions, a 401/404, or the mock data.
  "consultationInvoices.list": null,
  "consultationInvoices.create": null,
  "servicesInvoices.list": null,
  "servicesInvoices.create": null,
  "payments.list": null,
  "payments.create": null,
  "receipts.list": null,
  "receipts.create": null,
  // Expense categories (S12): routes and permissions from the handoff (8.2, 9); fields from the PROPOSED contract (docs/openapi.draft.json).
  // "remove" is deactivate: the handoff never deletes.
  "expenseCategories.list": { method: "GET", path: "/expense-categories" },
  "expenseCategories.create": { method: "POST", path: "/expense-categories" },
  "expenseCategories.update": { method: "PATCH", path: "/expense-categories/:id" },
  "expenseCategories.remove": { method: "POST", path: "/expense-categories/:id/deactivate" },
  "expenseCategories.reactivate": { method: "POST", path: "/expense-categories/:id/reactivate" },
  "expenses.list": null,
  "expenses.create": null,
  "expenses.totals": null,
  // Bank accounts (S13): same source as above. GET needs accounts.read, changes need catalogs.write.
  "bankAccounts.list": { method: "GET", path: "/bank-accounts" },
  "bankAccounts.create": { method: "POST", path: "/bank-accounts" },
  "bankAccounts.update": { method: "PATCH", path: "/bank-accounts/:id" },
  "bankAccounts.deactivate": { method: "POST", path: "/bank-accounts/:id/deactivate" },
  "bankAccounts.reactivate": { method: "POST", path: "/bank-accounts/:id/reactivate" },
  "bankTransactions.statement": null,
  "bankTransactions.create": null,
  // Reports (Phase 4I). The Task List describes T8 / T9 (and calls Revenue, Daily Transactions and Patient Balances "already
  // covered") but publishes NO route, parameter or response schema for any report. CONTRACT REQUIRED for every operation — none
  // may be inferred from REST conventions, a 401/404, or the screens. "serviceCatalog.list" feeds the Lists report only.
  "reports.dailySummary": null,
  "reports.dailyTransactions": null,
  "reports.opdStatistics": null,
  "reports.revenue": null,
  "reports.laboratory": null,
  "reports.pharmacy": null,
  "reports.expenseTrend": null,
  "reports.demographics": null,
  "reports.patientBalances": null,
  "reports.organisationBalances": null,
  "reports.patientAccountSummary": null,
  "reports.accountsPayments": null,
  "reports.accountsReceipts": null,
  "reports.prescriptionHistory": null,
  // Services catalogue (S5): connected to docs/openapi.json (GET/POST /services, PATCH /services/{id}, POST .../deactivate | reactivate).
  "serviceCatalog.list": { method: "GET", path: "/services" },
  "serviceCatalog.create": { method: "POST", path: "/services" },
  "serviceCatalog.update": { method: "PATCH", path: "/services/:id" },
  "serviceCatalog.deactivate": { method: "POST", path: "/services/:id/deactivate" },
  "serviceCatalog.reactivate": { method: "POST", path: "/services/:id/reactivate" },
  // T12 Item History: "a read endpoint filtered by entity type and ID, restricted to admins" — nothing more is published (no path, no entity-type
  // values, no entry fields, no paging). CONTRACT REQUIRED.
  // Item History (D8): handoff 8.12 and 9 (audit.read); the entry fields are the PROPOSED contract in docs/openapi.draft.json.
  "itemHistory.list": { method: "GET", path: "/audit-entries" },
  // The patient / encounter balance panels. NO document describes a per-patient or per-encounter bill summary (only the "Patient Balances"
  // report is mentioned, as "already covered", with no route). These two keys exist so the panels have an explicit pending state; whether
  // the real source is a dedicated summary, the Patient Balances report filtered by patient, or the invoices themselves is a backend question.
  "billSummary.patient": null,
  "billSummary.encounter": null,
  // Top-bar notifications deliberately have NO key: no document mentions a notification feed, so none may be implied (same treatment as
  // organisations / guardian relations, see http/reference.ts).
  // Dashboard (T10) and Financial Statistics (T11), Phase 4J. The Task List describes them but publishes NO route, parameter or
  // schema. It names exactly one path — "GET /reports/revenue", which T11 "extends" — but gives neither its current response nor the
  // extension, and says nothing about the Dashboard or Cash Flow. A path that T11 is going to CHANGE is not a contract, so it is
  // deliberately NOT configured here (and "reports.revenue" above stays null for the same reason). The Cash Flow ships in PR #17 (in
  // review, not merged). CONTRACT REQUIRED for every operation — none may be inferred from REST conventions or a 401/404.
  "dashboard.summary": null,
  "dashboard.weeklyVisits": null,
  "dashboard.revenueTrend": null,
  "dashboard.upNext": null,
  "dashboard.cashFlow": null,
  "statistics.summary": null,
  "statistics.records": null,
  "statistics.dailyCheckupRevenue": null,
}

/** Resolves an endpoint or throws NotConnectedError when it is unset. */
export function resolveEndpoint(
  key: EndpointKey,
  params: Record<string, string> = {},
  table: Record<EndpointKey, Endpoint | null> = ENDPOINTS
): Endpoint {
  const ep = table[key]
  if (!ep) throw new NotConnectedError(`endpoint "${key}"`)
  const path = ep.path.replace(/:([A-Za-z_]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`Endpoint "${key}" needs a "${name}" parameter.`)
    return encodeURIComponent(value)
  })
  return { method: ep.method, path }
}

export interface CallOptions {
  params?: Record<string, string>
  /** Thunks, so a pending mapper throws only after the endpoint check and before any network call. */
  query?: () => QueryParams
  body?: () => unknown
  signal?: AbortSignal
}
