import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/client"
import { buildCsp, makeNonce, safeOrigins } from "@/lib/csp"
import { loggableError } from "@/lib/errorLog"
import { PAPER_LABEL, pageCss } from "@/lib/print"

// Phase 12, G1 (printing): one shared print layer, three papers, no PHI in the page title.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")

describe("the paper of a print (no PDF library: @page rules)", () => {
  it("A4 has 12 mm margins, a thermal roll is 80 mm wide with a length measured from the content, a tube label is 50 x 25 mm", () => {
    expect(pageCss("a4")).toBe("@page { size: A4; margin: 12mm; }")
    expect(pageCss("thermal", 123.2)).toBe("@page { size: 80mm 124mm; margin: 3mm; }") // a real length: "80mm auto" is ignored by browsers (Letter is used instead)
    expect(pageCss("thermal", 5)).toBe("@page { size: 80mm 40mm; margin: 3mm; }") // never shorter than 40 mm
    expect(pageCss("thermal")).toContain("80mm 200mm")
    expect(pageCss("label")).toBe("@page { size: 50mm 25mm; margin: 1.5mm; }")
    expect(Object.keys(PAPER_LABEL).sort()).toEqual(["a4", "label", "thermal"])
  })
  it("the print helper sets the paper just for the print and cleans up after it", () => {
    const src = read("src/lib/print.ts")
    expect(src).toContain('addEventListener("afterprint", cleanup)')
    expect(src).toContain('root.removeAttribute("data-paper")')
    expect(src).toContain("style.remove()")
  })
})

describe("every printable view uses the shared print layer", () => {
  const VIEWS: [string, string][] = [
    ["src/components/billing/ReceiptView.tsx", 'papers={["a4", "thermal"]}'], ["src/components/pharmacy/SlipAndReturn.tsx", 'papers={["a4", "thermal"]}'],
    ["src/components/diagnostics/PrintViews.tsx", 'papers={["a4"]}'], ["src/components/diagnostics/SpecimenLabel.tsx", 'papers={["label"]}'],
  ]
  it("each wraps its content in .print-root and prints through PrintButtons, with no stylesheet of its own", () => {
    for (const [f, papers] of VIEWS) {
      const src = read(f)
      expect(src, f).toContain("print-root")
      expect(src, f).toContain(papers)
      expect(src, f).not.toContain("PRINT_CSS")
      expect(src, f).not.toContain("window.print()")
    }
  })
  it("the global print rules remove the rest of the app, un-clip the dialog that holds the view and size the narrow papers", () => {
    const css = read("src/app/globals.css")
    expect(css).toContain("body:has(.print-root)")
    expect(css).toContain('[role="dialog"]:has(.print-root)')
    expect(css).toContain("overflow: visible !important")
    expect(css).toContain('html[data-paper="thermal"] .print-root')
    expect(css).toContain('html[data-paper="label"] .print-root')
  })
  it("a print is read fresh and never cached (lab report, imaging report, slip, receipt reprint)", () => {
    for (const f of ["src/components/diagnostics/PrintViews.tsx", "src/components/pharmacy/SlipAndReturn.tsx", "src/components/billing/RegistersTabs.tsx"]) expect(read(f), f).toContain("gcTime: 0")
  })
  it("every tube of a lab order that is not rejected can have its label printed", () => {
    const src = read("src/components/diagnostics/LabOrderDetailScreen.tsx")
    expect(src).toContain('s.status !== "rejected"')
    expect(src).toContain("<SpecimenLabelDialog")
  })
})

describe("no patient data in the page title or the address bar", () => {
  const files: string[] = []
  const walk = (dir: string) => { for (const e of readdirSync(dir)) { const p = path.join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) files.push(p) } }
  walk(path.resolve(root, "src"))
  it("nothing sets document.title, and no component renders a <title> or <Head> from data", () => {
    for (const f of files) {
      const code = readFileSync(f, "utf8")
      expect(code, f).not.toMatch(/document\.title\s*=/)
      expect(code, f).not.toMatch(/<title>\{/)
    }
  })
  it("no component injects HTML from a server answer", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toContain("dangerouslySetInnerHTML")
  })
})

