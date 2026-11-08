import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { NAV_RULES, ROUTE_PATTERNS, ROUTE_RULES, canSeeNav, hasPermission, ruleForPath, satisfies, type ModuleSwitches } from "./permissions"

// The handoff's role matrix (section 5, "as of Development today") is used ONLY to plan these tests: the app reads permissions from /auth/me.
const ROLES = ["admin", "doctor", "receptionist", "billing", "lab_tech", "pharmacist", "nurse", "radiographer"] as const
type R = (typeof ROLES)[number]
const MATRIX: Record<string, R[]> = {
  "patients.read": [...ROLES], "patients.write": ["admin", "receptionist"], "patients.archive": ["admin"], "patients.record_death": ["admin"],
  "appointments.read": ["admin", "doctor", "receptionist", "nurse"], "appointments.write": ["admin", "receptionist"],
  "encounters.read": ["admin", "doctor", "billing", "lab_tech", "pharmacist", "nurse", "radiographer"], "encounters.write": ["admin", "doctor"],
  "encounters.check_in": ["admin", "receptionist"], "encounters.record_vitals": ["admin", "nurse"], "encounters.correct": ["admin"], "encounters.archive": ["admin"],
  "diagnostics.read": ["admin", "doctor", "receptionist", "billing", "lab_tech", "nurse", "radiographer"], "diagnostics.order": ["admin", "doctor", "receptionist"],
  "diagnostics.collect": ["admin", "lab_tech", "nurse"], "diagnostics.enter_results": ["admin", "lab_tech"], "diagnostics.perform": ["admin", "nurse", "radiographer"],
  "diagnostics.verify": ["admin", "doctor"], "diagnostics.archive": ["admin"],
  "pharmacy.read": ["admin", "doctor", "pharmacist", "nurse"], "pharmacy.stock": ["admin", "pharmacist"], "pharmacy.dispense": ["admin", "pharmacist"],
  "ipd.read": ["admin", "doctor", "receptionist", "billing", "nurse"], "ipd.admit": ["admin", "doctor", "receptionist"], "ipd.discharge": ["admin", "doctor"], "ipd.write": ["admin", "nurse"],
  "billing.read": ["admin", "receptionist", "billing"], "billing.charge": ["admin", "receptionist", "billing"], "billing.write": ["admin", "billing"],
  "billing.collect_payment": ["admin", "receptionist", "billing", "pharmacist"], "reports.read": ["admin", "billing"], "accounts.read": ["admin", "billing"], "accounts.write": ["admin", "billing"],
  "users.read": ["admin"], "users.write": ["admin"], "doctors.read": [...ROLES], "catalogs.read": [...ROLES], "catalogs.write": ["admin"],
  "settings.read": [...ROLES], "settings.write": ["admin"], "audit.read": ["admin"],
}
const permsOf = (role: R) => Object.entries(MATRIX).filter(([, roles]) => roles.includes(role)).map(([p]) => p)
const ALL_ON: ModuleSwitches = { pharmacy: true, lab: true, imaging: true, ipd: true }

