// Phase 4 browser check: S1 Clinic Settings + S2 module switches (API mode). TEST HARNESS ONLY. No real backend, no credentials: a stateful fake
// backend inside Playwright's route(); every request body and response is validated against docs/openapi.json.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])
const NOW = "2026-11-07T10:00:00.000Z"

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const LENIENT = { lenientStringArrays: true }
  const violations = []
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const permEnum = new Set(schemaOf("AuthUserDto_Output").properties.permissions.items.enum)
  const forCheck = (u) => ({ ...u, permissions: u.permissions.filter((p) => permEnum.has(p)) })

  let version = 1
  const stamp = () => `2026-11-07T10:00:0${version}.000Z`
  const S = { perms: stubs.ALL_PERMISSIONS, n: 0, cookie: false, slowSave: false, failNext: null, lockCurrency: false, lockTimezone: false, ipdAdmitted: 3 }
  const settings = { ...stubs.settingsBody(), nameEn: "Citi Clinic", nameUr: "سٹی کلینک", phone: "0511111111", updatedAt: stamp() }
  const modules = { pharmacy: true, lab: true, imaging: true, ipd: true }
  const requests = []
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, extra = {}) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...extra })
  const issue = () => "tok-" + ++S.n
  const modulesPayload = () => ({ data: Object.entries(modules).map(([module, enabled]) => ({ module, enabled, enabledAt: enabled ? NOW : null })) })

  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method()
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(url.searchParams), body })
    if (m === "POST" && p === "/auth/login") { S.cookie = true; const out = { accessToken: issue(), tokenType: "Bearer", expiresIn: 900, user: stubs.userBody({ permissions: S.perms }) }; check("login", { ...out, user: forCheck(out.user) }, "SignInResponseDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "POST" && p === "/auth/refresh") return S.cookie ? json(route, 200, { accessToken: issue(), tokenType: "Bearer", expiresIn: 900, mustChangePassword: false }) : err(route, 401, "SESSION_MISSING", "No session.")
    if (m === "GET" && p === "/public/hospital") return err(route, 404, "NOT_FOUND", "none")
    if (m === "POST" && p === "/auth/logout") { S.cookie = false; return route.fulfill({ status: 204 }) }
    if (m === "GET" && p === "/auth/me") return json(route, 200, stubs.userBody({ permissions: S.perms }))
    // the dashboard now reads today's appointments and the low-stock medicines (Phase 11): none here
    if (m === "GET" && (p === "/appointments" || p === "/medicines")) return json(route, 200, { data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } })
    if (m === "GET" && p === "/patients") return json(route, 200, { data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } })
    if (m === "GET" && p === "/settings") { check("GET /settings", settings, "SettingsResponseDto_Output", LENIENT); return json(route, 200, settings) }
    if (m === "GET" && p === "/settings/modules") { const out = modulesPayload(); check("GET /settings/modules", out, "ModuleListDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/services") return json(route, 200, { data: [], meta: { page: 1, perPage: 10, total: 0, totalPages: 1 } }) // Master Data opens on the Services tab
    if (m === "PATCH" && p === "/settings") {
      check("PATCH /settings request", body, "UpdateSettingsDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      if (S.failNext) { const f = S.failNext; S.failNext = null; return err(route, f.status, f.code, f.message) }
      if (body.expectedUpdatedAt !== settings.updatedAt) return err(route, 409, "SETTINGS_CHANGED", "Someone else saved first. Reload.")
      if (S.lockCurrency && "currencyCode" in body && body.currencyCode !== settings.currencyCode) return err(route, 422, "CURRENCY_LOCKED", "The currency cannot be changed once invoices exist.")
      if (S.lockTimezone && "timezone" in body && body.timezone !== settings.timezone) return err(route, 422, "TIMEZONE_LOCKED", "The time zone cannot be changed once visits exist.")
      for (const k of Object.keys(body)) if (k !== "expectedUpdatedAt") settings[k] = body[k] === "" ? null : body[k]
      version++; settings.updatedAt = stamp()
      check("PATCH /settings response", settings, "SettingsResponseDto_Output", LENIENT); return json(route, 200, settings)
    }
    let mm
    if ((mm = p.match(/^\/settings\/modules\/(pharmacy|lab|imaging|ipd)\/(enable|disable)$/)) && m === "POST") {
      const [, mod, act] = mm
      if (act === "disable" && mod === "ipd" && S.ipdAdmitted > 0) return err(route, 422, "MODULE_IN_USE", "Discharge all admitted patients first.", { details: { openAdmissions: S.ipdAdmitted } })
      modules[mod] = act === "enable"
      const out = { module: mod, enabled: modules[mod], enabledAt: modules[mod] ? NOW : null }; check("module state", out, "ModuleStateDto_Output", LENIENT); return json(route, 200, out)
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement this")
  }

  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", handler)
  const count = (path, method = "GET", from = 0) => requests.slice(from).filter((r) => r.method === method && r.path === path).length
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x, p, { timeout: 10000 }); await page.waitForTimeout(900) }
  const field = (label) => page.getByLabel(label, { exact: true })
  const tab = page.getByTestId("clinic-settings-tab")
  const saveBtn = () => page.getByRole("button", { name: /^Save Settings$|^Saving/ })

  // ── S1 ──
  await login()
  let i0 = requests.length
  await go("/admin/master-data")
  await page.getByRole("tab", { name: "Clinic Settings" }).click(); await tab.waitFor({ timeout: 8000 })
  ok("S1 the tab shows the loaded values (no second GET /settings: it comes from the session cache)", (await field("Clinic Name (English)").inputValue()) === "Citi Clinic" && (await field("Phone").inputValue()) === "0511111111" && count("/settings", "GET", i0) === 0, `extra GET /settings=${count("/settings", "GET", i0)}`)
  ok("S1 the hospital code is shown but cannot be edited; the Urdu name is right-to-left", (await page.getByTestId("hospital-code").innerText()) === "H1" && (await field("Clinic Name (Urdu)").getAttribute("dir")) === "rtl")
  ok("S1 Save is disabled until something changes", await saveBtn().isDisabled())

  // validation before sending
  await field("Email").fill("not-an-email")
  i0 = requests.length
  await saveBtn().click(); await page.waitForTimeout(400)
  ok("S1 a bad email is refused on the form and NOTHING is sent", (await tab.innerText()).includes("valid email") && count("/settings", "PATCH", i0) === 0)
  await field("Email").fill("")

  // diff-only PATCH, double click, re-seed
  await field("Phone").fill("0512222222")
  S.slowSave = true; i0 = requests.length
  await Promise.all([saveBtn().dblclick(), page.waitForTimeout(100)])
  await page.waitForFunction(() => /Clinic settings saved/.test(document.body.innerText), null, { timeout: 8000 })
  S.slowSave = false
  const patches = requests.slice(i0).filter((r) => r.method === "PATCH" && r.path === "/settings")
  ok("S1 a double click on Save sends ONE PATCH /settings", patches.length === 1, String(patches.length))
  ok("S1 the PATCH carries ONLY the changed field and the loaded version (expectedUpdatedAt)", patches[0] && Object.keys(patches[0].body).sort().join() === "expectedUpdatedAt,phone" && patches[0].body.phone === "0512222222" && patches[0].body.expectedUpdatedAt === "2026-11-07T10:00:01.000Z", JSON.stringify(patches[0] && patches[0].body))
  ok("S1 after the save the form shows the saved version and Save is disabled again", (await field("Phone").inputValue()) === "0512222222" && (await saveBtn().isDisabled()))

  // clearing an optional field
  await field("Clinic Name (Urdu)").fill("")
  i0 = requests.length
  await saveBtn().click(); await page.waitForFunction(() => document.querySelectorAll("[role=status]").length >= 0, null, { timeout: 3000 }); await page.waitForTimeout(900)
  const clear = requests.slice(i0).find((r) => r.method === "PATCH")
  ok("S1 clearing an optional field sends it as '' (the server clears it)", !!clear && clear.body.nameUr === "" && Object.keys(clear.body).sort().join() === "expectedUpdatedAt,nameUr", JSON.stringify(clear && clear.body))

  // conflict
  settings.tagline = "Changed elsewhere"; version++; settings.updatedAt = stamp() // someone else saved
  await field("Clinic Name (English)").fill("Citi Clinic Lahore")
  i0 = requests.length
  await saveBtn().click(); await page.getByTestId("conflict-banner").waitFor({ timeout: 8000 })
  ok("S1 409 SETTINGS_CHANGED: banner with the support reference, and what the admin typed is KEPT", (await page.getByTestId("conflict-banner").innerText()).includes("req-SETTINGS_CHANGED") && (await field("Clinic Name (English)").inputValue()) === "Citi Clinic Lahore")
  ok("S1 the conflicting save was sent once and never re-sent", count("/settings", "PATCH", i0) === 1)
  i0 = requests.length
  await page.getByRole("button", { name: /Load latest/ }).click(); await page.waitForTimeout(1200)
  ok("S1 'Load latest' reads GET /settings again, shows the other person's change and clears the banner", count("/settings", "GET", i0) === 1 && (await field("Tagline").inputValue()) === "Changed elsewhere" && (await page.getByTestId("conflict-banner").count()) === 0 && (await field("Clinic Name (English)").inputValue()) === "Citi Clinic")
  await field("Clinic Name (English)").fill("Citi Clinic Lahore")
  i0 = requests.length
  await saveBtn().click(); await page.waitForTimeout(1000)
  const again = requests.slice(i0).find((r) => r.method === "PATCH")
  ok("S1 saving again sends the NEW version (…04) and succeeds", !!again && again.body.expectedUpdatedAt === "2026-11-07T10:00:04.000Z" && settings.nameEn === "Citi Clinic Lahore", JSON.stringify(again && again.body))

  // locked currency / timezone
  S.lockCurrency = true; S.lockTimezone = true
  await field("Currency").fill("usd"); i0 = requests.length
  await saveBtn().click(); await page.getByTestId("create-error").waitFor({ timeout: 8000 })
  const curText = await tab.innerText()
  ok("S1 422 CURRENCY_LOCKED is shown on the Currency field with the support reference; the typed value stays", /cannot be changed once invoices/.test(curText) && (await page.getByTestId("support-reference").count()) === 1 && (await field("Currency").inputValue()) === "usd")
  await field("Currency").fill("PKR"); await field("Time Zone").fill("Asia/Dubai")
  await saveBtn().click(); await page.waitForTimeout(900)
  ok("S1 422 TIMEZONE_LOCKED is shown too", /time zone cannot be changed once visits exist/.test(await tab.innerText()))
  await field("Time Zone").fill("Asia/Karachi")
  ok("S1 an unknown time zone is refused on the form before sending", await (async () => { await field("Time Zone").fill("Mars/Base"); const n = count("/settings", "PATCH"); await saveBtn().click(); await page.waitForTimeout(400); const refused = count("/settings", "PATCH") === n && (await tab.innerText()).includes("time zone name"); await field("Time Zone").fill("Asia/Karachi"); return refused })())

  // a 500 is sent once
  S.lockCurrency = false; S.lockTimezone = false
  ok("S1 Discard is disabled while the form equals the saved version", await page.getByRole("button", { name: "Discard changes" }).isDisabled())
  await field("Phone").fill("0519999999")
  await page.getByRole("button", { name: "Discard changes" }).click()
  ok("S1 Discard puts the saved values back", (await field("Phone").inputValue()) === "0512222222" && (await saveBtn().isDisabled()))
  await field("Phone").fill("0513333333"); S.failNext = { status: 500, code: "INTERNAL_ERROR", message: "Something broke." }
  i0 = requests.length
  await saveBtn().click(); await page.getByTestId("create-error").waitFor({ timeout: 8000 }); await page.waitForTimeout(3500)
  ok("S1 a 500 is sent ONCE (never re-sent) and shows the support reference; the form keeps what was typed", count("/settings", "PATCH", i0) === 1 && (await page.getByTestId("support-reference").count()) === 1 && (await field("Phone").inputValue()) === "0513333333")
  await saveBtn().click(); await page.waitForTimeout(1000)
  ok("S1 the admin's own retry then succeeds (exactly one more PATCH)", count("/settings", "PATCH", i0) === 2 && settings.phone === "0513333333")

  // ── S2 ──
  const row = (m) => page.getByTestId(`module-row-${m}`)
  ok("S2 four departments are listed with their current state from GET /settings/modules", (await page.getByTestId("module-switches").locator("[role=switch]").count()) === 4 && (await row("pharmacy").getByRole("switch").getAttribute("aria-checked")) === "true")
  ok("S2 the sidebar shows Pharmacy Inventory while pharmacy is on", (await page.locator("aside, nav").first().innerText()).includes("Pharmacy Inventory"))
  i0 = requests.length
  await row("pharmacy").getByRole("switch").click(); await page.waitForTimeout(1200)
  ok("S2 switching pharmacy off calls POST /settings/modules/pharmacy/disable, the switch shows off", requests.slice(i0).some((r) => r.method === "POST" && r.path === "/settings/modules/pharmacy/disable") && (await row("pharmacy").getByRole("switch").getAttribute("aria-checked")) === "false")
  ok("S2 the menu follows at once (Pharmacy Inventory is gone) without a page reload", !(await page.locator("aside, nav").first().innerText()).includes("Pharmacy Inventory"))
  i0 = requests.length
  await row("ipd").getByRole("switch").click(); await page.getByTestId("module-error").waitFor({ timeout: 8000 })
  ok("S2 422 MODULE_IN_USE says how many patients are admitted and the switch stays ON", /3 patients are still admitted/.test(await page.getByTestId("module-error").innerText()) && (await row("ipd").getByRole("switch").getAttribute("aria-checked")) === "true" && (await page.getByTestId("support-reference").count()) >= 1)
  ok("S2 the refused switch-off was sent once", count("/settings/modules/ipd/disable", "POST", i0) === 1)
  i0 = requests.length
  await row("pharmacy").getByRole("switch").click(); await page.waitForTimeout(1200)
  ok("S2 switching pharmacy back on calls .../enable and the menu returns", requests.slice(i0).some((r) => r.path === "/settings/modules/pharmacy/enable") && (await page.locator("aside, nav").first().innerText()).includes("Pharmacy Inventory"))

  // ── a user without settings.write ──
  S.perms = ["patients.read", "catalogs.read", "settings.read", "encounters.read", "doctors.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); await go("/admin/master-data")
  ok("S1 a user without settings.write does not get the Clinic Settings tab", (await page.getByRole("tab", { name: "Clinic Settings" }).count()) === 0 && (await page.getByRole("tab", { name: /Panels/ }).count()) === 1)

  ok("every request/response the fake backend handled matches docs/openapi.json", violations.length === 0, violations.slice(0, 4).join(" || "))
  const known = ["/services", "/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/settings", "/settings/modules", "/public/hospital", "/patients", "/appointments", "/medicines", "/dashboard", "/reports/cash-flow"]
  const unexpected = requests.filter((r) => !known.includes(r.path) && !r.path.startsWith("/settings/modules/"))
  ok("no request reached a route the test backend does not implement", unexpected.length === 0, unexpected.map((r) => r.method + " " + r.path).join(", "))
  ok("no DELETE was ever sent", !requests.some((r) => r.method === "DELETE"))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (401|404|409|422|500)/.test(e))
  ok("no browser console/page errors other than the deliberate 409 / 422 / 500 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
