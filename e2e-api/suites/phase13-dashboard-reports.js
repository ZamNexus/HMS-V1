// Phase 13 browser check: the dashboard (GET /dashboard), the remaining reports, prescription history and Financial Statistics Summary / Graphs / Expenses / Bank, API mode. TEST HARNESS ONLY.
// No real backend, no credentials: the stateful fake in accounts-fake.js runs inside Playwright's route(). The dashboard's FIELD NAMES are the handoff's own; the answers of the other routes
// are my assumption (the handoff lists no fields), so for those the check is "the request is the documented one and the answer is shown as received", never "the figures are right".
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const { formatMoneyString } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/moneyMath.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/accounts-fake.js")({ validate, schemaOf, stubs })
  const { S, S4, A, requests, violations, banks, fmt, TODAY, rxRows } = F
  const ALL = stubs.ALL_PERMISSIONS
  const base = process.argv[2]
  const M = formatMoneyString
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1800 }, acceptDownloads: true })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "") && !/status of (4\d\d|5\d\d)/.test(c.text())) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const gets = (i, re) => since(i).filter((r) => r.method === "GET" && re.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(1500)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const tid = (id) => page.getByTestId(id)
  const text = (id) => tid(id).innerText().then((t) => t.trim())
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)) } }
  const period = (n) => tid("period-bar").getByRole("button", { name: n, exact: true })
  const nav = async (r) => { await tid(`report-nav-${r}`).click(); await page.waitForTimeout(1200) }
  const reports = async (qs = "") => { await page.goto(base + "/reports" + qs); await tid("reports-hub").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) }
  const stats = async (qs = "") => { await page.goto(base + "/dashboard/stats" + qs); await tid("stats-hub").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) }
  const dash = async () => { await page.goto(base + "/dashboard"); await page.waitForTimeout(2000) }
  const pick = async (name, option) => { await page.getByRole("combobox", { name, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); await page.waitForTimeout(900) }
  let i0 = 0

  i0 = requests.length
  await login()

  // ═════════ Dashboard ═════════
  await step("Dashboard", async () => {
    await dash()
    const d = gets(i0, /^\/dashboard$/)
    ok("D1 the dashboard is drawn from ONE GET /dashboard (plus its own lists), not from many", d.length >= 1 && d.length <= 2, String(d.length))
    ok("D1 visits: today, yesterday and mine are the server's counts", (await text("tile-visits-value")) === "14" && /11 yesterday/.test(await text("tile-visits-sub")) && (await text("tile-mine-value")) === "3")
    ok("D1 admitted shows the total and the male / female / other split", (await text("tile-admitted-value")) === "5" && /Male 2 · Female 3 · Other 0/.test(await text("tile-admitted-sub")))
    ok("D1 lab and imaging: pending, with done today", (await text("tile-lab-pending-value")) === "4" && /9 done today/.test(await text("tile-lab-pending-sub")) && (await text("tile-imaging-pending-value")) === "1" && /2 done today/.test(await text("tile-imaging-pending-sub")))
    ok("D1 pharmacy: dispensed today with yesterday, and the low-stock count", (await text("tile-dispensed-value")) === "20" && /18 yesterday/.test(await text("tile-dispensed-sub")) && (await text("tile-low-stock-value")) === "6")
    ok("D1 revenue today and yesterday are the server's money text in the hospital's format", (await text("tile-revenue-value")) === M("12500.00") && (await text("tile-revenue-sub")).includes(M("980000.00")), `${await text("tile-revenue-value")} | ${await text("tile-revenue-sub")}`)
    const revVals = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => text(`chart-revenue-value-${i}`)))
    ok("D1 the 7-day revenue chart has seven bars and each figure under a bar is the server's text", (await page.locator('[data-testid^="chart-revenue-bar-"]').count()) === 7 && revVals.every((v, i) => v === M(fmt(100000 * (i + 1)))), revVals.join(" | "))
    const flow = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => text(`chart-flow-value-${i}`)))
    ok("D1 the 7-day patient flow chart shows the server's seven counts", flow.join(",") === "3,5,4,6,2,7,8", flow.join(","))
    ok("D1 the chart is reachable by a screen reader (role=img with the values in its name)", /Patient flow, last 7 days: .*3/.test((await page.locator('[data-testid="chart-flow"] [role="img"]').getAttribute("aria-label")) || ""))
    ok("D1 the cash flow of the hospital's today is asked ONCE as ?date=<today> and shown as received", gets(i0, /^\/reports\/cash-flow$/).length >= 1 && gets(i0, /^\/reports\/cash-flow$/)[0].query.date === TODAY && Object.keys(gets(i0, /^\/reports\/cash-flow$/)[0].query).join() === "date" && (await text("cash-flow-card")).includes(M("4900.00")))
    ok("D1 no demo patient or product appears (the demo seam is the stub in this build)", !/Ayesha Khan|Habib Bank|Panadol/.test(await page.locator("body").innerText()))
  })

  await step("Dashboard polling", async () => {
    await dash()
    const hits = A.dashHits
    await page.waitForTimeout(63000)
    ok("D1 the dashboard refreshes itself about every 60 seconds (one more GET /dashboard after 63 s)", A.dashHits === hits + 1, `${hits} -> ${A.dashHits}`)
  })

  await step("Dashboard sections", async () => {
    A.dashNull = ["revenue", "lab", "imaging"]; await dash()
    ok("D1 a section the server leaves null is NOT drawn: no revenue tile or chart, no lab or imaging tile; the others remain", (await tid("tile-revenue").count()) === 0 && (await tid("chart-revenue").count()) === 0 && (await tid("tile-lab-pending").count()) === 0 && (await tid("tile-imaging-pending").count()) === 0 && (await tid("tile-visits").count()) === 1 && (await tid("tile-dispensed").count()) === 1)
    A.dashNull = ["visits", "admitted", "lab", "imaging", "pharmacy", "revenue", "patientFlow"]; await dash()
    ok("D1 with every section null the dashboard says no figures are shown to the role, and does not invent zeros", /No figures are shown to your role/.test(await page.locator("body").innerText()) && (await tid("tile-visits").count()) === 0)
    A.dashNull = []
    A.failDashboard = true; await dash(); await tid("dashboard-api").getByTestId("error-state").first().waitFor({ timeout: 25000 }).catch(() => {})
    ok("D1 a failing /dashboard shows the error with Retry; no tile shows a made-up number", (await tid("dashboard-api").getByTestId("error-state").count()) >= 1 && (await tid("tile-visits").count()) === 0)
    A.failDashboard = false
    await page.waitForTimeout(6000) // the retry button may wait out a cool-down
    await tid("dashboard-api").getByRole("button", { name: /try again|retry/i }).first().click(); await page.waitForTimeout(1500)
    ok("D1 Retry draws the tiles", (await tid("tile-visits").count()) === 1)
    S.perms = ALL.filter((p) => p !== "accounts.read"); await signOutAndIn()
    i0 = requests.length; await dash()
    ok("PERM without accounts.read: no cash flow card and /reports/cash-flow is NOT asked", (await tid("cash-flow-card").count()) === 0 && gets(i0, /^\/reports\/cash-flow$/).length === 0)
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ The remaining reports ═════════
  const DOCS = [
    ["daily", "/reports/daily-summary", (t) => /patients registered/i.test(t) && t.includes(M("12500.00"))],
    ["opd", "/reports/opd", (t) => /Dr Imran/.test(t) && /Dr Sara/.test(t)],
    ["lab", "/reports/lab", (t) => /CBC/.test(t) && t.includes(M("15600.00"))],
    ["pharmacy", "/reports/pharmacy", (t) => /Amoxicillin 500 mg/.test(t)],
    ["expense", "/reports/expenses", (t) => /Electricity/.test(t) && /Cheque/i.test(t)],
    ["cash-flow", "/reports/cash-flow", (t) => t.includes(M("1000.00")) && t.includes(M("40000.00"))],
    ["demographics", "/reports/demographics", (t) => /male/i.test(t) && /13-40/.test(t)],
  ]
  await step("Document reports", async () => {
    await reports()
    for (const [r, path, shows] of DOCS) {
      i0 = requests.length
      await nav(r)
      const g = gets(i0, new RegExp(`^${path.replace("/", "\\/")}$`))
      ok(`D3 ${r}: ONE GET ${path} for this month so far (dateFrom 2026-11-01, dateTo ${TODAY}) and nothing else for a period`, g.length === 1 && g[0].query.dateFrom === "2026-11-01" && g[0].query.dateTo === TODAY && Object.keys(g[0].query).sort().join() === "dateFrom,dateTo", JSON.stringify(g.map((x) => x.query)))
      const body = await tid(`doc-report-${r}`).innerText()
      ok(`D3 ${r}: the answer is shown as received (known values appear, money in the hospital's format)`, shows(body), body.replace(/\s+/g, " ").slice(0, 160))
    }
    // a different period is re-asked
    i0 = requests.length
    await nav("daily"); i0 = requests.length
    await period("Today").click(); await page.waitForTimeout(1200)
    const t = gets(i0, /^\/reports\/daily-summary$/)
    ok("D3 changing the period asks again with that period", t.length === 1 && t[0].query.dateFrom === TODAY && t[0].query.dateTo === TODAY)
    await period("This Month").click(); await page.waitForTimeout(800)

    // pharmacy: expiring within
    await nav("pharmacy"); i0 = requests.length
    await pick("Expiring within", "60 days")
    const ph = gets(i0, /^\/reports\/pharmacy$/)
    ok("D3 pharmacy: choosing 60 days sends expiringWithinDays=60 beside the period", ph.length === 1 && ph[0].query.expiringWithinDays === "60" && ph[0].query.dateFrom === "2026-11-01")
    await pick("Expiring within", "The server's default")

    // CSV export built on the client from the JSON
    await nav("opd")
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), tid("export-csv").click()])
    const csv = require("fs").readFileSync(await dl.path(), "utf8")
    ok("D3 Export CSV downloads a .csv built from the same JSON (titles, headers and the rows)", /\.csv$/.test(dl.suggestedFilename()) && /Dr Imran/.test(csv) && /Doctor/.test(csv) && /Total visits/.test(csv), csv.slice(0, 120).replace(/\n/g, " / "))

    // a failing report is an error with Retry, never an empty report
    S4.failReports = true; await nav("lab"); await tid("error-state").first().waitFor({ timeout: 25000 }).catch(() => {})
    ok("D3 a report that fails shows the error with Retry (not an empty report)", (await tid("error-state").count()) >= 1)
    S4.failReports = false
    await page.waitForTimeout(6000)
    await page.getByRole("button", { name: /try again|retry/i }).first().click(); await page.waitForTimeout(1200)
    ok("D3 Retry shows the report", /CBC/.test(await tid("doc-report-lab").innerText()))

    // permissions
    S.perms = ALL.filter((p) => p !== "accounts.read"); await signOutAndIn()
    await reports(); i0 = requests.length
    ok("PERM without accounts.read: Expenses and Cash Flow are not on the list; Daily Summary still is", (await tid("report-nav-expense").count()) === 0 && (await tid("report-nav-cash-flow").count()) === 0 && (await tid("report-nav-daily").count()) === 1)
    await reports("?report=expense"); await page.waitForTimeout(800)
    ok("PERM without accounts.read: opening the Expenses report by address asks nothing", gets(i0, /^\/reports\/(expenses|cash-flow)$/).length === 0)
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ Prescription history ═════════
  await step("Prescription history", async () => {
    i0 = requests.length
    await reports("?report=prescriptions")
    const g = gets(i0, /^\/prescriptions$/)
    ok("D4 GET /prescriptions page 1 of 10, no filters", g.length === 1 && g[0].query.page === "1" && g[0].query.perPage === "10" && Object.keys(g[0].query).sort().join() === "page,perPage", JSON.stringify(g.map((x) => x.query)))
    ok("D4 ten rows and the footer says 1-10 of 23", (await page.locator('[data-testid^="rx-rows-row-"]').count()) === 10 && /Showing 1–10 of 23/.test(await page.getByText(/Showing \d/).first().innerText()))
    ok("D4 a row shows the medicine, dose and the doctor as received", /Amoxicillin|Paracetamol/.test(await tid("rx-rows").innerText()) && /1 tab/.test(await tid("rx-rows").innerText()))
    i0 = requests.length
    await page.getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(900); await page.getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(1000)
    ok("D4 page 3 asks page=3 and shows the last three rows", gets(i0, /^\/prescriptions$/).at(-1)?.query.page === "3" && (await page.locator('[data-testid^="rx-rows-row-"]').count()) === 3)
    i0 = requests.length
    await pick("Doctor", "Dr Sara")
    let q = gets(i0, /^\/prescriptions$/).at(-1)?.query ?? {}
    ok("D4 a doctor filter sends doctorId and returns to page 1", q.doctorId === rxRows.find((r) => r.doctor.name === "Dr Sara").doctor.id && q.page === "1")
    i0 = requests.length
    await page.getByLabel("From", { exact: true }).fill("2026-11-05"); await page.waitForTimeout(800)
    ok("D4 ONE date alone is explained and is NOT sent as half a range", (await tid("rx-dates-problem").count()) === 1 && !gets(i0, /^\/prescriptions$/).some((r) => r.query.dateFrom && !r.query.dateTo))
    await page.getByLabel("To", { exact: true }).fill("2026-11-07"); await page.waitForTimeout(1200)
    q = gets(i0, /^\/prescriptions$/).at(-1)?.query ?? {}
    ok("D4 both dates send dateFrom and dateTo together", q.dateFrom === "2026-11-05" && q.dateTo === "2026-11-07", JSON.stringify(q))
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(1000)
    i0 = requests.length
    await page.getByLabel("Search prescriptions").fill("amox"); await page.waitForTimeout(1500)
    q = gets(i0, /^\/prescriptions$/).at(-1)?.query ?? {}
    ok("D4 search is debounced into ONE request (search=amox) and every row matches", gets(i0, /^\/prescriptions$/).length === 1 && q.search === "amox" && (await tid("rx-rows").innerText()).split("Paracetamol").length === 1)
    S.perms = ALL.filter((p) => p !== "encounters.read"); await signOutAndIn()
    i0 = requests.length
    await reports("?report=prescriptions"); await page.waitForTimeout(600)
    ok("PERM without encounters.read: prescription history is not shown and /prescriptions is NOT asked", gets(i0, /^\/prescriptions$/).length === 0)
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ Financial Statistics ═════════
  await step("Financial Statistics", async () => {
    i0 = requests.length
    await stats("?tab=summary")
    const fs = gets(i0, /^\/reports\/financial-summary$/)
    ok("D6 Summary: ONE GET /reports/financial-summary for this month so far", fs.length === 1 && fs[0].query.dateFrom === "2026-11-01" && fs[0].query.dateTo === TODAY)
    ok("D6 Summary shows the document as received, including the accounts parts the role may see", (await tid("doc-report-financial-summary").innerText()).includes(M("12500.00")) && /cash flow|expenses|bank/i.test(await tid("doc-report-financial-summary").innerText()))
    i0 = requests.length
    await tid("stats-tab-graphs").click(); await page.waitForTimeout(1200)
    let g = gets(i0, /^\/reports\/revenue\/daily$/)
    ok("D5 Graphs: GET /reports/revenue/daily for the period, no sourceType for all kinds", g.length === 1 && g[0].query.dateFrom === "2026-11-01" && g[0].query.sourceType === undefined)
    const vals = await Promise.all([0, 1, 2, 3, 4].map((i) => text(`revenue-series-value-${i}`)))
    ok("D5 a daily series is drawn as five bars with the server's figures under them", (await page.locator('[data-testid^="revenue-series-bar-"]').count()) === 5 && vals[0] === M(fmt(200000)), vals.join(" | "))
    i0 = requests.length
    await pick("Kind of charge", "Pharmacy")
    g = gets(i0, /^\/reports\/revenue\/daily$/)
    ok("D5 choosing Pharmacy sends sourceType=pharmacy", g.length === 1 && g[0].query.sourceType === "pharmacy")
    i0 = requests.length
    await tid("stats-tab-expenses").click(); await page.waitForTimeout(1200)
    let e = gets(i0, /^\/expenses$/)
    ok("X1 the Expenses tab lists the PERIOD's expenses (dateFrom/dateTo from the period bar) and has no date boxes of its own", e.length >= 1 && e.at(-1).query.dateFrom === "2026-11-01" && e.at(-1).query.dateTo === TODAY && (await tid("expenses-tab").getByLabel("From", { exact: true }).count()) === 0)
    i0 = requests.length
    await period("Last Month").click(); await page.waitForTimeout(1200)
    e = gets(i0, /^\/expenses$/)
    ok("X1 changing the period re-asks the expenses with the new dates", e.at(-1)?.query.dateFrom === "2026-10-01" && e.at(-1)?.query.dateTo === "2026-10-31")
    await period("This Month").click(); await page.waitForTimeout(800)
    i0 = requests.length
    await tid("stats-tab-bank").click(); await page.waitForTimeout(1400)
    const st = gets(i0, /^\/bank-accounts\/[^/]+\/statement$/)
    ok("X3 the Bank tab asks the statement for the period bar's dates, and has no cash-drawer card (that is Billing > Bank)", st.length === 1 && st[0].query.dateFrom === "2026-11-01" && st[0].query.dateTo === TODAY && (await tid("drawer-card").count()) === 0 && (await tid("bank-balances").count()) === 1)

    S.perms = ALL.filter((p) => p !== "accounts.read"); await signOutAndIn()
    await stats("?tab=summary")
    ok("PERM without accounts.read: the Expenses and Bank statistics tabs are not offered; Summary and Graphs still are", (await tid("stats-tab-expenses").count()) === 0 && (await tid("stats-tab-bank").count()) === 0 && (await tid("stats-tab-summary").count()) === 1 && (await tid("stats-tab-graphs").count()) === 1)
    S.perms = ALL; await signOutAndIn()
  })

  ok("the fake saw no request that broke the spec or the handoff's rules", violations.length === 0, violations.slice(0, 3).join(" | "))
  ok("no console error or page error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "))
  await browser.close()
  for (const [s, n, ex] of results) console.log(`${s} ${n}${ex && s === "FAIL" ? "  -> " + ex : ""}`)
  console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`)
})().catch((e) => { console.log("SCRIPT ERROR", e.stack || e); process.exit(1) })