describe("sidebar per role, from permissions (handoff section 5)", () => {
  // expected menu per role, worked out by hand from the screen table, not from the code under test
  const EXPECTED: Record<R, string[]> = {
    admin: ["dashboard", "patients", "encounters", "appointments", "billing", "laboratory", "imaging", "pharmacy", "users", "doctors", "master-data", "reports"],
    doctor: ["dashboard", "patients", "encounters", "appointments", "laboratory", "imaging", "pharmacy", "master-data"],
    receptionist: ["dashboard", "patients", "encounters", "appointments", "billing", "laboratory", "imaging", "master-data"],
    billing: ["dashboard", "patients", "encounters", "billing", "laboratory", "imaging", "master-data", "reports"],
    lab_tech: ["dashboard", "patients", "encounters", "laboratory", "imaging", "master-data"],
    pharmacist: ["dashboard", "patients", "encounters", "pharmacy", "master-data"],
    nurse: ["dashboard", "patients", "encounters", "appointments", "laboratory", "imaging", "pharmacy", "master-data"],
    radiographer: ["dashboard", "patients", "encounters", "laboratory", "imaging", "master-data"],
  }
  it.each(ROLES)("%s", (role) => {
    const user = { permissions: permsOf(role) }
    const visible = Object.keys(NAV_RULES).filter((key) => canSeeNav(user, ALL_ON, key))
    expect(visible.sort()).toEqual([...EXPECTED[role]].sort())
  })

  it("a switched-off department hides its menu even for a user who has the permission", () => {
    const admin = { permissions: permsOf("admin") }
    const off: ModuleSwitches = { pharmacy: false, lab: false, imaging: true, ipd: true }
    expect(canSeeNav(admin, off, "pharmacy")).toBe(false)
    expect(canSeeNav(admin, off, "laboratory")).toBe(false)
    expect(canSeeNav(admin, off, "imaging")).toBe(true)
  })

  it("until the switches are loaded, a department menu stays hidden (nothing is assumed on)", () => {
    const admin = { permissions: permsOf("admin") }
    expect(canSeeNav(admin, null, "pharmacy")).toBe(false)
    expect(canSeeNav(admin, null, "patients")).toBe(true)
  })

  it("nobody sees anything without permissions, and an unknown key is never shown", () => {
    for (const key of Object.keys(NAV_RULES)) expect(canSeeNav({ permissions: [] }, ALL_ON, key)).toBe(false)
    expect(canSeeNav(null, ALL_ON, "patients")).toBe(false)
    expect(canSeeNav({ permissions: permsOf("admin") }, ALL_ON, "not-a-menu")).toBe(false)
  })

  it("the role NAME changes nothing: only the listed permissions count", () => {
    const user = { role: "admin", permissions: ["patients.read"] } as { permissions: string[] }
    expect(Object.keys(NAV_RULES).filter((k) => canSeeNav(user, ALL_ON, k))).toEqual(["patients"])
  })
})

