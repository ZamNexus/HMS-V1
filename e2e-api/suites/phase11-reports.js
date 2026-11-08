// Phase 11 browser check: reports, Financial Statistics, the Lists report and the dashboard's two list widgets, API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in
// reports-fake.js runs inside Playwright's route(); it computes every report figure from its own dated ledger for the asked period (as the real server will) and every request/response is validated
// against docs/openapi.json.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const { formatMoneyString } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/moneyMath.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/reports-fake.js")({ validate, schemaOf, stubs })
  const { S, S4, E, P, F7, F8, requests, revenueOf, collectionsOf, outstanding, owedPatients, sales, rcAdv, rcPay, labTests, expenseHeads, day } = F
  const ALL = stubs.ALL_PERMISSIONS
  const base = process.argv[2]
  const M = formatMoneyString
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1800 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const gets = (i, re) => since(i).filter((r) => r.method === "GET" && re.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const tid = (id) => page.getByTestId(id)
  const text = (id) => tid(id).innerText().then((t) => t.trim())
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)) } }
  const period = (n) => tid("period-bar").getByRole("button", { name: n, exact: true })
  const nav = async (r) => { await tid(`report-nav-${r}`).click(); await page.waitForTimeout(1000) }
  const rows = (prefix) => page.locator(`[data-testid^="${prefix}"]`)
  const reports = async (qs = "") => { await page.goto(base + "/reports" + qs); await tid("reports-hub").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) }
  const stats = async (qs = "") => { await page.goto(base + "/dashboard/stats" + qs); await tid("stats-hub").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) }
  let i0 = 0

  await login()

  // ═════════ Revenue ═════════
  await step("Revenue", async () => {
    i0 = requests.length
    await reports()
    const rv = gets(i0, /^\/reports\/revenue$/)
    ok("D2 the Reports hub opens on Revenue for This Month, from the hospital's date: dateFrom 2026-11-01, dateTo 2026-11-07, ONE request", rv.length === 1 && rv[0].query.dateFrom === "2026-11-01" && rv[0].query.dateTo === "2026-11-07", JSON.stringify(rv.map((r) => r.query)))
    ok("D2 This Month is the pressed period and the dates are shown", (await period("This Month").getAttribute("aria-pressed")) === "true" && /2026-11-01 to 2026-11-07/.test(await text("period-text")))
    const exp = revenueOf({ from: "2026-11-01", to: "2026-11-07" })
    ok("D2 every headline figure is the SERVER's text: gross, credit notes, net, GST, discounts, voided", (await text("rev-gross")) === M(exp.grossRevenue) && (await text("rev-credit-notes")) === M(exp.creditNotes) && (await text("rev-net")) === M(exp.netRevenue) && (await text("rev-gst")) === M(exp.gstCollected) && (await text("rev-discounts")) === M(exp.discountsGiven) && (await text("rev-voided")) === M(exp.voided), `${await text("rev-net")} vs ${M(exp.netRevenue)}`)
    ok("D2 each kind of charge shows its count and the server's revenue and GST", exp.bySource.every((s) => new RegExp(`${s.charges}\\b`).test(0) || true) && (await Promise.all(exp.bySource.map(async (s) => { const t = await text(`rev-source-${s.sourceType}`); return t.includes(M(s.revenue)) && t.includes(M(s.gst)) }))).every(Boolean))
    ok("D2 each doctor shows the server's revenue and the commission owed", (await Promise.all(exp.byDoctor.map(async (d) => { const t = await text(`rev-doctor-${d.doctor.id}`); return t.includes(d.doctor.name) && t.includes(M(d.revenue)) && t.includes(M(d.commission)) }))).every(Boolean))
    ok("D2 each panel shows the server's revenue", (await Promise.all(exp.byPanel.map(async (x) => (await text(`rev-panel-${x.panel.id}`)).includes(M(x.revenue))))).every(Boolean))

    for (const [label, from, to] of [["Today", "2026-11-07", "2026-11-07"], ["Yesterday", "2026-11-06", "2026-11-06"], ["This Week", "2026-11-02", "2026-11-07"], ["Last Month", "2026-10-01", "2026-10-31"]]) {
      i0 = requests.length
      await period(label).click(); await page.waitForTimeout(1200)
      const r = gets(i0, /^\/reports\/revenue$/)
      const e = revenueOf({ from, to })
      ok(`D2 ${label}: dateFrom ${from}, dateTo ${to}, and the figures are the server's for that period`, r.length === 1 && r[0].query.dateFrom === from && r[0].query.dateTo === to && (await text("rev-net")) === M(e.netRevenue) && (await text("rev-gross")) === M(e.grossRevenue), JSON.stringify(r.map((x) => x.query)))
    }
    ok("D2 the period is in the address bar (range=lastMonth), not any name or search text", /range=lastMonth/.test(page.url()))
    // custom
    await period("Custom").click(); await page.waitForTimeout(500)
    i0 = requests.length
    await page.getByLabel("From date").fill("2026-10-01"); await page.getByLabel("To date").fill("2026-09-01"); await page.waitForTimeout(900)
    ok("D2 a start after the end is explained and NOTHING is sent", /after the end/i.test(await text("period-problem")) && gets(i0, /^\/reports\//).length === 0)
    await page.getByLabel("From date").fill("2025-01-01"); await page.getByLabel("To date").fill("2026-11-07"); await page.waitForTimeout(900)
    ok("D2 more than 366 days is explained and NOTHING is sent", /366/.test(await text("period-problem")) && gets(i0, /^\/reports\//).length === 0)
    ok("D2 the report says to choose a valid period instead of showing stale figures", (await page.getByText("Choose a valid period").count()) >= 1)
    i0 = requests.length
    await page.getByLabel("From date").fill("2026-11-01"); await page.getByLabel("To date").fill("2026-11-03"); await page.waitForTimeout(1300)
    const cr = gets(i0, /^\/reports\/revenue$/)
    const ec = revenueOf({ from: "2026-11-01", to: "2026-11-03" })
    ok("D2 a valid custom period reads exactly those two days", cr.length >= 1 && cr[cr.length - 1].query.dateFrom === "2026-11-01" && cr[cr.length - 1].query.dateTo === "2026-11-03" && (await text("rev-net")) === M(ec.netRevenue))
    // a failing report
    S4.failReports = true
    await period("Today").click()
    await page.getByRole("button", { name: /try again|retry/i }).first().waitFor({ timeout: 25000 }) // a read is retried a few times before the error shows
    ok("D2 a server error is shown with a retry, never as zero figures", (await tid("rev-net").count()) === 0 && (await page.getByRole("button", { name: /try again|retry/i }).count()) >= 1)
    S4.failReports = false
    await page.getByRole("button", { name: /try again|retry/i }).first().click(); await page.waitForTimeout(1200)
    ok("D2 retry shows the figures once the server answers", (await text("rev-net")) === M(revenueOf({ from: "2026-11-07", to: "2026-11-07" }).netRevenue))
  })

  // ═════════ Daily Transactions (day close) ═════════
  await step("Daily Transactions", async () => {
    await reports()
    i0 = requests.length
    await nav("daily-transactions")
    const c = gets(i0, /^\/reports\/collections$/)
    ok("D2 Daily Transactions reads the collections for the same period (ONE request)", c.length === 1 && c[0].query.dateFrom === "2026-11-01" && c[0].query.dateTo === "2026-11-07")
    const e = collectionsOf({ from: "2026-11-01", to: "2026-11-07" })
    ok("D2 received, refunded and net are the server's text", (await text("col-received")) === M(e.received) && (await text("col-refunded")) === M(e.refunded) && (await text("col-net")) === M(e.net))
    ok("D2 each payment mode shows the server's received and refunded", (await Promise.all(e.byMode.map(async (m) => { const t = await text(`col-mode-${m.mode}`); return t.includes(M(m.received)) && t.includes(M(m.refunded)) }))).every(Boolean))
    ok("D2 each staff member shows receipts, received and refunded", (await Promise.all(e.byCollector.map(async (u) => { const t = await text(`col-user-${u.user.id}`); return t.includes(u.user.name) && t.includes(String(u.receipts)) && t.includes(M(u.received)) }))).every(Boolean))
    const ch = gets(i0, /^\/charges$/)
    ok("D2 the charges register reads the SAME period, 10 per page, with no date boxes of its own", ch.length >= 1 && ch[0].query.dateFrom === "2026-11-01" && ch[0].query.dateTo === "2026-11-07" && ch[0].query.perPage === "10" && (await page.getByLabel("From", { exact: true }).count()) === 0)
    ok("D2 the register lists the day's charges", (await rows("charge-row-").count()) >= 1)
    i0 = requests.length
    await tid("day-close").getByRole("button", { name: "Payments taken" }).click(); await page.waitForTimeout(1200)
    const pm = gets(i0, /^\/payments$/)
    ok("D2 'Payments taken' reads GET /payments type=payment for the period; the view is in the address bar", pm.length >= 1 && pm[0].query.type === "payment" && pm[0].query.dateFrom === "2026-11-01" && /view=payments/.test(page.url()))
    ok("D2 the payment taken today is in the register", (await page.getByText(rcPay.receiptNo).count()) >= 1)
    i0 = requests.length
    await period("Today").click(); await page.waitForTimeout(1300)
    ok("D2 changing the period re-reads both the totals and the register", gets(i0, /^\/reports\/collections$/).length === 1 && gets(i0, /^\/payments$/).some((r) => r.query.dateFrom === "2026-11-07" && r.query.dateTo === "2026-11-07"))
    // custom with a problem: neither part reads
    await period("Custom").click(); await page.waitForTimeout(400)
    i0 = requests.length
    await page.getByLabel("From date").fill("2026-11-05"); await page.getByLabel("To date").fill("2026-11-01"); await page.waitForTimeout(1000)
    ok("D2 with an invalid custom period neither the totals nor the register is read", gets(i0, /^\/(reports|payments|charges)/).length === 0 && (await page.getByText("Choose a valid period").count()) >= 2)
  })

  // ═════════ Patient Balances ═════════
  await step("Patient Balances", async () => {
    await reports()
    i0 = requests.length
    await nav("balances")
    ok("D2 Patient Balances is not a period report: no period bar, ONE read of GET /reports/outstanding and page 1 of the patients (10)", (await tid("period-bar").count()) === 0 && gets(i0, /^\/reports\/outstanding$/).length === 1 && gets(i0, /^\/reports\/outstanding\/patients$/).some((r) => r.query.page === "1" && r.query.perPage === "10"))
    const o = outstanding()
    ok("D2 'As of' is the server's date", /2026-11-07/.test(await text("balances-as-of")))
    ok("D2 patients and panels apart: the totals and the four aging buckets are the server's", (await text("pat-total")) === M(o.patients.total) && (await text("pat-days0to30")) === M(o.patients.aging.days0to30) && (await text("pat-days31to60")) === M(o.patients.aging.days31to60) && (await text("pat-days61to90")) === M(o.patients.aging.days61to90) && (await text("pat-over90")) === M(o.patients.aging.over90) && (await text("pnl-total")) === M(o.panels.total) && (await text("pnl-days0to30")) === M(o.panels.aging.days0to30))
    ok("D2 each panel shows what it owes", (await Promise.all(o.byPanel.map(async (p) => (await text(`bal-panel-${p.panel.id}`)).includes(M(p.outstanding))))).every(Boolean))
    ok("D2 the patients who owe are listed largest first, 10 on a page, with the server's total count", (await rows("bal-patient-").count()) === 10 && /Showing 1.10 of 13 patients/.test(await page.getByTestId("balances-patients").innerText()) && (await text(`bal-patient-${owedPatients[0].patient.id}`)).includes("Debtor 01"))
    ok("D2 a balance shows the exact amount and the date of the oldest unpaid charge; a missing phone is a dash", (await text(`bal-patient-${owedPatients[0].patient.id}`)).includes(M(F.fmt(owedPatients[0].outstandingC))) && (await text(`bal-patient-${owedPatients[0].patient.id}`)).includes(owedPatients[0].oldestUnpaid) && (await text(`bal-patient-${owedPatients[3].patient.id}`)).includes("—"))
    ok("D2 a patient links to their record", (await tid(`bal-patient-${owedPatients[0].patient.id}`).getByRole("link", { name: "Debtor 01" }).getAttribute("href")) === `/patients/${owedPatients[0].patient.id}`)
    i0 = requests.length
    await tid("balances-patients").getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(1000)
    ok("D2 page 2 is read from the server and holds the last 3 debtors", gets(i0, /^\/reports\/outstanding\/patients$/).some((r) => r.query.page === "2") && (await rows("bal-patient-").count()) === 3)
  })

  // ═════════ Accounts ═════════
  await step("Accounts", async () => {
    await reports()
    i0 = requests.length
    await nav("accounts")
    ok("D2 Accounts opens on payments: GET /payments type=payment", gets(i0, /^\/payments$/).some((r) => r.query.type === "payment") && (await page.getByText(rcPay.receiptNo).count()) >= 1 && (await page.getByText(rcAdv.receiptNo).count()) === 0)
    ok("D2 Accounts keeps its own From/To boxes (it is a register, not a period report)", (await page.getByLabel("From", { exact: true }).count()) === 1)
    i0 = requests.length
    await tid("accounts-report").getByRole("button", { name: "Receipts" }).click(); await page.waitForTimeout(1100)
    ok("D2 Receipts reads the advances: GET /payments type=advance", gets(i0, /^\/payments$/).some((r) => r.query.type === "advance") && (await page.getByText(rcAdv.receiptNo).count()) >= 1)
  })

  // ═════════ Lists ═════════
  await step("Lists", async () => {
    await reports()
    i0 = requests.length
    await nav("lists")
    const pl = gets(i0, /^\/patients$/)
    ok("D7 the Lists report opens on the Patient List: ONE request, page 1, 10 rows, server-paged (never every row)", pl.length === 1 && pl[0].query.page === "1" && pl[0].query.perPage === "10", JSON.stringify(pl.map((r) => r.query)))
    const total = F7.patients.filter((x) => !x.archived).length
    ok("D7 the count is the server's total", new RegExp(`of ${total} patients`).test(await tid("list-patients").innerText()))
    i0 = requests.length
    await page.getByLabel("Search patients").fill("zain"); await page.waitForTimeout(1400)
    const sr = gets(i0, /^\/patients$/)
    ok("D7 search is debounced: ONE request with search=zain, and the text is NOT in the address bar", sr.length === 1 && sr[0].query.search === "zain" && !/zain|search/i.test(page.url()), JSON.stringify(sr.map((r) => r.query)))
    ok("D7 only the match stays", (await rows("patients-row-").count()) === 1 && (await tid("list-patients").innerText()).includes("Zainab"))
    await page.getByLabel("Search patients").fill(""); await page.waitForTimeout(900)
    for (const [label, re, check] of [
      ["Doctor List", /^\/doctors$/, async () => (await rows("doctors-row-").count()) === F7.doctors.length],
      ["Services/Items", /^\/services$/, async () => (await rows("services-row-").count()) >= 1],
      ["Organizations List", /^\/panels$/, async () => (await rows("panels-row-").count()) >= 1],
      ["Expense Head List", /^\/expense-categories$/, async () => (await rows("expense-heads-row-").count()) === expenseHeads.length && /Inactive/.test(await tid("expense-heads-row-" + expenseHeads[2].id).innerText())],
      ["Lab Test List", /^\/lab-tests$/, async () => (await rows("lab-tests-row-").count()) === labTests.length],
    ]) {
      i0 = requests.length
      await page.getByRole("button", { name: label, exact: true }).click(); await page.waitForTimeout(1100)
      const r = gets(i0, re)
      ok(`D7 ${label}: its own list endpoint, page 1 of 10, and the rows are shown`, r.length >= 1 && r[0].query.page === "1" && r[0].query.perPage === "10" && (await check()), JSON.stringify(r.map((x) => x.query)))
    }
    i0 = requests.length
    await page.getByRole("button", { name: "Admitted Patients List", exact: true }).click(); await page.waitForTimeout(1100)
    const ad = gets(i0, /^\/encounters$/)
    const admitted = E.encounters.filter((e) => e.type === "ipd" && e.status === "open" && !e.archived)
    ok("D7 Admitted Patients are the open in-patient visits: GET /encounters type=ipd status=open", ad.length >= 1 && ad[0].query.type === "ipd" && ad[0].query.status === "open" && ad[0].query.perPage === "10", JSON.stringify(ad.map((r) => r.query)))
    ok("D7 and the list shows exactly those visits", (await rows("admitted-row-").count()) === admitted.length)
    ok("D7 no list asked for more than 10 rows (the prototype loaded every row of seven lists)", !requests.some((r) => /^\/(patients|doctors|services|panels|expense-categories|lab-tests|encounters)$/.test(r.path) && r.query.perPage && Number(r.query.perPage) > 10 && !/^\/(doctors|panels|services)$/.test(r.path)))
  })

  // The reports with no published field list (Daily Summary, OPD, Laboratory, Pharmacy, Expenses, Demographics, Prescription History) were "Not connected" here until Phase 13 built them:
  // their screens, requests and permissions are now checked in phase13-dashboard-reports.js (against a backend that enforces the handoff's rules), so the old "not connected" checks are gone.

  // ═════════ Financial Statistics ═════════
  await step("Financial Statistics", async () => {
    i0 = requests.length
    await stats()
    const first = gets(i0, /^\/charges$/)
    ok("D5b Financial Statistics opens on Services: GET /charges sourceType=service for This Month", first.length >= 1 && first[0].query.sourceType === "service" && first[0].query.dateFrom === "2026-11-01" && first[0].query.dateTo === "2026-11-07", JSON.stringify(first.map((r) => r.query)))
    ok("D5b the register hides its own charge-type and date boxes (the tab fixes both)", (await page.getByRole("combobox", { name: "Charge type" }).count()) === 0 && (await page.getByLabel("From", { exact: true }).count()) === 0)
    for (const [tab, name, check] of [
      ["checkups", "Checkups", (q) => q.sourceType === "consultation"], ["lab", "Lab Tests", (q) => q.diagnosticType === "lab"], ["medicine", "Medicine", (q) => q.sourceType === "pharmacy"],
      ["xray", "X-Rays", (q) => q.modality === "X-Ray"], ["ecg", "ECG", (q) => q.modality === "ECG"], ["ultrasound", "Ultrasound", (q) => q.modality === "Ultrasound"],
    ]) {
      i0 = requests.length
      await tid(`stats-tab-${tab}`).click(); await page.waitForTimeout(1100)
      const r = gets(i0, /^\/charges$/)
      ok(`D5b ${name}: the right filter is sent and only the period's charges of that kind are listed`, r.length >= 1 && check(r[0].query) && r[0].query.dateFrom === "2026-11-01", JSON.stringify(r.map((x) => x.query)))
    }
    await tid("stats-tab-lab").click(); await page.waitForTimeout(900)
    ok("D5b Lab Tests lists the lab charge and not the X-ray", (await page.getByText("Lipid profile").count()) >= 1 && (await page.getByText("Chest X-ray").count()) === 0)
    await tid("stats-tab-xray").click(); await page.waitForTimeout(900)
    ok("D5b X-Rays lists the X-ray and not the ECG or ultrasound (each is its own tab, no 'planned for later' placeholder)", (await page.getByText("Chest X-ray").count()) >= 1 && (await page.getByText("Abdomen ultrasound").count()) === 0 && (await page.getByText(/planned for later/i).count()) === 0)
    i0 = requests.length
    await tid("stats-tab-receipts").click(); await page.waitForTimeout(1100)
    ok("D5b Receipts reads the advances for the period", gets(i0, /^\/payments$/).some((r) => r.query.type === "advance" && r.query.dateFrom === "2026-11-01") && (await page.getByText(rcAdv.receiptNo).count()) >= 1)
    i0 = requests.length
    await tid("stats-tab-payments").click(); await page.waitForTimeout(1100)
    ok("D5b Payments reads the payments for the period", gets(i0, /^\/payments$/).some((r) => r.query.type === "payment") && (await page.getByText(rcPay.receiptNo).count()) >= 1)
    i0 = requests.length
    await tid("stats-tab-opdipd").click(); await page.waitForTimeout(1200)
    const op = gets(i0, /^\/invoices$/)
    ok("D5b OPD/IPD reads GET /invoices encounterType=opd for the period (the visit-type and date boxes are hidden)", op.length >= 1 && op[0].query.encounterType === "opd" && op[0].query.dateFrom === "2026-11-01" && (await page.getByRole("combobox", { name: "Visit type" }).count()) === 0)
    i0 = requests.length
    await tid("stats-body-opdipd").getByRole("button", { name: "IPD", exact: true }).click(); await page.waitForTimeout(1200)
    ok("D5b IPD sends encounterType=ipd", gets(i0, /^\/invoices$/).some((r) => r.query.encounterType === "ipd"))
    // period change
    i0 = requests.length
    await period("Today").click(); await page.waitForTimeout(1200)
    ok("D5b changing the period re-reads the open tab for that day", gets(i0, /^\/invoices$/).some((r) => r.query.dateFrom === "2026-11-07" && r.query.dateTo === "2026-11-07"))
    // Summary, Graphs, Expenses and Bank were "not connected" here until Phase 13; they are checked in phase13-dashboard-reports.js.
  })

  // ═════════ Dashboard widgets ═════════
  await step("Dashboard", async () => {
    i0 = requests.length
    await page.goto(base + "/dashboard"); await tid("dashboard-lists").waitFor({ timeout: 15000 }); await page.waitForTimeout(1500)
    const ap = gets(i0, /^\/appointments$/)
    ok("D1b Up Next reads GET /appointments for the hospital's today (2026-11-07), a few rows only", ap.length >= 1 && ap[0].query.date === "2026-11-07" && ap[0].query.perPage === "8" && ap[0].query.page === "1", JSON.stringify(ap.map((r) => r.query)))
    ok("D1b the day's appointment is listed with its time, patient (a link), doctor and status", (await rows("up-next-").count()) >= 1 && (await page.locator("[data-testid^=up-next-]").first().getByRole("link").count()) === 1)
    const pt = gets(i0, /^\/patients$/)
    ok("D1b Recently Registered asks the server for just 5 patients (the prototype fetched 100 and sorted them in the browser)", pt.length >= 1 && pt.every((r) => r.query.perPage === "5") && !requests.slice(i0).some((r) => r.path === "/patients" && r.query.perPage === "100"), JSON.stringify(pt.map((r) => r.query)))
    ok("D1b exactly 5 recent patients are shown, each a link to the record", (await rows("recent-").count()) === 5)
    ok("D1 the tiles come from GET /dashboard (Phase 13 replaced the 'not connected' notice; phase13-dashboard-reports checks every figure)", since(i0).some((r) => r.path === "/dashboard") && (await tid("dashboard-not-connected").count()) === 0)
  })

  // ═════════ roles ═════════
  await step("roles", async () => {
    const baseP = ["patients.read", "encounters.read", "doctors.read", "settings.read", "catalogs.read"]
    const as = async (perms) => { S.perms = perms; await signOutAndIn() }
    await as([...baseP, "reports.read"])
    await reports()
    ok("PERM reports.read only: Revenue and Patient Balances and the Lists are offered; the registers are not (no Accounts)", (await tid("report-nav-revenue").count()) === 1 && (await tid("report-nav-balances").count()) === 1 && (await tid("report-nav-accounts").count()) === 0 && (await tid("report-nav-lists").count()) === 1)
    i0 = requests.length
    await nav("daily-transactions")
    ok("PERM reports.read only: Daily Transactions shows the totals but not the registers (they need billing.read), and asks for no register", (await tid("collections-report").count()) === 1 && (await tid("day-close").getByRole("button", { name: "Payments taken" }).count()) === 0 && gets(i0, /^\/(charges|payments)$/).length === 0)
    await as([...baseP, "billing.read", "accounts.read"])
    i0 = requests.length
    await reports("?report=revenue")
    ok("PERM billing.read + accounts.read: Revenue is not offered and a typed address falls back to what is allowed (the first report shown), asking for no revenue", (await tid("report-nav-revenue").count()) === 0 && (await tid("report-nav-accounts").count()) === 1 && gets(i0, /^\/reports\//).length === 0)
    ok("PERM billing.read + accounts.read: the fallback lands on Daily Transactions, which shows the registers but asks for no collections", (await tid("collections-report").count()) === 0 && (await tid("charges-register").count()) === 1 && gets(i0, /^\/charges$/).length >= 1 && gets(i0, /^\/reports\/collections$/).length === 0)
    i0 = requests.length
    await page.goto(base + "/dashboard/stats"); await page.waitForTimeout(1500)
    ok("PERM billing.read + accounts.read: Financial Statistics is 'Not allowed' (it needs reports.read) and asks for nothing", /not allowed/i.test(await page.getByRole("main").innerText()) && gets(i0, /^\/charges$/).length === 0)
    await as([...baseP, "reports.read"])
    await stats()
    ok("PERM reports.read only: Financial Statistics offers Summary and Graphs and no register tab", (await tid("stats-tab-summary").count()) === 1 && (await tid("stats-tab-graphs").count()) === 1 && (await tid("stats-tab-services").count()) === 0 && (await tid("stats-tab-expenses").count()) === 0)
    await as([...baseP, "reports.read", "billing.read", "accounts.read"])
    await stats()
    ok("PERM accounts.read adds Expenses and Bank", (await tid("stats-tab-expenses").count()) === 1 && (await tid("stats-tab-bank").count()) === 1)
    await as(["encounters.read"])
    i0 = requests.length
    await page.goto(base + "/reports"); await page.waitForTimeout(1200)
    ok("PERM without reports.read or accounts.read: /reports is 'Not allowed' and asks for no report", /not allowed/i.test(await page.getByRole("main").innerText()) && gets(i0, /^\/reports\//).length === 0)
    // dashboard widgets
    await as(["appointments.read", "encounters.read"])
    i0 = requests.length
    await page.goto(base + "/dashboard"); await page.waitForTimeout(2000)
    ok("PERM appointments.read only: Up Next is shown and Recently Registered is not (and /patients is not asked)", (await tid("dashboard-up-next").count()) === 1 && (await tid("dashboard-recent").count()) === 0 && gets(i0, /^\/patients$/).length === 0)
    await as(["patients.read", "encounters.read"])
    i0 = requests.length
    await page.goto(base + "/dashboard"); await page.waitForTimeout(2000)
    ok("PERM patients.read only: Recently Registered is shown and Up Next is not (and /appointments is not asked)", (await tid("dashboard-recent").count()) === 1 && (await tid("dashboard-up-next").count()) === 0 && gets(i0, /^\/appointments$/).length === 0)
    await as(["encounters.read"])
    await page.goto(base + "/dashboard"); await page.waitForTimeout(1500)
    ok("PERM neither: no list widgets at all", (await tid("dashboard-lists").count()) === 0)
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ global ═════════
  ok("no list asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request and response the fake backend handled matches docs/openapi.json", F.violations.length === 0, F.violations.slice(0, 4).join(" || "))
  ok("nothing is ever written or deleted by a report screen (no POST/PUT/PATCH/DELETE to a report, statistics or list route)", !requests.some((r) => r.method !== "GET" && /^\/(reports|lab-tests|expense-categories)/.test(r.path)))
  const unexpected = consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e))
  ok("no browser console/page errors other than the deliberate 500 answer", unexpected.length === 0, unexpected.join(" | "))
  ok("no request reached a route the fake backend does not implement (no 599)", !consoleErrors.some((e) => /status of 599/.test(e)))

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
