import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeAll, describe, expect, it } from "vitest"
import { DISEASES } from "@/data/diseases"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { MEDICINES } from "@/data/medicines"
import { PANELS } from "@/data/organisations"
import { CLINIC_SETTINGS } from "@/data/settings"
import { WARDS } from "@/data/wards"
import { mockDashboardService } from "./mock/dashboard"
import { mockNotificationsService } from "./mock/crossModule"
import { mockMedicinesService } from "./mock/pharmacy"
import { mockReportsService } from "./mock/reports"
import { isLowStock, matchesInventoryFilter } from "./pharmacyHelpers"
import type { MedicineRecord } from "./types"
import type { PrescriptionItem } from "@/types"

// Post-Phase-4K.1 cross-module audit. Frontend-only tests with controlled demo data: they say nothing about the real backend.

const srcRoot = join(__dirname, "../..")
const root = join(srcRoot, "..")
const source = (rel: string) => readFileSync(join(root, rel), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// ── 1. The demo data is reachable through ONE seam ("@hms/demo") ────────────────────────────────────────────────────
// src/data (sample records) and src/lib/services/mock (in-memory services) are imported by exactly two modules: the seam's registry and (for the mock adapters' own helper) billingAggregate.
// Every other file reaches the demo through "@hms/demo", and a production build for the real API replaces that module with a stub (next.config.ts), so nothing here ships to a user.
const ALLOWED_DIRECT_DATA_IMPORTS: Record<string, string[]> = {
  "src/lib/demo/registry.ts": ["billing", "diseases", "encounters", "imaging", "lab", "patients", "pharmacy", "settings", "wards"],
  "src/lib/billingAggregate.ts": ["billing", "encounters", "imaging", "lab", "pharmacy"], // read ONLY by the mock adapters (checked below)
}
// Files allowed to read the seam, each only on the mock side of a dataSource === "mock" branch (or, for master data and the ICD box, inside a component that API mode does not render).
const SEAM_READERS = [
  "src/app/(dashboard)/admin/master-data/page.tsx", "src/app/(dashboard)/encounters/new/page.tsx", "src/app/(dashboard)/imaging/orders/new/page.tsx", "src/app/(dashboard)/lab/orders/new/page.tsx",
  "src/app/(dashboard)/patients/[id]/page.tsx", "src/app/(dashboard)/patients/page.tsx", "src/app/(dashboard)/pharmacy/[tab]/PharmacyHub.tsx", "src/components/patients/PatientForm.tsx",
  "src/components/shared/IcdLookup.tsx", "src/lib/services/index.ts",
]

describe("the demo data is reachable only through the seam", () => {
  const files = [...walk(join(srcRoot, "app")), ...walk(join(srcRoot, "components")), ...walk(join(srcRoot, "lib"))]
    .filter((f) => !f.endsWith(".test.ts"))
    .filter((f) => !f.split(sep).join("/").includes("/lib/services/mock/"))
  const rel = (f: string) => relative(root, f).split(sep).join("/")
  const dataImports = (f: string) => [...readFileSync(f, "utf8").matchAll(/from\s+["']@\/data\/([A-Za-z]+)["']/g)].map((m) => m[1]).sort()

  it("no screen, component or lib file imports src/data except the seam's registry and billingAggregate", () => {
    const found: Record<string, string[]> = {}
    for (const f of files) {
      const d = dataImports(f)
      if (d.length) found[rel(f)] = d
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED_DIRECT_DATA_IMPORTS).map(([k, v]) => [k, [...v].sort()])))
  })

  it("no HTTP adapter, reference helper or API client imports demo data, the seam or a mock adapter", () => {
    for (const f of files.filter((x) => /\/lib\/(services\/http|services\/reference|api)\//.test(x.split(sep).join("/")))) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/@\/data\/|@hms\/demo|\/mock\/|billingAggregate/)
    }
  })

  it("only the mock adapters read billingAggregate, and only the seam's registry imports a mock adapter", () => {
    const all = [...walk(join(srcRoot, "app")), ...walk(join(srcRoot, "components")), ...walk(join(srcRoot, "lib"))].filter((f) => !f.endsWith(".test.ts"))
    const readers = all.filter((f) => /from\s+["'][^"']*billingAggregate["']/.test(readFileSync(f, "utf8"))).map(rel).sort()
    expect(readers).toEqual(["src/lib/services/mock/crossModule.ts", "src/lib/services/mock/reports.ts"])
    const mockImporters = files.filter((f) => /from\s+["'][^"']*\/mock\//.test(readFileSync(f, "utf8"))).map(rel)
    expect(mockImporters).toEqual(["src/lib/demo/registry.ts"])
  })

  it("exactly the audited files read the seam", () => {
    const readers = files.filter((f) => /from\s+["']@hms\/demo["']/.test(readFileSync(f, "utf8"))).map(rel).sort()
    expect(readers).toEqual([...SEAM_READERS].sort())
  })

  it("the stub that replaces the seam in a production build throws on every read and carries no sample data", async () => {
    const stub = readFileSync(join(srcRoot, "lib/demo/registry.stub.ts"), "utf8")
    expect(stub).not.toMatch(/from\s+["']/) // imports nothing at all
    const { demo } = await import("@/lib/demo/registry.stub")
    expect(() => (demo as { services: unknown }).services).toThrow(/not part of this build/)
    expect(() => (demo as { data: unknown }).data).toThrow(/not part of this build/)
  })

  it("the config swaps the seam for the stub by the app's own data-source rule, in both bundlers", () => {
    const config = readFileSync(join(root, "next.config.ts"), "utf8")
    expect(config).toMatch(/resolveDataSource\(process\.env\.NEXT_PUBLIC_HMS_DATA_SOURCE, process\.env\.NODE_ENV\) === "mock"/)
    expect(config).toMatch(/turbopack: demoIncluded \? \{\} : \{ resolveAlias: \{ "@hms\/demo": demoStub \} \}/)
    expect(config).toMatch(/"@hms\/demo": path\.resolve\(__dirname, demoStub\)/)
    expect(config).toContain('"./src/lib/demo/registry.stub.ts"')
    const tsconfig = readFileSync(join(root, "tsconfig.json"), "utf8")
    expect(tsconfig).toContain('"@hms/demo": ["./src/lib/demo/registry.ts"]')
  })

  it("the two screens that read the patient's other-module records do so only in mock mode", () => {
    const detail = source("src/app/(dashboard)/patients/[id]/page.tsx")
    expect(detail).toMatch(/const legacyId = dataSource === "mock" \? legacyPatientId\(patient\) : null/)
    expect(source("src/app/(dashboard)/patients/page.tsx")).toMatch(/if \(dataSource === "mock"\) return demoLastVisit\(legacyPatientId\(p\)\)/)
  })
})

// ── 2. Master Data: tabs with no service and no contract are demo-only (API mode = contract pending) ──────────────
describe("Master Data: demo-only tabs are contract-pending in API mode", () => {
  const page = source("src/app/(dashboard)/admin/master-data/page.tsx")
  const render = async (source: "mock" | "api") => {
    const { MockModeOnly } = await import("@/components/shared/MockModeOnly")
    return renderToStaticMarkup(createElement(MockModeOnly, { source, title: "Panels are unavailable", awaiting: ["panels"], testId: "t-pending" }, createElement("p", null, "DEMO-CHILD")))
  }
  beforeAll(async () => { await render("mock") }, 30_000)

  it("mock mode renders the children unchanged", async () => {
    const html = await render("mock")
    expect(html).toBe("<p>DEMO-CHILD</p>")
  })

  it("API mode renders only the contract-pending notice — the children are not rendered", async () => {
    const html = await render("api")
    expect(html).toContain('data-testid="t-pending"')
    expect(html).toMatch(/Not connected/)
    expect(html).toMatch(/not an empty list/)
    expect(html).not.toContain("DEMO-CHILD")
  })

  it("the Diagnoses tab is the read-only ICD-10 list in API mode (S11) and the demo list ONLY in mock mode", () => {
    expect(page).toContain('dataSource === "api" ? <IcdCodesTab /> : <DiseasesTab />')
    expect(page).not.toMatch(/masterdata-diseases-pending/)
  })

  it("Clinic Settings is connected (S1): the API tab in API mode, the demo form ONLY in mock mode, and the tab needs settings.write in API mode", () => {
    expect(page).toMatch(/dataSource === "api" \? <ClinicSettingsTab \/> : <MockClinicSettingsTab \/>/)
    expect(page).toMatch(/showClinicSettings = dataSource !== "api" \|\| can\("settings\.write"\)/)
    expect(page).not.toMatch(/masterdata-clinic-pending/)
  })

  it("Expense Categories (S12) and Banks (S13) are connected: the API tab in API mode, the demo tab ONLY in mock mode; Banks needs accounts.read", () => {
    expect(page).toContain('dataSource === "api" ? <ExpenseCategoriesTab /> : <MockExpenseCategoriesTab />')
    expect(page).toContain('dataSource === "api" ? <BankAccountsTab /> : <MockBanksTab />')
    expect(page).toContain('const showBanks = dataSource !== "api" || can("accounts.read")')
  })

  it("Wards and beds are connected (S8): the API tab in API mode, the demo tab ONLY in mock mode", () => {
    expect(page).toContain('dataSource === "api" ? <WardsTab /> : <MockWardsTab />')
  })

  it("the Imaging Tests catalogue is connected (S7): the API tab in API mode, the demo tab ONLY in mock mode", () => {
    expect(page).toContain('dataSource === "api" ? <ImagingTestsTab /> : <MockEcgUltrasoundTab />')
  })

  it("the Lab Tests catalogue is connected (S6): the API tab in API mode, the demo tab ONLY in mock mode", () => {
    expect(page).toContain('dataSource === "api" ? <LabTestsTab /> : <MockLabTestsTab />')
  })

  it("the Services Catalog is connected (S5): the API tab in API mode, the demo tab ONLY in mock mode", () => {
    expect(page).toContain('dataSource === "api" ? <ServicesTab /> : <MockServicesTab />')
  })

  it("Panels and Guardian Relations are connected tabs (no demo array, no wrapper)", () => {
    expect(page).toMatch(/<PanelsTab \/>/)
    expect(page).toMatch(/<GuardianRelationsTab \/>/)
    expect(page).not.toMatch(/data\/organisations|data\/guardianRelations/)
  })

  it("the demo arrays the remaining wrapped tabs read are non-empty in the demo data (so the API-mode notice is hiding something real)", () => {
    expect(WARDS.length).toBeGreaterThan(0)
    expect(DISEASES.length).toBeGreaterThan(0)
    expect(CLINIC_SETTINGS).toBeTruthy()
  })
})

// ── 3. ICD lookup ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("ICD-10 lookup (New Encounter, Discharge)", () => {
  const render = async (source: "mock" | "api") => {
    const { IcdLookup } = await import("@/components/shared/IcdLookup")
    return renderToStaticMarkup(createElement(IcdLookup, { onSelect: () => {}, source }))
  }
  beforeAll(async () => { await render("mock") }, 30_000)

  it("API mode (S11): the real lookup trigger, closed: no demo diagnosis name or code is offered and nothing is requested until it opens", async () => {
    const html = await render("api")
    expect(html).toContain("ICD-10 Lookup")
    expect(html).not.toContain("icd-lookup-pending")
    for (const d of DISEASES) { expect(html).not.toContain(d.name); expect(html).not.toContain(d.icdCode) }
    expect(source("src/components/shared/IcdLookup.tsx")).toContain("{open && <IcdApiLookupBody")
  })

  it("mock mode: the normal 'ICD-10 Lookup' trigger", async () => {
    const html = await render("mock")
    expect(html).toContain("ICD-10 Lookup")
    expect(html).not.toContain("icd-lookup-pending")
  })

  it("the lookup defaults to the build's dataSource, so both callers get the guard", () => {
    expect(source("src/components/shared/IcdLookup.tsx")).toMatch(/source = dataSource/)
  })
})

// ── 4. Patient info panel: organisation through the shared service ───────────────────────────────────────────────
describe("PatientInfoPanel organisation name", () => {
  const panel = source("src/components/shared/PatientInfoPanel.tsx")
  it("resolves the organisation through useOrganisations, not the demo organisation array", () => {
    expect(panel).not.toMatch(/@\/data\/|getPanel|legacyNumericId/)
    expect(panel).toMatch(/useOrganisations\(/)
    expect(panel).toMatch(/Organisation \(not yet connected\)/)
  })
})

// ── 5. Low stock: the documented inconsistency, pinned (NOT resolved — no authoritative rule exists) ──────────────
// Characterisation of what each consumer does TODAY, at the three boundary values. If someone changes one of these rules the test fails,
// so the change is deliberate. The business question (is "low" `<` or `<=` the reorder level, and does 0 count?) is still OPEN.
describe("low-stock rules across consumers (documented inconsistency — characterised, not changed)", () => {
  const FAR = "2099-01-01"
  const facts = (stock: number, reorderLevel: number) => ({ expiry: FAR, stock, reorderLevel })

  it("Pharmacy hub (inventory tile, filter, badge): 0 < stock < reorder — excludes 0 and excludes stock == reorder", () => {
    expect(isLowStock(facts(0, 10))).toBe(false)
    expect(isLowStock(facts(10, 10))).toBe(false)
    expect(isLowStock(facts(9, 10))).toBe(true)
    expect(matchesInventoryFilter(facts(0, 10), "Out of Stock")).toBe(true)
  })

  async function withStock<T>(stock: number, fn: (m: (typeof MEDICINES)[number]) => Promise<T>): Promise<T> {
    const target = MEDICINES[0]
    const original = target.stock
    target.stock = stock
    try { return await fn(target) } finally { target.stock = original }
  }
  const counts = async () => {
    const tile = (await mockDashboardService.summary()).lowStockItems
    const report = (await mockReportsService.pharmacy()).lowStock.length
    const notes = await mockNotificationsService.list()
    const num = (id: string) => Number(notes.find((n) => n.id === id)?.title.match(/^(\d+)/)?.[1] ?? 0)
    return { tile, report, running: num("low-stock"), out: num("out-of-stock") }
  }

  it("the same medicine at stock 0 / == reorder / below reorder is counted differently by the consumers", async () => {
    const level = MEDICINES[0].reorderLevel
    expect(level).toBeGreaterThan(2)
    const base = await withStock(level + 5, () => counts()) // comfortably in stock
    const at = (stock: number) => withStock(stock, () => counts())
    const [zero, equal, below] = [await at(0), await at(level), await at(level - 1)]
    const d = (a: Awaited<ReturnType<typeof counts>>) => ({ tile: a.tile - base.tile, report: a.report - base.report, running: a.running - base.running, out: a.out - base.out })
    // Dashboard tile and Pharmacy report: `stock < reorder` — INCLUDE zero, exclude equal.
    expect(d(zero)).toMatchObject({ tile: 1, report: 1 })
    expect(d(equal)).toMatchObject({ tile: 0, report: 0 })
    expect(d(below)).toMatchObject({ tile: 1, report: 1 })
    // Top-bar "running low": `0 < stock <= reorder` — EXCLUDES zero (reported separately as out of stock), INCLUDES equal.
    expect(d(zero)).toMatchObject({ running: 0, out: 1 })
    expect(d(equal)).toMatchObject({ running: 1, out: 0 })
    expect(d(below)).toMatchObject({ running: 1, out: 0 })
  })

  it("New Encounter picker note and Dashboard stock banner: `stock < reorder` (zero counts as low, equal does not)", async () => {
    const { PrescriptionRows } = await import("@/components/encounters/PrescriptionRows")
    const rowFor = (name: string): PrescriptionItem[] => [{ medicine: name, dose: "", route: "Oral", frequency: "OD", duration: "", instructions: "" }]
    const note = async (stock: number) => withStock(stock, async (m) => {
      const items: MedicineRecord[] = (await mockMedicinesService.list({ pageSize: 1000 })).items
      return renderToStaticMarkup(createElement(PrescriptionRows, {
        uid: "u", rows: rowFor(m.name), medicines: { items, loading: false, error: null, reload: () => {} }, pending: false, onUpdate: () => {}, onRemove: () => {}, onAdd: () => {},
      }))
    })
    const level = MEDICINES[0].reorderLevel
    expect(await note(0)).toContain("(low stock)")
    expect(await note(level)).not.toContain("(low stock)")
    expect(await note(level - 1)).toContain("(low stock)")
    expect(source("src/app/(dashboard)/dashboard/page.tsx")).toMatch(/medicines\.items\.filter\(\(m\) => m\.stock < m\.reorderLevel\)/)
  })
})
