// Phase 7 fake backend, TEST HARNESS ONLY. A stateful fake of encounters, vitals, the clinical record, notes, beds and a minimal appointments/patients/ICD
// surface, run inside Playwright's route(). Every request body is validated against docs/openapi.json and so is every response it sends.
// 2026-11-07 (the hospital's "today") is a Saturday; the hospital's zone is Asia/Karachi (UTC+5).
module.exports = function createFake({ validate, schemaOf, stubs }) {
  const U = (n) => "01HZX" + String(n).padStart(21, "0")
  const NOW = "2026-11-07T10:00:00.000Z"
  const TODAY = "2026-11-07", YESTERDAY = "2026-11-06"
  const LENIENT = { lenientStringArrays: true }
  const violations = []
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const permEnum = new Set(schemaOf("AuthUserDto_Output").properties.permissions.items.enum)
  const forCheck = (u) => ({ ...u, permissions: u.permissions.filter((p) => permEnum.has(p)) })

  const S = { perms: stubs.ALL_PERMISSIONS, modulesOn: true, n: 0, cookie: false, slowSave: false, version: 0, bump: null, stealBed: null, failNext: null, dispensedLine: null, seq: 100, apptNotToday: false, unavailable: false }
  const requests = []

  // ── people
  const D1 = U(900) // the signed-in test user is also a doctor, so "My patients" shows
  const doctors = [{ id: D1, name: "Dr Imran", specialization: "Cardiology" }, { id: U(902), name: "Dr Sara", specialization: "ENT" }]
  const pat = (i, name, o = {}) => ({ id: U(10 + i), mrNo: `MR-2026-${String(40 + i).padStart(4, "0")}`, name, fatherName: null, gender: "female", dob: "1990-05-17", dobEstimated: false, phone: `+92300555${String(1000 + i)}`, cnic: null, city: "Lahore", registrationDate: "2026-01-10", primaryPanel: null, admitted: false, lastVisitDate: null, balance: null, deceasedOn: null, archived: false, ...o })
  const patients = [pat(0, "Zainab Qureshi"), pat(1, "Bilal Anwar", { gender: "male" }), pat(2, "Hira Malik", { admitted: true }), pat(3, "Saima Rehan", { deceasedOn: "2026-09-01" }), pat(4, "Tariq Jamil", { archived: true }), pat(5, "Noor Fatima")]
  const P = (i) => patients[i]
  const refOf = (p) => ({ id: p.id, mrNo: p.mrNo, name: p.name, gender: p.gender, dob: p.dob, dobEstimated: p.dobEstimated, deceasedOn: p.deceasedOn })
  const patientDetail = (p) => ({ id: p.id, mrNo: p.mrNo, name: p.name, fatherName: null, gender: p.gender, dob: p.dob, dobEstimated: false, phone: p.phone, cnic: null, city: p.city, registrationDate: p.registrationDate, admitted: p.admitted, lastVisitDate: null, deceasedOn: p.deceasedOn,
    archived: p.archived, medicalRecordNo: null, emergencyContact: null, email: null, address: null, area: null, country: "Pakistan", bloodGroup: null, guardianRelation: null, guardianName: null, referredBy: null, remarks: null, photoUrl: null, coverages: [], archivedAt: null, createdAt: NOW, updatedAt: NOW })
  const icd = [{ id: U(600), code: "J06.9", name: "Acute upper respiratory infection", category: "Respiratory" }, { id: U(601), code: "A09", name: "Gastroenteritis", category: "Infectious" }, { id: U(602), code: "E11.9", name: "Type 2 diabetes mellitus", category: "Endocrine" }]

  // ── wards and beds
  const wards = [
    { id: U(200), name: "General Ward", type: "general", dailyRate: "1500.00", beds: [{ id: U(210), bedNo: "A-01", maint: false }, { id: U(211), bedNo: "A-02", maint: false }, { id: U(212), bedNo: "A-03", maint: true }] },
    { id: U(201), name: "ICU", type: "icu", dailyRate: "8000.00", beds: [{ id: U(220), bedNo: "B-01", maint: false }] },
  ]
  const allBeds = () => wards.flatMap((w) => w.beds.map((b) => Object.assign(b, { wardId: w.id, wardName: w.name })))
  const bedById = (id) => allBeds().find((b) => b.id === id)

  // ── encounters
  let seq = 0
  const instant = (date, hhmm) => new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - 5 * 3600_000).toISOString()
  const bump = (e) => { e.updatedAt = new Date(Date.parse(NOW) + ++S.version * 1000).toISOString() }
  const mkE = (o) => {
    const n = ++seq
    const e = { id: U(300 + n), encId: `${o.type === "ipd" ? "IPD" : "OPD"}-2026-${String(n).padStart(4, "0")}`, type: "opd", status: "open", date: TODAY, tokenNo: null, priority: "normal", doctorId: D1, appointment: null, bedId: null, admissionType: null,
      advisedBy: null, referredBy: null, reason: null, closedAt: null, dischargedAt: null, cancelledAt: null, cancelReason: null, archived: false, archivedAt: null, bedHistory: [], createdAt: NOW, updatedAt: NOW,
      rec: { chief: null, history: null, exam: null, notes: null, instr: null, follow: null, diagnoses: [], rx: [], discharge: null }, vitals: [], notes: [], ...o }
    e.startedAt = o.startedAt ?? instant(e.date, "09:00")
    encounters.push(e)
    return e
  }
  const encounters = []
  const doc = (id) => doctors.find((d) => d.id === id)
  const diag = (text, isPrimary, code) => ({ id: U(400 + ++S.seq), icdCode: code ? { id: code.id, code: code.code } : null, text, isPrimary })
  const e0 = mkE({ type: "opd", patient: P(0), tokenNo: 1, priority: "urgent", reason: "Fever", date: TODAY }) // open, record empty
  const e1 = mkE({ type: "opd", patient: P(1), tokenNo: 2, doctorId: U(902), date: TODAY })
  const e2 = mkE({ type: "opd", patient: P(5), tokenNo: 4, date: YESTERDAY, status: "closed", closedAt: instant(YESTERDAY, "11:00"), rec: { chief: "Cough", history: null, exam: null, notes: null, instr: null, follow: null, diagnoses: [diag("Acute URI", true, icd[0])], rx: [], discharge: null } })
  const e3 = mkE({ type: "ipd", patient: P(2), admissionType: "emergency", reason: "Chest pain", bedId: U(211), date: TODAY, rec: { chief: "Chest pain", history: null, exam: null, notes: null, instr: null, follow: null, diagnoses: [diag("Unstable angina", true)], rx: [], discharge: null } })
  e3.bedHistory.push({ bedId: U(211), assignedAt: e3.startedAt, releasedAt: null })
  const e4 = mkE({ type: "opd", patient: P(1), tokenNo: 3, date: YESTERDAY, rec: { chief: "Headache", history: null, exam: null, notes: null, instr: null, follow: null, diagnoses: [], rx: [], discharge: null } }) // earlier day, incomplete -> pending
  const e5 = mkE({ type: "opd", patient: P(5), tokenNo: 5, date: YESTERDAY, status: "cancelled", cancelledAt: instant(YESTERDAY, "10:00"), cancelReason: "Patient left" })
  const e6 = mkE({ type: "opd", patient: P(0), tokenNo: 6, date: YESTERDAY, archived: true, archivedAt: NOW })
  const complete = (e) => !!(e.rec.chief && e.rec.chief.trim()) && e.rec.diagnoses.some((d) => d.isPrimary)
  const isPending = (e) => e.status === "open" && e.date < TODAY && !complete(e)
  const primaryText = (e) => (e.rec.diagnoses.find((d) => d.isPrimary) || {}).text ?? null
  const bedOf = (e) => (e.bedId ? bedById(e.bedId) : null)

  const sumOf = (e) => { const b = bedOf(e); return { id: e.id, encId: e.encId, type: e.type, status: e.status, startedAt: e.startedAt, date: e.date, tokenNo: e.tokenNo, priority: e.priority, patient: refOf(e.patient), doctor: { id: e.doctorId, name: doc(e.doctorId).name },
    appointment: e.appointment, bed: b && e.status === "open" ? { id: b.id, bedNo: b.bedNo, wardName: b.wardName } : null, primaryDiagnosis: primaryText(e), pending: isPending(e), archived: e.archived } }
  const vitalsOf = (v) => ({ id: v.id, recordedAt: v.recordedAt, recordedBy: { id: D1, name: "Test User" }, bpSystolic: v.bpSystolic ?? null, bpDiastolic: v.bpDiastolic ?? null, pulse: v.pulse ?? null, temperatureF: v.temperatureF ?? null, weightKg: v.weightKg ?? null, heightCm: v.heightCm ?? null, spo2: v.spo2 ?? null, rbs: v.rbs ?? null, bmi: v.bmi ?? null })
  const clinicalOf = (e) => ({
    chiefComplaint: e.rec.chief, historyOfIllness: e.rec.history, examinationFindings: e.rec.exam, clinicalNotes: e.rec.notes, generalInstructions: e.rec.instr, followUpDate: e.rec.follow,
    diagnoses: e.rec.diagnoses, prescription: e.rx ?? e.rec.rx, latestVitals: e.vitals.length ? vitalsOf(e.vitals[0]) : null, recordComplete: complete(e),
    discharge: e.rec.discharge ? { summary: e.rec.discharge.summary ?? null, condition: e.rec.discharge.condition, followUpInstructions: e.rec.discharge.followUpInstructions ?? null, diagnoses: e.rec.discharge.diagnoses } : null,
  })
  const detailOf = (e) => ({ ...sumOf(e), admissionType: e.admissionType, advisedBy: e.advisedBy, referredBy: e.referredBy, reason: e.reason, closedAt: e.closedAt, dischargedAt: e.dischargedAt, cancelledAt: e.cancelledAt, cancelReason: e.cancelReason, archivedAt: e.archivedAt,
    bedHistory: e.bedHistory.map((h) => { const b = bedById(h.bedId); return { bedId: h.bedId, bedNo: b.bedNo, wardId: b.wardId, wardName: b.wardName, assignedAt: h.assignedAt, releasedAt: h.releasedAt } }),
    clinical: S.perms.includes("encounters.read") ? clinicalOf(e) : null, createdAt: e.createdAt, updatedAt: e.updatedAt })

  // ── appointments (minimal: enough to check a patient in from one)
  const appt = { id: U(500), appointmentNo: "APT-2026-0001", status: "confirmed", patient: P(0), doctorId: D1, date: TODAY, time: "10:00", encounter: null }
  const apptDto = () => ({ id: appt.id, appointmentNo: appt.appointmentNo, status: appt.status, date: appt.date, time: appt.time, startsAt: instant(appt.date, appt.time), endsAt: instant(appt.date, "10:15"), durationMinutes: 15,
    patient: { id: appt.patient.id, mrNo: appt.patient.mrNo, name: appt.patient.name, phone: appt.patient.phone }, doctor: { id: appt.doctorId, name: doc(appt.doctorId).name }, notes: null, outsideSchedule: false, encounter: appt.encounter,
    bookedAt: NOW, bookedBy: { id: D1, name: "Test User" }, confirmedAt: NOW, confirmedBy: { id: D1, name: "Test User" }, cancelledAt: null, cancelledBy: null, cancelReason: null, noShowAt: null, noShowBy: null,
    allowedActions: appt.status === "confirmed" ? ["reschedule", "cancel", "no_show", "check_in"] : [] })

  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, extra = {}) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...extra })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const issue = () => "tok-" + ++S.n
  const reply = (route, e, what, status = 200) => { const out = detailOf(e); check(what, out, "EncounterDetailDto_Output", LENIENT); return json(route, status, out) }
  const bedState = (b) => (encounters.some((e) => e.bedId === b.id && e.status === "open" && !e.archived) ? "occupied" : b.maint ? "maintenance" : "available")

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
    if (m === "GET" && p === "/settings/modules") return json(route, 200, stubs.modulesBody(S.modulesOn))
    if (m === "GET" && p === "/doctors") { const out = pageOf(doctors.map((d) => ({ id: d.id, name: d.name, specialization: d.specialization, qualifications: "MBBS", consultationFee: "1500.00" })), url.searchParams); check("GET /doctors", out, "DoctorPageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && (p === "/panels" || p === "/guardian-relations")) { const out = pageOf([], url.searchParams); check("GET " + p, out, p === "/panels" ? "PanelPageDto_Output" : "GuardianRelationPageDto_Output", LENIENT); return json(route, 200, out) } // the patient form reads both
    if (m === "GET" && p === "/medicines") { const out = pageOf([], url.searchParams); check("GET /medicines", out, "MedicinePageDto_Output", LENIENT); return json(route, 200, out) } // the dashboard stock alert reads the low and out-of-stock medicines (none here)
    if (m === "GET" && p === "/icd-codes") { const q = url.searchParams, s = (q.get("search") || "").toLowerCase(); const out = pageOf(icd.filter((x) => !s || x.name.toLowerCase().includes(s) || x.code.toLowerCase().startsWith(s)), q); check("GET /icd-codes", out, "IcdCodePageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/patients") { const q = url.searchParams, s = (q.get("search") || "").toLowerCase(); const out = pageOf(patients.filter((x) => !x.archived && (!s || x.name.toLowerCase().includes(s) || x.mrNo.toLowerCase().includes(s) || x.phone.includes(s))), q); check("GET /patients", out, "PatientPageDto_Output", LENIENT); return json(route, 200, out) }
    let mm
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})$/)) && m === "GET") { const x = patients.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "no"); const out = patientDetail(x); check("GET /patients/{id}", out, "PatientDetailDto_Output", LENIENT); return json(route, 200, out) }
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})\/encounters$/)) && m === "GET") {
      const q = url.searchParams
      let rows = encounters.filter((e) => e.patient.id === mm[1] && (q.get("includeArchived") === "true" || !e.archived) && (!q.get("type") || e.type === q.get("type")) && (!q.get("status") || e.status === q.get("status")))
      rows = [...rows].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      const out = pageOf(rows.map(sumOf), q); check("GET /patients/{id}/encounters", out, "EncounterPageDto_Output", LENIENT); return json(route, 200, out)
    }
    // ── appointments (minimal)
    if (m === "GET" && p === "/appointments") { const out = pageOf(!url.searchParams.get("date") || url.searchParams.get("date") === appt.date ? [apptDto()] : [], url.searchParams); check("GET /appointments", out, "AppointmentPageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === `/appointments/${appt.id}`) { const out = apptDto(); check("GET /appointments/{id}", out, "AppointmentResponseDto_Output", LENIENT); return json(route, 200, out) }
    // ── wards
    if (m === "GET" && p === "/wards/occupancy") {
      const out = { wards: wards.map((w) => ({ id: w.id, name: w.name, type: w.type, dailyRate: w.dailyRate, beds: w.beds.map((b) => {
        const st = bedState(b), occ = st === "occupied" ? encounters.find((e) => e.bedId === b.id && e.status === "open" && !e.archived) : null
        return { id: b.id, bedNo: b.bedNo, state: st, occupant: occ ? { encounterId: occ.id, encId: occ.encId, since: occ.startedAt, patient: { id: occ.patient.id, mrNo: occ.patient.mrNo, name: occ.patient.name } } : null }
      }) })) }
      check("GET /wards/occupancy", out, "OccupancyDto_Output"); return json(route, 200, out)
    }
    if ((mm = p.match(/^\/beds\/([0-9A-Z]{26})\/maintenance$/)) && m === "POST") {
      check("POST maintenance request", body, "BedMaintenanceDto")
      const b = bedById(mm[1]); if (!b) return err(route, 404, "NOT_FOUND", "no")
      if (bedState(b) === "occupied") return err(route, 422, "BED_OCCUPIED", "A patient is in this bed.")
      b.maint = body.underMaintenance
      const out = { id: b.id, bedNo: b.bedNo, state: bedState(b), active: true, wardId: b.wardId }; check("maintenance response", out, "BedResponseDto_Output"); return json(route, 200, out)
    }
    // ── encounters: list and create
    if (p === "/encounters" && m === "GET") {
      const q = url.searchParams, s = (q.get("search") || "").toLowerCase()
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      let rows = encounters.filter((e) => (q.get("includeArchived") === "true" || !e.archived) && (!q.get("type") || e.type === q.get("type")) && (!q.get("status") || e.status === q.get("status")) && (!q.get("doctorId") || e.doctorId === q.get("doctorId"))
        && (!q.get("dateFrom") || e.date >= q.get("dateFrom")) && (!q.get("dateTo") || e.date <= q.get("dateTo")) && (!q.get("admitted") || ((e.type === "ipd" && e.status === "open") === (q.get("admitted") === "true")))
        && (!q.get("pending") || isPending(e) === (q.get("pending") === "true")) && (!q.get("patientId") || e.patient.id === q.get("patientId"))
        && (!s || e.patient.name.toLowerCase().includes(s) || e.patient.mrNo.toLowerCase().includes(s) || e.patient.phone.includes(s) || e.encId.toLowerCase().includes(s)))
      rows = q.get("sort") === "tokenNo:asc" ? [...rows].sort((a, b) => (a.tokenNo ?? 1e9) - (b.tokenNo ?? 1e9)) : [...rows].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      const out = pageOf(rows.map(sumOf), q); check("GET /encounters", out, "EncounterPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (p === "/encounters/opd" && m === "POST") {
      check("POST /encounters/opd request", body, "CheckInDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      if (S.failNext) { const f = S.failNext; S.failNext = null; return err(route, f.status, f.code, f.message) }
      const patient = patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      if (patient.archived) return err(route, 422, "PATIENT_ARCHIVED", "This patient is archived.")
      if (patient.deceasedOn) return err(route, 422, "PATIENT_DECEASED", "This patient is deceased.")
      if (patient.admitted) return err(route, 422, "PATIENT_ADMITTED", "The patient is admitted.")
      if (S.unavailable) return err(route, 422, "DOCTOR_UNAVAILABLE", "The doctor is not available.")
      if (body.appointmentId) {
        if (body.appointmentId !== appt.id) return err(route, 404, "NOT_FOUND", "The appointment does not exist here.")
        if (S.apptNotToday) return err(route, 422, "APPOINTMENT_NOT_TODAY", "That appointment is not for today.")
        if (appt.status !== "confirmed") return err(route, 422, "APPOINTMENT_NOT_OPEN", "That appointment is no longer open.")
      }
      const startedAt = body.startedAt ?? instant(TODAY, "10:05")
      const date = new Date(Date.parse(startedAt) + 5 * 3600_000).toISOString().slice(0, 10)
      const tokenNo = Math.max(0, ...encounters.filter((e) => e.doctorId === body.doctorId && e.date === date && e.tokenNo).map((e) => e.tokenNo)) + 1
      const e = mkE({ type: "opd", patient, doctorId: body.doctorId, priority: body.priority ?? "normal", advisedBy: body.advisedBy ?? null, referredBy: body.referredBy ?? null, reason: body.reason ?? null, startedAt, date, tokenNo })
      if (body.appointmentId) { e.appointment = { id: appt.id, appointmentNo: appt.appointmentNo }; appt.status = "completed"; appt.encounter = { id: e.id, encId: e.encId } }
      return reply(route, e, "POST /encounters/opd response", 201)
    }
    if (p === "/encounters/ipd" && m === "POST") {
      check("POST /encounters/ipd request", body, "AdmitDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      const patient = patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      if (patient.deceasedOn) return err(route, 422, "PATIENT_DECEASED", "This patient is deceased.")
      if (patient.admitted) return err(route, 409, "PATIENT_ADMITTED", "The patient is already admitted.")
      const bed = bedById(body.bedId); if (!bed) return err(route, 404, "NOT_FOUND", "The bed does not exist here.")
      if (S.stealBed === bed.id) { S.stealBed = null; mkE({ type: "ipd", patient: P(5), admissionType: "planned", bedId: bed.id }); }
      if (bedState(bed) === "occupied") return err(route, 409, "BED_OCCUPIED", "Another patient took that bed.")
      if (bed.maint) return err(route, 422, "BED_UNDER_MAINTENANCE", "That bed is under maintenance.")
      const e = mkE({ type: "ipd", patient, doctorId: body.doctorId, priority: body.priority ?? "normal", advisedBy: body.advisedBy ?? null, referredBy: body.referredBy ?? null, reason: body.reason ?? null, admissionType: body.admissionType, bedId: bed.id })
      e.bedHistory.push({ bedId: bed.id, assignedAt: e.startedAt, releasedAt: null }); patient.admitted = true
      return reply(route, e, "POST /encounters/ipd response", 201)
    }
    // ── one encounter
    if ((mm = p.match(/^\/encounters\/([0-9A-Z]{26})$/)) && m === "GET") { const e = encounters.find((x) => x.id === mm[1]); return e ? reply(route, e, "GET /encounters/{id}") : err(route, 404, "NOT_FOUND", "Encounter not found") }
    if ((mm = p.match(/^\/encounters\/([0-9A-Z]{26})\/(check-in|clinical-record|vitals|progress-notes|close|transfer|discharge|cancel|reopen|archive|restore)$/))) {
      const e = encounters.find((x) => x.id === mm[1]); if (!e) return err(route, 404, "NOT_FOUND", "Encounter not found")
      const part = mm[2]
      const open = e.status === "open" && !e.archived
      if (S.bump === e.id && (part === "check-in" || part === "clinical-record")) { S.bump = null; e.reason = "Changed by someone else"; bump(e) }
      if (S.failNext && m !== "GET") { const f = S.failNext; S.failNext = null; return err(route, f.status, f.code, f.message) }
      if (part === "check-in" && m === "PATCH") {
        check("PATCH check-in request", body, "UpdateCheckInDto")
        if (body.expectedUpdatedAt && body.expectedUpdatedAt !== e.updatedAt) return err(route, 409, "ENCOUNTER_CHANGED", "Someone else changed this encounter.")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        for (const k of ["doctorId", "priority", "advisedBy", "referredBy", "reason", "admissionType", "startedAt"]) if (k in body) e[k] = body[k]
        bump(e); return reply(route, e, "PATCH check-in response")
      }
      if (part === "vitals" && m === "GET") { const out = pageOf(e.vitals.map(vitalsOf), url.searchParams); check("GET vitals", out, "VitalsPageDto_Output", LENIENT); return json(route, 200, out) }
      if (part === "vitals" && m === "POST") {
        check("POST vitals request", body, "VitalsReadingDto")
        if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        const v = { id: U(450 + ++S.seq), recordedAt: body.recordedAt ?? NOW, ...body }
        if (v.weightKg && v.heightCm) v.bmi = Math.round((v.weightKg / ((v.heightCm / 100) ** 2)) * 10) / 10
        e.vitals.unshift(v); bump(e)
        const out = vitalsOf(v); const lenientNums = { ...out, temperatureF: out.temperatureF === null ? [] : [out.temperatureF], weightKg: out.weightKg === null ? [] : [out.weightKg], heightCm: out.heightCm === null ? [] : [out.heightCm], bmi: out.bmi === null ? [] : [out.bmi] }
        check("POST vitals response", lenientNums, "VitalsResponseDto_Output", LENIENT); return json(route, 201, out)
      }
      if (part === "clinical-record" && m === "PUT") {
        check("PUT clinical-record request", body, "ClinicalRecordDto")
        if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
        if (!open) return err(route, 422, e.archived ? "ENCOUNTER_ARCHIVED" : "ENCOUNTER_NOT_OPEN", "This encounter cannot be changed.")
        if (body.expectedUpdatedAt !== e.updatedAt) return err(route, 409, "ENCOUNTER_CHANGED", "Someone else changed this encounter.")
        const keptIds = new Set((body.prescription || []).filter((l) => l.id).map((l) => l.id))
        if (S.dispensedLine && (e.rx ?? e.rec.rx).some((l) => l.id === S.dispensedLine) && !keptIds.has(S.dispensedLine)) return err(route, 422, "PRESCRIPTION_DISPENSED", "A line the pharmacy has dispensed must come back unchanged.")
        e.rec.chief = body.chiefComplaint ?? null; e.rec.history = body.historyOfIllness ?? null; e.rec.exam = body.examinationFindings ?? null; e.rec.notes = body.clinicalNotes ?? null; e.rec.instr = body.generalInstructions ?? null; e.rec.follow = body.followUpDate ?? null
        e.rec.diagnoses = (body.diagnoses || []).map((d) => { const c = d.icdCodeId ? icd.find((x) => x.id === d.icdCodeId) : null; return { id: U(400 + ++S.seq), icdCode: c ? { id: c.id, code: c.code } : null, text: c ? c.name : d.text, isPrimary: d.isPrimary } })
        e.rec.rx = (body.prescription || []).map((l) => ({ id: l.id ?? U(400 + ++S.seq), medicineId: l.medicineId ?? null, medicineText: l.medicineText ?? "", dose: l.dose ?? null, route: l.route ?? null, frequency: l.frequency ?? null, duration: l.duration ?? null, quantity: l.quantity ?? null, instructions: l.instructions ?? null }))
        bump(e); return reply(route, e, "PUT clinical-record response")
      }
      if (part === "close" && m === "POST") {
        if (e.type !== "opd") return err(route, 422, "NOT_AN_OPD_VISIT", "Only an OPD visit is closed.")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        if (!complete(e)) return err(route, 422, "CLINICAL_RECORD_INCOMPLETE", "The clinical record is incomplete.", { details: { missing: [...(e.rec.chief && e.rec.chief.trim() ? [] : ["chiefComplaint"]), ...(e.rec.diagnoses.some((d) => d.isPrimary) ? [] : ["primaryDiagnosis"])] } })
        e.status = "closed"; e.closedAt = NOW; bump(e); return reply(route, e, "POST close response")
      }
      if (part === "progress-notes" && m === "GET") { if (e.type !== "ipd") return err(route, 422, "NOT_AN_ADMISSION", "Not an admission."); const out = pageOf(e.notes, url.searchParams); check("GET notes", out, "ProgressNotePageDto_Output"); return json(route, 200, out) }
      if (part === "progress-notes" && m === "POST") {
        check("POST note request", body, "ProgressNoteDto")
        if (e.type !== "ipd") return err(route, 422, "NOT_AN_ADMISSION", "Not an admission.")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        const n = { id: U(450 + ++S.seq), note: body.note, writtenAt: NOW, author: { id: D1, name: "Test User" } }; e.notes.unshift(n)
        check("POST note response", n, "ProgressNoteResponseDto_Output"); return json(route, 201, n)
      }
      if (part === "transfer" && m === "POST") {
        check("POST transfer request", body, "TransferDto")
        if (e.type !== "ipd") return err(route, 422, "NOT_AN_ADMISSION", "Not an admission.")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        if (body.bedId === e.bedId) return err(route, 422, "SAME_BED", "The patient is already in that bed.")
        const bed = bedById(body.bedId); if (!bed) return err(route, 404, "NOT_FOUND", "no bed")
        if (bedState(bed) === "occupied") return err(route, 422, "BED_OCCUPIED", "That bed is occupied.")
        if (bed.maint) return err(route, 422, "BED_UNDER_MAINTENANCE", "That bed is under maintenance.")
        const last = e.bedHistory[e.bedHistory.length - 1]; if (last) last.releasedAt = NOW
        e.bedId = bed.id; e.bedHistory.push({ bedId: bed.id, assignedAt: NOW, releasedAt: null }); bump(e); return reply(route, e, "POST transfer response")
      }
      if (part === "discharge" && m === "POST") {
        check("POST discharge request", body, "DischargeDto")
        if (e.type !== "ipd") return err(route, 422, "NOT_AN_ADMISSION", "Not an admission.")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        const last = e.bedHistory[e.bedHistory.length - 1]; if (last) last.releasedAt = body.dischargedAt ?? NOW
        e.rec.discharge = { summary: body.dischargeSummary, condition: body.conditionOnDischarge, followUpInstructions: body.followUpInstructions, diagnoses: body.diagnoses.map((d) => { const c = d.icdCodeId ? icd.find((x) => x.id === d.icdCodeId) : null; return { id: U(400 + ++S.seq), icdCode: c ? { id: c.id, code: c.code } : null, text: c ? c.name : d.text, isPrimary: d.isPrimary } }) }
        e.status = "discharged"; e.dischargedAt = body.dischargedAt ?? NOW; e.patient.admitted = false
        if (body.conditionOnDischarge === "expired") e.patient.deceasedOn = TODAY
        bump(e); return reply(route, e, "POST discharge response")
      }
      if (part === "cancel" && m === "POST") {
        check("POST cancel request", body, "ReasonDto")
        if (!open) return err(route, 422, "ENCOUNTER_NOT_OPEN", "This encounter is not open.")
        if (e.rec.chief) return err(route, 422, "ENCOUNTER_RECORD_STARTED", "The doctor has already started the record.")
        e.status = "cancelled"; e.cancelledAt = NOW; e.cancelReason = body.reason; if (e.type === "ipd") e.patient.admitted = false; bump(e); return reply(route, e, "POST cancel response")
      }
      if (part === "reopen" && m === "POST") {
        check("POST reopen request", body, "ReasonDto")
        if (e.status !== "closed" && e.status !== "discharged") return err(route, 422, "ENCOUNTER_NOT_ENDED", "This encounter has not ended.")
        e.status = "open"; e.closedAt = null; e.dischargedAt = null; bump(e); return reply(route, e, "POST reopen response")
      }
      if (part === "archive" && m === "POST") { e.archived = true; e.archivedAt = NOW; bump(e); return reply(route, e, "POST archive response") }
      if (part === "restore" && m === "POST") { e.archived = false; e.archivedAt = null; bump(e); return reply(route, e, "POST restore response") }
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement this")
  }
  return { S, handler, requests, violations, check, E: { e0, e1, e2, e3, e4, e5, e6, encounters }, P, patients, wards, icd, appt, doctors, D1, TODAY, YESTERDAY, U, NOW, bedById, bedState, forCheck, LENIENT }
}
