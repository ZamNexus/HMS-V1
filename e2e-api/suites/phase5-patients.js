// Phase 5 browser check: patients (PT1-PT7), API mode. TEST HARNESS ONLY. No real backend, no credentials: a stateful fake backend inside
// Playwright's route(); every request body is validated against docs/openapi.json and so is every response the fake sends.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])
const U = (n) => "01HZX" + String(n).padStart(21, "0")
const NOW = "2026-11-07T10:00:00.000Z"
const TODAY = "2026-11-07"

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const LENIENT = { lenientStringArrays: true }
  const violations = []
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const permEnum = new Set(schemaOf("AuthUserDto_Output").properties.permissions.items.enum)
  const forCheck = (u) => ({ ...u, permissions: u.permissions.filter((p) => permEnum.has(p)) })

  const S = { perms: stubs.ALL_PERMISSIONS, n: 0, cookie: false, slowSave: false, bump: null, version: 0 }
  const panels = [
    { id: U(101), name: "State Life", type: "insurance", contactPerson: null, phone: null, commissionPct: null, discountPct: "0.00", billingMode: "patient_pays", active: true, createdAt: NOW },
    { id: U(102), name: "EFU Health", type: "corporate", contactPerson: null, phone: null, commissionPct: null, discountPct: "0.00", billingMode: "patient_pays", active: true, createdAt: NOW },
  ]
  const relations = ["Husband", "Father"].map((name, i) => ({ id: U(201 + i), name, remarks: null, active: true, createdAt: NOW }))
  const covOut = (c) => { const pn = panels.find((x) => x.id === c.panelId); return { panel: { id: pn.id, name: pn.name, type: pn.type, active: pn.active, discountPct: pn.discountPct, billingMode: pn.billingMode }, priority: c.priority, memberNo: c.memberNo ?? null, principalMemberName: c.principalMemberName ?? null, principalRelation: c.principalRelation ?? null, validFrom: c.validFrom ?? null, validTo: c.validTo ?? null, benefitsApply: true } }
  const mk = (i, o) => ({ id: U(1 + i), mrNo: `MR-2026-${String(100 + i).padStart(4, "0")}`, name: "P", fatherName: null, gender: "male", dob: "1985-03-02", dobEstimated: false, phone: `0300-55500${String(10 + i)}`, cnic: null, city: "Lahore",
    registrationDate: `2026-10-${String(28 - i).padStart(2, "0")}`, admitted: false, lastVisitDate: null, deceasedOn: null, archived: false, medicalRecordNo: null, emergencyContact: null, email: null, address: "House " + (i + 1), area: null,
    country: "Pakistan", bloodGroup: null, guardian: null, guardianName: null, referredBy: null, remarks: null, photoUrl: null, coverages: [], balance: "0.00", archivedAt: null, createdAt: NOW, updatedAt: NOW, ...o })
  const db = [
    mk(0, { name: "Zainab Qureshi", fatherName: "Imran Qureshi", gender: "female", dob: "1990-05-17", phone: "+923001234567", cnic: "3520112345671", bloodGroup: "A+", guardian: relations[0], guardianName: "Mr Qureshi", balance: "1500.00", lastVisitDate: "2026-10-30",
      coverages: [{ panelId: panels[0].id, priority: "primary", memberNo: "M-77", principalMemberName: "Mr Qureshi", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31" }, { panelId: panels[1].id, priority: "secondary" }] }),
    mk(1, { name: "Bilal Anwar", balance: "0.00" }),
    mk(2, { name: "Hira Malik", gender: "female", dob: "1975-08-20", admitted: true, balance: "-200.00" }),
    mk(3, { name: "Usman Ghani", dob: "1981-11-07", dobEstimated: true }),
    mk(4, { name: "Saima Rehan", gender: "female", dob: "1960-01-01", deceasedOn: "2026-09-01" }),
    mk(5, { name: "Tariq Jamil", phone: "0333-5550099", archived: true, archivedAt: NOW }),
    mk(6, { name: "Noor Fatima", gender: "female", dob: "2026-03-01", admitted: true }),
    ...["Kamran Shah", "Amna Siddiqui", "Farhan Iqbal", "Rabia Aslam", "Imtiaz Baig", "Sadia Noor"].map((name, k) => mk(7 + k, { name })),
  ]
  const live = () => db.filter((p) => !p.archived)
  const toItem = (p) => { const pri = p.coverages.find((c) => c.priority === "primary"); return { id: p.id, mrNo: p.mrNo, name: p.name, fatherName: p.fatherName, gender: p.gender, dob: p.dob, dobEstimated: p.dobEstimated, phone: p.phone, cnic: p.cnic, city: p.city, registrationDate: p.registrationDate,
    primaryPanel: pri ? { id: pri.panelId, name: panels.find((x) => x.id === pri.panelId).name } : null, admitted: p.admitted, lastVisitDate: p.lastVisitDate, balance: S.perms.includes("billing.read") ? p.balance : null, deceasedOn: p.deceasedOn, archived: p.archived } }
  const toDetail = (p) => ({ id: p.id, mrNo: p.mrNo, name: p.name, fatherName: p.fatherName, gender: p.gender, dob: p.dob, dobEstimated: p.dobEstimated, phone: p.phone, cnic: p.cnic, city: p.city, registrationDate: p.registrationDate, admitted: p.admitted, lastVisitDate: p.lastVisitDate,
    deceasedOn: p.deceasedOn, archived: p.archived, medicalRecordNo: p.medicalRecordNo, emergencyContact: p.emergencyContact, email: p.email, address: p.address, area: p.area, country: p.country, bloodGroup: p.bloodGroup, guardianRelation: p.guardian ? { id: p.guardian.id, name: p.guardian.name } : null,
    guardianName: p.guardianName, referredBy: p.referredBy, remarks: p.remarks, photoUrl: p.photoUrl, coverages: p.coverages.map(covOut), archivedAt: p.archivedAt, createdAt: p.createdAt, updatedAt: p.updatedAt })
  const bumpVersion = (p) => { p.updatedAt = new Date(Date.parse(NOW) + ++S.version * 1000).toISOString() }
  const digits = (s) => (s || "").replace(/\D/g, "")
  const matchesFor = (phone, cnic) => db.filter((p) => (phone && digits(p.phone).slice(-10) === digits(phone).slice(-10)) || (cnic && p.cnic && digits(p.cnic) === digits(cnic))).map((p) => ({ id: p.id, mrNo: p.mrNo, name: p.name, fatherName: p.fatherName, gender: p.gender, dob: p.dob, phone: p.phone, cnic: p.cnic, deceasedOn: p.deceasedOn, archived: p.archived, matchedOn: ["phone"] }))

  const requests = []
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, extra = {}) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...extra })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 20); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const issue = () => "tok-" + ++S.n

  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method()
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(url.searchParams), body })
    if (m === "POST" && p === "/auth/login") { S.cookie = true; const out = { accessToken: issue(), tokenType: "Bearer", expiresIn: 900, user: stubs.userBody({ permissions: S.perms }) }; check("login", { ...out, user: forCheck(out.user) }, "SignInResponseDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "POST" && p === "/auth/refresh") return S.cookie ? json(route, 200, { accessToken: issue(), tokenType: "Bearer", expiresIn: 900, mustChangePassword: false }) : err(route, 401, "SESSION_MISSING", "No session.")
    if (m === "GET" && p === "/public/hospital") return err(route, 404, "NOT_FOUND", "none")
    if (m === "POST" && p === "/auth/logout") { S.cookie = false; return route.fulfill({ status: 204 }) }
    if (m === "GET" && p === "/auth/me") return json(route, 200, stubs.userBody({ permissions: S.perms }))
    if (m === "GET" && p === "/settings") return json(route, 200, stubs.settingsBody())
    if (m === "GET" && p === "/settings/modules") return json(route, 200, stubs.modulesBody(true))
    if (m === "GET" && p === "/panels") { const out = pageOf(panels, url.searchParams); check("GET /panels", out, "PanelPageDto_Output", LENIENT); return json(route, 200, out) }
    // the dashboard now lists today's appointments and the low-stock medicines (Phase 11): none here
    if (m === "GET" && p === "/appointments") { const out = pageOf([], url.searchParams); check("GET /appointments", out, "AppointmentPageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/medicines") { const out = pageOf([], url.searchParams); check("GET /medicines", out, "MedicinePageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/guardian-relations") { const out = pageOf(relations, url.searchParams); check("GET /guardian-relations", out, "GuardianRelationPageDto_Output", LENIENT); return json(route, 200, out) }
    let mm
    if (m === "GET" && p === "/patients") {
      const q = url.searchParams
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const s = (q.get("search") || "").toLowerCase()
      let rows = db.filter((x) => (q.get("includeArchived") === "true" ? true : !x.archived))
      if (s) rows = rows.filter((x) => x.name.toLowerCase().includes(s) || x.mrNo.toLowerCase().includes(s) || x.phone.includes(s) || (x.cnic || "").includes(s))
      if (q.get("gender")) rows = rows.filter((x) => x.gender === q.get("gender"))
      if (q.get("admitted")) rows = rows.filter((x) => String(x.admitted) === q.get("admitted"))
      if (q.get("selfPay")) rows = rows.filter((x) => (x.coverages.length === 0) === (q.get("selfPay") === "true"))
      if (q.get("panelId")) rows = rows.filter((x) => x.coverages.some((c) => c.panelId === q.get("panelId")))
      if (q.get("registeredFrom")) rows = rows.filter((x) => x.registrationDate >= q.get("registeredFrom"))
      if (q.get("registeredTo")) rows = rows.filter((x) => x.registrationDate <= q.get("registeredTo"))
      rows = [...rows].sort((a, b) => (a.registrationDate < b.registrationDate ? 1 : a.registrationDate > b.registrationDate ? -1 : 0))
      const out = pageOf(rows.map(toItem), q); check("GET /patients", out, "PatientPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "GET" && p === "/patients/duplicates") { const out = { matches: matchesFor(url.searchParams.get("phone"), url.searchParams.get("cnic")) }; check("GET /patients/duplicates", out, "DuplicateCheckDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "POST" && p === "/patients") {
      check("POST /patients request", body, "CreatePatientDto", LENIENT)
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      const dups = matchesFor(body.phone, body.cnic)
      if (dups.length && body.acknowledgeDuplicates !== true) return err(route, 409, "POSSIBLE_DUPLICATE", "A patient with this phone number or CNIC already exists.", { details: { matches: dups } })
      const est = body.estimatedAge
      const dob = body.dob ?? (est ? `${Number(TODAY.slice(0, 4)) - (est.unit === "years" ? est.value : 0)}${TODAY.slice(4)}` : TODAY)
      const rec = mk(db.length, { id: U(800 + db.length), mrNo: `MR-2026-${5000 + db.length}`, name: body.name, fatherName: body.fatherName ?? null, gender: body.gender, dob, dobEstimated: !!est, phone: body.phone, cnic: body.cnic ?? null, city: body.city ?? null,
        registrationDate: TODAY, email: body.email ?? null, address: body.address ?? null, country: body.country ?? null, bloodGroup: body.bloodGroup ?? null, coverages: body.coverages ?? [], guardian: body.guardianRelationId ? relations.find((r) => r.id === body.guardianRelationId) : null, guardianName: body.guardianName ?? null })
      db.push(rec)
      const out = toDetail(rec); check("POST /patients response", out, "PatientDetailDto_Output", LENIENT); return json(route, 201, out)
    }
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})$/))) {
      const x = db.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "Patient not found")
      if (m === "GET") { const out = toDetail(x); check("GET /patients/{id}", out, "PatientDetailDto_Output", LENIENT); return json(route, 200, out) }
      if (m === "PATCH") {
        check("PATCH /patients request", body, "UpdatePatientDto", LENIENT)
        if (S.bump === x.id) { S.bump = null; x.phone = "0300-1112223"; bumpVersion(x) } // someone else saved first
        if (x.archived) return err(route, 422, "PATIENT_ARCHIVED", "This patient is archived. Restore the patient first.")
        if (body.expectedUpdatedAt && body.expectedUpdatedAt !== x.updatedAt) return err(route, 409, "PATIENT_CHANGED", "Someone else changed this patient.")
        for (const k of ["name", "gender", "phone", "fatherName", "cnic", "emergencyContact", "email", "address", "area", "city", "country", "bloodGroup", "guardianName", "referredBy", "remarks", "medicalRecordNo", "dob"]) if (k in body) x[k] = body[k] === "" ? null : body[k]
        if (body.estimatedAge) { x.dob = `${Number(TODAY.slice(0, 4)) - body.estimatedAge.value}${TODAY.slice(4)}`; x.dobEstimated = true } else if (body.dob) x.dobEstimated = false
        if ("coverages" in body) x.coverages = body.coverages
        if ("guardianRelationId" in body) x.guardian = body.guardianRelationId ? relations.find((r) => r.id === body.guardianRelationId) : null
        bumpVersion(x)
        const out = toDetail(x); check("PATCH /patients response", out, "PatientDetailDto_Output", LENIENT); return json(route, 200, out)
      }
    }
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})\/(archive|restore|record-death|revoke-death)$/)) && m === "POST") {
      const x = db.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "no")
      const act = mm[2]
      if (act === "record-death") check("POST record-death request", body, "RecordDeathDto")
      if ((act === "archive" || act === "record-death") && x.admitted) return err(route, 422, "PATIENT_ADMITTED", act === "archive" ? "The patient is admitted: discharge the patient first." : "The patient is admitted: discharge the patient as expired instead.")
      if (act === "archive") { x.archived = true; x.archivedAt = NOW }
      if (act === "restore") { x.archived = false; x.archivedAt = null }
      if (act === "record-death") x.deceasedOn = body.deceasedOn
      if (act === "revoke-death") x.deceasedOn = null
      bumpVersion(x)
      const out = toDetail(x); check("POST " + act + " response", out, "PatientDetailDto_Output", LENIENT); return json(route, 200, out)
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement this")
  }

  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1200 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", handler)
  const since = (i) => requests.slice(i)
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const main = () => page.locator("main").innerText()
  const row = (i) => page.getByTestId(`patient-row-${db[i].id}`)

  await login()
  // ───────────── PT1 list ─────────────
  let i0 = requests.length
  await go("/patients")
  await row(0).waitFor({ timeout: 8000 })
  const first = since(i0).find((r) => r.method === "GET" && r.path === "/patients")
  ok("PT1 the list asks GET /patients page 1, perPage 10; no sort invented, archived not asked for", !!first && first.query.page === "1" && first.query.perPage === "10" && !("sort" in first.query) && !("includeArchived" in first.query), JSON.stringify(first && first.query))
  let text = await main()
  ok("PT1 total is the server's (12 live patients) and the archived patient is hidden", /12 registered patients/.test(text) && !text.includes("Tariq Jamil"), text.slice(0, 120).replace(/\n/g, " "))
  ok("PT1 age is counted on the hospital calendar (36 yrs, ~45 yrs for an estimate, 8 mo for an infant)", /36 yrs/.test(await row(0).innerText()) && /~45 yrs/.test(await row(3).innerText()) && /^[\s\S]*8 mo/.test(await row(6).innerText()), (await row(3).innerText()).replace(/\n/g, " "))
  ok("PT1 phone is shown from E.164 as 0300-1234567; the organisation name and Self-pay appear", (await row(0).innerText()).includes("0300-1234567") && (await row(0).innerText()).includes("State Life") && (await row(1).innerText()).includes("Self-pay"))
  ok("PT1 the Balance column shows (billing.read): Rs-formatted for Zainab, a dash is never invented", /1,500\.00/.test(await page.getByTestId(`patient-balance-${db[0].id}`).innerText()), await page.getByTestId(`patient-balance-${db[0].id}`).innerText())
  ok("PT1 the deceased patient is badged; the admitted one shows IPD Admitted", /Deceased/.test(await row(4).innerText()) && /IPD Admitted/.test(await row(2).innerText()))
  ok("PT1 Register Patient and Edit are shown (patients.write)", (await page.getByRole("link", { name: /Register Patient/ }).count()) === 1 && (await page.getByRole("link", { name: `Edit ${db[0].name}` }).count()) === 1)

  i0 = requests.length
  await row(1).hover(); await page.waitForTimeout(700)
  ok("PT1 hovering a row prefetches that patient (GET /patients/{id}) before any click", since(i0).some((r) => r.method === "GET" && r.path === "/patients/" + db[1].id))

  i0 = requests.length
  await page.getByLabel("Search patients").fill("hira"); await page.waitForTimeout(1300)
  const sreq = since(i0).filter((r) => r.path === "/patients" && r.method === "GET")
  ok("PT1 search is debounced: ONE request with search=hira on page 1", sreq.length === 1 && sreq[0].query.search === "hira" && !("page" in sreq[0].query && sreq[0].query.page !== "1"), JSON.stringify(sreq.map((r) => r.query)))
  ok("PT1 the search text is NOT in the address bar", !/hira|search/i.test(page.url()), page.url())
  text = await main()
  ok("PT1 only the match is shown", text.includes("Hira Malik") && !text.includes("Zainab Qureshi"))
  await page.getByLabel("Search patients").fill(""); await page.waitForTimeout(1000)

  i0 = requests.length
  await page.getByRole("tab", { name: "IPD" }).click(); await page.waitForTimeout(1000)
  ok("PT1 the IPD tab sends admitted=true and the address bar keeps view=ipd", since(i0).some((r) => r.path === "/patients" && r.query.admitted === "true") && /view=ipd/.test(page.url()), page.url())
  ok("PT1 IPD shows exactly the two admitted patients", (await main()).includes("Hira Malik") && (await main()).includes("Noor Fatima") && !(await main()).includes("Zainab Qureshi"))
  i0 = requests.length
  await page.getByRole("tab", { name: "Active" }).click(); await page.waitForTimeout(1000)
  ok("PT1 the Active tab sends admitted=false", since(i0).some((r) => r.path === "/patients" && r.query.admitted === "false"))
  i0 = requests.length
  await page.getByRole("tab", { name: "With archived" }).click(); await page.waitForTimeout(1000)
  ok("PT1 'With archived' sends includeArchived=true and shows the archived patient marked Inactive", since(i0).some((r) => r.path === "/patients" && r.query.includeArchived === "true") && /Tariq Jamil/.test(await main()) && /Inactive/i.test(await row(5).innerText()))
  ok("PT1 there is no 'Inactive' tab against the API (no archived-only filter exists)", (await page.getByRole("tab", { name: "Inactive" }).count()) === 0)
  await page.getByRole("tab", { name: "All" }).click(); await page.waitForTimeout(800)

  i0 = requests.length
  await page.getByRole("combobox", { name: "Gender" }).click(); await page.getByRole("option", { name: "Female" }).click(); await page.waitForTimeout(900)
  ok("PT1 the gender filter is sent as gender=female", since(i0).some((r) => r.path === "/patients" && r.query.gender === "female") && /gender=Female/.test(page.url()))
  i0 = requests.length
  await page.getByRole("combobox", { name: "Organisation" }).click(); await page.getByRole("option", { name: "Self-pay only" }).click(); await page.waitForTimeout(900)
  ok("PT1 'Self-pay only' is sent as selfPay=true", since(i0).some((r) => r.path === "/patients" && r.query.selfPay === "true" && r.query.gender === "female"))
  i0 = requests.length
  await page.getByRole("combobox", { name: "Organisation" }).click(); await page.getByRole("option", { name: "State Life" }).click(); await page.waitForTimeout(900)
  ok("PT1 choosing an organisation is sent as panelId", since(i0).some((r) => r.path === "/patients" && r.query.panelId === panels[0].id))
  await page.getByRole("combobox", { name: "Gender" }).click(); await page.getByRole("option", { name: "Any gender" }).click(); await page.waitForTimeout(600)
  i0 = requests.length
  await page.getByLabel("Registered from").fill("2026-10-27"); await page.waitForTimeout(900)
  ok("PT1 the registration date range is sent (registeredFrom)", since(i0).some((r) => r.path === "/patients" && r.query.registeredFrom === "2026-10-27"))
  await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(900)
  ok("PT1 'Clear filters' empties the address bar filters", !/view=|gender=|panel=|from=|to=/.test(page.url()), page.url())

  i0 = requests.length
  await page.getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(900)
  ok("PT1 paging asks the server for page 2 and keeps page=2 in the address bar", since(i0).some((r) => r.path === "/patients" && r.query.page === "2") && /page=2/.test(page.url()) && (await main()).includes("Sadia Noor"), page.url())

  // a shared / refreshed link keeps the filters
  i0 = requests.length
  await page.goto(base + "/patients?view=ipd&gender=Female"); await row(2).waitFor({ timeout: 15000 }); await page.waitForTimeout(500)
  ok("PT1 a refreshed link restores the filters from the address bar (view=ipd&gender=Female -> admitted=true&gender=female)", since(i0).some((r) => r.path === "/patients" && r.query.admitted === "true" && r.query.gender === "female"))

  // ───────────── PT4 profile ─────────────
  i0 = requests.length
  await go("/patients/" + db[0].id)
  await page.getByTestId("profile-age").waitFor({ timeout: 8000 })
  ok("PT4 the profile reads GET /patients/{id}", since(i0).some((r) => r.method === "GET" && r.path === "/patients/" + db[0].id))
  ok("PT4 age on the hospital calendar, phone from E.164, CNIC with dashes", /36 yrs/.test(await page.getByTestId("profile-age").innerText()) && /0300-1234567/.test(await main()) && /35201-1234567-1/.test(await main()))
  text = await main()
  ok("PT4 both coverages with member details and benefits shown", (await page.getByTestId("profile-coverage-primary").innerText()).includes("M-77") && (await page.getByTestId("profile-coverage-primary").innerText()).includes("Mr Qureshi (Husband)") && (await page.getByTestId("profile-coverage-secondary").innerText()).includes("EFU Health") && /Apply today/.test(text))
  await go("/patients/" + db[3].id)
  await page.getByTestId("profile-age").waitFor()
  ok("PT4 an estimated date of birth reads '~45 yrs' and '(estimated)'", /~45 yrs/.test(await page.getByTestId("profile-age").innerText()) && /\(estimated\)/.test(await page.getByTestId("profile-dob").innerText()))
  await go("/patients/" + db[4].id)
  await page.getByTestId("profile-deceased-banner").waitFor({ timeout: 8000 })
  ok("PT4 a deceased patient: banner, age counted to the date of death (66 yrs), no New Encounter", /66 yrs/.test(await page.getByTestId("profile-age").innerText()) && (await page.getByRole("link", { name: /New Encounter/ }).count()) === 0, await page.getByTestId("profile-age").innerText())
  await go("/patients/" + db[5].id)
  await page.getByTestId("profile-archived-banner").waitFor({ timeout: 8000 })
  ok("PT4 an archived patient: banner, Restore Patient offered, no New Encounter", (await page.getByRole("button", { name: "Restore Patient" }).count()) === 1 && (await page.getByRole("link", { name: /New Encounter/ }).count()) === 0)

  // ───────────── PT2 register / PT3 duplicates ─────────────
  await go("/patients/new")
  await page.getByRole("heading", { name: "Register New Patient" }).waitFor()
  ok("PT2 the MR number is 'Assigned on registration' (never predicted); no photo, SS/Emp, registration date or Active switch", /Assigned on registration/.test(await page.getByTestId("mr-number").innerText()) && (await page.getByText("SS/Emp No").count()) === 0 && (await page.getByText("Registration Date").count()) === 0 && (await page.getByText("Patient Active Status").count()) === 0)
  ok("PT2 'Save & OPD/IPD Ticket' are on for a user with encounters.check_in / ipd.admit and the inpatient department on (Phase 7)", await page.getByRole("button", { name: /Save & OPD Ticket/ }).isEnabled() && await page.getByRole("button", { name: /Save & IPD Ticket/ }).isEnabled())
  // validation first: nothing is sent
  i0 = requests.length
  await page.getByLabel("Full Name *").fill("Test Patient")
  await page.getByLabel("Primary Phone *").fill("abcdef")
  await page.getByRole("button", { name: "Register Patient" }).click(); await page.waitForTimeout(600)
  ok("PT2 a bad phone is refused on the form with the contract's rule, nothing is sent", /digits, spaces/.test(await main()) && since(i0).filter((r) => r.method === "POST" && r.path === "/patients").length === 0)
  await page.getByLabel("Primary Phone *").fill("+92 300 7001234")
  await page.getByLabel("CNIC").fill("123"); await page.getByRole("button", { name: "Register Patient" }).click(); await page.waitForTimeout(600)
  ok("PT2 a bad CNIC is refused (13 digits)", /13 digits/.test(await main()) && since(i0).filter((r) => r.method === "POST" && r.path === "/patients").length === 0)
  await page.getByLabel("CNIC").fill("")
  // neither date of birth nor estimated age
  await page.getByRole("button", { name: "Register Patient" }).click(); await page.waitForTimeout(600)
  ok("PT2 neither a date of birth nor an estimated age is refused with a clear message, nothing is sent", /Date of birth is required/.test(await main()) && since(i0).filter((r) => r.method === "POST" && r.path === "/patients").length === 0)
  // estimated age + coverages
  await page.getByRole("radio", { name: /Estimated age/ }).click()
  await page.getByLabel("Estimated Age *").fill("45")
  await page.getByRole("combobox", { name: "Primary Panel/Organisation" }).click(); await page.getByRole("option", { name: "State Life" }).click()
  await page.getByTestId("coverage-primary").getByLabel("Member no.").fill("SL-9")
  await page.getByRole("combobox", { name: "Secondary Panel/Organisation" }).click(); await page.getByRole("option", { name: "EFU Health" }).click()
  await page.getByRole("combobox", { name: "Guardian/Relation" }).click(); await page.getByRole("option", { name: "Husband" }).click()
  await page.getByLabel("Guardian Name").fill("Mr Test")
  i0 = requests.length
  S.slowSave = true
  const save = page.getByRole("button", { name: "Register Patient" })
  await Promise.all([save.dblclick(), page.waitForTimeout(100)])
  await page.waitForURL(/\/patients\/01HZX/, { timeout: 10000 }); S.slowSave = false
  const posts = since(i0).filter((r) => r.method === "POST" && r.path === "/patients")
  ok("PT2 a double click sends ONE POST /patients", posts.length === 1, String(posts.length))
  const pb = posts[0] && posts[0].body
  ok("PT2 the body has estimatedAge {45, years} and NO dob; both coverages with the member no.; the relation by id; no MR number/photo/SS-Emp", !!pb && pb.estimatedAge && pb.estimatedAge.value === 45 && pb.estimatedAge.unit === "years" && !("dob" in pb) && pb.coverages.length === 2 && pb.coverages[0].priority === "primary" && pb.coverages[0].memberNo === "SL-9" && pb.coverages[1].priority === "secondary" && pb.guardianRelationId === relations[0].id && !("mrNo" in pb) && !("photoUrl" in pb) && !("ssEmpNo" in pb), JSON.stringify(pb))
  await page.getByTestId("profile-age").waitFor({ timeout: 8000 })
  ok("PT2 lands on the new patient with the server-issued MR number and '~45 yrs'", /MR-2026-5\d\d\d/.test(await page.getByTestId("profile-mr-no").innerText()) && /~45 yrs/.test(await page.getByTestId("profile-age").innerText()))

  // PT3: inline warning on blur, then the 409 flow
  await go("/patients/new")
  await page.getByLabel("Full Name *").fill("Another Zainab")
  i0 = requests.length
  await page.getByLabel("Primary Phone *").fill("0300-1234567"); await page.getByLabel("Full Name *").click(); await page.waitForTimeout(900)
  const dreq = since(i0).filter((r) => r.path === "/patients/duplicates")
  ok("PT3 leaving the phone box asks GET /patients/duplicates?phone=…", dreq.length === 1 && dreq[0].query.phone === "0300-1234567", JSON.stringify(dreq.map((r) => r.query)))
  await page.getByTestId("duplicate-matches").waitFor({ timeout: 5000 })
  ok("PT3 the warning names the existing patient and offers 'Open record'", /Zainab Qureshi/.test(await page.getByTestId("duplicate-matches").innerText()) && (await page.getByRole("link", { name: "Open record" }).count()) >= 1)
  // archived match offers Restore
  await page.getByLabel("Primary Phone *").fill("0333-5550099"); await page.getByLabel("Full Name *").click(); await page.waitForTimeout(900)
  ok("PT3 an archived match offers Restore (patients.archive)", /Tariq Jamil/.test(await page.getByTestId("duplicate-matches").innerText()) && (await page.getByRole("button", { name: "Restore this patient" }).count()) === 1)
  i0 = requests.length
  await page.getByRole("button", { name: "Restore this patient" }).click(); await page.waitForTimeout(900)
  ok("PT3 Restore sends POST /patients/{id}/restore and the archived patient is live again", since(i0).some((r) => r.method === "POST" && r.path === `/patients/${db[5].id}/restore`) && db[5].archived === false, since(i0).map((r) => r.method + " " + r.path).join(" > "))
  // register with a phone that matches: 409 -> panel -> register anyway
  await page.getByLabel("Primary Phone *").fill("0300-1234567")
  await page.getByLabel("Date of Birth *").fill("1992-02-02")
  i0 = requests.length
  await page.getByRole("button", { name: "Register Patient" }).click(); await page.waitForTimeout(1200)
  ok("PT3 the registration is refused (409 POSSIBLE_DUPLICATE) and sent ONCE; the matches are shown", since(i0).filter((r) => r.method === "POST" && r.path === "/patients").length === 1 && /already registered/.test(await main()) && /different person/.test(await main()))
  i0 = requests.length
  await page.getByRole("button", { name: /register anyway/ }).click()
  await page.waitForURL(/\/patients\/01HZX/, { timeout: 10000 })
  const again = since(i0).filter((r) => r.method === "POST" && r.path === "/patients")
  ok("PT3 'register anyway' sends exactly ONE more POST, with acknowledgeDuplicates: true", again.length === 1 && again[0].body.acknowledgeDuplicates === true, JSON.stringify(again.map((r) => r.body.acknowledgeDuplicates)))

  // ───────────── PT5 edit ─────────────
  await go("/patients/" + db[0].id + "/edit")
  await page.getByLabel("Primary Phone *").waitFor({ timeout: 8000 })
  i0 = requests.length
  await page.getByRole("button", { name: "Update Profile" }).click(); await page.waitForTimeout(1200)
  ok("PT5 saving an unchanged form sends NO PATCH", since(i0).filter((r) => r.method === "PATCH").length === 0)
  await go("/patients/" + db[0].id + "/edit")
  await page.getByLabel("Primary Phone *").waitFor({ timeout: 8000 })
  await page.getByLabel("Primary Phone *").fill("0300-9998877")
  i0 = requests.length
  await page.getByRole("button", { name: "Update Profile" }).click(); await page.waitForURL(/\/patients\/01HZX\d+$/, { timeout: 10000 }); await page.waitForTimeout(600)
  const patch = since(i0).find((r) => r.method === "PATCH")
  ok("PT5 the PATCH carries ONLY the changed phone and expectedUpdatedAt (nothing else, no coverages)", !!patch && JSON.stringify(Object.keys(patch.body).sort()) === JSON.stringify(["expectedUpdatedAt", "phone"]), JSON.stringify(patch && patch.body))
  ok("PT5 the stored coverages are untouched (the secondary organisation is still there)", db[0].coverages.length === 2)
  ok("PT5 the record is not read again before the PATCH (only the phone's advisory duplicate check may come first)", since(i0).findIndex((r) => r.method === "PATCH") >= 0 && !since(i0).slice(0, since(i0).findIndex((r) => r.method === "PATCH")).some((r) => r.method === "GET" && r.path === "/patients/" + db[0].id), since(i0).map((r) => r.method + " " + r.path).slice(0, 3).join(" > "))

  // conflict: someone else saves first; the typed city stays; Load latest; only the city is then sent
  await go("/patients/" + db[1].id + "/edit")
  await page.getByLabel("City").waitFor({ timeout: 8000 })
  await page.getByLabel("City").fill("Karachi")
  S.bump = db[1].id
  i0 = requests.length
  await page.getByRole("button", { name: "Update Profile" }).click(); await page.waitForTimeout(1200)
  ok("PT5 409 PATIENT_CHANGED shows the banner and keeps what was typed", (await page.getByTestId("conflict-banner").count()) === 1 && (await page.getByLabel("City").inputValue()) === "Karachi" && since(i0).filter((r) => r.method === "PATCH").length === 1)
  i0 = requests.length
  await page.getByRole("button", { name: "Load latest" }).click(); await page.waitForTimeout(1000)
  ok("PT5 Load latest reads the record; untouched fields show the fresh values (the other user's phone); the typed city stays", since(i0).some((r) => r.method === "GET" && r.path === "/patients/" + db[1].id) && (await page.getByLabel("Primary Phone *").inputValue()) === "0300-1112223" && (await page.getByLabel("City").inputValue()) === "Karachi", await page.getByLabel("Primary Phone *").inputValue())
  i0 = requests.length
  await page.getByRole("button", { name: "Update Profile" }).click(); await page.waitForURL(/\/patients\/01HZX\d+$/, { timeout: 10000 }); await page.waitForTimeout(500)
  const patch2 = since(i0).find((r) => r.method === "PATCH")
  ok("PT5 the second save sends ONLY the city with the fresh version, so the other user's phone is not overwritten", !!patch2 && JSON.stringify(Object.keys(patch2.body).sort()) === JSON.stringify(["city", "expectedUpdatedAt"]) && patch2.body.city === "Karachi" && db[1].phone === "0300-1112223", JSON.stringify(patch2 && patch2.body))

  // archived patient: banner, Save off
  await go("/patients/" + db[5].id + "/edit")
  db[5].archived = true; bumpVersion(db[5])
  await page.reload(); await page.getByTestId("archived-banner").waitFor({ timeout: 15000 })
  ok("PT5/6 an archived patient shows the banner, Update Profile is disabled and Restore Patient is offered", await page.getByRole("button", { name: "Update Profile" }).isDisabled() && (await page.getByRole("button", { name: "Restore Patient" }).count()) === 1)
  i0 = requests.length
  await page.getByRole("button", { name: "Restore Patient" }).click(); await page.waitForURL(/\/patients\/01HZX\d+$/, { timeout: 10000 }); await page.waitForTimeout(500)
  ok("PT6 Restore sends POST /patients/{id}/restore, then the profile shows the patient live", since(i0).some((r) => r.method === "POST" && r.path === `/patients/${db[5].id}/restore`) && db[5].archived === false)

  // ───────────── PT6 archive ─────────────
  await go("/patients/" + db[6].id)
  await page.getByRole("button", { name: "Archive Patient" }).click()
  i0 = requests.length
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click(); await page.waitForTimeout(900)
  ok("PT6 archiving an admitted patient: 422 PATIENT_ADMITTED is explained in the dialog and the patient is NOT archived", /admitted/i.test(await page.getByRole("dialog").innerText()) && db[6].archived === false && since(i0).filter((r) => r.path.endsWith("/archive")).length === 1)
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click(); await page.waitForTimeout(400)
  await go("/patients/" + db[7].id)
  await page.getByRole("button", { name: "Archive Patient" }).click()
  ok("PT6 the archive dialog says hidden / kept / restorable, never 'permanently removed'", /restored/.test(await page.getByRole("dialog").innerText()) && !/permanent/i.test(await page.getByRole("dialog").innerText()))
  i0 = requests.length
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click(); await page.waitForURL("**/patients", { timeout: 10000 }); await page.waitForTimeout(800)
  ok("PT6 confirming sends ONE POST /patients/{id}/archive and returns to the list", since(i0).filter((r) => r.method === "POST" && r.path === `/patients/${db[7].id}/archive`).length === 1 && db[7].archived === true)
  ok("PT6 nothing is ever deleted (no DELETE request in the whole run)", !requests.some((r) => r.method === "DELETE"))

  // ───────────── PT7 death ─────────────
  await go("/patients/" + db[8].id)
  await page.getByRole("button", { name: "Record Death" }).click()
  const dlg = page.getByRole("dialog")
  ok("PT7 the dialog defaults to the hospital's today", (await dlg.getByLabel("Date of death *").inputValue()) === TODAY)
  i0 = requests.length
  await dlg.getByLabel("Date of death *").fill("2026-12-01"); await dlg.getByRole("button", { name: "Record Death" }).click(); await page.waitForTimeout(500)
  ok("PT7 a future date is refused on the form, nothing is sent", /cannot be in the future/.test(await dlg.innerText()) && since(i0).filter((r) => r.path.endsWith("record-death")).length === 0)
  await dlg.getByLabel("Date of death *").fill("2026-11-01")
  await Promise.all([dlg.getByRole("button", { name: "Record Death" }).dblclick(), page.waitForTimeout(150)])
  await page.getByTestId("profile-deceased-banner").waitFor({ timeout: 8000 })
  const dposts = since(i0).filter((r) => r.method === "POST" && r.path.endsWith("/record-death"))
  ok("PT7 a double click sends ONE POST record-death with {deceasedOn}", dposts.length === 1 && dposts[0].body.deceasedOn === "2026-11-01", JSON.stringify(dposts.map((r) => r.body)))
  ok("PT7 the profile now shows the Deceased badge, hides New Encounter and offers Revoke Death", (await page.getByRole("button", { name: "Revoke Death" }).count()) === 1 && (await page.getByRole("link", { name: /New Encounter/ }).count()) === 0)
  i0 = requests.length
  await page.getByRole("button", { name: "Revoke Death" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Revoke Death" }).click(); await page.waitForTimeout(1000)
  ok("PT7 Revoke Death (after a confirmation) sends POST revoke-death and the banner goes", since(i0).some((r) => r.method === "POST" && r.path.endsWith("/revoke-death")) && (await page.getByTestId("profile-deceased-banner").count()) === 0 && db[8].deceasedOn === null)
  await go("/patients/" + db[2].id)
  await page.getByRole("button", { name: "Record Death" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Record Death" }).click(); await page.waitForTimeout(900)
  ok("PT7 an admitted patient: 422 PATIENT_ADMITTED explains to record it through discharge; the patient is not marked deceased", /discharge/i.test(await page.getByRole("dialog").innerText()) && db[2].deceasedOn === null)
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()

  // ───────────── permissions ─────────────
  S.perms = ["patients.read", "catalogs.read", "settings.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); i0 = requests.length
  await go("/patients"); await row(0).waitFor({ timeout: 8000 })
  ok("PERM a read-only user: no Register button, no Edit buttons, no Balance column, balances are null from the server", (await page.getByRole("link", { name: /Register Patient/ }).count()) === 0 && (await page.getByRole("link", { name: `Edit ${db[0].name}` }).count()) === 0 && (await page.getByRole("columnheader", { name: "Balance" }).count()) === 0)
  await go("/patients/" + db[0].id)
  await page.getByTestId("profile-age").waitFor({ timeout: 8000 })
  ok("PERM a read-only user: no Edit, Archive or Record Death on the profile", (await page.getByRole("link", { name: /Edit Patient/ }).count()) === 0 && (await page.getByRole("button", { name: /Archive Patient|Record Death|Restore Patient/ }).count()) === 0)

  // ───────────── global ─────────────
  ok("no GET asked for more than 100 per page", !requests.some((r) => r.path === "/patients" && Number(r.query.perPage || 0) > 100))
  ok("every request/response the fake backend handled matches docs/openapi.json", violations.length === 0, violations.slice(0, 4).join(" || "))
  const known = ["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/settings", "/settings/modules", "/public/hospital", "/panels", "/guardian-relations", "/appointments", "/medicines", "/dashboard", "/reports/cash-flow"]
  const unexpected = requests.filter((r) => !known.includes(r.path) && !r.path.startsWith("/patients"))
  ok("no request reached a route the test backend does not implement", unexpected.length === 0, unexpected.map((r) => r.method + " " + r.path).join(", "))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (401|404|409|422|500)/.test(e))
  ok("no browser console/page errors other than the deliberate 409 / 422 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
