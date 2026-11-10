// Test harness only. Answers the session endpoints the app now calls itself (boot refresh, /auth/me, /settings, /settings/modules) for the browser
// scripts written before Phase 2. No credentials: a made-up user. NOT the real backend.
const NOW = "2026-11-07T10:00:00.000Z"
const U = (n) => "01HZX" + String(n).padStart(21, "0")
// every permission name in the handoff's role matrix (an admin-like user)
const ALL_PERMISSIONS = ["patients.read", "patients.write", "patients.archive", "patients.record_death", "appointments.read", "appointments.write", "encounters.read", "encounters.write", "encounters.check_in", "encounters.record_vitals", "encounters.correct", "encounters.archive", "diagnostics.read", "diagnostics.order", "diagnostics.collect", "diagnostics.enter_results", "diagnostics.perform", "diagnostics.verify", "diagnostics.archive", "pharmacy.read", "pharmacy.stock", "pharmacy.dispense", "ipd.read", "ipd.admit", "ipd.discharge", "ipd.write", "billing.read", "billing.charge", "billing.write", "billing.collect_payment", "reports.read", "accounts.read", "accounts.write", "users.read", "users.write", "doctors.read", "catalogs.read", "catalogs.write", "settings.read", "settings.write", "audit.read"]
const userBody = (over = {}) => ({ id: U(900), username: "tester", email: null, name: "Test User", role: "admin", isPlatform: false, mustChangePassword: false, permissions: ALL_PERMISSIONS, hospital: { id: U(901), code: "H1", name: "Test Hospital", defaultCity: null, defaultCountry: "Pakistan" }, primaryLocationId: null, ...over })
const loginBody = (over = {}) => ({ accessToken: "stub-token", tokenType: "Bearer", expiresIn: 900, user: userBody(over) })
const settingsBody = () => ({ hospitalCode: "H1", nameEn: "Test Hospital", nameUr: null, address: null, phone: null, email: null, tagline: null, printHeader: null, defaultCity: null, defaultCountry: "Pakistan", timezone: "Asia/Karachi", currencyCode: "PKR", fiscalYearStart: "july", today: "2026-11-07", updatedAt: NOW })
const modulesBody = (on = true) => ({ data: ["pharmacy", "lab", "imaging", "ipd"].map((module) => ({ module, enabled: on, enabledAt: null })) })
const errBody = (status, code, message) => ({ statusCode: status, code, message, requestId: "req-stub", path: "/x", timestamp: NOW })
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

/** Handles the session endpoints. Returns true when it answered. `signedIn` is whether the (fake) refresh cookie exists. */
async function tryHandle(route, method, p, state = {}) {
  if (method === "POST" && p === "/auth/refresh") {
    if (state.signedIn) return json(route, 200, { accessToken: "stub-token-2", tokenType: "Bearer", expiresIn: 900, mustChangePassword: false }), true
    return json(route, 401, errBody(401, "SESSION_MISSING", "No session.")), true
  }
  if (method === "GET" && p === "/auth/me") return json(route, 200, userBody(state.userOver || {})), true
  if (method === "GET" && p === "/settings") return json(route, 200, settingsBody()), true
  if (method === "GET" && p === "/settings/modules") return json(route, 200, modulesBody(state.modulesOn !== false)), true
  if (method === "POST" && p === "/auth/logout") return route.fulfill({ status: 204 }), true
  return false
}
/**
 * The home page's own two requests (GET /dashboard and GET /reports/cash-flow?date=), answered with a small fixed body, for the suites whose test backend belongs to ANOTHER module and
 * which only pass through the home page after signing in. It checks nothing about the dashboard: phase13-dashboard-reports does that against a backend that enforces the handoff's rules.
 */
function tryHandleHome(route, method, p) {
  if (method !== "GET") return false
  if (p === "/dashboard") return json(route, 200, { visits: { today: 1, yesterday: 0, mine: { today: 0, open: 0 } }, admitted: null, lab: null, imaging: null, pharmacy: null, revenue: null, patientFlow: null }), true
  if (p === "/reports/cash-flow") return json(route, 200, { date: "2026-11-07", opening: "0.00", closing: "0.00" }), true
  return false
}
module.exports = { tryHandleHome, ALL_PERMISSIONS, userBody, loginBody, settingsBody, modulesBody, errBody, tryHandle, U, NOW }
