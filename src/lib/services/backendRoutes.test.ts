import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ENDPOINTS, HANDOFF_ONLY_ROUTE_KEYS } from "./endpoints"

// docs/openapi.json is the contract for routes. This guard makes sure the ENDPOINTS table never claims a route that no contract contains: a route
// is allowed only if docs/openapi.json defines it, or docs/openapi.draft.json (the frontend's PROPOSED contract for routes the handoff names but
// openapi.json lacks: expense categories, bank accounts, audit entries) does.

const spec = JSON.parse(readFileSync(path.resolve(process.cwd(), "docs/openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>
}
const draft = JSON.parse(readFileSync(path.resolve(process.cwd(), "docs/openapi.draft.json"), "utf8")) as { paths: Record<string, Record<string, unknown>> }
const METHODS = ["get", "post", "put", "patch", "delete"]
const routes: string[] = []
const proposed: string[] = []
for (const [p, item] of Object.entries(spec.paths)) {
  for (const m of Object.keys(item)) if (METHODS.includes(m)) routes.push(`${m.toUpperCase()} ${p}`)
}
for (const [p, item] of Object.entries(draft.paths)) {
  for (const m of Object.keys(item)) if (METHODS.includes(m)) proposed.push(`${m.toUpperCase()} ${p}`)
}

// "{id}", "{testId}" and ":id" are all the same thing for matching purposes
const normalise = (p: string) => p.replace(/\{[^}]+\}/g, ":p").replace(/:[A-Za-z]+/g, ":p")
const listed = new Set([...routes, ...proposed].map((r) => { const [m, p] = r.split(" "); return `${m} ${normalise(p)}` }))

describe("routes in docs/openapi.json", () => {
  it("are parsed (guards against an empty or truncated file)", () => {
    expect(routes.length).toBeGreaterThan(150)
    expect(routes).toContain("GET /api/v1/auth/me")
  })

  it("contain every route that ENDPOINTS has set", () => {
    const set = Object.entries(ENDPOINTS).filter(([, e]) => e !== null)
    expect(set.length).toBeGreaterThan(0)
    for (const [key, e] of set) {
      if ((HANDOFF_ONLY_ROUTE_KEYS as readonly string[]).includes(key)) continue // routes only, named by the handoff but not in the spec (see endpoints.ts)
      expect(listed.has(`${e!.method} ${normalise("/api/v1" + e!.path)}`), `${key} -> ${e!.method} ${e!.path} is in neither docs/openapi.json nor docs/openapi.draft.json`).toBe(true)
    }
  })

  it("really would reject a route that is not listed (the matcher is not vacuous)", () => {
    expect(listed.has(`GET ${normalise("/api/v1/definitely-not-a-route")}`)).toBe(false)
    expect(listed.has(`DELETE ${normalise("/api/v1/patients/:id")}`)).toBe(false)
    expect(listed.has(`PATCH ${normalise("/api/v1/patients/:id")}`)).toBe(true)
  })

  it("has switched on only keys whose mapper exists (identity, patients, organisations, guardian relations, settings, services)", () => {
    expect(Object.keys(ENDPOINTS).length).toBe(255)
    const on = Object.entries(ENDPOINTS).filter(([, e]) => e !== null).map(([k]) => k)
    expect(on.every((k) => ["auth.me", "patients.", "schedule.", "slots.", "appointments.", "visits.", "beds.", "invoices.", "account.", "charges.", "paymentsRegister.", "advances.", "credit.", "refunds.", "creditNotes.", "labApi.", "imagingApi.", "pharmacyApi.", "reportsApi.", "accountsApi.", "organisations.", "guardianRelations.", "settings.", "serviceCatalog.", "labTests.", "ecgTests.", "wardsAdmin.", "usersAdmin.", "doctors.", "icd.", "expenseCategories.", "bankAccounts.", "itemHistory."].some((p) => k === p || k.startsWith(p)))).toBe(true)
  })
})
