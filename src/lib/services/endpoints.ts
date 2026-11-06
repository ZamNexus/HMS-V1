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
  | "encounters.list"
  | "encounters.get"
  | "encounters.create"
  | "encounters.discharge"
  | "wards.list"
  | "labTests.list"
  | "labTests.create"
  | "labTests.update"
  | "ecgTests.list"
  | "ecgTests.create"
  | "ecgTests.update"
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
  | "expenses.list"
  | "expenses.create"
  | "expenses.totals"
  | "bankAccounts.list"
  | "bankAccounts.create"
  | "bankAccounts.update"
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
export const ENDPOINTS: Record<EndpointKey, Endpoint | null> = {
  // The only documented endpoint (HMS API Reference overview): "GET /api/v1/auth/me returns
  // the signed-in user's permissions". The response SCHEMA is not in the overview, so
  // parseCurrentUser is still pending and nothing calls this during login.
  "auth.me": { method: "GET", path: "/auth/me" },
  "users.list": null,
  "users.create": null,
  "users.update": null,
  // May be the same route as users.update with a different body, or a dedicated route.
  "users.setActive": null,
  "doctors.list": null,
  "doctors.create": null,
  "doctors.update": null,
  // Patients: operations the existing screens perform. CONTRACT REQUIRED for all of them
  // (the provided API Reference lists a "Patients" tag but no endpoints).
  "patients.list": null,
  "patients.get": null,
  "patients.create": null,
  "patients.update": null,
  "patients.delete": null,
  // Encounters + wards/beds: the documentation says only that they are "already covered" on the backend.
  // CONTRACT REQUIRED for every operation (paths, methods, schemas, statuses, discharge, bed allocation).
  "encounters.list": null,
  "encounters.get": null,
  "encounters.create": null,
  "encounters.discharge": null,
  "wards.list": null,
  // Laboratory T1 (catalog) + T2 (orders): the Task List describes the backend but publishes no routes or schemas.
  // CONTRACT REQUIRED for every operation (the catalog may share routes with the generic services catalog).
  "labTests.list": null,
  "labTests.create": null,
  "labTests.update": null,
  "ecgTests.list": null,
  "ecgTests.create": null,
  "ecgTests.update": null,
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
  "expenseCategories.list": null,
  "expenseCategories.create": null,
  "expenseCategories.update": null,
  "expenseCategories.remove": null,
  "expenses.list": null,
  "expenses.create": null,
  "expenses.totals": null,
  "bankAccounts.list": null,
  "bankAccounts.create": null,
  "bankAccounts.update": null,
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
  "serviceCatalog.list": null,
  // Phase 4K. Master Data → Services Catalog: the Task List says only that lab / ECG-USG tests are CRUD + deactivate "on the existing services
  // catalog" (T1); whether the generic catalogue can be created or edited through the API is CONTRACT REQUIRED.
  "serviceCatalog.create": null,
  "serviceCatalog.update": null,
  // T12 Item History: "a read endpoint filtered by entity type and ID, restricted to admins" — nothing more is published (no path, no entity-type
  // values, no entry fields, no paging). CONTRACT REQUIRED.
  "itemHistory.list": null,
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
