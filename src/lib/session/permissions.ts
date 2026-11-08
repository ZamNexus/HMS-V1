// What the user may see and do, from `user.permissions` (GET /auth/me) and the module switches (GET /settings/modules). NEVER from the role
// (MD section 5). The UI is not the security boundary: the API checks the same names on every request and a 403 is always handled.
import type { SessionUser } from "./sessionUser"

export type ModuleName = "pharmacy" | "lab" | "imaging" | "ipd"

/**
 * A rule: the user needs ANY of `any` (when given) AND ALL of `all` (when given), and the department `module` must be on (when given).
 * Rules are copied from the handoff's table "Screens and the permission that opens them" (section 5) and the module rule (navigation =
 * permission AND module).
 */
export interface AccessRule {
  any?: readonly string[]
  all?: readonly string[]
  module?: ModuleName
}

/** Module switches as loaded from GET /settings/modules; null = not loaded yet (a module-gated screen stays hidden until known). */
export type ModuleSwitches = Readonly<Record<ModuleName, boolean>> | null

export function hasPermission(permissions: readonly string[] | null | undefined, permission: string): boolean {
  return !!permissions && permissions.includes(permission)
}

export function satisfies(rule: AccessRule, permissions: readonly string[] | null | undefined, modules: ModuleSwitches): boolean {
  if (!permissions) return false
  if (rule.any && !rule.any.some((p) => permissions.includes(p))) return false
  if (rule.all && !rule.all.every((p) => permissions.includes(p))) return false
  if (rule.module && !(modules && modules[rule.module])) return false
  return true
}

/** Sidebar item key -> rule. An item without a rule is never shown. */
export const NAV_RULES: Readonly<Record<string, AccessRule>> = {
  dashboard: { any: ["encounters.read", "encounters.check_in", "ipd.read", "diagnostics.read", "pharmacy.read", "reports.read"] },
  patients: { any: ["patients.read"] },
  encounters: { any: ["encounters.check_in", "encounters.read"] },
  appointments: { any: ["appointments.read"] },
  // billing hub: invoices/receipts need billing.read; its Expenses and Bank tabs need accounts.read
  billing: { any: ["billing.read", "accounts.read"] },
  laboratory: { any: ["diagnostics.read"], module: "lab" },
  imaging: { any: ["diagnostics.read"], module: "imaging" },
  pharmacy: { any: ["pharmacy.read"], module: "pharmacy" },
  users: { any: ["users.read"] },
  doctors: { any: ["users.read"] },
  "master-data": { any: ["catalogs.read"] },
  reports: { any: ["reports.read", "accounts.read"] },
}

/** Route prefix -> rule, for the "Not allowed" page when a user types a URL (MD section 5). The most specific (longest) prefix wins. */
export const ROUTE_RULES: ReadonlyArray<readonly [string, AccessRule]> = [
  ["/dashboard", NAV_RULES.dashboard],
  ["/dashboard/stats", { any: ["reports.read"] }], // Financial Statistics
  ["/appointments", { any: ["appointments.read"] }],
  ["/patients", NAV_RULES.patients],
  ["/encounters", NAV_RULES.encounters],
  ["/billing", NAV_RULES.billing],
  ["/lab", NAV_RULES.laboratory],
  ["/imaging", NAV_RULES.imaging],
  ["/pharmacy", NAV_RULES.pharmacy],
  ["/admin/users", NAV_RULES.users],
  ["/admin/doctors", NAV_RULES.doctors],
  ["/admin/master-data", NAV_RULES["master-data"]],
  ["/reports", NAV_RULES.reports],
]

/**
 * Routes whose rule is stricter than their section's. Checked first. Source: the handoff's table "Screens and the permission that opens them"
 * and the buttons it names (register/edit = patients.write; place a lab or imaging order = diagnostics.order; dispense = pharmacy.dispense;
 * charge services = billing.charge; expenses and bank = accounts.read).
 */
export const ROUTE_PATTERNS: ReadonlyArray<readonly [RegExp, AccessRule]> = [
  [/^\/patients\/new$/, { any: ["patients.write"] }],
  [/^\/patients\/[^/]+\/edit$/, { any: ["patients.write"] }],
  [/^\/encounters\/new$/, { any: ["encounters.check_in", "ipd.admit"] }],
  // The menu entries need the department on (section 5: navigation = permission AND module), but with it off an order is still placed, as an external referral
  // recorded and not worked (8.7), and past records stay readable (5): so the order form and the order pages need only their permission; working a lab order does not.
  [/^\/lab\/orders\/new$/, { any: ["diagnostics.order"] }],
  [/^\/lab\/orders\/[^/]+\/results$/, { any: ["diagnostics.enter_results"], module: "lab" }],
  [/^\/lab\/orders(\/[^/]+)?$/, { any: ["diagnostics.read"] }],
  [/^\/imaging\/orders\/new$/, { any: ["diagnostics.order"] }],
  [/^\/imaging\/orders(\/[^/]+)?$/, { any: ["diagnostics.read"] }],
  [/^\/pharmacy\/dispense$/, { any: ["pharmacy.dispense"], module: "pharmacy" }],
  [/^\/billing\/(consultations|services)\/new$/, { any: ["billing.charge"] }],
  [/^\/billing\/(expenses|bank)$/, { any: ["accounts.read"] }],
  // invoices, receipts and payments are billing.read; ONLY expenses and bank are accounts.*
  [/^\/billing\/(consultations|services|payments|receipts|transactions)$/, { any: ["billing.read"] }],
  [/^\/encounters\/[^/]+\/discharge$/, { any: ["ipd.discharge"], module: "ipd" }],
]

/** Pages that need nothing but being signed in. Every other page must match a rule above, or it is refused (default deny). */
export const OPEN_TO_SIGNED_IN: readonly string[] = ["/profile"]

export function ruleForPath(pathname: string): AccessRule | null {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname) // /%61dmin/users must not slip past a prefix rule
  } catch {
    // a malformed escape: match the raw text, which will not match any rule and so is refused
  }
  const clean = decoded.length > 1 ? decoded.replace(/\/+$/, "") : decoded
  for (const [pattern, rule] of ROUTE_PATTERNS) if (pattern.test(clean)) return rule
  let best: readonly [string, AccessRule] | null = null
  for (const entry of ROUTE_RULES) {
    if ((clean === entry[0] || clean.startsWith(entry[0] + "/")) && (!best || entry[0].length > best[0].length)) best = entry
  }
  return best ? best[1] : null
}

export function canSeeNav(user: Pick<SessionUser, "permissions"> | null, modules: ModuleSwitches, key: string): boolean {
  const rule = NAV_RULES[key]
  return !!user && !!rule && satisfies(rule, user.permissions, modules)
}