describe("typed addresses (Not allowed page)", () => {
  const status = (role: R, p: string, modules: ModuleSwitches = ALL_ON) => {
    const rule = ruleForPath(p)
    return !rule || satisfies(rule, permsOf(role), modules)
  }
  it.each([
    ["receptionist", "/admin/users", false], ["admin", "/admin/users", true], ["doctor", "/admin/master-data", true],
    ["doctor", "/admin/users", false], ["nurse", "/patients/new", false], ["receptionist", "/patients/new", true],
    ["receptionist", "/patients/01HZX/edit", true], ["doctor", "/patients/01HZX/edit", false], ["doctor", "/patients/01HZX", true],
    ["pharmacist", "/lab/orders", false], ["lab_tech", "/lab/orders", true], ["lab_tech", "/lab/orders/new", false], ["lab_tech", "/lab/orders/01HZX/results", true],
    ["doctor", "/lab/orders/01HZX/results", false], ["receptionist", "/billing/expenses", false], ["billing", "/billing/expenses", true],
    ["pharmacist", "/pharmacy/dispense", true], ["nurse", "/pharmacy/dispense", false], ["nurse", "/pharmacy/inventory", true],
    ["lab_tech", "/reports", false], ["billing", "/reports", true], ["receptionist", "/billing/consultations/new", true], ["nurse", "/billing/consultations/new", false], ["billing", "/billing/transactions", true], ["lab_tech", "/billing/transactions", false],
    ["receptionist", "/encounters/new", true], ["nurse", "/encounters/new", false], ["doctor", "/encounters/new", true], // doctors admit (ipd.admit)
    ["radiographer", "/imaging/orders", true], ["radiographer", "/imaging/orders/new", false],
  ] as const)("%s opens %s -> %s", (role, route, expected) => {
    expect(status(role, route)).toBe(expected)
  })

  it("a department that is switched off refuses its screens", () => {
    expect(status("admin", "/pharmacy/inventory", { pharmacy: false, lab: true, imaging: true, ipd: true })).toBe(false)
    expect(status("admin", "/lab/orders/01HZX/results", { pharmacy: true, lab: false, imaging: true, ipd: true })).toBe(false) // working a lab order needs the lab
  })

  it("handoff 5 and 8.7 together: the menu needs the department, but an order is still placed (as an external referral) and past records stay readable", () => {
    const labOff: ModuleSwitches = { pharmacy: true, lab: false, imaging: true, ipd: true }
    const imagingOff: ModuleSwitches = { pharmacy: true, lab: true, imaging: false, ipd: true }
    // navigation = permission AND module
    expect(canSeeNav({ permissions: permsOf("admin") }, labOff, "laboratory")).toBe(false)
    expect(canSeeNav({ permissions: permsOf("admin") }, imagingOff, "imaging")).toBe(false)
    expect(canSeeNav({ permissions: permsOf("admin") }, ALL_ON, "laboratory")).toBe(true)
    // placing an order and reading past records need only their permission
    for (const route of ["/lab/orders/new", "/lab/orders", "/lab/orders/01HZX"]) expect(status("admin", route, labOff), route).toBe(true)
    for (const route of ["/imaging/orders/new", "/imaging/orders", "/imaging/orders/01HZX"]) expect(status("admin", route, imagingOff), route).toBe(true)
    // ...and still the permission: a role without diagnostics.order cannot place one, without diagnostics.read cannot read
    expect(status("lab_tech", "/lab/orders/new", labOff)).toBe(false)
    expect(status("billing", "/lab/orders", labOff)).toBe(status("billing", "/lab/orders", ALL_ON))
  })

  it("the most specific rule wins and a trailing slash does not matter", () => {
    expect(ruleForPath("/patients/new/")).toEqual({ any: ["patients.write"] })
    expect(ruleForPath("/patients")).toEqual(NAV_RULES.patients)
    expect(ruleForPath("/profile")).toBeNull()
  })

  it("every route rule uses a permission the handoff's screen table names", () => {
    const known = new Set(Object.keys(MATRIX))
    const used = [...ROUTE_RULES.map((r) => r[1]), ...ROUTE_PATTERNS.map((r) => r[1]), ...Object.values(NAV_RULES)].flatMap((r) => [...(r.any ?? []), ...(r.all ?? [])])
    expect(used.length).toBeGreaterThan(10)
    for (const p of used) expect(known.has(p), `${p} is not in the handoff's permission list`).toBe(true)
  })
})

describe("hasPermission", () => {
  it("grants only what is listed", () => {
    expect(hasPermission(["a.b"], "a.b")).toBe(true)
    expect(hasPermission(["a.b"], "a.c")).toBe(false)
    expect(hasPermission(null, "a.b")).toBe(false)
    expect(hasPermission(undefined, "a.b")).toBe(false)
  })
})

describe("no role-based decisions anywhere", () => {
  const SRC = path.resolve(process.cwd(), "src")
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, out)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== "schema.d.ts") out.push(full)
    }
    return out
  }
  it("no screen compares or switches on user.role (the role is a display label only)", () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).replace(/\\/g, "/")
      if (rel.startsWith("data/") || rel.startsWith("lib/services/mock/")) continue // demo data and the mock users service describe demo users
      const text = readFileSync(f, "utf8")
      if (/\buser\??\.role\s*(===|!==|==|!=)/.test(text) || /\bswitch\s*\(\s*user\??\.role/.test(text) || /\bSIDEBAR_VISIBILITY\b|\bRoleGate\b(?!.*REMOVED)/.test(text.replace(/\/\/.*$/gm, ""))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("user.role is only read by the screens that print a label (and the Users form, where `user` is ANOTHER user being edited)", () => {
    const readers: string[] = []
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).replace(/\\/g, "/")
      if (rel.startsWith("data/") || rel.startsWith("lib/services/")) continue
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
      if (/\buser\??\.role\b/.test(code)) readers.push(rel)
    }
    expect(readers.sort()).toEqual([
      "app/(dashboard)/admin/users/page.tsx", "app/(dashboard)/profile/page.tsx", "app/(public)/login/page.tsx", "app/(public)/page.tsx",
      "components/layout/Sidebar.tsx", "components/layout/Topbar.tsx",
    ].sort())
  })
})
