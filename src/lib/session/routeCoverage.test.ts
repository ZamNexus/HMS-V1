import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { OPEN_TO_SIGNED_IN, ruleForPath, satisfies, type ModuleSwitches } from "./permissions"

// Every screen under src/app/(dashboard) must be covered by an access rule (or be on the short "signed-in is enough" list). A new page that is
// forgotten fails here instead of being open to everybody (default deny).

const APP = path.resolve(process.cwd(), "src/app/(dashboard)")
function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) pages(full, out)
    else if (e.name === "page.tsx") out.push(full)
  }
  return out
}
// "src/app/(dashboard)/patients/[id]/edit/page.tsx" -> "/patients/x/edit"; "[tab]" -> a real tab name
const toRoute = (file: string) => {
  const rel = path.relative(APP, path.dirname(file)).replace(/\\/g, "/")
  return "/" + rel.replace(/\[id\]/g, "01HZX0000000000000000000AA").replace(/\[tab\]/g, "payments")
}

const ON: ModuleSwitches = { pharmacy: true, lab: true, imaging: true, ipd: true }

describe("route coverage (default deny)", () => {
  const routes = pages(APP).map(toRoute)

  it("finds the real screens", () => {
    expect(routes.length).toBeGreaterThan(20)
    expect(routes).toContain("/patients/01HZX0000000000000000000AA/edit")
    expect(routes).toContain("/dashboard/stats")
  })

  it("every screen has a rule, or is one of the few open to any signed-in user", () => {
    const uncovered = routes.filter((r) => ruleForPath(r) === null && !OPEN_TO_SIGNED_IN.includes(r))
    expect(uncovered).toEqual([])
  })

  it("the list of open screens is short and deliberate", () => {
    expect(OPEN_TO_SIGNED_IN).toEqual(["/profile"])
  })
})

describe("rules added after the review", () => {
  const can = (path: string, permissions: string[], modules: ModuleSwitches = ON) => {
    const rule = ruleForPath(path)
    return !!rule && satisfies(rule, permissions, modules)
  }
  it("appointments need appointments.read", () => {
    expect(can("/appointments", ["appointments.read"])).toBe(true)
    expect(can("/appointments", ["patients.read"])).toBe(false)
  })
  it("Financial Statistics (/dashboard/stats) needs reports.read, not just a dashboard permission", () => {
    expect(can("/dashboard", ["encounters.read"])).toBe(true)
    expect(can("/dashboard/stats", ["encounters.read"])).toBe(false)
    expect(can("/dashboard/stats", ["reports.read"])).toBe(true)
  })
  it("discharge needs ipd.discharge and the ipd module", () => {
    const route = "/encounters/01HZX0000000000000000000AA/discharge"
    expect(can(route, ["encounters.read"])).toBe(false)
    expect(can(route, ["ipd.discharge"])).toBe(true)
    expect(can(route, ["ipd.discharge"], { ...ON, ipd: false })).toBe(false)
  })
  it("invoices, receipts and payments need billing.read; only expenses and bank accept accounts.read", () => {
    for (const tab of ["consultations", "services", "payments", "receipts"]) {
      expect(can(`/billing/${tab}`, ["accounts.read"]), tab).toBe(false)
      expect(can(`/billing/${tab}`, ["billing.read"]), tab).toBe(true)
    }
    for (const tab of ["expenses", "bank"]) {
      expect(can(`/billing/${tab}`, ["billing.read"]), tab).toBe(false)
      expect(can(`/billing/${tab}`, ["accounts.read"]), tab).toBe(true)
    }
  })
  it("a percent-encoded path does not slip past a prefix rule", () => {
    expect(ruleForPath("/%61dmin/users")).toEqual(ruleForPath("/admin/users")) // decoded first, so the users rule applies
    expect(ruleForPath("/admin/%75sers")).toEqual(ruleForPath("/admin/users"))
    expect(ruleForPath("/admin/%E0%A4%A")).toBeNull() // malformed escape: matched as plain text, refused
  })
})
