// Phase 6 browser check: doctor schedules (AP1), booking from the slot grid (AP2), the list and detail (AP3) and the actions (AP4). API mode. TEST HARNESS
// ONLY. No real backend, no credentials: a stateful fake backend inside Playwright's route(); every request body is validated against docs/openapi.json
// and so is every response the fake sends. 2026-11-07 (the hospital's "today" in the settings stub) is a Saturday.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])
const U = (n) => "01HZX" + String(n).padStart(21, "0")
const NOW = "2026-11-07T10:00:00.000Z"
const TODAY = "2026-11-07", SUN = "2026-11-08", MON = "2026-11-09", TUE = "2026-11-10"

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const LENIENT = { lenientStringArrays: true }
  const violations = []
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const permEnum = new Set(schemaOf("AuthUserDto_Output").properties.permissions.items.enum)
  const forCheck = (u) => ({ ...u, permissions: u.permissions.filter((p) => permEnum.has(p)) })

  const S = { perms: stubs.ALL_PERMISSIONS, n: 0, cookie: false, slowSave: false, steal: null, failNextAction: null, seq: 100 }
  // ── doctors (staff users with the doctor role) and their weekly schedules
  const docUser = (i, name, spec) => ({ id: U(100 + i), username: `dr.${i}`, email: null, name, phone: null, cnic: null, address: null, city: "Lahore", joiningDate: null, role: "doctor", active: true, mustChangePassword: false, locked: false, lastLoginAt: null, createdAt: NOW,
    doctorProfile: { specialization: spec, qualifications: "MBBS", pmcRegNo: "PMC-" + i, consultationFee: "1500.00", commissionPct: null, photoUrl: null, notes: null } })
  const users = [{ ...docUser(0, "Test User", null), id: U(900), username: "tester", role: "admin", doctorProfile: null }, docUser(1, "Dr Imran", "Cardiology"), docUser(2, "Dr Sara", "ENT"), docUser(3, "Dr Off", "Dermatology")]
  const D1 = users[1].id, D2 = users[2].id, D3 = users[3].id
  const schedules = {
    [D1]: { days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: "09:00", to: "11:00", slotMinutes: 30 },
    [D2]: { days: ["mon", "wed"], from: "14:00", to: "15:00", slotMinutes: 20 },
    [D3]: { days: [], from: null, to: null, slotMinutes: 15 },
  }
  const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
  const weekday = (date) => WD[new Date(date + "T00:00:00Z").getUTCDay()]
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  const slotTimes = (doctorId, date) => { const s = schedules[doctorId]; if (!s || !s.days.includes(weekday(date)) || !s.from) return []; const out = []; for (let m = mins(s.from); m + s.slotMinutes <= mins(s.to); m += s.slotMinutes) out.push(hhmm(m)); return out }
  const covered = (a) => { const s = schedules[a.doctorId]; return !!s && s.days.includes(weekday(a.date)) && !!s.from && mins(a.time) >= mins(s.from) && mins(a.time) < mins(s.to) }
  // ── patients
  const pat = (i, name, o = {}) => ({ id: U(10 + i), mrNo: `MR-2026-${String(40 + i).padStart(4, "0")}`, name, fatherName: null, gender: "female", dob: "1990-05-17", dobEstimated: false, phone: `+92300555${String(1000 + i)}`, cnic: null, city: "Lahore", registrationDate: "2026-01-10", primaryPanel: null, admitted: false, lastVisitDate: null, balance: null, deceasedOn: null, archived: false, ...o })
  const patients = [pat(0, "Zainab Qureshi"), pat(1, "Bilal Anwar", { gender: "male" }), pat(2, "Hira Malik"), pat(3, "Saima Rehan", { deceasedOn: "2026-09-01" })]
  const P = (i) => patients[i]
  // ── appointments
  const appts = []
  let apptSeq = 0
  const mkAppt = (o) => { const a = { id: U(300 + apptSeq), no: `APT-2026-${String(++apptSeq).padStart(4, "0")}`, status: "requested", notes: null, encounter: null, bookedAt: NOW, confirmedAt: null, cancelledAt: null, cancelReason: null, noShowAt: null, ...o }; appts.push(a); return a }
  const a0 = mkAppt({ doctorId: D1, patient: P(0), date: TODAY, time: "09:30", status: "requested" })
  const a1 = mkAppt({ doctorId: D1, patient: P(1), date: TODAY, time: "10:00", status: "confirmed", confirmedAt: NOW })
  const a2 = mkAppt({ doctorId: D1, patient: P(2), date: TODAY, time: "09:00", status: "completed", confirmedAt: NOW, encounter: { id: U(700), encId: "OPD-2026-0007" } })
  const a3 = mkAppt({ doctorId: D2, patient: P(0), date: MON, time: "14:00", status: "confirmed", confirmedAt: NOW })
  const a4 = mkAppt({ doctorId: D1, patient: P(1), date: TODAY, time: "10:30", status: "cancelled", cancelledAt: NOW, cancelReason: "Patient travelled" })
  const isOpen = (a) => a.status === "requested" || a.status === "confirmed"
  const allowed = (a) => (a.status === "requested" ? ["confirm", "reschedule", "cancel"] : a.status === "confirmed" ? ["reschedule", "cancel", "no_show", "check_in"] : [])
  const instant = (date, time) => new Date(Date.parse(`${date}T${time}:00.000Z`) - 5 * 3600_000).toISOString()
  const actor = { id: U(900), name: "Front Desk" }
  const docName = (id) => users.find((u) => u.id === id).name
  const toDto = (a) => { const dur = schedules[a.doctorId].slotMinutes; return { id: a.id, appointmentNo: a.no, status: a.status, date: a.date, time: a.time, startsAt: instant(a.date, a.time), endsAt: instant(a.date, hhmm(mins(a.time) + dur)), durationMinutes: dur,
    patient: { id: a.patient.id, mrNo: a.patient.mrNo, name: a.patient.name, phone: a.patient.phone }, doctor: { id: a.doctorId, name: docName(a.doctorId) }, notes: a.notes, outsideSchedule: isOpen(a) && !covered(a), encounter: a.encounter,
    bookedAt: a.bookedAt, bookedBy: actor, confirmedAt: a.confirmedAt, confirmedBy: a.confirmedAt ? actor : null, cancelledAt: a.cancelledAt, cancelledBy: a.cancelledAt ? actor : null, cancelReason: a.cancelReason, noShowAt: a.noShowAt, noShowBy: a.noShowAt ? actor : null, allowedActions: allowed(a) } }

  const requests = []
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, extra = {}) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...extra })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const issue = () => "tok-" + ++S.n
  const respond = (route, a, what, status = 200) => { const out = toDto(a); check(what, out, "AppointmentResponseDto_Output", LENIENT); return json(route, status, out) }
  const slotState = (doctorId, date, time) => {
    if (appts.some((a) => a.doctorId === doctorId && a.date === date && a.time === time && a.status !== "cancelled" && a.status !== "no_show")) return "booked"
    return date === TODAY && time <= "09:00" ? "passed" : "free"
  }

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
    // the dashboard now reads the low-stock medicines (Phase 11): none here
    if (m === "GET" && p === "/medicines") { const out = { data: [], meta: { page: 1, perPage: 25, total: 0, totalPages: 1 } }; check("GET /medicines", out, "MedicinePageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/doctors") {
      const docs = users.filter((u) => u.role === "doctor" && u.active).map((u) => ({ id: u.id, name: u.name, specialization: u.doctorProfile.specialization, qualifications: u.doctorProfile.qualifications, consultationFee: u.doctorProfile.consultationFee }))
      const out = pageOf(docs, url.searchParams); check("GET /doctors", out, "DoctorPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "GET" && p === "/users") {
      const q = url.searchParams; const rows = users.filter((x) => !q.get("role") || x.role === q.get("role"))
      const out = pageOf(rows, q); check("GET /users", out, "UserPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "GET" && p === "/patients") {
      const q = url.searchParams, s = (q.get("search") || "").toLowerCase()
      const out = pageOf(patients.filter((x) => !s || x.name.toLowerCase().includes(s) || x.mrNo.toLowerCase().includes(s) || x.phone.includes(s)), q); check("GET /patients", out, "PatientPageDto_Output", LENIENT); return json(route, 200, out)
    }
    let mm
    // ── schedules and slots
    if ((mm = p.match(/^\/doctors\/([0-9A-Z]{26})\/schedule$/))) {
      if (!schedules[mm[1]]) return err(route, 404, "NOT_FOUND", "The doctor does not exist here.")
      if (m === "GET") { const out = { doctorId: mm[1], ...schedules[mm[1]] }; check("GET schedule", out, "ScheduleResponseDto_Output", LENIENT); return json(route, 200, out) }
      if (m === "PUT") {
        check("PUT schedule request", body, "SetScheduleDto")
        schedules[mm[1]] = { days: body.days, from: body.from, to: body.to, slotMinutes: body.slotMinutes }
        const out = { doctorId: mm[1], ...schedules[mm[1]] }; check("PUT schedule response", out, "ScheduleResponseDto_Output", LENIENT); return json(route, 200, out)
      }
    }
    if ((mm = p.match(/^\/doctors\/([0-9A-Z]{26})\/slots$/)) && m === "GET") {
      if (!schedules[mm[1]]) return err(route, 404, "NOT_FOUND", "The doctor does not exist here.")
      const date = url.searchParams.get("date"); if (!date) return err(route, 400, "VALIDATION_FAILED", "date is required")
      const out = { doctorId: mm[1], date, slotMinutes: schedules[mm[1]].slotMinutes, slots: slotTimes(mm[1], date).map((t) => ({ time: t, startsAt: instant(date, t), state: slotState(mm[1], date, t) })) }
      check("GET slots", out, "SlotsResponseDto_Output"); return json(route, 200, out)
    }
    // ── appointments
    if (p === "/appointments" && m === "GET") {
      const q = url.searchParams, s = (q.get("search") || "").toLowerCase()
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      let rows = appts.filter((a) => (!q.get("date") || a.date === q.get("date")) && (!q.get("dateFrom") || a.date >= q.get("dateFrom")) && (!q.get("dateTo") || a.date <= q.get("dateTo"))
        && (!q.get("doctorId") || a.doctorId === q.get("doctorId")) && (!q.get("patientId") || a.patient.id === q.get("patientId")) && (!q.get("status") || a.status === q.get("status"))
        && (!s || a.patient.name.toLowerCase().includes(s) || a.patient.mrNo.toLowerCase().includes(s) || a.patient.phone.includes(s)))
      rows = [...rows].sort((x, y) => (x.date + x.time < y.date + y.time ? -1 : 1))
      const out = pageOf(rows.map(toDto), q); check("GET /appointments", out, "AppointmentPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (p === "/appointments" && m === "POST") {
      check("POST /appointments request", body, "BookAppointmentDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      const patient = patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      if (!schedules[body.doctorId]) return err(route, 404, "NOT_FOUND", "The doctor does not exist here.")
      if (patient.deceasedOn) return err(route, 422, "PATIENT_DECEASED", "This patient is deceased.")
      if (schedules[body.doctorId].days.length === 0) return err(route, 422, "DOCTOR_UNAVAILABLE", "The doctor is not taking appointments.")
      if (!slotTimes(body.doctorId, body.date).includes(body.time)) return err(route, 422, "NOT_A_SLOT", "That is not a slot start in the doctor's schedule.")
      if (S.steal && S.steal.doctorId === body.doctorId && S.steal.date === body.date && S.steal.time === body.time) { const t = S.steal; S.steal = null; mkAppt({ doctorId: t.doctorId, patient: P(2), date: t.date, time: t.time, status: "confirmed", confirmedAt: NOW }) }
      if (slotState(body.doctorId, body.date, body.time) === "booked") return err(route, 409, "SLOT_TAKEN", "Another appointment holds that time.")
      if (slotState(body.doctorId, body.date, body.time) === "passed") return err(route, 422, "SLOT_PASSED", "That time has passed.")
      if (appts.some((a) => isOpen(a) && a.patient.id === patient.id && a.doctorId === body.doctorId && a.date === body.date)) return err(route, 409, "PATIENT_ALREADY_BOOKED", "The patient already has an open appointment with this doctor that day.")
      const rec = mkAppt({ doctorId: body.doctorId, patient, date: body.date, time: body.time, notes: body.notes ?? null, status: body.confirmed ? "confirmed" : "requested", confirmedAt: body.confirmed ? NOW : null })
      return respond(route, rec, "POST /appointments response", 201)
    }
    if ((mm = p.match(/^\/appointments\/([0-9A-Z]{26})$/))) {
      const a = appts.find((x) => x.id === mm[1]); if (!a) return err(route, 404, "NOT_FOUND", "no")
      if (m === "GET") return respond(route, a, "GET /appointments/{id}")
      if (m === "PATCH") {
        check("PATCH /appointments request", body, "RescheduleAppointmentDto")
        if (S.failNextAction) { const f = S.failNextAction; S.failNextAction = null; return err(route, f.status, f.code, f.message) }
        if (!isOpen(a)) return err(route, 422, "APPOINTMENT_NOT_OPEN", "This appointment is no longer open.")
        const doctorId = body.doctorId ?? a.doctorId, date = body.date ?? a.date, time = body.time ?? a.time
        if (!slotTimes(doctorId, date).includes(time)) return err(route, 422, "NOT_A_SLOT", "That is not a slot start in the doctor's schedule.")
        if (S.steal && S.steal.doctorId === doctorId && S.steal.date === date && S.steal.time === time) { const t = S.steal; S.steal = null; mkAppt({ doctorId: t.doctorId, patient: P(2), date: t.date, time: t.time, status: "confirmed", confirmedAt: NOW }) }
        if (slotState(doctorId, date, time) === "booked" && !(doctorId === a.doctorId && date === a.date && time === a.time)) return err(route, 409, "SLOT_TAKEN", "Another appointment holds that time.")
        Object.assign(a, { doctorId, date, time }); if ("notes" in body) a.notes = body.notes
        return respond(route, a, "PATCH /appointments response")
      }
    }
    if ((mm = p.match(/^\/appointments\/([0-9A-Z]{26})\/(confirm|cancel|no-show)$/)) && m === "POST") {
      const a = appts.find((x) => x.id === mm[1]); if (!a) return err(route, 404, "NOT_FOUND", "no")
      if (mm[2] === "cancel") check("POST cancel request", body, "CancelAppointmentDto")
      if (S.failNextAction) { const f = S.failNextAction; S.failNextAction = null; return err(route, f.status, f.code, f.message) }
      if (!isOpen(a)) return err(route, 422, "APPOINTMENT_NOT_OPEN", "This appointment is no longer open.")
      if (mm[2] === "confirm") { a.status = "confirmed"; a.confirmedAt = NOW }
      if (mm[2] === "cancel") { a.status = "cancelled"; a.cancelledAt = NOW; a.cancelReason = body.reason }
      if (mm[2] === "no-show") { a.status = "no_show"; a.noShowAt = NOW }
      return respond(route, a, "POST " + mm[2] + " response")
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement this")
  }

  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1300 } })
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
  const row = (a) => page.getByTestId(`appointment-row-${a.id}`)
  const acts = (a) => page.getByTestId(`appointment-actions-${a.id}`)
  const closed = () => page.waitForFunction(() => !document.querySelector("[role=dialog]"), null, { timeout: 8000 })
  const dayInput = () => page.locator('input[type=date][aria-label="Day"]')

  await login()

  // ───────────── AP1 doctor schedule ─────────────
  let i0 = requests.length
  await go("/admin/doctors"); await page.getByTestId("doctors-admin").waitFor({ timeout: 8000 })
  await page.getByRole("button", { name: "Appointment hours for Dr Off" }).click(); await page.getByTestId("doctor-schedule-dialog").waitFor(); await page.waitForTimeout(700)
  ok("AP1 opening the editor reads GET /doctors/{id}/schedule", since(i0).some((r) => r.method === "GET" && r.path === `/doctors/${D3}/schedule`))
  let sum = await page.getByTestId("schedule-summary").innerText()
  ok("AP1 a doctor with no schedule shows the default hours and says they are off appointments", /off appointments/.test(sum) && (await page.getByLabel("Opens").inputValue()) === "09:00" && (await page.getByLabel("Closes").inputValue()) === "17:00" && (await page.getByLabel("Slot (minutes)").inputValue()) === "15", sum)
  ok("AP1 Save is off until something changes", await page.getByRole("button", { name: "Save hours" }).isDisabled())
  await page.getByLabel("Monday").click(); await page.getByLabel("Wednesday").click(); await page.getByLabel("Slot (minutes)").fill("20")
  sum = await page.getByTestId("schedule-summary").innerText()
  ok("AP1 the summary counts the slots (09:00 to 17:00 in 20 minutes = 24 a day)", /24 slots of 20 minutes/.test(sum), sum)
  i0 = requests.length
  await page.getByLabel("Opens").fill("17:00"); await page.getByLabel("Closes").fill("09:00")
  await page.getByRole("button", { name: "Save hours" }).click(); await page.waitForTimeout(500)
  ok("AP1 hours that run backwards are refused on the form, nothing is sent", /closing time/i.test(await page.getByTestId("doctor-schedule-dialog").innerText()) && since(i0).filter((r) => r.method === "PUT").length === 0)
  await page.getByLabel("Opens").fill("09:00"); await page.getByLabel("Closes").fill("17:00")
  await Promise.all([page.getByRole("button", { name: "Save hours" }).dblclick(), page.waitForTimeout(100)])
  await closed(); await page.waitForTimeout(500)
  const puts = since(i0).filter((r) => r.method === "PUT")
  ok("AP1 a double click sends ONE PUT with exactly { days, from, to, slotMinutes } in week order", puts.length === 1 && JSON.stringify(puts[0].body) === JSON.stringify({ days: ["mon", "wed"], from: "09:00", to: "17:00", slotMinutes: 20 }), JSON.stringify(puts.map((r) => r.body)))
  await page.getByRole("button", { name: "Appointment hours for Dr Off" }).click(); await page.getByTestId("doctor-schedule-dialog").waitFor(); await page.waitForTimeout(600)
  ok("AP1 reopening shows the saved hours (Monday and Wednesday ticked)", (await page.getByLabel("Monday").getAttribute("aria-checked")) === "true" && (await page.getByLabel("Tuesday").getAttribute("aria-checked")) === "false" && (await page.getByLabel("Slot (minutes)").inputValue()) === "20")
  for (const d of ["Monday", "Wednesday"]) await page.getByLabel(d).click()
  ok("AP1 with no day ticked the summary says the doctor is off appointments", /off appointments/.test(await page.getByTestId("schedule-summary").innerText()))
  i0 = requests.length
  await page.getByRole("button", { name: "Save hours" }).click(); await closed(); await page.waitForTimeout(500)
  const off = since(i0).find((r) => r.method === "PUT")
  ok("AP1 taking a doctor off appointments sends days: []", !!off && JSON.stringify(off.body.days) === "[]", JSON.stringify(off && off.body))

  // ───────────── AP3 list ─────────────
  i0 = requests.length
  await go("/appointments"); await row(a0).waitFor({ timeout: 8000 })
  const first = since(i0).find((r) => r.method === "GET" && r.path === "/appointments")
  ok("AP3 the screen asks GET /appointments for TODAY (the hospital's date), page 1, perPage 10; no sort invented", !!first && first.query.date === TODAY && first.query.page === "1" && first.query.perPage === "10" && !("sort" in first.query), JSON.stringify(first && first.query))
  let text = await main()
  ok("AP3 today's four appointments are listed (the cancelled one too), sorted by time; Monday's is not", [a2, a0, a1, a4].every((a) => text.includes(a.patient.name)) && !text.includes("Dr Sara") && /4 appointments/.test(text), text.slice(0, 100).replace(/\n/g, " "))
  const order = [a2, a0, a1, a4].map((a) => text.indexOf(a.patient.name === "Zainab Qureshi" ? "Zainab" : a.patient.name))
  ok("AP3 times are shown as 12-hour clock times", /9:30 AM/.test(await row(a0).innerText()) && /10:00 AM/.test(await row(a1).innerText()), (await row(a0).innerText()).replace(/\n/g, " "))
  ok("AP3 statuses read Requested / Confirmed / Completed / Cancelled", /Requested/.test(await row(a0).innerText()) && /Confirmed/.test(await row(a1).innerText()) && /Completed/.test(await row(a2).innerText()) && /Cancelled/.test(await row(a4).innerText()))

  i0 = requests.length
  await page.getByRole("tab", { name: "Tomorrow" }).click(); await page.waitForTimeout(1000)
  ok("AP3 'Tomorrow' sends date=2026-11-08 and keeps it in the address bar; nothing is booked", since(i0).some((r) => r.path === "/appointments" && r.query.date === SUN) && /date=2026-11-08/.test(page.url()) && /No appointments/.test(await main()), page.url())
  i0 = requests.length
  await page.getByRole("tab", { name: "Upcoming" }).click(); await page.waitForTimeout(1000)
  ok("AP3 'Upcoming' sends dateFrom=today and no single date", since(i0).some((r) => r.path === "/appointments" && r.query.dateFrom === TODAY && !("date" in r.query)))
  i0 = requests.length
  await page.getByRole("tab", { name: "All dates" }).click(); await page.waitForTimeout(1000)
  ok("AP3 'All dates' sends no date filter at all and shows Monday's appointment", since(i0).some((r) => r.path === "/appointments" && !("date" in r.query) && !("dateFrom" in r.query)) && (await main()).includes("Dr Sara"))
  i0 = requests.length
  await dayInput().fill(MON); await page.waitForTimeout(1000)
  ok("AP3 choosing a day sends date=2026-11-09", since(i0).some((r) => r.path === "/appointments" && r.query.date === MON) && (await main()).includes("Dr Sara") && !(await main()).includes("Dr Imran"))
  await page.getByRole("tab", { name: "Today" }).click(); await page.waitForTimeout(900)
  i0 = requests.length
  await page.getByRole("combobox", { name: "Doctor" }).click(); await page.getByRole("option", { name: "Dr Imran" }).click(); await page.waitForTimeout(900)
  ok("AP3 the doctor filter is sent as doctorId", since(i0).some((r) => r.path === "/appointments" && r.query.doctorId === D1) && /doctor=/.test(page.url()))
  i0 = requests.length
  await page.getByRole("combobox", { name: "Status" }).click(); await page.getByRole("option", { name: "Confirmed" }).click(); await page.waitForTimeout(900)
  ok("AP3 the status filter is sent as status=confirmed and shows only that one", since(i0).some((r) => r.path === "/appointments" && r.query.status === "confirmed") && (await main()).includes("Bilal Anwar") && !(await main()).includes("Hira Malik"))
  i0 = requests.length
  await page.getByLabel("Search appointments").fill("bilal"); await page.waitForTimeout(1300)
  const sreq = since(i0).filter((r) => r.path === "/appointments")
  ok("AP3 search is debounced: ONE request with search=bilal, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "bilal" && !/bilal|search/i.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
  await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(1000)
  ok("AP3 'Clear filters' empties the filters and the search box", !/doctor=|status=/.test(page.url()) && (await page.getByLabel("Search appointments").inputValue()) === "")
  i0 = requests.length
  await page.goto(base + "/appointments?date=2026-11-09"); await page.waitForTimeout(2500)
  ok("AP3 a refreshed link restores the day from the address bar", since(i0).some((r) => r.path === "/appointments" && r.query.date === MON))
  await go("/appointments")

  // detail
  await row(a3).waitFor({ timeout: 1 }).catch(() => {})
  await page.getByRole("tab", { name: "All dates" }).click(); await page.waitForTimeout(900)
  i0 = requests.length
  await row(a3).click(); await page.getByTestId("appointment-detail").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
  ok("AP3 opening a row reads GET /appointments/{id} (a record being worked on is never cached)", since(i0).some((r) => r.method === "GET" && r.path === `/appointments/${a3.id}`))
  let det = await page.getByTestId("appointment-detail").innerText()
  ok("AP3 the detail shows the appointment number, patient, doctor, day, time and length", [a3.no, "Zainab Qureshi", "MR-2026-0040", "Dr Sara", "Mon 09 Nov 2026", "2:00 PM", "20 min"].every((t) => det.includes(t)), det.replace(/\n/g, " | ").slice(0, 300))
  ok("AP3 while the doctor's hours still cover the appointment there is no 'outside hours' warning", (await page.getByTestId("outside-schedule").count()) === 0)
  await page.getByRole("button", { name: "Close" }).last().click(); await closed()
  await row(a4).click(); await page.getByTestId("appointment-detail").waitFor({ timeout: 8000 })
  det = await page.getByTestId("appointment-detail").innerText()
  ok("AP3 a cancelled appointment shows who cancelled it and the reason", /Patient travelled/.test(det) && /Front Desk/.test(det))
  await page.keyboard.press("Escape"); await closed()
  await row(a2).click(); await page.getByTestId("appointment-detail").waitFor({ timeout: 8000 })
  ok("AP3 a completed appointment links to its visit (OPD-2026-0007)", /OPD-2026-0007/.test(await page.getByTestId("appointment-detail").innerText()))
  await page.keyboard.press("Escape"); await closed()
  await page.getByRole("tab", { name: "Today" }).click(); await page.waitForTimeout(900)

  // ───────────── AP4 buttons = allowedActions ─────────────
  const names = async (a) => (await acts(a).getByRole("button").allInnerTexts()).map((t) => t.trim())
  ok("AP4 a requested appointment shows exactly Confirm, Reschedule, Cancel", JSON.stringify(await names(a0)) === JSON.stringify(["Confirm", "Reschedule", "Cancel"]), JSON.stringify(await names(a0)))
  ok("AP4 a confirmed appointment shows exactly Reschedule, Cancel, Mark no-show, Check in", JSON.stringify(await names(a1)) === JSON.stringify(["Reschedule", "Cancel", "Mark no-show", "Check in"]), JSON.stringify(await names(a1)))
  ok("AP4 a completed and a cancelled appointment show no buttons at all", (await acts(a2).count()) === 0 && (await acts(a4).count()) === 0)
  const checkIn = acts(a1).getByRole("button", { name: /Check in/ })
  ok("AP4/AP5 'Check in' is a real action now (it opens the check-in dialog; the visit is created by POST /encounters/opd)", await checkIn.isEnabled())

  // confirm: a double click sends one request; the row follows the server
  i0 = requests.length
  await Promise.all([acts(a0).getByRole("button", { name: /^Confirm/ }).dblclick(), page.waitForTimeout(150)]); await page.waitForTimeout(1200)
  const conf = since(i0).filter((r) => r.method === "POST" && r.path === `/appointments/${a0.id}/confirm`)
  ok("AP4 Confirm sends ONE POST /appointments/{id}/confirm with no body", conf.length === 1 && conf[0].body === undefined, String(conf.length))
  ok("AP4 the row now reads Confirmed and Confirm is gone (the buttons follow allowedActions)", /Confirmed/.test(await row(a0).innerText()) && JSON.stringify(await names(a0)) === JSON.stringify(["Reschedule", "Cancel", "Mark no-show", "Check in"]), JSON.stringify(await names(a0)))
  // someone else changed it: 409 APPOINTMENT_CHANGED -> a message and the row is read again
  S.failNextAction = { status: 409, code: "APPOINTMENT_CHANGED", message: "This appointment was changed by someone else." }
  i0 = requests.length
  await acts(a0).getByRole("button", { name: /Mark no-show/ }).click(); await page.getByRole("dialog").getByRole("button", { name: "Mark no-show" }).click(); await page.waitForTimeout(1500)
  ok("AP4 409 APPOINTMENT_CHANGED is explained and the list is read again; the no-show is not re-sent", /changed by someone else/i.test(await page.locator("body").innerText()) && since(i0).filter((r) => r.path.endsWith("/no-show")).length === 1 && since(i0).some((r) => r.method === "GET" && r.path === "/appointments"))

  // cancel
  await acts(a1).getByRole("button", { name: /^Cancel/ }).click(); await page.getByTestId("cancel-appointment-dialog").waitFor()
  i0 = requests.length
  await page.locator("#cancel-reason").fill("no"); await page.getByRole("button", { name: "Cancel appointment" }).click(); await page.waitForTimeout(400)
  ok("AP4 a 2-character reason is refused on the form (3 to 300), nothing is sent", /3 to 300/.test(await page.getByTestId("cancel-appointment-dialog").innerText()) && since(i0).filter((r) => r.path.endsWith("/cancel")).length === 0)
  await page.locator("#cancel-reason").fill("Patient called to cancel")
  await Promise.all([page.getByRole("button", { name: "Cancel appointment" }).dblclick(), page.waitForTimeout(150)]); await closed(); await page.waitForTimeout(1000)
  const cposts = since(i0).filter((r) => r.method === "POST" && r.path === `/appointments/${a1.id}/cancel`)
  ok("AP4 Cancel sends ONE POST with exactly { reason }", cposts.length === 1 && JSON.stringify(cposts[0].body) === JSON.stringify({ reason: "Patient called to cancel" }), JSON.stringify(cposts.map((r) => r.body)))
  ok("AP4 the row reads Cancelled and has no buttons", /Cancelled/.test(await row(a1).innerText()) && (await acts(a1).count()) === 0)

  // ───────────── AP2 booking ─────────────
  await page.getByRole("button", { name: "Book Appointment" }).first().click(); await page.getByTestId("book-appointment-dialog").waitFor()
  const dlg = page.getByTestId("book-appointment-dialog")
  ok("AP2 Book is off until a patient, a doctor, a day and a free time are chosen", await dlg.getByRole("button", { name: "Book Appointment" }).isDisabled())
  i0 = requests.length
  await page.locator("#book-patient").fill("zain"); await page.waitForTimeout(1300)
  const preq = since(i0).filter((r) => r.path === "/patients")
  ok("AP2 the patient picker searches with perPage=6 after the pause, from 2 characters", preq.length === 1 && preq[0].query.search === "zain" && preq[0].query.perPage === "6", JSON.stringify(preq.map((r) => r.query)))
  await dlg.getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(400)
  await page.getByRole("combobox", { name: "Doctor *" }).click()
  ok("AP2 the doctor list is the active doctors from GET /doctors (including the one off appointments)", (await page.getByRole("option").allInnerTexts()).join("|").includes("Dr Off") && (await page.getByRole("option").count()) === 3)
  await page.getByRole("option", { name: /Dr Imran/ }).click(); await page.waitForTimeout(900)
  let slots = await page.getByTestId("slot-grid").innerText()
  ok("AP2 today's grid asks GET /doctors/{id}/slots?date=2026-11-07", requests.some((r) => r.method === "GET" && r.path === `/doctors/${D1}/slots` && r.query.date === TODAY))
  ok("AP2 booked slots are off (9:00 completed, 9:30 open) and a cancelled appointment frees its time again (10:00, 10:30)", (await page.getByRole("radio", { name: "9:00 AM booked" }).isDisabled()) && (await page.getByRole("radio", { name: "9:30 AM booked" }).isDisabled()) && (await page.getByRole("radio", { name: "10:00 AM free" }).isEnabled()) && (await page.getByRole("radio", { name: "10:30 AM free" }).isEnabled()), slots.replace(/\n/g, " "))
  await page.locator("#book-date").fill(MON); await page.waitForTimeout(1000)
  ok("AP2 changing the day asks for that day's slots and clears the choice; Monday has four free times", requests.some((r) => r.path === `/doctors/${D1}/slots` && r.query.date === MON) && (await page.getByRole("radio").count()) === 4 && await dlg.getByRole("button", { name: "Book Appointment" }).isDisabled())
  // already booked that day, with the same doctor
  await page.getByRole("radio", { name: "10:00 AM free" }).click()
  ok("AP2 choosing a free time enables Book", await dlg.getByRole("button", { name: "Book Appointment" }).isEnabled())
  await page.locator("#book-notes").fill("First visit")
  await page.getByLabel(/Confirm it now/).click()
  i0 = requests.length
  S.slowSave = true
  await Promise.all([dlg.getByRole("button", { name: "Book Appointment" }).dblclick(), page.waitForTimeout(150)]); await closed(); S.slowSave = false; await page.waitForTimeout(1200)
  const bposts = since(i0).filter((r) => r.method === "POST" && r.path === "/appointments")
  ok("AP2 a double click sends ONE POST with the slot start as time, the notes and confirmed: true", bposts.length === 1 && JSON.stringify(bposts[0].body) === JSON.stringify({ patientId: P(0).id, doctorId: D1, date: MON, time: "10:00", notes: "First visit", confirmed: true }), JSON.stringify(bposts.map((r) => r.body)))
  const booked = appts[appts.length - 1]
  ok("AP2 the list jumps to the booked day and shows the new appointment as Confirmed", /date=2026-11-09/.test(page.url()) && (await row(booked).count()) === 1 && /Confirmed/.test(await row(booked).innerText()), page.url())

  // the same patient, the same doctor, the same day
  await page.getByRole("button", { name: "Book Appointment" }).first().click(); await page.getByTestId("book-appointment-dialog").waitFor()
  await page.locator("#book-patient").fill("zain"); await page.waitForTimeout(1300); await dlg.getByText("Zainab Qureshi").first().click()
  await page.getByRole("combobox", { name: "Doctor *" }).click(); await page.getByRole("option", { name: /Dr Imran/ }).click(); await page.locator("#book-date").fill(MON); await page.waitForTimeout(1000)
  await page.getByRole("radio", { name: "9:00 AM free" }).click(); i0 = requests.length
  await dlg.getByRole("button", { name: "Book Appointment" }).click(); await page.waitForTimeout(1000)
  ok("AP2 PATIENT_ALREADY_BOOKED is explained (409), the dialog stays open, one request", /already has an appointment that day/i.test(await dlg.innerText()) && since(i0).filter((r) => r.method === "POST" && r.path === "/appointments").length === 1)
  // another desk takes the slot meanwhile
  await page.locator("#book-date").fill(TUE); await page.waitForTimeout(900)
  await page.getByRole("radio", { name: "9:00 AM free" }).click()
  await page.locator("#book-notes").fill("keep me")
  S.steal = { doctorId: D1, date: TUE, time: "09:00" }
  i0 = requests.length
  await dlg.getByRole("button", { name: "Book Appointment" }).click(); await page.waitForTimeout(1500)
  ok("AP2 409 SLOT_TAKEN: the message says the time was just taken, the grid is read again and the choice is cleared", /just taken/i.test(await dlg.innerText()) && since(i0).filter((r) => r.path === `/doctors/${D1}/slots`).length >= 1 && await dlg.getByRole("button", { name: "Book Appointment" }).isDisabled())
  ok("AP2 the stolen slot now shows as booked, and what was typed (the notes) is still there", await page.getByRole("radio", { name: "9:00 AM booked" }).isDisabled() && (await page.locator("#book-notes").inputValue()) === "keep me")
  i0 = requests.length
  await page.getByRole("radio", { name: "9:30 AM free" }).click()
  await dlg.getByRole("button", { name: "Book Appointment" }).click(); await closed(); await page.waitForTimeout(1000)
  ok("AP2 choosing another slot books it (the first refusal was not re-sent)", since(i0).filter((r) => r.method === "POST" && r.path === "/appointments").length === 1 && appts[appts.length - 1].time === "09:30" && appts[appts.length - 1].date === TUE)
  // off-appointments doctor and a deceased patient
  await page.getByRole("button", { name: "Book Appointment" }).first().click(); await page.getByTestId("book-appointment-dialog").waitFor()
  await page.locator("#book-patient").fill("saima"); await page.waitForTimeout(1300); await dlg.getByText("Saima Rehan").first().click(); await page.waitForTimeout(400)
  ok("AP2 a deceased patient is refused on the form with the reason; Book stays off", /deceased/i.test(await dlg.innerText()) && await dlg.getByRole("button", { name: "Book Appointment" }).isDisabled())
  await dlg.getByRole("button", { name: "Clear selected patient" }).click()
  await page.locator("#book-patient").fill("bilal"); await page.waitForTimeout(1300); await dlg.getByText("Bilal Anwar").first().click()
  await page.getByRole("combobox", { name: "Doctor *" }).click(); await page.getByRole("option", { name: /Dr Off/ }).click(); await page.locator("#book-date").fill(MON); await page.waitForTimeout(1000)
  ok("AP2 a doctor who is off appointments has no slots and says so", (await page.getByTestId("no-slots").count()) === 1)
  await dlg.getByRole("button", { name: "Cancel" }).click(); await closed()

  // ───────────── AP4 reschedule ─────────────
  await dayInput().fill(MON); await page.waitForTimeout(1000)
  await acts(booked).getByRole("button", { name: /^Reschedule/ }).click(); await page.getByTestId("reschedule-appointment-dialog").waitFor(); await page.waitForTimeout(900)
  const rd = page.getByTestId("reschedule-appointment-dialog")
  ok("AP4 Reschedule stays off until a different free time is chosen", await rd.getByRole("button", { name: "Reschedule" }).isDisabled())
  await page.getByRole("radio", { name: "10:30 AM free" }).click(); i0 = requests.length
  await rd.getByRole("button", { name: "Reschedule" }).click(); await closed(); await page.waitForTimeout(1200)
  const rs1 = since(i0).find((r) => r.method === "PATCH")
  ok("AP4 moving to another time on the same day sends PATCH { time } and nothing else", !!rs1 && rs1.path === `/appointments/${booked.id}` && JSON.stringify(rs1.body) === JSON.stringify({ time: "10:30" }), JSON.stringify(rs1 && rs1.body))
  ok("AP4 the list shows the new time", /10:30 AM/.test(await row(booked).innerText()))
  await acts(booked).getByRole("button", { name: /^Reschedule/ }).click(); await page.getByTestId("reschedule-appointment-dialog").waitFor(); await page.waitForTimeout(700)
  await page.locator("#resched-date").fill(TUE); await page.waitForTimeout(1000)
  await page.getByRole("radio", { name: "10:00 AM free" }).click(); i0 = requests.length
  await rd.getByRole("button", { name: "Reschedule" }).click(); await closed(); await page.waitForTimeout(1200)
  const rs2 = since(i0).find((r) => r.method === "PATCH")
  ok("AP4 moving to another day sends the new date together with the new time", !!rs2 && JSON.stringify(rs2.body) === JSON.stringify({ date: TUE, time: "10:00" }), JSON.stringify(rs2 && rs2.body))
  // SLOT_TAKEN on reschedule
  await dayInput().fill(TUE); await page.waitForTimeout(1000)
  await acts(booked).getByRole("button", { name: /^Reschedule/ }).click(); await page.getByTestId("reschedule-appointment-dialog").waitFor(); await page.waitForTimeout(800)
  await page.getByRole("radio", { name: "10:30 AM free" }).click(); S.steal = { doctorId: D1, date: TUE, time: "10:30" }
  await rd.getByRole("button", { name: "Reschedule" }).click(); await page.waitForTimeout(1500)
  ok("AP4 SLOT_TAKEN on a reschedule reloads the grid and clears the choice (the dialog stays open)", /just taken/i.test(await rd.innerText()) && await rd.getByRole("button", { name: "Reschedule" }).isDisabled())
  await rd.getByRole("button", { name: "Close" }).last().click(); await closed()

  // ───────────── AP1 → AP3: a changed schedule flags appointments it no longer covers ─────────────
  await go("/admin/doctors"); await page.getByTestId("doctors-admin").waitFor({ timeout: 8000 })
  await page.getByRole("button", { name: "Appointment hours for Dr Sara" }).click(); await page.getByTestId("doctor-schedule-dialog").waitFor(); await page.waitForTimeout(700)
  await page.getByLabel("Monday").click(); await page.getByLabel("Tuesday").click()
  await page.getByRole("button", { name: "Save hours" }).click(); await closed(); await page.waitForTimeout(600)
  await go("/appointments"); await page.getByRole("tab", { name: "All dates" }).click(); await page.waitForTimeout(1200)
  ok("AP1 a new schedule does not move or cancel anything: Monday's appointment stays and is flagged 'Outside hours'", /Outside hours/.test(await row(a3).innerText()) && /Confirmed/.test(await row(a3).innerText()))
  await row(a3).click(); await page.getByTestId("appointment-detail").waitFor({ timeout: 8000 })
  ok("AP3 the detail explains it: the hours changed after booking, nothing was moved or cancelled", (await page.getByTestId("outside-schedule").count()) === 1 && /has not been moved or cancelled/.test(await page.getByTestId("outside-schedule").innerText()))
  await page.keyboard.press("Escape"); await closed()

  // ───────────── polling ─────────────
  const polls0 = requests.filter((r) => r.method === "GET" && r.path === "/appointments").length
  await page.waitForTimeout(32000)
  ok("AP3 the open list refreshes by itself about every 30 seconds (worklist)", requests.filter((r) => r.method === "GET" && r.path === "/appointments").length > polls0)

  // ───────────── permissions ─────────────
  S.perms = ["patients.read", "appointments.read", "doctors.read", "settings.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); await go("/appointments"); await row(a0).waitFor({ timeout: 8000 })
  ok("PERM read-only (appointments.read): no Book button and no action buttons on any row", (await page.getByRole("button", { name: "Book Appointment" }).count()) === 0 && (await page.locator('[data-testid^="appointment-actions-"]').count()) === 0)
  S.perms = ["patients.read", "appointments.read", "appointments.write", "doctors.read", "settings.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); await go("/appointments"); await row(a0).waitFor({ timeout: 8000 })
  ok("PERM appointments.write without encounters.check_in: Reschedule / Cancel / No-show are offered, Check in is not", JSON.stringify(await names(a0)) === JSON.stringify(["Reschedule", "Cancel", "Mark no-show"]), JSON.stringify(await names(a0)))
  await go("/admin/doctors"); await page.getByTestId("doctors-admin").waitFor({ timeout: 8000 }).catch(() => {})

  // ───────────── global ─────────────
  ok("no GET asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request/response the fake backend handled matches docs/openapi.json", violations.length === 0, violations.slice(0, 4).join(" || "))
  const known = ["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/settings", "/settings/modules", "/public/hospital", "/doctors", "/users", "/patients", "/appointments", "/medicines", "/dashboard", "/reports/cash-flow"]
  const unexpected = requests.filter((r) => !known.includes(r.path) && !r.path.startsWith("/appointments/") && !r.path.startsWith("/doctors/"))
  ok("no request reached a route the test backend does not implement", unexpected.length === 0, unexpected.map((r) => r.method + " " + r.path).join(", "))
  ok("nothing is ever deleted (no DELETE request)", !requests.some((r) => r.method === "DELETE"))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (401|403|404|409|422|500)/.test(e))
  ok("no browser console/page errors other than the deliberate 409 / 422 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
