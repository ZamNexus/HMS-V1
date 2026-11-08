import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Static checks on the source tree (MD sections 6 and 7). They scan the files, so a convention broken anywhere fails here.

const SRC = path.resolve(process.cwd(), "src")
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== "schema.d.ts") out.push(full)
  }
  return out
}
const files = walk(SRC)
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/")
const text = new Map(files.map((f) => [rel(f), readFileSync(f, "utf8")]))

describe("source conventions", () => {
  it("scans a real tree (guards against a wrong path making every check vacuous)", () => {
    expect(files.length).toBeGreaterThan(100)
    expect(text.get("lib/api/client.ts")).toContain("createApiClient")
  })

  it("console output is allowed only in the few files that print names, codes and ids (no patient data in logs)", () => {
    const allowed = new Set(["lib/errorLog.ts", "lib/api/devInspect.ts", "lib/services/http/wire.ts"])
    const offenders = [...text].filter(([f, t]) => /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(t) && !allowed.has(f)).map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it("no page or layout fetches data on the server: no route handlers, no server actions, no async server components that call the API", () => {
    const routeHandlers = files.filter((f) => /\/route\.tsx?$/.test(f.replace(/\\/g, "/"))).map(rel)
    expect(routeHandlers).toEqual([])
    const serverActions = [...text].filter(([, t]) => /^\s*["']use server["']/m.test(t)).map(([f]) => f)
    expect(serverActions).toEqual([])
    const serverFetchers = [...text]
      .filter(([f, t]) => /^app\/.*\/(page|layout)\.tsx$/.test(f) && !/^\s*["']use client["']/m.test(t) && /\b(fetch\(|api\.(get|post|put|patch|delete)\b|Service\.)/.test(t))
      .map(([f]) => f)
    expect(serverFetchers).toEqual([])
  })

  it("nothing uses dangerouslySetInnerHTML, localStorage/sessionStorage writes or document.title for data", () => {
    const html = [...text].filter(([, t]) => t.includes("dangerouslySetInnerHTML")).map(([f]) => f)
    expect(html).toEqual([])
    const storageWrites = [...text].filter(([, t]) => /\b(localStorage|sessionStorage)\.(setItem|clear)\b|indexedDB\.open/.test(t)).map(([f]) => f)
    // the ONE value kept in localStorage is the last Hospital Code typed on the device (not patient data, not a credential)
    expect(storageWrites.sort()).toEqual(["lib/session/lastHospital.ts", "lib/session/logoutPending.ts"]) // + a single boolean: a logout the server still has to hear about
    const title = [...text].filter(([f, t]) => /document\.title\s*=/.test(t) && f !== "never").map(([f]) => f)
    expect(title).toEqual([])
  })

  it("the sign-in cookie hint is the only cookie the frontend writes (tokens and patient data never go in a cookie)", () => {
    const writers = [...text].filter(([, t]) => /document\.cookie\s*=/.test(t)).map(([f]) => f)
    expect(writers).toEqual(["lib/session/hint.ts"])
  })
})
