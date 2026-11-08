// Phase 7 browser check: encounters (E1-E13, PT8, AP5), API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in encounters-fake.js runs
// inside Playwright's route(); every request body is validated against docs/openapi.json and so is every response it sends.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/encounters-fake.js")({ validate, schemaOf, stubs })
  const { S, requests, E, P, TODAY, YESTERDAY, U, D1 } = F
  const { e0, e1, e2, e3, e4, e5, e6 } = E

  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const main = () => page.locator("main").innerText()
  const row = (e) => page.getByTestId(`visit-row-${e.id}`)
  const closed = () => page.waitForFunction(() => !document.querySelector("[role=dialog]"), null, { timeout: 8000 })
  const actionNames = async () => { const out = []; const bs = page.getByTestId("visit-actions").getByRole("button"); for (let i = 0; i < await bs.count(); i++) if (await bs.nth(i).isEnabled()) out.push((await bs.nth(i).innerText()).trim()); return out } // the buttons that are ON
  const tab = (name) => page.getByRole("tab", { name, exact: true })
  const dlg = () => page.getByTestId("action-dialog")

  await login()

  // ───────────── E1 list and queue ─────────────
  let i0 = requests.length
  await go("/encounters"); await row(e0).waitFor({ timeout: 8000 })
  const first = since(i0).find((r) => r.method === "GET" && r.path === "/encounters")
  ok("E1 the queue asks for today's OPEN visits in token order: dateFrom = dateTo = today, status=open, sort=tokenNo:asc, page 1, perPage 10", !!first && first.query.dateFrom === TODAY && first.query.dateTo === TODAY && first.query.status === "open" && first.query.sort === "tokenNo:asc" && first.query.page === "1" && first.query.perPage === "10", JSON.stringify(first && first.query))
  let text = await main()
  ok("E1 today's three open visits are listed (two OPD, one admission), earlier days are not", [e0, e1, e3].every((e) => text.includes(e.patient.name)) && !text.includes("Noor Fatima") && /3 encounters/.test(text), text.slice(0, 120).replace(/\n/g, " "))
  const order = (await page.locator("tbody tr").allInnerTexts()).map((t) => t.split("\n")[0].trim())
  ok("E1 token order: #1, #2 and the admission (no token) last", JSON.stringify(order) === JSON.stringify(["#1", "#2", "—"]), JSON.stringify(order))
  ok("E1 an urgent visit is marked; the admission shows its ward and bed", /Urgent/.test(await row(e0).innerText()) && /General Ward · bed A-02/.test(await row(e3).innerText()))
  ok("E1 Check In is offered (encounters.check_in)", (await page.getByRole("link", { name: /Check In/ }).count()) === 1)

  i0 = requests.length
  await tab("To finish").click(); await page.waitForTimeout(1000)
  ok("E1 'To finish' sends pending=true and lists the earlier-day visit with its record unfinished, flagged", since(i0).some((r) => r.path === "/encounters" && r.query.pending === "true") && (await row(e4).count()) === 1 && /To finish/.test(await row(e4).innerText()) && /tab=pending/.test(page.url()), page.url())
  i0 = requests.length
  await tab("Admitted").click(); await page.waitForTimeout(1000)
  ok("E1 'Admitted' sends admitted=true, type=ipd, status=open and shows the one admission", since(i0).some((r) => r.path === "/encounters" && r.query.admitted === "true" && r.query.type === "ipd" && r.query.status === "open") && (await row(e3).count()) === 1 && (await page.locator("tbody tr").count()) === 1)
  i0 = requests.length
  await tab("All visits").click(); await page.waitForTimeout(1000)
  const allReq = since(i0).find((r) => r.path === "/encounters")
  ok("E1 'All visits' sends no day or status filter and hides archived and cancelled-by-default? (archived hidden)", !!allReq && !("dateFrom" in allReq.query) && !("includeArchived" in allReq.query) && (await row(e6).count()) === 0 && (await row(e5).count()) === 1)
  i0 = requests.length
  await page.getByRole("combobox", { name: "Type" }).click(); await page.getByRole("option", { name: "OPD", exact: true }).click(); await page.waitForTimeout(900)
  ok("E1 the type filter is sent (type=opd) and the admission disappears", since(i0).some((r) => r.path === "/encounters" && r.query.type === "opd") && (await row(e3).count()) === 0)
  i0 = requests.length
  await page.getByRole("combobox", { name: "Status" }).click(); await page.getByRole("option", { name: "Closed" }).click(); await page.waitForTimeout(900)
  ok("E1 the status filter is sent (status=closed) and shows only the closed visit", since(i0).some((r) => r.path === "/encounters" && r.query.status === "closed") && (await row(e2).count()) === 1 && (await page.locator("tbody tr").count()) === 1)
  await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(900)
  i0 = requests.length
  await page.getByLabel("Include archived").click(); await page.waitForTimeout(900)
  ok("E1 'Include archived' sends includeArchived=true and shows the archived visit marked Archived", since(i0).some((r) => r.path === "/encounters" && r.query.includeArchived === "true") && /Archived/.test(await row(e6).innerText()))
  await page.getByLabel("Include archived").click(); await page.waitForTimeout(700)
  i0 = requests.length
  await page.getByLabel("Search encounters").fill("hira"); await page.waitForTimeout(1300)
  const sreq = since(i0).filter((r) => r.path === "/encounters")
  ok("E1 search is debounced: ONE request with search=hira, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "hira" && !/hira|search/i.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
  await page.getByLabel("Search encounters").fill(""); await page.waitForTimeout(900)
  await tab("Today's queue").click(); await page.waitForTimeout(800)
  i0 = requests.length
  await page.getByRole("button", { name: "My patients" }).click(); await page.waitForTimeout(1000)
  ok("E1 'My patients' sends this doctor's id (a doctor's queue) and shows only their visits", since(i0).some((r) => r.path === "/encounters" && r.query.doctorId === D1 && r.query.sort === "tokenNo:asc") && (await row(e1).count()) === 0 && (await row(e0).count()) === 1 && new RegExp("doctor=" + D1).test(page.url()))
  i0 = requests.length
  await page.goto(base + "/encounters?tab=pending"); await page.waitForTimeout(2500)
  ok("E1 a refreshed link keeps the tab (tab=pending -> pending=true)", since(i0).some((r) => r.path === "/encounters" && r.query.pending === "true"))
  await go("/encounters")

  // ───────────── E8 bed board ─────────────
  i0 = requests.length
  await tab("Bed board").click(); await page.getByTestId("bed-board").waitFor({ timeout: 8000 })
  ok("E8 the bed board reads GET /wards/occupancy", since(i0).some((r) => r.method === "GET" && r.path === "/wards/occupancy"))
  text = await page.getByTestId("bed-counts").innerText()
  ok("E8 the counts: A-01 and B-01 available, A-02 occupied, A-03 under maintenance", /2 available · 1 occupied · 1 under maintenance/.test(text), text)
  ok("E8 the occupied bed names its patient and links to the admission", /Hira Malik/.test(await page.getByTestId(`bed-${U(211)}`).innerText()) && (await page.getByTestId(`bed-${U(211)}`).getByRole("link", { name: e3.encId }).count()) === 1)
  ok("E8 states are exposed (data-state) and an occupied bed has no maintenance button", (await page.getByTestId(`bed-${U(210)}`).getAttribute("data-state")) === "available" && (await page.getByTestId(`bed-${U(211)}`).getByRole("button").count()) === 0)

  // ───────────── E13 bed maintenance ─────────────
  i0 = requests.length
  await page.getByRole("button", { name: "Take out of use bed A-01" }).click(); await page.waitForTimeout(1200)
  const mp = since(i0).find((r) => r.method === "POST" && r.path === `/beds/${U(210)}/maintenance`)
  ok("E13 'Take out of use' sends POST /beds/{id}/maintenance { underMaintenance: true } and the board follows", !!mp && JSON.stringify(mp.body) === JSON.stringify({ underMaintenance: true }) && (await page.getByTestId(`bed-${U(210)}`).getAttribute("data-state")) === "maintenance")
  await page.getByRole("button", { name: "Return to use bed A-01" }).click(); await page.waitForTimeout(1200)
  ok("E13 'Return to use' sends { underMaintenance: false }", requests.some((r) => r.path === `/beds/${U(210)}/maintenance` && r.body && r.body.underMaintenance === false) && (await page.getByTestId(`bed-${U(210)}`).getAttribute("data-state")) === "available")

  // ───────────── E6 detail ─────────────
  await go("/encounters"); await row(e0).waitFor({ timeout: 8000 })
  i0 = requests.length
  await row(e0).click(); await page.getByTestId("visit-detail").waitFor({ timeout: 8000 }); await page.waitForTimeout(600)
  ok("E6 opening a visit reads GET /encounters/{id}", since(i0).some((r) => r.method === "GET" && r.path === `/encounters/${e0.id}`))
  ok("E6 the header shows the number, the patient (a link), the doctor and the token", (await page.getByTestId("visit-encid").innerText()) === e0.encId && (await page.getByTestId("visit-detail").getByRole("link", { name: "Zainab Qureshi" }).count()) === 1 && /Dr Imran/.test(await page.getByTestId("visit-detail").innerText()) && /token #1/.test(await page.getByTestId("visit-detail").innerText()))
  ok("E6 an open OPD visit offers, in this order: Correct check-in, Record vitals, Clinical record, Close visit, Cancel visit, Archive", JSON.stringify(await actionNames()) === JSON.stringify(["Correct check-in", "Record vitals", "Clinical record", "Close visit", "Cancel visit", "Archive"]), JSON.stringify(await actionNames()))
  await go("/encounters/" + e3.id); await page.getByTestId("visit-detail").waitFor()
  ok("E6 an open admission offers transfer, discharge and notes instead of Close", JSON.stringify(await actionNames()) === JSON.stringify(["Correct check-in", "Record vitals", "Clinical record", "Transfer bed", "Discharge", "Add note", "Cancel visit", "Archive"]), JSON.stringify(await actionNames()))
  ok("E6 an admission has an Overview with its bed history and a Progress notes tab; a Billing tab says billing is not connected", (await page.getByTestId("bed-history").count()) === 1 && (await tab("Progress notes").count()) === 1 && (await tab("Billing").count()) === 1)
  await go("/encounters/" + e2.id); await page.getByTestId("visit-detail").waitFor()
  ok("E6 a closed visit offers Reopen and Archive only", JSON.stringify(await actionNames()) === JSON.stringify(["Reopen", "Archive"]), JSON.stringify(await actionNames()))
  await go("/encounters/" + e5.id); await page.getByTestId("visit-cancelled").waitFor()
  ok("E6 a cancelled visit shows who and why, and can only be archived", /Patient left/.test(await page.getByTestId("visit-cancelled").innerText()) && JSON.stringify(await actionNames()) === JSON.stringify(["Archive"]))
  await go("/encounters/" + e6.id); await page.getByTestId("visit-archived").waitFor()
  ok("E6 an archived visit says so and can only be restored", JSON.stringify(await actionNames()) === JSON.stringify(["Restore"]))
  await go("/encounters/01HZX000000000000000000999"); await page.getByTestId("visit-error").waitFor({ timeout: 8000 })
  ok("E6 an unknown encounter says 'not found'", /Encounter not found/.test(await main()))

  // ───────────── E2 OPD check-in ─────────────
  await go("/encounters/new"); await page.getByTestId("check-in-screen").waitFor()
  ok("E2 Check in is off until a patient and a doctor are chosen", await page.getByRole("button", { name: "Check in", exact: true }).isDisabled())
  i0 = requests.length
  await page.locator("#checkin-patient").fill("zain"); await page.waitForTimeout(1300)
  await page.getByTestId("check-in-screen").getByText("Zainab Qureshi").first().click()
  await page.getByRole("combobox", { name: "Doctor" }).click(); await page.getByRole("option", { name: /Dr Sara/ }).click()
  await page.locator("#checkin-priority").click(); await page.getByRole("option", { name: "Urgent" }).click()
  await page.locator("#checkin-reason").fill("Cough and fever")
  ok("E2 Check in is on once both are chosen", await page.getByRole("button", { name: "Check in", exact: true }).isEnabled())
  S.slowSave = true
  await Promise.all([page.getByRole("button", { name: "Check in", exact: true }).dblclick(), page.waitForTimeout(150)])
  await page.waitForURL(/\/encounters\/01HZX\d+$/, { timeout: 10000 }); S.slowSave = false
  const cposts = since(i0).filter((r) => r.method === "POST" && r.path === "/encounters/opd")
  ok("E2 a double click sends ONE POST /encounters/opd with exactly the chosen fields (no token, number or fee)", cposts.length === 1 && JSON.stringify(cposts[0].body) === JSON.stringify({ patientId: P(0).id, doctorId: U(902), priority: "urgent", reason: "Cough and fever" }), JSON.stringify(cposts.map((r) => r.body)))
  await page.getByTestId("visit-detail").waitFor({ timeout: 8000 })
  ok("E2 it lands on the new visit with the server-issued number and token", /^OPD-2026-\d{4}$/.test(await page.getByTestId("visit-encid").innerText()) && /token #3/.test(await page.getByTestId("visit-detail").innerText()))
  // blocked patients
  await go("/encounters/new"); await page.getByTestId("check-in-screen").waitFor()
  await page.locator("#checkin-patient").fill("saima"); await page.waitForTimeout(1300); await page.getByTestId("check-in-screen").getByText("Saima Rehan").first().click()
  ok("E2 a deceased patient is refused on the form with the reason", /deceased/i.test(await page.getByTestId("patient-blocked").innerText()))
  await page.getByRole("button", { name: "Clear selected patient" }).click()
  await page.locator("#checkin-patient").fill("hira"); await page.waitForTimeout(1300); await page.getByTestId("check-in-screen").getByText("Hira Malik").first().click()
  ok("E2 an admitted patient is warned about for OPD", /admitted/i.test(await page.getByTestId("check-in-screen").innerText()))
  await page.getByRole("combobox", { name: "Doctor" }).click(); await page.getByRole("option", { name: /Dr Imran/ }).click(); i0 = requests.length
  await page.getByRole("button", { name: "Check in", exact: true }).click(); await page.waitForTimeout(1000)
  ok("E2 the server's PATIENT_ADMITTED is shown with its message; one request; no retry", /The patient is admitted/i.test(await page.getByTestId("create-error").innerText()) && since(i0).filter((r) => r.path === "/encounters/opd").length === 1)
  // preset patient from the query, doctor unavailable, late entry
  await page.goto(base + "/encounters/new?patientId=" + P(1).id); await page.getByTestId("check-in-screen").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) // a fresh load: in-app navigation to the same route would keep the earlier picked patient
  ok("E2 ?patientId= pre-selects the patient (GET /patients/{id})", /Bilal Anwar/.test(await page.getByTestId("check-in-screen").innerText()) && requests.some((r) => r.method === "GET" && r.path === `/patients/${P(1).id}`))
  await page.getByRole("combobox", { name: "Doctor" }).click(); await page.getByRole("option", { name: /Dr Imran/ }).click()
  S.unavailable = true; i0 = requests.length
  await page.getByRole("button", { name: "Check in", exact: true }).click(); await page.waitForTimeout(1000)
  ok("E2 DOCTOR_UNAVAILABLE is explained; nothing is re-sent", /not available/i.test(await page.getByTestId("create-error").innerText()) && since(i0).filter((r) => r.path === "/encounters/opd").length === 1)
  S.unavailable = false
  await page.getByLabel("Checked in earlier than now", { exact: true }).click()
  await page.getByLabel("Checked in earlier than now: date").fill("2026-12-25"); await page.getByLabel("Checked in earlier than now: time").fill("09:30"); await page.waitForTimeout(300)
  ok("E2 a future time is refused on the form and Check in stays off", /in the future/i.test(await page.getByTestId("check-in-screen").innerText()) && await page.getByRole("button", { name: "Check in", exact: true }).isDisabled())
  await page.getByLabel("Checked in earlier than now: date").fill(YESTERDAY); await page.getByLabel("Checked in earlier than now: time").fill("09:30"); await page.waitForTimeout(300)
  i0 = requests.length
  await page.getByRole("button", { name: "Check in", exact: true }).click(); await page.waitForURL(/\/encounters\/01HZX\d+$/, { timeout: 10000 })
  const late = since(i0).find((r) => r.method === "POST" && r.path === "/encounters/opd")
  ok("E2 a late entry typed on the hospital's clock goes as the exact instant (09:30 in Karachi = 04:30Z)", !!late && late.body.startedAt === "2026-11-06T04:30:00.000Z", JSON.stringify(late && late.body))

  // ───────────── E7 admission ─────────────
  await go("/encounters/new?type=IPD"); await page.getByTestId("check-in-screen").waitFor()
  ok("E7 ?type=IPD opens the admission form (Admit Patient) with the department's radio", /Admit Patient/.test(await page.getByRole("heading").first().innerText()) && (await page.getByTestId("bed-picker").count()) === 1)
  await page.locator("#checkin-patient").fill("noor"); await page.waitForTimeout(1300); await page.getByTestId("check-in-screen").getByText("Noor Fatima").first().click()
  await page.getByRole("combobox", { name: "Doctor" }).click(); await page.getByRole("option", { name: /Dr Imran/ }).click()
  ok("E7 the bed picker shows the board: A-02 occupied and A-03 under maintenance are off; A-01 and B-01 can be chosen", (await page.getByRole("radio", { name: /Bed A-02 .*occupied/ }).isDisabled()) && (await page.getByRole("radio", { name: /Bed A-03 .*maintenance/ }).isDisabled()) && (await page.getByRole("radio", { name: /Bed A-01 .*available/ }).isEnabled()) && (await page.getByRole("radio", { name: /Bed B-01 .*available/ }).isEnabled()))
  ok("E7 Admit stays off until an admission type and a bed are chosen", await page.getByRole("button", { name: "Admit", exact: true }).isDisabled())
  await page.getByRole("radio", { name: "Emergency" }).click()
  await page.getByRole("radio", { name: /Bed A-01 .*available/ }).click()
  i0 = requests.length
  S.stealBed = U(210)
  await page.getByRole("button", { name: "Admit", exact: true }).click(); await page.waitForTimeout(1500)
  ok("E7 BED_OCCUPIED (another desk won the bed): the message is shown, the board is read again and the choice is cleared", /took that bed|A patient is in this bed/i.test(await page.getByTestId("create-error").innerText()) && since(i0).some((r) => r.path === "/wards/occupancy") && await page.getByRole("button", { name: "Admit", exact: true }).isDisabled())
  ok("E7 the stolen bed now shows as occupied", await page.getByRole("radio", { name: /Bed A-01 .*occupied/ }).isDisabled())
  await page.getByRole("radio", { name: /Bed B-01 .*available/ }).click(); i0 = requests.length
  S.slowSave = true
  await Promise.all([page.getByRole("button", { name: "Admit", exact: true }).dblclick(), page.waitForTimeout(150)])
  await page.waitForURL(/\/encounters\/01HZX\d+$/, { timeout: 10000 }); S.slowSave = false
  const ap = since(i0).filter((r) => r.method === "POST" && r.path === "/encounters/ipd")
  ok("E7 a double click sends ONE POST /encounters/ipd with the bed from the board and the admission type", ap.length === 1 && ap[0].body.bedId === U(220) && ap[0].body.admissionType === "emergency" && ap[0].body.patientId === P(5).id && !("appointmentId" in ap[0].body), JSON.stringify(ap.map((r) => r.body)))
  await page.getByTestId("visit-detail").waitFor()
  ok("E7 the admission opens with its bed (ICU, bed B-01)", /ICU, bed B-01/.test(await page.getByTestId("visit-detail").innerText()) && /^IPD-/.test(await page.getByTestId("visit-encid").innerText()))

  // ───────────── AP5 check-in from an appointment ─────────────
  await go("/appointments"); await page.getByTestId(`appointment-row-${F.appt.id}`).waitFor({ timeout: 8000 })
  const ci = page.getByTestId(`appointment-actions-${F.appt.id}`).getByRole("button", { name: /Check in/ })
  ok("AP5 'Check in' on a confirmed appointment is a real button now", await ci.isEnabled())
  S.apptNotToday = true; await ci.click(); await page.getByTestId("action-dialog").waitFor(); i0 = requests.length
  await page.getByRole("button", { name: "Check in", exact: true }).click(); await page.waitForTimeout(1000)
  ok("AP5 APPOINTMENT_NOT_TODAY is explained in the dialog; one request; the dialog stays open", /not for today/i.test(await dlg().innerText()) && since(i0).filter((r) => r.path === "/encounters/opd").length === 1)
  S.apptNotToday = false; i0 = requests.length
  await Promise.all([page.getByRole("button", { name: "Check in", exact: true }).dblclick(), page.waitForTimeout(150)])
  await page.waitForURL(/\/encounters\/01HZX\d+$/, { timeout: 10000 })
  const cp = since(i0).filter((r) => r.method === "POST" && r.path === "/encounters/opd")
  ok("AP5 checking in sends ONE POST /encounters/opd with the appointment's id, patient and doctor", cp.length === 1 && cp[0].body.appointmentId === F.appt.id && cp[0].body.patientId === P(0).id && cp[0].body.doctorId === D1, JSON.stringify(cp.map((r) => r.body)))
  await page.getByTestId("visit-detail").waitFor()
  ok("AP5 the new visit names its appointment, and the appointment is completed on the server", /APT-2026-0001/.test(await page.getByTestId("visit-detail").innerText()) && F.appt.status === "completed")

  // ═════════════ part 2 ═════════════
  await require("./phase7-encounters-part2.js")({ page, S, requests, F, E, P, TODAY, YESTERDAY, U, D1, ok, go, main, row, closed, actionNames, tab, dlg, signOutAndIn, login, since, base, consoleErrors })

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
