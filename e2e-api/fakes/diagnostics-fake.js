// Phase 9 fake backend, TEST HARNESS ONLY. A stateful lab and imaging server layered on the Phase 7 fake (patients, doctors, auth). The FAKE computes everything the real
// server will: specimens, flags against the reference ranges, the status of an order, and `allowedActions` at the order, specimen and test level for the signed-in user's
// permissions and the record's state. The screens must only show what it sends. Every request body and response is validated against docs/openapi.json.
module.exports = function createFake({ validate, schemaOf, stubs }) {
  const F7 = require("./encounters-fake.js")({ validate, schemaOf, stubs })
  const { S, E, P, U } = F7
  const NOW = "2026-11-07T10:00:00.000Z"
  const LENIENT = { lenientStringArrays: true }
  const violations = F7.violations
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const requests = []
  const S2 = { slow: false, dropNext: false, enterer: U(950), nextSpecimen: 0, seq: 3000, labModuleOn: true }
  const me = { id: F7.D1, name: "Test User" }
  const labTech = { id: U(950), name: "Lab Tech" }
  const nid = () => U(++S2.seq)
  const has = (p) => S.perms.includes(p)

  // ── catalogues
  const lt = (n, o) => ({ id: U(n), code: o.code, name: o.name, category: o.category, specimenType: o.specimenType, rate: o.rate, gstPct: "0", discountPct: "0", turnaroundHours: 4, narrative: !!o.narrative, parameters: o.parameters || [], active: true, createdAt: NOW })
  const labTests = [
    lt(1000, { code: "CBC", name: "CBC", category: "Haematology", specimenType: "EDTA whole blood", rate: "600.00", parameters: [
      { key: "hb", name: "Haemoglobin", unit: "g/dL", decimals: 1, ranges: { male: { low: 13, high: 17 }, female: { low: 12, high: 15.5 } }, critical: { low: 7, high: 20 } },
      { key: "wbc", name: "WBC", unit: "x10^9/L", decimals: 1, ranges: { any: { low: 4, high: 11 } } }] }),
    lt(1001, { code: "LFT", name: "Liver function", category: "Biochemistry", specimenType: "Serum", rate: "900.00", parameters: [{ key: "alt", name: "ALT", unit: "U/L", decimals: 0, ranges: { any: { low: 7, high: 56 } } }] }),
    lt(1002, { code: "UCS", name: "Urine culture", category: "Microbiology", specimenType: "Urine", rate: "700.00", narrative: true }),
    lt(1003, { code: "GLU", name: "Glucose", category: "Biochemistry", specimenType: "Serum", rate: "200.00", parameters: [{ key: "glu", name: "Glucose", unit: "mg/dL", decimals: 0, ranges: { any: { low: 70, high: 110 } } }] }),
  ]
  const it = (n, o) => ({ id: U(n), code: o.code, name: o.name, modality: o.modality, rate: o.rate, gstPct: "0", discountPct: "0", turnaroundHours: 2, reportRequired: o.reportRequired, reportTemplate: o.reportTemplate ?? null, active: true, createdAt: NOW })
  const imagingTests = [
    it(1100, { code: "CXR", name: "Chest X-ray", modality: "X-Ray", rate: "800.00", reportRequired: true, reportTemplate: "Lungs are clear. Heart size is normal." }),
    it(1101, { code: "ECG", name: "ECG tracing", modality: "ECG", rate: "500.00", reportRequired: false }),
    it(1102, { code: "USG", name: "USG abdomen", modality: "Ultrasound", rate: "1500.00", reportRequired: true }),
  ]

  // ── flags
  const bandText = (b) => (b ? `${b.low} - ${b.high}` : null)
  const rangeOf = (spec, gender) => { const r = spec.ranges || {}; return gender === "male" ? r.male || r.any : gender === "female" ? r.female || r.any : r.any || r.male || r.female }
  const flagOf = (spec, gender, value) => {
    const v = parseFloat(value); if (Number.isNaN(v)) return null
    if (spec.critical && (v < spec.critical.low || v > spec.critical.high)) return "critical"
    const r = rangeOf(spec, gender); if (!r) return null
    return v < r.low ? "low" : v > r.high ? "high" : "normal"
  }
  const paramsFor = (def, gender, list) => list.map(({ key, value }) => { const spec = def.parameters.find((p) => p.key === key) || { key, name: key }; return { key, name: spec.name, unit: spec.unit ?? null, value, flag: flagOf(spec, gender, value), normalRange: bandText(rangeOf(spec, gender)) } })

  // ── lab orders
  let ln = 0
  const labOrders = []
  const mkSpecimen = (type, over = {}) => ({ id: nid(), no: `SPM-2026-${String(++S2.nextSpecimen).padStart(6, "0")}`, type, status: "pending", collectedAt: null, collectedBy: null, rejectedAt: null, rejectedReason: null, replacesId: null, ...over })
  const mkLab = (o) => {
    const order = { id: nid(), no: `LAB-2026-${String(++ln).padStart(4, "0")}`, priority: "routine", fulfillment: "internal", referredTo: null, patient: P(0), encounterId: null, doctorId: F7.D1, outsideDoctor: null, notes: null, remarks: null, orderedAt: NOW, deliveredAt: null, deliveredBy: null, archived: false, specimens: [], tests: [], ...o }
    labOrders.push(order); return order
  }
  const addLabTests = (order, ids) => {
    for (const testId of ids) {
      const def = labTests.find((t) => t.id === testId); if (!def) return null
      let sp = order.specimens.find((s) => s.type === def.specimenType && s.status !== "rejected")
      if (!sp && order.fulfillment === "internal") { sp = mkSpecimen(def.specimenType); order.specimens.push(sp) }
      order.tests.push({ id: nid(), testId, def, name: def.name, rate: def.rate, specimenId: sp ? sp.id : null, status: "ordered", result: null, amendments: [], cancelledAt: null, cancelledReason: null, charge: { id: nid(), invoiceId: nid(), total: def.rate, received: "0.00", paid: false } })
    }
    return order
  }
  const activeTests = (o) => o.tests.filter((t) => t.status !== "cancelled")
  const labStatus = (o) => {
    if (o.deliveredAt) return "delivered"
    const a = activeTests(o); if (a.length === 0) return "cancelled"
    if (a.every((t) => t.status === "verified")) return "completed"
    if (a.some((t) => t.result)) return "in_progress"
    const live = o.specimens.filter((s) => s.status !== "rejected")
    return live.length > 0 && live.every((s) => s.status === "collected") ? "collected" : "pending"
  }
  const specimenOf = (o, t) => o.specimens.find((s) => s.id === t.specimenId)
  const labTestActions = (o, t) => {
    const out = [], sp = specimenOf(o, t)
    if (o.archived || o.deliveredAt || t.status === "cancelled") return out
    if (has("diagnostics.order") && t.status === "ordered" && !t.result) out.push("cancel")
    if (has("diagnostics.enter_results") && (!sp || sp.status === "collected") && (t.status === "ordered" || t.status === "entered") && o.fulfillment === "internal") out.push("enter_result")
    if (has("diagnostics.verify") && t.status === "entered") out.push("verify")
    if (has("diagnostics.verify") && t.status === "verified") out.push("amend")
    return out
  }
  const labOrderActions = (o) => {
    const out = []
    if (has("diagnostics.order") && !o.archived && !o.deliveredAt && labStatus(o) !== "cancelled") out.push("add_test")
    if (has("diagnostics.verify") && !o.archived) out.push("write_remarks")
    if (has("diagnostics.enter_results") && labStatus(o) === "completed" && !o.archived) out.push("deliver")
    if (has("diagnostics.archive")) out.push(o.archived ? "restore" : "archive")
    return out
  }
  const person = (p) => (p ? { id: p.id, name: p.name } : null)
  const resultDto = (r) => (r ? { version: r.version, parameters: r.parameters, narrative: r.narrative, enteredBy: person(r.enteredBy), enteredAt: r.enteredAt, verifiedBy: person(r.verifiedBy), verifiedAt: r.verifiedAt } : null)
  const labDetail = (o) => ({
    id: o.id, orderNo: o.no, status: labStatus(o), priority: o.priority, fulfillment: o.fulfillment, referredTo: o.referredTo, patient: { id: o.patient.id, mrNo: o.patient.mrNo, name: o.patient.name, gender: o.patient.gender },
    encounter: o.encounterId ? (() => { const e = E.encounters.find((x) => x.id === o.encounterId); return e ? { id: e.id, encId: e.encId } : null })() : null,
    doctor: o.doctorId ? { id: o.doctorId, name: F7.doctors.find((d) => d.id === o.doctorId).name } : null, referringDoctorText: o.outsideDoctor, clinicalNotes: o.notes, pathologistRemarks: o.remarks, orderedAt: o.orderedAt,
    deliveredAt: o.deliveredAt, deliveredBy: person(o.deliveredBy), archived: o.archived,
    specimens: o.specimens.map((s) => ({ id: s.id, specimenNo: s.no, specimenType: s.type, status: s.status, collectedAt: s.collectedAt, collectedBy: person(s.collectedBy), rejectedAt: s.rejectedAt, rejectedReason: s.rejectedReason, replacesSpecimenId: s.replacesId,
      allowedActions: has("diagnostics.collect") && s.status === "pending" && !o.archived ? ["collect", "reject"] : [] })),
    tests: o.tests.map((t) => ({ id: t.id, testId: t.testId, name: t.name, rate: t.rate, specimenId: t.specimenId, status: t.status, result: resultDto(t.result),
      amendments: t.amendments.map((a) => ({ version: a.version, reason: a.reason, amendedBy: person(a.amendedBy), amendedAt: a.amendedAt, previous: a.previous })), charge: t.charge, cancelledAt: t.cancelledAt, cancelledReason: t.cancelledReason, allowedActions: labTestActions(o, t) })),
    allowedActions: labOrderActions(o),
  })
  const hasCritical = (o) => o.tests.some((t) => t.result && t.result.parameters.some((p) => p.flag === "critical"))
  const labRow = (o) => ({ id: o.id, orderNo: o.no, status: labStatus(o), priority: o.priority, fulfillment: o.fulfillment, orderedAt: o.orderedAt, patient: { id: o.patient.id, mrNo: o.patient.mrNo, name: o.patient.name },
    encounter: labDetail(o).encounter, referringDoctor: o.outsideDoctor || (o.doctorId ? F7.doctors.find((d) => d.id === o.doctorId).name : ""), tests: o.tests.map((t) => ({ name: t.name, status: t.status })),
    toCollect: o.specimens.filter((s) => s.status === "pending").length, hasCritical: hasCritical(o), archived: o.archived })

  // seed lab orders
  const labA = mkLab({ patient: P(0), priority: "urgent", notes: "Fever for 3 days" }); addLabTests(labA, [labTests[0].id, labTests[1].id])
  const labB = mkLab({ patient: P(1) }); addLabTests(labB, [labTests[0].id])
  labB.specimens[0].status = "collected"; labB.specimens[0].collectedAt = NOW; labB.specimens[0].collectedBy = labTech
  labB.tests[0].result = { version: 1, parameters: paramsFor(labTests[0], "male", [{ key: "hb", value: "6.5" }, { key: "wbc", value: "7" }]), narrative: null, enteredBy: labTech, enteredAt: NOW, verifiedBy: null, verifiedAt: null }; labB.tests[0].status = "entered"
  const labC = mkLab({ patient: P(5) }); addLabTests(labC, [labTests[0].id])
  labC.specimens[0].status = "collected"; labC.specimens[0].collectedAt = NOW; labC.specimens[0].collectedBy = labTech
  labC.tests[0].result = { version: 1, parameters: paramsFor(labTests[0], "female", [{ key: "hb", value: "13.2" }, { key: "wbc", value: "6" }]), narrative: null, enteredBy: labTech, enteredAt: NOW, verifiedBy: { id: F7.D1, name: "Dr Imran" }, verifiedAt: NOW }; labC.tests[0].status = "verified"
  const labD = mkLab({ patient: P(0), fulfillment: "external_referral", referredTo: "Chughtai Lab", doctorId: null, outsideDoctor: "Dr Outside" }); addLabTests(labD, [labTests[1].id])

  // ── imaging orders
  let imn = 0
  const imgOrders = []
  const mkImg = (o) => { const order = { id: nid(), no: `XR-2026-${String(++imn).padStart(4, "0")}`, priority: "routine", fulfillment: "internal", referredTo: null, patient: P(0), encounterId: null, doctorId: F7.D1, outsideDoctor: null, notes: null, orderedAt: NOW, deliveredAt: null, deliveredBy: null, archived: false, tests: [], ...o }; imgOrders.push(order); return order }
  const addImgTests = (order, ids) => { for (const testId of ids) { const def = imagingTests.find((t) => t.id === testId); if (!def) return null; order.tests.push({ id: nid(), testId, def, name: def.name, rate: def.rate, status: "ordered", performedBy: null, performedAt: null, report: null, amendments: [], cancelledAt: null, cancelledReason: null, charge: { id: nid(), invoiceId: nid(), total: def.rate, received: "0.00", paid: false } }) } return order }
  const imgStatus = (o) => {
    if (o.deliveredAt) return "delivered"
    const a = o.tests.filter((t) => t.status !== "cancelled"); if (a.length === 0) return "cancelled"
    const done = (t) => (t.def.reportRequired ? t.status === "verified" : t.status === "performed")
    if (a.every(done)) return "completed"
    return a.some((t) => t.status !== "ordered") ? "in_progress" : "pending"
  }
  const imgTestActions = (o, t) => {
    const out = []
    if (o.archived || o.deliveredAt || t.status === "cancelled") return out
    if (has("diagnostics.order") && t.status === "ordered") out.push("cancel")
    if (has("diagnostics.perform") && t.status === "ordered") out.push("perform")
    if ((has("diagnostics.perform") || has("diagnostics.verify")) && t.def.reportRequired && (t.status === "performed" || t.status === "entered")) out.push("write_report")
    if (has("diagnostics.verify") && t.status === "entered") out.push("sign")
    if (has("diagnostics.verify") && t.status === "verified") out.push("amend")
    return out
  }
  const imgOrderActions = (o) => {
    const out = []
    if (has("diagnostics.order") && !o.archived && !o.deliveredAt && imgStatus(o) !== "cancelled") out.push("add_test")
    if (has("diagnostics.perform") && imgStatus(o) === "completed" && !o.archived) out.push("deliver")
    if (has("diagnostics.archive")) out.push(o.archived ? "restore" : "archive")
    return out
  }
  const reportDto = (r) => (r ? { version: r.version, narrative: r.narrative, writtenBy: person(r.writtenBy), writtenAt: r.writtenAt, signedBy: person(r.signedBy), signedAt: r.signedAt } : null)
  const imgDetail = (o) => ({
    id: o.id, orderNo: o.no, status: imgStatus(o), priority: o.priority, fulfillment: o.fulfillment, referredTo: o.referredTo, patient: { id: o.patient.id, mrNo: o.patient.mrNo, name: o.patient.name, gender: o.patient.gender }, encounter: null,
    doctor: o.doctorId ? { id: o.doctorId, name: F7.doctors.find((d) => d.id === o.doctorId).name } : null, referringDoctorText: o.outsideDoctor, clinicalNotes: o.notes, orderedAt: o.orderedAt, deliveredAt: o.deliveredAt, deliveredBy: person(o.deliveredBy), archived: o.archived,
    tests: o.tests.map((t) => ({ id: t.id, testId: t.testId, name: t.name, modality: t.def.modality, rate: t.rate, status: t.status, reportRequired: t.def.reportRequired, performedBy: person(t.performedBy), performedAt: t.performedAt, report: reportDto(t.report),
      reportTemplate: t.def.reportTemplate, amendments: t.amendments.map((a) => ({ version: a.version, reason: a.reason, amendedBy: person(a.amendedBy), amendedAt: a.amendedAt, previousNarrative: a.previousNarrative })), charge: t.charge, cancelledAt: t.cancelledAt, cancelledReason: t.cancelledReason, allowedActions: imgTestActions(o, t) })),
    allowedActions: imgOrderActions(o),
  })
  const imgRow = (o) => ({ id: o.id, orderNo: o.no, status: imgStatus(o), priority: o.priority, fulfillment: o.fulfillment, orderedAt: o.orderedAt, patient: { id: o.patient.id, mrNo: o.patient.mrNo, name: o.patient.name }, encounter: null,
    referringDoctor: o.outsideDoctor || (o.doctorId ? F7.doctors.find((d) => d.id === o.doctorId).name : ""), tests: o.tests.map((t) => ({ name: t.name, modality: t.def.modality, status: t.status })),
    toPerform: o.tests.filter((t) => t.status === "ordered").length, toReport: o.tests.filter((t) => t.def.reportRequired && (t.status === "performed" || t.status === "entered")).length, archived: o.archived })
  const imgA = mkImg({ patient: P(0) }); addImgTests(imgA, [imagingTests[0].id, imagingTests[1].id])
  const imgB = mkImg({ patient: P(1), priority: "urgent" }); addImgTests(imgB, [imagingTests[2].id])
  imgB.tests[0].status = "entered"; imgB.tests[0].performedBy = labTech; imgB.tests[0].performedAt = NOW; imgB.tests[0].report = { version: 1, narrative: "Gallstones seen.", writtenBy: labTech, writtenAt: NOW, signedBy: null, signedAt: null }
  const imgC = mkImg({ patient: P(5) }); addImgTests(imgC, [imagingTests[0].id])
  imgC.tests[0].status = "verified"; imgC.tests[0].performedBy = labTech; imgC.tests[0].performedAt = NOW; imgC.tests[0].report = { version: 1, narrative: "Normal chest.", writtenBy: { id: F7.D1, name: "Dr Imran" }, writtenAt: NOW, signedBy: { id: F7.D1, name: "Dr Imran" }, signedAt: NOW }

  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const inRange = (iso, q) => { const d = iso.slice(0, 10); return (!q.get("dateFrom") || d >= q.get("dateFrom")) && (!q.get("dateTo") || d <= q.get("dateTo")) }
  const filterCommon = (o, q, statusFn) => (q.get("includeArchived") === "true" || !o.archived) && (!q.get("status") || statusFn(o) === q.get("status")) && (!q.get("priority") || o.priority === q.get("priority")) && inRange(o.orderedAt, q)
    && (!q.get("search") || [o.no, o.patient.name, o.patient.mrNo, o.outsideDoctor || ""].some((x) => x.toLowerCase().includes(q.get("search").toLowerCase())))

  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method(), q = url.searchParams
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(q), body })
    const mine = /^\/(lab-orders|imaging-orders|lab-tests|imaging-tests)(\/|$)/.test(p)
    if (!mine) return F7.handler(route)
    if (m !== "GET" && S2.slow) await new Promise((r) => setTimeout(r, 700))
    if (m !== "GET" && S2.dropNext) { S2.dropNext = false; return route.abort("failed") }
    let mm
    // catalogues
    if (m === "GET" && p === "/lab-tests") { const s = (q.get("search") || "").toLowerCase(); const out = pageOf(labTests.filter((t) => !s || t.name.toLowerCase().includes(s)), q); check("GET /lab-tests", out, "LabTestPageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && (mm = p.match(/^\/lab-tests\/([0-9A-Z]{26})$/))) { const t = labTests.find((x) => x.id === mm[1]); if (!t) return err(route, 404, "NOT_FOUND", "Test not found"); check("GET /lab-tests/{id}", { ...t, turnaroundHours: [t.turnaroundHours] }, "LabTestResponseDto_Output", LENIENT); return json(route, 200, t) }
    if (m === "GET" && p === "/imaging-tests") { const s = (q.get("search") || "").toLowerCase(); const out = pageOf(imagingTests.filter((t) => !s || t.name.toLowerCase().includes(s)), q); check("GET /imaging-tests", out, "ImagingTestPageDto_Output", LENIENT); return json(route, 200, out) }
    const lab = p.startsWith("/lab-orders")
    const orders = lab ? labOrders : imgOrders
    const detail = lab ? labDetail : imgDetail
    const respSchema = lab ? "LabOrderResponseDto_Output" : "ImagingOrderResponseDto_Output"
    const reply = (o, what, status = 200) => { const out = detail(o); check(what, out, respSchema, LENIENT); return json(route, status, out) }
    if (m === "GET" && (p === "/lab-orders" || p === "/imaging-orders")) {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      let rows
      if (lab) rows = labOrders.filter((o) => filterCommon(o, q, labStatus) && (q.get("toCollect") !== "true" || o.specimens.some((s) => s.status === "pending")))
      else rows = imgOrders.filter((o) => filterCommon(o, q, imgStatus) && (!q.get("modality") || o.tests.some((t) => t.def.modality === q.get("modality"))) && (q.get("toPerform") !== "true" || o.tests.some((t) => t.status === "ordered")) && (q.get("toReport") !== "true" || o.tests.some((t) => t.def.reportRequired && (t.status === "performed" || t.status === "entered"))))
      if (q.get("sort") === "priority:desc") rows = [...rows].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "urgent" ? -1 : 1))
      const out = pageOf(rows.map(lab ? labRow : imgRow), q); check("GET " + p, out, lab ? "LabOrderPageDto_Output" : "ImagingOrderPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "POST" && (p === "/lab-orders" || p === "/imaging-orders")) {
      check("POST " + p + " request", body, lab ? "CreateLabOrderDto" : "CreateImagingOrderDto")
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const off = lab ? !S2.labModuleOn : false
      const o = lab ? mkLab({ patient, priority: body.priority ?? "routine", doctorId: body.doctorId ?? null, outsideDoctor: body.referringDoctorText ?? null, notes: body.clinicalNotes ?? null, encounterId: body.encounterId ?? null, fulfillment: off ? "external_referral" : "internal", referredTo: off ? body.referredTo ?? null : null })
        : mkImg({ patient, priority: body.priority ?? "routine", doctorId: body.doctorId ?? null, outsideDoctor: body.referringDoctorText ?? null, notes: body.clinicalNotes ?? null })
      const ok = (lab ? addLabTests : addImgTests)(o, body.tests.map((t) => t.testId)); if (!ok) { orders.pop(); return err(route, 404, "NOT_FOUND", "A test does not exist here.") }
      return reply(o, "POST " + p + " response", 201)
    }
    if ((mm = p.match(/^\/(lab|imaging)-orders\/([0-9A-Z]{26})$/)) && m === "GET") { const o = orders.find((x) => x.id === mm[2]); return o ? reply(o, "GET order") : err(route, 404, "NOT_FOUND", "Order not found") }
    if ((mm = p.match(/^\/(lab|imaging)-orders\/([0-9A-Z]{26})\/report$/)) && m === "GET") {
      const o = orders.find((x) => x.id === mm[2]); if (!o) return err(route, 404, "NOT_FOUND", "Order not found")
      const hospital = { name: "City Hospital", address: "Lahore", phone: null, email: null, printHeader: null }
      const patient = { mrNo: o.patient.mrNo, name: o.patient.name, gender: o.patient.gender, dateOfBirth: o.patient.dob, dateOfBirthEstimated: false }
      const referringDoctor = o.outsideDoctor || (o.doctorId ? F7.doctors.find((d) => d.id === o.doctorId).name : "")
      if (lab) {
        const verified = o.tests.filter((t) => t.status === "verified"), pending = o.tests.filter((t) => t.status !== "verified" && t.status !== "cancelled").map((t) => t.name)
        const out = { hospital, orderNo: o.no, priority: o.priority, orderedAt: o.orderedAt, deliveredAt: o.deliveredAt, patient, encounterNo: [], referringDoctor, clinicalNotes: o.notes ? [o.notes] : [], pathologistRemarks: o.remarks ? [o.remarks] : [],
          specimens: o.specimens.filter((s) => s.status === "collected").map((s) => ({ specimenNo: s.no, specimenType: s.type, collectedAt: s.collectedAt })),
          tests: verified.map((t) => ({ name: t.name, amended: t.amendments.length > 0, amendments: t.amendments.map((a) => ({ version: a.version, reason: a.reason, amendedAt: a.amendedAt, previous: a.previous })),
            parameters: t.result.parameters.map(({ name, unit, value, flag, normalRange }) => ({ name, unit, value, flag, normalRange })), narrative: t.result.narrative, enteredBy: t.result.enteredBy.name, verifiedBy: t.result.verifiedBy.name, verifiedAt: t.result.verifiedAt })), pending, complete: pending.length === 0 }
        check("GET lab report", out, "LabReportDto_Output", LENIENT); return json(route, 200, out)
      }
      const signed = o.tests.filter((t) => t.status === "verified"), unrep = o.tests.filter((t) => t.def.reportRequired && (t.status === "performed" || t.status === "entered")), pending = o.tests.filter((t) => t.status === "ordered").map((t) => t.name)
      const out = { hospital, orderNo: o.no, priority: o.priority, orderedAt: o.orderedAt, deliveredAt: o.deliveredAt, patient, encounterNo: [], referringDoctor, clinicalNotes: o.notes ? [o.notes] : [],
        reports: signed.map((t) => ({ name: t.name, modality: t.def.modality, narrative: t.report.narrative, amended: t.amendments.length > 0, amendments: t.amendments.map((a) => ({ version: a.version, reason: a.reason, amendedAt: a.amendedAt, previousNarrative: a.previousNarrative })), performedBy: t.performedBy ? t.performedBy.name : null, performedAt: t.performedAt, signedBy: t.report.signedBy.name, signedAt: t.report.signedAt })),
        unreported: unrep.map((t) => ({ name: t.name, modality: t.def.modality, performedBy: t.performedBy.name, performedAt: t.performedAt })), pending, complete: pending.length === 0 && unrep.length === 0 }
      check("GET imaging report", out, "ImagingReportDto_Output", LENIENT); return json(route, 200, out)
    }
    // order and test actions
    if ((mm = p.match(/^\/(lab|imaging)-orders\/([0-9A-Z]{26})\/(tests|archive|restore|deliver|remarks)(?:\/([0-9A-Z]{26})\/(cancel|result|verify|amend|perform|report|sign))?$/)) || (mm = p.match(/^\/lab-orders\/([0-9A-Z]{26})\/specimens\/([0-9A-Z]{26})\/(collect|reject)$/))) {
      // specimens
      if (mm.length === 4 && /collect|reject/.test(mm[3])) {
        const o = labOrders.find((x) => x.id === mm[1]); const sp = o && o.specimens.find((s) => s.id === mm[2]); if (!sp) return err(route, 404, "NOT_FOUND", "Specimen not found")
        if (sp.status !== "pending") return err(route, 422, "SPECIMEN_NOT_COLLECTED", "That specimen is not waiting to be collected.")
        if (mm[3] === "collect") { sp.status = "collected"; sp.collectedAt = NOW; sp.collectedBy = me; return reply(o, "collect response") }
        check("reject request", body, "RejectSpecimenDto"); sp.status = "rejected"; sp.rejectedAt = NOW; sp.rejectedReason = body.reason
        const rep = mkSpecimen(sp.type, { replacesId: sp.id }); o.specimens.push(rep); o.tests.forEach((t) => { if (t.specimenId === sp.id) t.specimenId = rep.id })
        return reply(o, "reject response")
      }
      const kind = mm[1], id = mm[2], what = mm[3], testLine = mm[4], act = mm[5]
      const list = kind === "lab" ? labOrders : imgOrders
      const o = list.find((x) => x.id === id); if (!o) return err(route, 404, "NOT_FOUND", "Order not found")
      if (what === "tests" && !testLine) { check("add tests request", body, kind === "lab" ? "AddLabTestsDto" : "AddImagingTestsDto"); const ok = (kind === "lab" ? addLabTests : addImgTests)(o, body.tests.map((t) => t.testId)); if (!ok) return err(route, 404, "NOT_FOUND", "A test does not exist here."); return reply(o, "add tests response", 201) }
      if (what === "archive") { check("archive request", body, kind === "lab" ? "ArchiveLabOrderDto" : "ArchiveImagingOrderDto"); o.archived = true; return reply(o, "archive response") }
      if (what === "restore") { o.archived = false; return reply(o, "restore response") }
      if (what === "deliver") {
        if (o.fulfillment === "external_referral") return err(route, 422, "ORDER_IS_REFERRAL", "This order is an external referral.")
        if ((kind === "lab" ? labStatus(o) : imgStatus(o)) !== "completed") return err(route, 422, "ORDER_NOT_COMPLETE", "The order is not complete yet.")
        o.deliveredAt = NOW; o.deliveredBy = me; return reply(o, "deliver response")
      }
      if (what === "remarks") { check("remarks request", body, "LabRemarksDto"); o.remarks = body.pathologistRemarks ?? null; return reply(o, "remarks response") }
      const t = o.tests.find((x) => x.id === testLine); if (!t) return err(route, 404, "NOT_FOUND", "Test not found")
      if (act === "cancel") {
        check("cancel test request", body, kind === "lab" ? "CancelLabTestDto" : "CancelImagingTestDto")
        if (kind === "lab" ? !!t.result : t.status !== "ordered") return err(route, 422, "TEST_HAS_RESULT", "This test already has a result.")
        t.status = "cancelled"; t.cancelledAt = NOW; t.cancelledReason = body.reason; return reply(o, "cancel test response")
      }
      if (kind === "lab") {
        if (act === "result") {
          check("result request", body, "EnterResultDto")
          if (t.status === "verified") return err(route, 422, "RESULT_VERIFIED", "This result is already verified.")
          const sp = specimenOf(o, t); if (sp && sp.status !== "collected") return err(route, 422, "SPECIMEN_NOT_COLLECTED", "The specimen has not been collected yet.")
          const params = body.parameters ? paramsFor(t.def, o.patient.gender, body.parameters) : []
          t.result = { version: 1, parameters: params, narrative: body.narrative ?? null, enteredBy: S2.enterer === me.id ? me : labTech, enteredAt: NOW, verifiedBy: null, verifiedAt: null }; t.status = "entered"; return reply(o, "result response")
        }
        if (act === "verify") {
          if (t.status === "verified") return err(route, 422, "RESULT_VERIFIED", "This result is already verified.")
          if (t.result && t.result.enteredBy.id === me.id) return err(route, 422, "VERIFIER_IS_ENTERER", "A doctor cannot verify a result they entered.")
          t.result.verifiedBy = me; t.result.verifiedAt = NOW; t.status = "verified"; return reply(o, "verify response")
        }
        if (act === "amend") {
          check("amend request", body, "AmendResultDto")
          const prev = { parameters: t.result.parameters.map(({ name, unit, value, flag, normalRange }) => ({ name, unit, value, flag, normalRange })), narrative: t.result.narrative }
          t.amendments.push({ version: t.result.version + 1, reason: body.reason, amendedBy: me, amendedAt: NOW, previous: prev })
          t.result = { ...t.result, version: t.result.version + 1, parameters: body.parameters ? paramsFor(t.def, o.patient.gender, body.parameters) : [], narrative: body.narrative ?? null, enteredBy: me, enteredAt: NOW, verifiedBy: null, verifiedAt: null }; t.status = "entered"
          return reply(o, "amend response")
        }
      } else {
        if (act === "perform") { if (t.status !== "ordered") return err(route, 422, "ENCOUNTER_NOT_OPEN", "Already performed."); t.status = "performed"; t.performedBy = me; t.performedAt = NOW; return reply(o, "perform response") }
        if (act === "report") { check("report request", body, "WriteImagingReportDto"); t.report = { version: 1, narrative: body.narrative, writtenBy: me, writtenAt: NOW, signedBy: null, signedAt: null }; t.status = "entered"; return reply(o, "report response") }
        if (act === "sign") { if (!t.report) return err(route, 422, "TEST_HAS_RESULT", "Write the report first."); t.report.signedBy = me; t.report.signedAt = NOW; t.status = "verified"; return reply(o, "sign response") }
        if (act === "amend") {
          check("imaging amend request", body, "AmendImagingReportDto")
          t.amendments.push({ version: t.report.version + 1, reason: body.reason, amendedBy: me, amendedAt: NOW, previousNarrative: t.report.narrative })
          t.report = { ...t.report, version: t.report.version + 1, narrative: body.narrative, writtenBy: me, writtenAt: NOW, signedBy: null, signedAt: null }; t.status = "entered"; return reply(o, "imaging amend response")
        }
      }
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement " + m + " " + p)
  }
  return { F7, S, S2, E, P, U, handler, requests, violations, labOrders, imgOrders, labA, labB, labC, labD, imgA, imgB, imgC, labTests, imagingTests, labTech, me, labStatus, imgStatus }
}
