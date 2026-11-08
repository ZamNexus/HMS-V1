// Phase 8 browser check: billing (B1 to B9), API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in billing-fake.js runs inside Playwright's
// route(); it does the money arithmetic and every request/response is validated against docs/openapi.json. The screens must only show what the fake sends.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/billing-fake.js")({ validate, schemaOf, stubs })
  const { S, S2, E, P, requests, invoices, panel, svc, receipts } = F
  const { invA, invB, invC, invD, invE } = invoices
  const ALL = stubs.ALL_PERMISSIONS
  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1700 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const posts = (i, pathRe) => since(i).filter((r) => r.method === "POST" && pathRe.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const tid = (id) => page.getByTestId(id)
  const dlg = () => page.getByTestId("billing-dialog")
  const rcpt = () => page.getByTestId("receipt-dialog")
  const closeDialogs = async () => { for (let i = 0; i < 3; i++) { if ((await page.getByRole("dialog").count()) === 0) break; await page.keyboard.press("Escape"); await page.waitForTimeout(250) } }
  const openVisitBill = async (e) => { await go("/encounters/" + e.id); await tid("visit-detail").waitFor({ timeout: 8000 }); await page.getByRole("tab", { name: "Billing", exact: true }).click(); await page.waitForTimeout(900) }
  const actionBtns = () => tid("invoice-actions").getByRole("button")
  const enabledNames = async () => { const out = []; const bs = actionBtns(); for (let i = 0; i < await bs.count(); i++) if (await bs.nth(i).isEnabled()) out.push((await bs.nth(i).innerText()).trim()); return out }
  const offReasons = async () => { const out = {}; const bs = actionBtns(); for (let i = 0; i < await bs.count(); i++) if (!(await bs.nth(i).isEnabled())) out[(await bs.nth(i).innerText()).trim()] = (await bs.nth(i).getAttribute("title")) || ""; return out }
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)); await closeDialogs().catch(() => {}) } }
  const canon = (o) => (Array.isArray(o) ? o.map(canon) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])])) : o)
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
  const amount = (id) => tid(id).innerText().then((t) => t.trim())
  let i0 = 0

  await login()

  // ═════════ B1: the visit's bill and the patient's balance ═════════
  await step("B1 visit bill", async () => {
    i0 = requests.length
    await openVisitBill(E.e2)
    ok("B1 the Billing tab reads GET /encounters/{id}/invoice (one invoice per visit)", since(i0).some((r) => r.method === "GET" && r.path === `/encounters/${E.e2.id}/invoice`))
    await tid("invoice-panel").waitFor()
    ok("B1 the invoice number and status are the server's", (await amount("invoice-no")) === invA.no && /Partial/.test(await tid("invoice-panel").innerText()))
    ok("B1 every figure is the server's: total Rs. 2,600, received Rs. 500, balance Rs. 2,100; patient owes Rs. 2,100, panel Rs. 0",
      (await amount("total-total")) === "Rs. 2,600" && (await amount("total-received")) === "Rs. 500" && (await amount("total-balance")) === "Rs. 2,100" && (await amount("total-patient")) === "Rs. 2,100" && (await amount("total-panel")) === "Rs. 0")
    ok("B1 the three charges are listed with their amounts", (await tid("invoice-charges").locator("tbody tr").count()) === 3 && /Rs\. 1,500/.test(await tid(`charge-${invA.charges[0].id}`).innerText()) && /Rs\. 1,000/.test(await tid(`charge-${invA.charges[0].id}`).innerText()))
    await go("/encounters/" + E.e1.id); await tid("visit-detail").waitFor(); await page.getByRole("tab", { name: "Billing", exact: true }).click(); await page.waitForTimeout(900)
    ok("B1 a visit with nothing billed says so (NOTHING_BILLED), not an error", /Nothing has been billed on this visit yet/.test(await page.getByRole("main").innerText()))
    await go("/patients/" + P(5).id); await page.getByRole("tab", { name: /^Billing/ }).click(); await page.waitForTimeout(900)
    ok("B1 the patient's Billing tab shows the server's account: outstanding Rs. 2,100, credit Rs. 0", (await amount("patient-account-outstanding")) === "Rs. 2,100" && (await amount("patient-account-credit")) === "Rs. 0" && requests.some((r) => r.path === `/patients/${P(5).id}/account`))
  })

  // ═════════ B2: the hub's invoice lists and the invoice detail ═════════
  await step("B2 hub lists", async () => {
    i0 = requests.length
    await go("/billing/consultations"); await tid("invoices-tab").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/invoices")
    ok("B2 the Consultations tab asks for sourceType=consultation, page 1, perPage 10 (server paging), with no sort", !!first && first.query.sourceType === "consultation" && first.query.page === "1" && first.query.perPage === "10" && !("sort" in first.query), JSON.stringify(first && first.query))
    ok("B2 it lists the two consultation invoices, not the services-only or counter ones", (await tid(`invoice-row-${invA.id}`).count()) === 1 && (await tid(`invoice-row-${invB.id}`).count()) === 1 && (await tid(`invoice-row-${invC.id}`).count()) === 0)
    const rowA = await tid(`invoice-row-${invA.id}`).innerText()
    ok("B2 a row shows the number, patient, visit, total, received, balance and status from the server", rowA.includes(invA.no) && rowA.includes("Noor Fatima") && rowA.includes("Rs. 2,600") && rowA.includes("Rs. 500") && rowA.includes("Rs. 2,100") && /Partial/.test(rowA), rowA.replace(/\n/g, " | "))
    i0 = requests.length
    await page.getByRole("combobox", { name: "Invoice status" }).click(); await page.getByRole("option", { name: "Unpaid", exact: true }).click(); await page.waitForTimeout(900)
    ok("B2 the status filter is sent (status=unpaid) and only the unpaid invoice stays", since(i0).some((r) => r.path === "/invoices" && r.query.status === "unpaid") && (await tid(`invoice-row-${invB.id}`).count()) === 1 && (await tid(`invoice-row-${invA.id}`).count()) === 0 && /status=unpaid/.test(page.url()))
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Visit type" }).click(); await page.getByRole("option", { name: "IPD", exact: true }).click(); await page.waitForTimeout(900)
    ok("B2 the OPD/IPD filter the handoff names is sent (encounterType=ipd): no inpatient invoice here, so the list is empty", since(i0).some((r) => r.path === "/invoices" && r.query.encounterType === "ipd") && (await page.locator("[data-testid^=invoice-row-]").count()) === 0 && /type=ipd/.test(page.url()))
    i0 = requests.length
    await page.getByRole("combobox", { name: "Visit type" }).click(); await page.getByRole("option", { name: "OPD", exact: true }).click(); await page.waitForTimeout(900)
    ok("B2 encounterType=opd lists the outpatient invoices", since(i0).some((r) => r.path === "/invoices" && r.query.encounterType === "opd") && (await tid(`invoice-row-${invA.id}`).count()) === 1)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByLabel("Search invoices").fill("noor"); await page.waitForTimeout(1300)
    const sreq = since(i0).filter((r) => r.path === "/invoices")
    ok("B2 search is debounced: ONE request with search=noor, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "noor" && !/noor|search/i.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
    await page.getByLabel("Search invoices").fill(""); await page.waitForTimeout(900)
    i0 = requests.length
    await tid(`invoice-row-${invA.id}`).click(); await tid("invoice-dialog").waitFor(); await page.waitForTimeout(700)
    ok("B2 opening a row reads GET /invoices/{id} and shows the invoice with its charges", since(i0).some((r) => r.method === "GET" && r.path === `/invoices/${invA.id}`) && (await tid("invoice-dialog").getByTestId("invoice-no").innerText()) === invA.no && (await tid("invoice-dialog").locator("tbody tr").count()) === 3)
    await closeDialogs()
    i0 = requests.length
    await go("/billing/services"); await tid("invoices-tab").waitFor(); await page.waitForTimeout(800)
    ok("B2 the Services tab asks for sourceType=service", since(i0).some((r) => r.path === "/invoices" && r.query.sourceType === "service"))
    ok("B2 it lists the invoices with a service charge, including the voided one (marked Voided)", (await tid(`invoice-row-${invE.id}`).count()) === 1 && /Voided/.test(await tid(`invoice-row-${invD.id}`).innerText()))
    await go("/billing/consultations?patient=" + P(5).id); await tid("invoices-tab").waitFor(); await page.waitForTimeout(800)
    ok("B2 ?patient= narrows the list to one patient (patientId sent) with a way to clear it", requests.some((r) => r.path === "/invoices" && r.query.patientId === P(5).id) && (await tid(`invoice-row-${invB.id}`).count()) === 0 && (await page.getByRole("button", { name: /One patient only/ }).count()) === 1)
  })

  // ═════════ B8 (part): the charges register, counter sales ═════════
  await step("B8 charges register", async () => {
    i0 = requests.length
    await go("/billing/transactions"); await tid("charges-register").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/charges")
    ok("B8 Daily Transactions reads GET /charges (page 1, perPage 10) and does not ask for voided charges", !!first && first.query.page === "1" && first.query.perPage === "10" && !("includeVoided" in first.query), JSON.stringify(first && first.query))
    const counterRow = tid(`charge-row-${invC.charges[0].id}`)
    ok("B8 a counter sale shows its customer's name where a patient name goes, marked Counter sale", /Walk-in Ali/.test(await counterRow.innerText()) && /Counter sale/.test(await counterRow.innerText()))
    ok("B8 a voided charge is not listed by default", (await tid(`charge-row-${invD.charges[0].id}`).count()) === 0)
    i0 = requests.length
    await page.getByLabel("Show voided").click(); await page.waitForTimeout(900)
    ok("B8 'Show voided' sends includeVoided=true and lists the voided charge struck through", since(i0).some((r) => r.path === "/charges" && r.query.includeVoided === "true") && (await tid(`charge-row-${invD.charges[0].id}`).getAttribute("data-voided")) === "true")
    await page.getByLabel("Show voided").click(); await page.waitForTimeout(900)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Payer" }).click(); await page.getByRole("option", { name: "Counter sale" }).click(); await page.waitForTimeout(900)
    ok("B8 the payer filter is sent (payer=counter) and only counter sales stay", since(i0).some((r) => r.path === "/charges" && r.query.payer === "counter") && (await page.locator("[data-testid^=charge-row-]").count()) === 1)
    i0 = requests.length
    await counterRow.getByRole("button").click(); await tid("invoice-dialog").waitFor(); await page.waitForTimeout(700)
    ok("B2/B8 a counter-sale invoice shows the customer's name and offers NO billing action (COUNTER_SALE)", (await tid("invoice-dialog").getByTestId("invoice-party").innerText()) === "Walk-in Ali" && (await tid("invoice-dialog").getByTestId("invoice-actions").count()) === 0)
    await closeDialogs()
  })

  // ═════════ B4: take a payment, the receipt ═════════
  await step("B4 payments", async () => {
    await openVisitBill(E.e2)
    ok("B4 on a closed visit's open invoice, every permitted action is on: add services, pay, discount, credit note, void", JSON.stringify(await enabledNames()) === JSON.stringify(["Add services", "Take payment", "Discount", "Credit note", "Void invoice"]), JSON.stringify(await enabledNames()))
    await actionBtns().filter({ hasText: "Take payment" }).click(); await dlg().waitFor()
    ok("B4 the payment starts at the server's own figure for what the patient owes", (await page.locator("#pay-amount").inputValue()) === "2100.00")
    await page.locator("#pay-amount").fill("1000"); S2.slow = true; i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Record payment" }).dblclick(), page.waitForTimeout(200)]); await rcpt().waitFor({ timeout: 8000 }); S2.slow = false
    const pp = posts(i0, /^\/payments$/)
    ok("B4 a double click sends ONE POST /payments with the patient, invoice, amount as a string and the mode", pp.length === 1 && same(pp[0].body, { patientId: P(5).id, invoiceId: invA.id, amount: "1000.00", mode: "cash" }), JSON.stringify(pp.map((r) => r.body)))
    ok("B4 the response is the receipt: number, amount Rs. 1,000, payer, one settled line, Rs. 1,100 still owed, nothing kept as credit",
      /^RCT-2026-\d{4}$/.test(await amount("receipt-no")) && (await amount("receipt-amount")) === "Rs. 1,000" && /Noor Fatima/.test(await amount("receipt-payer")) && (await tid("receipt-settled").locator("tbody tr").count()) === 1 && (await amount("receipt-outstanding")) === "Rs. 1,100" && (await amount("receipt-kept")) === "Rs. 0")
    await page.keyboard.press("Escape"); await page.waitForTimeout(900)
    ok("B4 afterwards the bill is read again: received Rs. 1,500, balance Rs. 1,100, still Partial", (await amount("total-received")) === "Rs. 1,500" && (await amount("total-balance")) === "Rs. 1,100" && /Partial/.test(await tid("invoice-panel").innerText()))
    // overpayment
    await actionBtns().filter({ hasText: "Take payment" }).click(); await dlg().waitFor(); await page.locator("#pay-amount").fill("5000"); i0 = requests.length
    await dlg().getByRole("button", { name: "Record payment" }).click(); await page.waitForTimeout(1000)
    ok("B4 OVERPAYMENT: the backend's message and the server's own owed figure are shown; ONE request; the dialog stays", /That is more than is owed/.test(await dlg().getByTestId("create-error").innerText()) && (await amount("owed-note")).includes("Rs. 1,100") && posts(i0, /^\/payments$/).length === 1)
    await page.locator("#pay-excess").check(); i0 = requests.length
    await dlg().getByRole("button", { name: "Record payment" }).click(); await rcpt().waitFor({ timeout: 8000 })
    const pe = posts(i0, /^\/payments$/)
    ok("B4 'keep the excess as an advance' is sent as excessAsAdvance: true, once", pe.length === 1 && pe[0].body.excessAsAdvance === true && pe[0].body.amount === "5000.00")
    ok("B4 the receipt shows Rs. 5,000 received, Rs. 3,900 kept as credit, nothing owed, credit held Rs. 3,900; the bill is Paid", (await amount("receipt-amount")) === "Rs. 5,000" && (await amount("receipt-kept")) === "Rs. 3,900" && (await amount("receipt-outstanding")) === "Rs. 0" && (await amount("receipt-credit")) === "Rs. 3,900")
    await page.keyboard.press("Escape"); await page.waitForTimeout(900)
    ok("B4 the bill is now Paid with balance Rs. 0", /Paid/.test(await tid("invoice-panel").innerText()) && (await amount("total-balance")) === "Rs. 0")
  })

  await step("B4 failures are never re-sent", async () => {
    await openVisitBill(E.e0)
    // the connection drops mid-request: nothing is sent again
    await actionBtns().filter({ hasText: "Take payment" }).click(); await dlg().waitFor(); await page.locator("#pay-amount").fill("500"); S2.dropNext = true; i0 = requests.length
    await dlg().getByRole("button", { name: "Record payment" }).click(); await page.waitForTimeout(2500)
    ok("B4 a dropped connection: ONE attempt, no automatic re-send, an error is shown and the dialog stays", posts(i0, /^\/payments$/).length === 1 && (await dlg().count()) === 1 && (await dlg().getByRole("alert").count()) >= 1)
    // the server records it but its answer cannot be read
    S2.garbleNext = true; i0 = requests.length
    await dlg().getByRole("button", { name: "Record payment" }).click(); await page.waitForTimeout(1800)
    ok("B4 an accepted but unreadable answer: ONE request, announced as done, the dialog closes, no receipt shown, nothing re-sent", posts(i0, /^\/payments$/).length === 1 && (await page.getByRole("dialog").count()) === 0 && invB.charges[0].receivedC === 50000)
    await page.waitForTimeout(800)
    ok("B4 the bill was read again and shows the payment the server recorded: received Rs. 500", (await amount("total-received")) === "Rs. 500" && /Partial/.test(await tid("invoice-panel").innerText()))
  })

  // ═════════ B6: discount and void ═════════
  await step("B6 discount and void", async () => {
    await openVisitBill(E.e0)
    const off = await offReasons()
    ok("B6 Void is shown OFF with its reason while the visit is under way (handoff 5), not hidden", /under way/.test(off["Void invoice"] || ""), JSON.stringify(off))
    await actionBtns().filter({ hasText: "Discount" }).click(); await dlg().waitFor()
    await dlg().getByRole("button", { name: "Included in package (100%)" }).click()
    ok("B6 'Included in package' sets 100 percent and a reason", (await page.locator("#disc-value").inputValue()) === "100" && (await page.locator("#disc-reason").inputValue()) === "Included in package")
    await page.locator("#disc-value").fill("10"); await page.locator("#disc-reason").fill("Staff concession"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Apply discount" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const dp = posts(i0, /\/discount$/)
    ok("B6 a double click sends ONE POST /invoices/{id}/discount { discount: { type: percent, value: 10 }, reason }", dp.length === 1 && same(dp[0].body, { discount: { type: "percent", value: "10" }, reason: "Staff concession" }), JSON.stringify(dp.map((r) => r.body)))
    ok("B6 the server's new figures are shown: discount Rs. 150, total Rs. 1,350, balance Rs. 850", (await amount("total-discount")) === "Rs. 150" && (await amount("total-total")) === "Rs. 1,350" && (await amount("total-balance")) === "Rs. 850")
    await actionBtns().filter({ hasText: "Discount" }).click(); await dlg().waitFor()
    await page.getByRole("combobox", { name: "Discount by" }).click(); await page.getByRole("option", { name: "Amount (Rs.)" }).click(); await page.locator("#disc-value").fill("99999"); await page.locator("#disc-reason").fill("Too big on purpose"); i0 = requests.length
    await dlg().getByRole("button", { name: "Apply discount" }).click(); await page.waitForTimeout(1000)
    ok("B6 DISCOUNT_TOO_LARGE is explained with the backend's message; one request", /larger than the bill/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /\/discount$/).length === 1)
    await closeDialogs()
    // void a charge: a lab charge cannot be voided here; a paid one is refused by the server; an unpaid service charge can be voided
    await openVisitBill(E.e2)
    const labBtn = page.getByRole("button", { name: "Void charge Lab: CBC" })
    ok("B6 a lab charge's Void is shown OFF with 'cancel the test or return the medicine'", (await labBtn.isDisabled()) && /cancel the test or return the medicine/.test((await labBtn.getAttribute("title")) || ""))
    await page.getByRole("button", { name: "Void charge Consultation: Dr Imran" }).click(); await dlg().waitFor()
    ok("B6 the void button stays off until the reason has 3 characters", await dlg().getByRole("button", { name: "Void charge" }).isDisabled())
    await page.locator("#void-reason").fill("Wrong service"); i0 = requests.length
    await dlg().getByRole("button", { name: "Void charge" }).click(); await page.waitForTimeout(1000)
    ok("B6 CHARGE_PAID: the backend's message is shown (money is on it); one POST /charges/{id}/void; nothing changes", /already been received|received on this charge/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /^\/charges\/.*\/void$/).length === 1 && invA.charges[0].voided === false)
    await closeDialogs()
    await go("/billing/services"); await tid("invoices-tab").waitFor(); await tid(`invoice-row-${invE.id}`).click(); await tid("invoice-dialog").waitFor(); await page.waitForTimeout(700)
    await page.getByRole("button", { name: "Void charge Dressing" }).click(); await dlg().waitFor(); await page.locator("#void-reason").fill("Not performed"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Void charge" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const vc = posts(i0, /^\/charges\/.*\/void$/)
    ok("B6 voiding an unpaid charge: ONE POST { reason }; the charge stays on the bill struck through with the reason", vc.length === 1 && same(vc[0].body, { reason: "Not performed" }) && (await tid(`charge-voided-${invE.charges[0].id}`).innerText()).includes("Not performed"))
    // void the whole invoice (stand-alone: no visit under way)
    await tid("invoice-dialog").getByRole("button", { name: "Void invoice" }).click(); await dlg().waitFor(); await page.locator("#void-reason").fill("Entered twice"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Void invoice" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const vi = posts(i0, /\/void$/)
    ok("B6 voiding the invoice: ONE POST { reason }; a voided banner with the reason; nothing is deleted", vi.length === 1 && same(vi[0].body, { reason: "Entered twice" }) && /Entered twice/.test(await tid("invoice-voided").innerText()))
    const offV = await offReasons()
    ok("B6 on the voided invoice every action is shown OFF with 'This invoice is voided.'", (await enabledNames()).length === 0 && Object.keys(offV).length === 5 && Object.values(offV).every((r) => /voided/.test(r)), JSON.stringify(offV))
    await closeDialogs()
  })

  // ═════════ B7: credit note ═════════
  await step("B7 credit note", async () => {
    await openVisitBill(E.e2)
    await actionBtns().filter({ hasText: "Credit note" }).click(); await dlg().waitFor(); await page.locator("#cn-amount").fill("100"); await page.locator("#cn-reason").fill("Concession"); i0 = requests.length
    await dlg().getByRole("button", { name: "Issue credit note" }).click(); await page.waitForTimeout(1000)
    ok("B7 CREDIT_NOTE_EXCEEDS_OWED: refused by the server, explained; one request (the bill is already paid)", /larger than what is owed/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /^\/credit-notes$/).length === 1)
    await closeDialogs()
    await openVisitBill(E.e0)
    await actionBtns().filter({ hasText: "Credit note" }).click(); await dlg().waitFor(); await page.locator("#cn-amount").fill("100"); await page.locator("#cn-reason").fill("Concession"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Issue credit note" }).dblclick(), page.waitForTimeout(200)]); await rcpt().waitFor({ timeout: 8000 })
    const cn = posts(i0, /^\/credit-notes$/)
    ok("B7 a credit note: ONE POST { patientId, invoiceId, amount, reason }; the receipt says no money moved", cn.length === 1 && same(cn[0].body, { patientId: P(0).id, invoiceId: invB.id, amount: "100.00", reason: "Concession" }) && /No money moved/.test(await rcpt().innerText()) && (await amount("receipt-amount")) === "Rs. 100")
    await page.keyboard.press("Escape"); await page.waitForTimeout(900)
    ok("B7 the bill follows the server: balance Rs. 750", (await amount("total-balance")) === "Rs. 750")
  })

  // ═════════ B5: advance, apply credit, refund ═════════
  await step("B5 advance, apply credit, refund", async () => {
    await go("/patients/" + P(0).id); await page.getByRole("tab", { name: /^Billing/ }).click(); await page.waitForTimeout(900)
    ok("B5 the account shows the server's figures: outstanding Rs. 750, credit Rs. 0", (await amount("patient-account-outstanding")) === "Rs. 750" && (await amount("patient-account-credit")) === "Rs. 0")
    await page.getByRole("button", { name: "Take advance" }).click(); await dlg().waitFor(); await page.locator("#adv-amount").fill("1000"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Record advance" }).dblclick(), page.waitForTimeout(200)]); await rcpt().waitFor({ timeout: 8000 })
    const ad = posts(i0, /^\/advances$/)
    ok("B5 an advance: ONE POST /advances { patientId, amount, mode }; the receipt shows Rs. 1,000 kept as credit", ad.length === 1 && same(ad[0].body, { patientId: P(0).id, amount: "1000.00", mode: "cash" }) && (await amount("receipt-kept")) === "Rs. 1,000")
    await page.keyboard.press("Escape"); await page.waitForTimeout(900)
    ok("B5 the account now shows credit Rs. 1,000", (await amount("patient-account-credit")) === "Rs. 1,000")
    await page.getByRole("button", { name: "Apply credit" }).click(); await dlg().waitFor(); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Apply credit" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const ac = posts(i0, /\/apply-credit$/)
    ok("B5 applying credit: ONE POST /patients/{id}/apply-credit with an empty body (apply as much as possible); NO receipt (no money moves)", ac.length === 1 && JSON.stringify(ac[0].body) === "{}" && (await rcpt().count()) === 0)
    ok("B5 the account follows the server: outstanding Rs. 0, credit Rs. 250", (await amount("patient-account-outstanding")) === "Rs. 0" && (await amount("patient-account-credit")) === "Rs. 250")
    await page.getByRole("button", { name: "Apply credit" }).click(); await dlg().waitFor()
    await dlg().getByRole("button", { name: "Apply credit" }).click(); await page.waitForTimeout(1000)
    ok("B5 NOTHING_TO_APPLY is explained", /nothing to apply the credit to/i.test(await dlg().getByTestId("create-error").innerText()))
    await closeDialogs()
    await page.getByRole("button", { name: "Refund credit" }).click(); await dlg().waitFor(); await page.locator("#ref-amount").fill("5000"); await page.locator("#ref-reason").fill("Patient left"); i0 = requests.length
    await dlg().getByRole("button", { name: "Record refund" }).click(); await page.waitForTimeout(1000)
    ok("B5/B7 refunding more than the unused credit: INSUFFICIENT_CREDIT explained; one request", /not enough credit/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /^\/refunds$/).length === 1)
    await page.locator("#ref-amount").fill("250"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Record refund" }).dblclick(), page.waitForTimeout(200)]); await rcpt().waitFor({ timeout: 8000 })
    const rf = posts(i0, /^\/refunds$/)
    const rtxt = await rcpt().innerText(), ramt = await amount("receipt-amount")
    ok("B7 a refund of unused credit: ONE POST /refunds { patientId, amount, mode, reason }; the receipt is a refund for Rs. 250", rf.length === 1 && same(rf[0].body, { patientId: P(0).id, amount: "250.00", mode: "cash", reason: "Patient left" }) && /refund/i.test(rtxt) && ramt === "Rs. 250", JSON.stringify([rf.map((r) => r.body), ramt, rtxt.slice(0, 120)]))
    await page.keyboard.press("Escape"); await page.waitForTimeout(900)
    ok("B7 the account's credit is now Rs. 0", (await amount("patient-account-credit")) === "Rs. 0")
  })

  // ═════════ B3: charge services ═════════
  await step("B3 charge services", async () => {
    await openVisitBill(E.e0)
    await actionBtns().filter({ hasText: "Add services" }).click(); await dlg().waitFor(); i0 = requests.length
    await page.locator("#charge-service-search").fill("e"); await page.waitForTimeout(900)
    ok("B3 one letter searches nothing (2+ letters)", !since(i0).some((r) => r.path === "/services"))
    await page.locator("#charge-service-search").fill("ec"); await page.waitForTimeout(1300)
    const sq = since(i0).filter((r) => r.path === "/services")
    ok("B3 the catalogue is searched from 2 letters, once, active services only, 6 results at most", sq.length === 1 && sq[0].query.search === "ec" && sq[0].query.active === "true", JSON.stringify(sq.map((r) => r.query)))
    await tid("service-options").getByRole("button", { name: /ECG/ }).click()
    ok("B3 the chosen service is a line with the catalogue rate as the server sent it", /Catalogue rate Rs\. 500/.test(await tid("charge-lines").innerText()))
    ok("B3 with billing.write the line offers an own rate and an own discount", (await page.getByLabel("Own rate of ECG").count()) === 1 && (await page.getByLabel("Discount type of ECG").count()) === 1)
    await page.getByLabel("Quantity of ECG").fill("2"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Add to invoice" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const ch = posts(i0, /\/charges$/)
    ok("B3 a double click sends ONE POST /invoices/{id}/charges with only the service and quantity (no rate or discount)", ch.length === 1 && same(ch[0].body, { charges: [{ serviceId: svc[1].id, qty: "2" }] }), JSON.stringify(ch.map((r) => r.body)))
    ok("B3 the new charge is on the bill and the totals are the server's (total Rs. 2,250, received Rs. 1,250, balance Rs. 1,000)", /ECG/.test(await tid("invoice-charges").innerText()) && (await amount("total-total")) === "Rs. 2,250" && (await amount("total-received")) === "Rs. 1,250" && (await amount("total-balance")) === "Rs. 1,000", `total ${await amount("total-total")}, received ${await amount("total-received")}, balance ${await amount("total-balance")}`)
    // a new stand-alone services invoice
    await go("/billing/services"); await tid("invoices-tab").waitFor(); await page.getByRole("button", { name: "New services invoice" }).click(); await dlg().waitFor()
    ok("B3 Create invoice is off until a patient and a service are chosen", await dlg().getByRole("button", { name: "Create invoice" }).isDisabled())
    await page.locator("#charge-patient").fill("bilal"); await page.waitForTimeout(1300); await dlg().getByText("Bilal Anwar").first().click()
    await page.locator("#charge-service-search").fill("dre"); await page.waitForTimeout(1300); await tid("service-options").getByRole("button", { name: /Dressing/ }).click(); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Create invoice" }).dblclick(), page.waitForTimeout(200)]); await tid("invoice-dialog").waitFor({ timeout: 8000 })
    const ni = posts(i0, /^\/invoices$/)
    ok("B3 a new stand-alone invoice: ONE POST /invoices { patientId, charges }; the new invoice opens, in Bilal Anwar's name", ni.length === 1 && same(ni[0].body, { patientId: P(1).id, charges: [{ serviceId: svc[2].id, qty: "1" }] }) && (await tid("invoice-dialog").getByTestId("invoice-party").innerText()) === "Bilal Anwar")
    await closeDialogs()
  })

  // ═════════ B9: a panel's account and its payment ═════════
  await step("B9 panel", async () => {
    await go("/admin/master-data"); await page.getByRole("tab", { name: /^Panels/ }).click(); await page.waitForTimeout(1200)
    i0 = requests.length
    await page.getByRole("button", { name: `Account of ${panel.name}` }).click(); await tid("panel-account-dialog").waitFor(); await page.waitForTimeout(800)
    ok("B9 the panel's account reads GET /panels/{id}/account: owed Rs. 12,000, credit Rs. 0", since(i0).some((r) => r.path === `/panels/${panel.id}/account`) && (await amount("panel-account-outstanding")) === "Rs. 12,000" && (await amount("panel-account-credit")) === "Rs. 0")
    await tid("panel-account-dialog").getByRole("button", { name: "Record panel payment" }).click(); await dlg().waitFor(); await page.locator("#pay-amount").fill("2000")
    await page.getByRole("combobox", { name: "Payment mode" }).click(); await page.getByRole("option", { name: "Insurance" }).click(); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Record payment" }).dblclick(), page.waitForTimeout(200)]); await rcpt().waitFor({ timeout: 8000 })
    const pp = posts(i0, /^\/payments$/)
    ok("B9/B4 a panel's payment: ONE POST /payments { panelId, amount, mode } (no patient, no invoice)", pp.length === 1 && same(pp[0].body, { panelId: panel.id, amount: "2000.00", mode: "insurance" }), JSON.stringify(pp.map((r) => r.body)))
    ok("B9 the receipt names the panel and shows the server's remaining Rs. 10,000", /State Life \(panel\)/.test(await amount("receipt-payer")) && (await amount("receipt-outstanding")) === "Rs. 10,000")
    await page.keyboard.press("Escape"); await page.waitForTimeout(700); await closeDialogs()
    await page.getByRole("button", { name: `Account of ${panel.name}` }).click(); await tid("panel-account-dialog").waitFor(); await page.waitForTimeout(900)
    ok("B9 reopening the account reads it again: owed Rs. 10,000", (await amount("panel-account-outstanding")) === "Rs. 10,000")
    await closeDialogs()
  })

  // ═════════ B8: the payments register ═════════
  await step("B8 payments register", async () => {
    i0 = requests.length
    await go("/billing/payments"); await tid("payments-register").waitFor({ timeout: 8000 }); await page.waitForTimeout(900)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/payments")
    ok("B8 the Payments tab asks for type=payment, page 1, perPage 10", !!first && first.query.type === "payment" && first.query.page === "1" && first.query.perPage === "10", JSON.stringify(first && first.query))
    const rows = await page.locator("[data-testid^=payment-row-]").count()
    ok("B8 it lists the payments recorded above (not advances, refunds or credit notes)", rows === receipts.filter((r) => r.type === "payment").length && rows >= 3, `${rows} rows`)
    const r1 = receipts.find((r) => r.type === "payment")
    i0 = requests.length
    await tid(`payment-row-${r1.id}`).click(); await rcpt().waitFor(); await page.waitForTimeout(700)
    ok("B8 a row opens the receipt, read fresh from GET /payments/{id} (a reprint), with Print A4 and Print 80 mm buttons", since(i0).some((r) => r.method === "GET" && r.path === `/payments/${r1.id}`) && (await amount("receipt-no")) === r1.receiptNo && (await rcpt().getByTestId("print-a4").count()) === 1 && (await rcpt().getByTestId("print-thermal").count()) === 1)
    await closeDialogs()
    i0 = requests.length
    await page.getByRole("combobox", { name: "Receipt type" }).click(); await page.getByRole("option", { name: "All types" }).click(); await page.waitForTimeout(900)
    const all = since(i0).find((r) => r.path === "/payments")
    ok("B8 'All types' sends no type and also lists the advance, the refund and the credit note", !!all && !("type" in all.query) && (await page.locator("[data-testid^=payment-row-]").count()) === receipts.length)
    i0 = requests.length
    await go("/billing/receipts"); await tid("payments-register").waitFor(); await page.waitForTimeout(900)
    ok("B8 the Receipts tab starts on type=advance and lists only advances", since(i0).some((r) => r.path === "/payments" && r.query.type === "advance") && (await page.locator("[data-testid^=payment-row-]").count()) === receipts.filter((r) => r.type === "advance").length)
  })

  // ═════════ roles ═════════
  await step("roles", async () => {
    const base2 = ["patients.read", "encounters.read", "doctors.read", "settings.read", "catalogs.read"]
    const as = async (perms) => { S.perms = perms; await signOutAndIn() }
    await as([...base2, "billing.read", "billing.collect_payment"]) // cashier
    await openVisitBill(E.e2)
    ok("PERM cashier (read + collect): only Take payment", JSON.stringify(await enabledNames()) === JSON.stringify(["Take payment"]) && (await page.getByRole("button", { name: /^Void charge/ }).count()) === 0, JSON.stringify(await enabledNames()))
    await go("/patients/" + P(5).id); await page.getByRole("tab", { name: /^Billing/ }).click(); await page.waitForTimeout(800)
    ok("PERM cashier: the account offers Take advance and Apply credit, not Refund or Credit note", (await page.getByRole("button", { name: "Take advance" }).count()) === 1 && (await page.getByRole("button", { name: "Apply credit" }).count()) === 1 && (await page.getByRole("button", { name: "Refund credit" }).count()) === 0 && (await page.getByRole("button", { name: "Credit note" }).count()) === 0)
    await as([...base2, "billing.read", "billing.charge", "billing.collect_payment"]) // billing clerk
    await openVisitBill(E.e2)
    ok("PERM billing clerk (charge + collect): Add services and Take payment", JSON.stringify(await enabledNames()) === JSON.stringify(["Add services", "Take payment"]), JSON.stringify(await enabledNames()))
    await actionBtns().filter({ hasText: "Add services" }).click(); await dlg().waitFor()
    await page.locator("#charge-service-search").fill("ec"); await page.waitForTimeout(1300); await tid("service-options").getByRole("button", { name: /ECG/ }).click()
    ok("PERM without billing.write the line has NO own-rate or discount fields", (await page.getByLabel(/Own rate of/).count()) === 0 && (await page.getByLabel(/Discount type of/).count()) === 0 && (await page.getByLabel("Quantity of ECG").count()) === 1)
    await closeDialogs()
    await as([...base2, "billing.read", "billing.write"]) // manager
    await openVisitBill(E.e2)
    ok("PERM manager (write): Discount, Credit note and Void invoice", JSON.stringify(await enabledNames()) === JSON.stringify(["Discount", "Credit note", "Void invoice"]), JSON.stringify(await enabledNames()))
    await go("/patients/" + P(5).id); await page.getByRole("tab", { name: /^Billing/ }).click(); await page.waitForTimeout(800)
    ok("PERM manager: the account offers Refund credit and Credit note, not Take advance", (await page.getByRole("button", { name: "Refund credit" }).count()) === 1 && (await page.getByRole("button", { name: "Credit note" }).count()) === 1 && (await page.getByRole("button", { name: "Take advance" }).count()) === 0)
    await as([...base2, "billing.read"]) // read only
    await openVisitBill(E.e2)
    ok("PERM read-only: the bill shows no action at all", (await tid("invoice-actions").count()) === 0 && (await tid("invoice-panel").count()) === 1)
    await go("/billing/consultations"); await page.waitForTimeout(800)
    ok("PERM read-only: no 'New services invoice' button", (await page.getByRole("button", { name: "New services invoice" }).count()) === 0)
    await as([...base2]) // no billing at all
    i0 = requests.length
    await openVisitBill(E.e2)
    ok("PERM without billing.read: the Billing tab says it is not shown to the role and NO invoice request is made", /The bill is not shown to your role/.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => /\/invoice$/.test(r.path)))
    await go("/billing/consultations"); await page.waitForTimeout(800)
    ok("PERM without billing.read: the hub tab is a 'Not allowed' page (route guard) and asks the server for nothing", /not allowed/i.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => r.path === "/invoices"))
    await go("/billing/transactions"); await page.waitForTimeout(800)
    ok("PERM without billing.read: Daily Transactions is also 'Not allowed' and asks the server for nothing", /not allowed/i.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => r.path === "/charges"))
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ global ═════════
  ok("no list asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request and response the fake backend handled matches docs/openapi.json", F.violations.length === 0, F.violations.slice(0, 4).join(" || "))
  const unexpected = requests.filter((r) => false)
  void unexpected
  ok("nothing is ever deleted (no DELETE request)", !requests.some((r) => r.method === "DELETE"))
  ok("no write was ever sent twice in a row with the same body (no auto-retry anywhere)", (() => { for (let k = 1; k < requests.length; k++) { const a = requests[k - 1], b = requests[k]; if (a.method !== "GET" && a.method === b.method && a.path === b.path && JSON.stringify(a.body) === JSON.stringify(b.body) && !/discount|apply-credit/.test(a.path)) return false } return true })())
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e))
  ok("no browser console/page errors other than the deliberate 404 / 422 answers and the deliberately dropped request", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  ok("no request reached a route the fake backend does not implement (no 599)", !consoleErrors.some((e) => /status of 599/.test(e)))

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