describe("the Content-Security-Policy (G2)", () => {
  const nonce = "dGVzdC1ub25jZS0xMjM0NTY3OA=="
  const csp = buildCsp({ nonce })
  const dir = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " ") || d === name)
  it("allows only this origin by default, and scripts only with the request's nonce (no inline, no eval in production)", () => {
    expect(dir("default-src")).toBe("default-src 'self'")
    expect(dir("script-src")).toBe("script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(dir("script-src")).not.toContain("'unsafe-inline'")
    expect(dir("connect-src")).toBe("connect-src 'self'")
    expect(dir("frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(dir("object-src")).toBe("object-src 'none'")
    expect(dir("base-uri")).toBe("base-uri 'self'")
    expect(dir("form-action")).toBe("form-action 'self'")
    expect(dir("img-src")).toBe("img-src 'self' data: blob:")
    expect(dir("font-src")).toBe("font-src 'self'")
  })
  it("only the development server gets eval and a websocket; upgrade-insecure-requests only where HTTPS is on", () => {
    const dev = buildCsp({ nonce, dev: true })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).toContain("connect-src 'self' ws: wss:")
    expect(csp).not.toContain("upgrade-insecure-requests")
    expect(buildCsp({ nonce, upgradeInsecure: true })).toContain("upgrade-insecure-requests")
  })
  it("extra image hosts must be plain https origins: a wildcard, a path or a directive smuggled in is dropped", () => {
    expect(safeOrigins("https://photos.example.com, https://cdn.example.org:8443")).toEqual(["https://photos.example.com", "https://cdn.example.org:8443"])
    expect(safeOrigins("*, http://insecure.example, https://a.example/path, https://b.example; script-src *, javascript:alert(1)")).toEqual([])
    expect(buildCsp({ nonce, imgExtra: "https://photos.example.com" })).toContain("img-src 'self' data: blob: https://photos.example.com")
    expect(buildCsp({ nonce, imgExtra: "https://x.example; script-src *" })).not.toContain("script-src *")
  })
  it("refuses a nonce that is too short or not base64", () => {
    expect(() => buildCsp({ nonce: "short" })).toThrow()
    expect(() => buildCsp({ nonce: "has spaces in it, not valid!" })).toThrow()
  })
  it("a nonce is 128 random bits and never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => makeNonce()))
    expect(seen.size).toBe(200)
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
  it("is applied by the proxy to every page request, and every page renders per request so the nonce exists", () => {
    const proxy = read("src/proxy.ts")
    expect(proxy).toContain('requestHeaders.set("Content-Security-Policy", csp)')
    expect(proxy).toContain('response.headers.set("Content-Security-Policy", csp)')
    expect(proxy).toContain('requestHeaders.set("x-nonce", nonce)')
    expect(proxy).toContain('key: "next-router-prefetch"')
    expect(read("src/app/layout.tsx")).toContain("await connection()")
    expect(read("next.config.ts")).not.toContain('key: "Content-Security-Policy"')
    expect(read("next.config.ts")).toContain('"X-Frame-Options"')
  })
})

describe("no patient data in logs, storage or error reports (G2)", () => {
  const files: string[] = []
  const walk = (dir: string) => { for (const e of readdirSync(dir)) { const p = path.join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) files.push(p) } }
  walk(path.resolve(root, "src"))
  const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/")
  const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "") // comments may talk about storage; only code counts
  it("only three places write to the console, and none prints a message, a body or a URL", () => {
    const users = files.filter((f) => /console\.(log|error|warn|info|debug)\(/.test(code(f))).map(rel).sort()
    expect(users).toEqual(["src/lib/api/devInspect.ts", "src/lib/errorLog.ts", "src/lib/services/http/wire.ts"])
    expect(read("src/lib/services/http/wire.ts")).toContain("arrived as array") // the message names a DTO.field, never a value
  })
  it("an error report carries names, codes and ids only: never the message, the response body or the request path", () => {
    const err = new ApiError({ status: 422, code: "PATIENT_CHANGED", message: "Ayesha Khan (MR-2026-0042) was changed by someone else", requestId: "req-1", path: "/api/v1/patients/01HZX?search=Ayesha" })
    const out = JSON.stringify(loggableError(err))
    expect(out).toContain("PATIENT_CHANGED")
    expect(out).toContain("req-1")
    expect(out).not.toMatch(/Ayesha|MR-2026|search=|patients\//)
    expect(JSON.stringify(loggableError(new Error("Zainab Qureshi 35201-1234567-1")))).not.toMatch(/Zainab|35201/)
  })
  it("browser storage holds only the hospital code and the owed-logout flag; nothing else is written, and no session storage or database is used", () => {
    const writers = files.filter((f) => /(localStorage|sessionStorage|indexedDB)\.(setItem|open)|indexedDB\.open/.test(code(f))).map(rel).sort()
    expect(writers).toEqual(["src/lib/session/lastHospital.ts", "src/lib/session/logoutPending.ts"])
    for (const f of files) expect(code(f), rel(f)).not.toMatch(/sessionStorage|indexedDB|document\.cookie\s*=.*(token|patient)/i)
    expect(read("src/lib/session/logoutPending.ts")).toContain('localStorage.setItem(KEY, "1")')
  })
  it("the address bar carries ids, dates, pages and enums only: the search text is never written to it", () => {
    const hook = read("src/lib/query/useUrlFilters.ts")
    expect(hook).toContain("is not a filter this screen keeps in the address bar")
    for (const f of files.filter((f) => /\.tsx$/.test(f))) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/url\.set\(\{[^}]*search:/)
  })
})

describe("heavy and rarely used views load only when needed (G2)", () => {
  it("charts and the report print views are dynamic imports", () => {
    expect(read("src/app/(dashboard)/dashboard/page.tsx")).toContain('dynamic(() => import("./DashboardCharts")')
    expect(read("src/app/(dashboard)/billing/[tab]/BillingHub.tsx")).toContain('dynamic(() => import("./ExpenseChart")')
    expect(read("src/components/diagnostics/LabOrderDetailScreen.tsx")).toContain('dynamic(() => import("./PrintViews")')
    expect(read("src/components/diagnostics/LabOrderDetailScreen.tsx")).toContain('dynamic(() => import("./SpecimenLabel")')
    expect(read("src/components/diagnostics/ImagingOrderDetailScreen.tsx")).toContain('dynamic(() => import("./PrintViews")')
  })
})
