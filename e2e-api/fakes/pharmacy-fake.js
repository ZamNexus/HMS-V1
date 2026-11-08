// Phase 10 fake backend, TEST HARNESS ONLY. A stateful pharmacy server (medicines, batches, stock movements, prescriptions, dispenses, returns) layered on the billing fake (so a dispense
// posts real charges to a real invoice) and the encounters fake. The FAKE computes every stock figure, first-expire-first-out and the level/expiry badges, as the real server will: the
// screens must only show what it sends. Every request body and response is validated against docs/openapi.json.
const fs = require("fs")
module.exports = function createFake({ validate, schemaOf, stubs }) {
  // expose the billing fake's invoice builders to this layer
  const p8path = require.resolve("./billing-fake.js")
  const src = fs.readFileSync(p8path, "utf8")
  const F8 = (src.includes("allInvoices") ? require("./billing-fake.js") : (() => { throw new Error("billing-fake.js must expose allInvoices, mkInvoice and mkCharge") })())({ validate, schemaOf, stubs })
  const F7 = F8.F7
  const { S, E, P, U } = F7
  const NOW = "2026-11-07T10:00:00.000Z", TODAY = "2026-11-07"
  const LENIENT = { lenientStringArrays: true }
  const violations = F7.violations
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const requests = []
  const S3 = { slow: false, dropNext: false, seq: 5000 }
  const me = { id: F7.D1, name: "Test User" }
  const has = (p) => S.perms.includes(p)
  const nid = () => U(++S3.seq)
  const fmt = F8.fmt, toC = F8.toC
  const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10)

  const medicines = []
  const movements = []
  const mkMed = (o) => { const m = { id: nid(), name: "Medicine", generic: null, category: null, unit: "tablet", saleRate: "5.00", gstPct: "0", discountPct: "0", reorderLevel: 0, active: true, createdAt: NOW, batches: [], ...o }; medicines.push(m); return m }
  const mkBatch = (m, o) => { const b = { id: nid(), batchNo: "B", expiryDate: "2027-03-31", receivedDate: "2026-10-01", quantityReceived: 100, quantityRemaining: 100, purchaseRate: "3.00", supplier: null, ...o }; m.batches.push(b); return b }
  const expired = (b) => b.expiryDate < TODAY
  const live = (m) => m.batches.filter((b) => !expired(b) && b.quantityRemaining > 0)
  const stockOf = (m) => {
    const onHand = m.batches.filter((b) => !expired(b)).reduce((n, b) => n + b.quantityRemaining, 0)
    const expiredQty = m.batches.filter(expired).reduce((n, b) => n + b.quantityRemaining, 0)
    const nonExp = m.batches.filter((b) => !expired(b) && b.quantityRemaining > 0).sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1))
    const level = onHand <= 0 ? "out_of_stock" : onHand <= m.reorderLevel ? "low" : "in_stock"
    const expiry = expiredQty > 0 ? "expired" : nonExp.some((b) => b.expiryDate <= addDays(TODAY, 60)) ? "expiring" : null
    return { onHand, expired: expiredQty, nearestExpiry: nonExp.length ? nonExp[0].expiryDate : null, level, expiry, saleValue: fmt(onHand * toC(m.saleRate)) }
  }
  const medDto = (m) => ({ id: m.id, name: m.name, generic: m.generic, category: m.category, unit: m.unit, saleRate: m.saleRate, gstPct: m.gstPct, discountPct: m.discountPct, reorderLevel: m.reorderLevel, active: m.active, stock: stockOf(m), createdAt: m.createdAt })
  const batchDto = (b) => ({ id: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, receivedDate: b.receivedDate, quantityReceived: b.quantityReceived, quantityRemaining: b.quantityRemaining, purchaseRate: b.purchaseRate, supplier: b.supplier, expired: expired(b) })
  const detailDto = (m) => ({ ...medDto(m), batches: m.batches.map(batchDto) })
  const move = (m, b, type, quantity, reason, dispense) => { movements.unshift({ id: nid(), type, quantity, reason: reason ?? null, occurredAt: NOW, medicine: { id: m.id, name: m.name }, batch: { id: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate }, by: me, dispense: dispense ? { id: dispense.id, dispenseNo: dispense.no } : null }) }

  const para = mkMed({ name: "Paracetamol 500 mg", generic: "Paracetamol", category: "Analgesic", saleRate: "5.00", reorderLevel: 50 })
  const paraB = mkBatch(para, { batchNo: "B-1001", expiryDate: "2027-03-31", quantityReceived: 200, quantityRemaining: 120, supplier: "Medico" })
  mkBatch(para, { batchNo: "B-0900", expiryDate: "2026-09-30", receivedDate: "2026-06-01", quantityReceived: 50, quantityRemaining: 5 }) // expired
  const amox = mkMed({ name: "Amoxicillin 250 mg", generic: "Amoxicillin", category: "Antibiotic", saleRate: "12.00", reorderLevel: 30 }) // no stock at all
  const brufen = mkMed({ name: "Brufen 400 mg", generic: "Ibuprofen", category: "Analgesic", saleRate: "8.00", reorderLevel: 20 })
  mkBatch(brufen, { batchNo: "B-2001", expiryDate: "2026-12-15", quantityReceived: 40, quantityRemaining: 30 }) // expiring within 60 days
  const panadol = mkMed({ name: "Panadol syrup", generic: "Paracetamol", category: "Analgesic", unit: "bottle", saleRate: "150.00", reorderLevel: 5 })
  mkBatch(panadol, { batchNo: "B-3001", expiryDate: "2027-06-30", quantityReceived: 40, quantityRemaining: 40 })
  const old = mkMed({ name: "Old tonic", category: "Tonic", saleRate: "90.00", active: false })

  // ── a prescription on the open visit of patient 0 (E.e0): one catalogue medicine, one free text, one out of stock
  const rx = { encId: E.e0.id, lines: [
    { id: nid(), medicineText: "Paracetamol 500 mg", med: para, dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", instructions: null, prescribed: 9 },
    { id: nid(), medicineText: "Cough syrup", med: null, dose: "5 ml", route: null, frequency: "BD", duration: null, instructions: "After food", prescribed: null },
    { id: nid(), medicineText: "Amoxicillin 250 mg", med: amox, dose: "1 cap", route: null, frequency: "TDS", duration: "5 days", instructions: null, prescribed: 15 },
  ] }
  const dispensedOf = (lineId) => dispenses.flatMap((d) => d.lines).filter((l) => l.rxLineId === lineId).reduce((n, l) => n + l.dispensed - l.returned, 0)
  const rxDto = () => ({ encounter: { id: E.e0.id, encId: E.e0.encId }, patient: { id: E.e0.patient.id, mrNo: E.e0.patient.mrNo, name: E.e0.patient.name }, doctor: { id: F7.D1, name: "Dr Imran" },
    lines: rx.lines.map((l) => { const d = dispensedOf(l.id); return { id: l.id, medicineText: l.medicineText, medicine: l.med ? { id: l.med.id, name: l.med.name, active: l.med.active } : null, dose: l.dose, route: l.route, frequency: l.frequency, duration: l.duration, instructions: l.instructions, prescribed: l.prescribed, dispensed: d, remaining: l.prescribed === null ? null : Math.max(0, l.prescribed - d) } }) })

  // ── dispenses
  const dispenses = []
  let dn = 0
  const person = (p) => ({ id: p.id, name: p.name })
  const lineDto = (d, l) => ({ id: l.id, medicineId: l.med.id, name: l.med.name, prescriptionLineId: l.rxLineId, requested: l.requested, dispensed: l.dispensed, returned: l.returned, unitRate: l.med.saleRate, gstPct: "0", standingDiscountPct: "0", discountPct: "0", instructions: l.instructions,
    batches: l.batches, returns: l.returns.map((r) => ({ id: r.id, quantity: r.quantity, reason: r.reason, restocked: r.restocked, returnedAt: NOW, returnedBy: person(me) })),
    charge: l.charge ? { id: l.charge.id, invoiceId: d.invoice.id, total: fmt(l.charge.totalC), received: fmt(l.charge.receivedC), paid: l.charge.receivedC >= l.charge.totalC } : null, allowedActions: has("pharmacy.dispense") && l.dispensed - l.returned > 0 ? ["return"] : [] })
  const dispenseDto = (d) => ({ id: d.id, dispenseNo: d.no, patient: d.patient ? { id: d.patient.id, mrNo: d.patient.mrNo, name: d.patient.name } : null, counterCustomer: d.counterCustomer, encounter: d.encounterId ? { id: d.encounterId, encId: E.encounters.find((e) => e.id === d.encounterId).encId } : null,
    doctor: d.doctorId ? { id: d.doctorId, name: "Dr Imran" } : null, remarks: d.remarks, dispensedAt: NOW, dispensedBy: person(me), invoice: { id: d.invoice.id, invoiceNo: d.invoice.no }, lines: d.lines.map((l) => lineDto(d, l)) })
  const totalC = (d) => d.lines.reduce((n, l) => n + (l.charge ? l.charge.totalC : 0), 0)
  const receivedC = (d) => d.lines.reduce((n, l) => n + (l.charge ? l.charge.receivedC : 0), 0)
  const rowDto = (d) => ({ id: d.id, dispenseNo: d.no, patient: d.patient ? { id: d.patient.id, mrNo: d.patient.mrNo, name: d.patient.name } : null, counterCustomer: d.counterCustomer, encounter: d.encounterId ? { id: d.encounterId, encId: E.encounters.find((e) => e.id === d.encounterId).encId } : null,
    dispensedAt: NOW, dispensedBy: person(me), lines: d.lines.map((l) => ({ name: l.med.name, quantity: l.dispensed })), total: fmt(totalC(d)), received: fmt(receivedC(d)) })

  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, details) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...(details ? { details } : {}) })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const inRange = (iso, q) => { const d = iso.slice(0, 10); return (!q.get("dateFrom") || d >= q.get("dateFrom")) && (!q.get("dateTo") || d <= q.get("dateTo")) }
  const MINE = /^\/(medicines|medicine-batches|stock-movements|dispenses)(\/|$)|^\/encounters\/[0-9A-Z]{26}\/prescription$/

  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method(), q = url.searchParams
    if (!MINE.test(p)) return F8.handler(route)
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(q), body })
    if (m !== "GET" && S3.slow) await new Promise((r) => setTimeout(r, 700))
    if (m !== "GET" && S3.dropNext) { S3.dropNext = false; return route.abort("failed") }
    let mm
    if (m === "GET" && p === "/medicines") {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const s = (q.get("search") || "").toLowerCase(), within = Number(q.get("expiringWithinDays") || 60)
      const rows = medicines.filter((x) => (q.get("active") === null || String(x.active) === q.get("active")) && (!s || [x.name, x.generic || "", x.category || ""].some((t) => t.toLowerCase().includes(s))) && (!q.get("category") || x.category === q.get("category"))
        && (!q.get("level") || stockOf(x).level === q.get("level")) && (!q.get("expiry") || (q.get("expiry") === "expired" ? stockOf(x).expired > 0 : x.batches.some((b) => !expired(b) && b.quantityRemaining > 0 && b.expiryDate <= addDays(TODAY, within)))))
      const out = pageOf(rows.map(medDto), q); check("GET /medicines", out, "MedicinePageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "POST" && p === "/medicines") {
      check("POST /medicines request", body, "CreateMedicineDto")
      if (medicines.some((x) => x.name.toLowerCase() === body.name.trim().toLowerCase())) return err(route, 409, "MEDICINE_NAME_TAKEN", "A medicine with that name already exists.")
      const x = mkMed({ name: body.name, generic: body.generic ?? null, category: body.category ?? null, unit: body.unit ?? null, saleRate: fmt(toC(String(body.saleRate))), gstPct: String(body.gstPct ?? "0"), discountPct: String(body.discountPct ?? "0"), reorderLevel: body.reorderLevel ?? 0 })
      const out = detailDto(x); check("POST /medicines response", out, "MedicineDetailDto_Output", LENIENT); return json(route, 201, out)
    }
    if ((mm = p.match(/^\/medicines\/([0-9A-Z]{26})(?:\/(deactivate|reactivate|batches))?$/))) {
      const x = medicines.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "Medicine not found")
      if (m === "GET" && !mm[2]) { const out = detailDto(x); check("GET /medicines/{id}", out, "MedicineDetailDto_Output", LENIENT); return json(route, 200, out) }
      if (m === "PATCH" && !mm[2]) {
        check("PATCH /medicines request", body, "UpdateMedicineDto")
        if (body.name && medicines.some((y) => y.id !== x.id && y.name.toLowerCase() === body.name.toLowerCase())) return err(route, 409, "MEDICINE_NAME_TAKEN", "A medicine with that name already exists.")
        for (const k of ["name", "generic", "category", "unit", "reorderLevel"]) if (k in body) x[k] = body[k]
        for (const k of ["saleRate", "gstPct", "discountPct"]) if (k in body) x[k] = k === "saleRate" ? fmt(toC(String(body[k]))) : String(body[k])
        const out = detailDto(x); check("PATCH /medicines response", out, "MedicineDetailDto_Output", LENIENT); return json(route, 200, out)
      }
      if (m === "POST" && (mm[2] === "deactivate" || mm[2] === "reactivate")) { x.active = mm[2] === "reactivate"; const out = detailDto(x); check("activate response", out, "MedicineDetailDto_Output", LENIENT); return json(route, 200, out) }
      if (m === "POST" && mm[2] === "batches") {
        check("POST batches request", body, "ReceiveStockDto")
        if (!x.active) return err(route, 422, "MEDICINE_INACTIVE", "That medicine is deactivated.")
        if (body.expiryDate < TODAY) return err(route, 422, "BATCH_EXPIRED", "That batch has already expired.")
        const b = mkBatch(x, { batchNo: body.batchNo, expiryDate: body.expiryDate, receivedDate: body.receivedDate ?? TODAY, quantityReceived: body.quantity, quantityRemaining: body.quantity, purchaseRate: fmt(toC(String(body.purchaseRate))), supplier: body.supplier ?? null })
        move(x, b, "received", body.quantity, null)
        const out = { ...batchDto(b), supplier: b.supplier ? [b.supplier] : [], medicine: { id: x.id, name: x.name } }; check("POST batches response", out, "BatchResponseDto_Output", LENIENT); return json(route, 201, out)
      }
    }
    if (m === "POST" && (mm = p.match(/^\/medicine-batches\/([0-9A-Z]{26})\/(write-off|adjust)$/))) {
      const x = medicines.find((y) => y.batches.some((b) => b.id === mm[1])); const b = x && x.batches.find((z) => z.id === mm[1]); if (!b) return err(route, 404, "NOT_FOUND", "Batch not found")
      check("batch action request", body, mm[2] === "write-off" ? "WriteOffStockDto" : "AdjustStockDto")
      const delta = mm[2] === "write-off" ? -body.quantity : body.quantity
      if (b.quantityRemaining + delta < 0) return err(route, 422, "INSUFFICIENT_STOCK", "The batch holds fewer units than that.")
      b.quantityRemaining += delta; move(x, b, mm[2] === "write-off" ? "written_off" : "adjusted", delta, body.reason)
      const out = { ...batchDto(b), supplier: b.supplier ? [b.supplier] : [], medicine: { id: x.id, name: x.name } }; check("batch action response", out, "BatchResponseDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "GET" && p === "/stock-movements") {
      const rows = movements.filter((x) => (!q.get("medicineId") || x.medicine.id === q.get("medicineId")) && (!q.get("type") || x.type === q.get("type")) && inRange(x.occurredAt, q))
      const out = pageOf(rows, q); check("GET /stock-movements", out, "StockMovementPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "GET" && (mm = p.match(/^\/encounters\/([0-9A-Z]{26})\/prescription$/))) {
      if (mm[1] !== rx.encId) return err(route, 404, "NOT_FOUND", "That visit has no prescription.")
      const out = rxDto(); check("GET prescription", out, "PrescriptionDispensingDto_Output", LENIENT); return json(route, 200, out)
    }
    if (m === "POST" && p === "/dispenses") {
      check("POST /dispenses request", body, "CreateDispenseDto")
      const patient = body.patientId ? F7.patients.find((x) => x.id === body.patientId) : null
      if (body.patientId && !patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const meds = body.lines.map((l) => medicines.find((x) => x.id === l.medicineId))
      if (meds.some((x) => !x)) return err(route, 404, "NOT_FOUND", "A medicine does not exist here.")
      if (meds.some((x) => !x.active)) return err(route, 422, "MEDICINE_INACTIVE", "A medicine is deactivated.")
      for (const l of body.lines) if (l.prescriptionLineId) { const r = rx.lines.find((z) => z.id === l.prescriptionLineId); if (r && r.prescribed !== null && r.prescribed - dispensedOf(r.id) <= 0) return err(route, 422, "PRESCRIPTION_FULFILLED", "That prescription line is already fully dispensed.") }
      const empty = body.lines.map((l, i) => ({ l, med: meds[i] })).filter(({ med }) => live(med).reduce((n, b) => n + b.quantityRemaining, 0) === 0)
      if (empty.length) return err(route, 422, "OUT_OF_STOCK", "Nothing at all is in stock for a medicine on this dispense.", { lines: empty.map(({ med, l }) => ({ medicineId: med.id, name: med.name, requested: l.quantity })) })
      const patientInv = patient ? F8.mkInvoice({ patient, encounterId: body.encounterId ?? null }) : F8.mkInvoice({ patient: null, counterCustomer: body.counterCustomer })
      const d = { id: nid(), no: `DSP-2026-${String(++dn).padStart(4, "0")}`, patient, counterCustomer: body.counterCustomer ?? null, encounterId: body.encounterId ?? null, doctorId: body.doctorId ?? null, remarks: body.remarks ?? null, invoice: patientInv, lines: [] }
      dispenses.unshift(d)
      body.lines.forEach((l, i) => {
        const med = meds[i]; let left = l.quantity; const used = []
        for (const b of live(med).sort((a, c) => (a.expiryDate < c.expiryDate ? -1 : 1))) { if (left <= 0) break; const take = Math.min(left, b.quantityRemaining); b.quantityRemaining -= take; left -= take; used.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, quantity: take }); move(med, b, "dispensed", -take, null, d) }
        const dispensed = l.quantity - left
        const charge = F8.mkCharge(patientInv, { sourceType: "pharmacy", description: med.name, rateC: toC(med.saleRate), qty: String(dispensed), payer: patient ? "patient" : "counter", receivedC: patient ? 0 : toC(med.saleRate) * dispensed })
        patientInv.charges.push(charge)
        d.lines.push({ id: nid(), med, rxLineId: l.prescriptionLineId ?? null, requested: l.quantity, dispensed, returned: 0, instructions: l.instructions ?? null, batches: used, returns: [], charge: { id: charge.id, get totalC() { return charge.totalC }, get receivedC() { return charge.receivedC }, set receivedC(v) { charge.receivedC = v } }, chargeObj: charge })
      })
      const out = dispenseDto(d); check("POST /dispenses response", out, "DispenseResponseDto_Output", LENIENT)
      if (S3.garble) { S3.garble = false; return route.fulfill({ status: 201, contentType: "text/html", body: "<html>ok</html>" }) }
      return json(route, 201, out)
    }
    if (m === "GET" && p === "/dispenses") {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const s = (q.get("search") || "").toLowerCase()
      const rows = dispenses.filter((d) => (!q.get("counter") || (q.get("counter") === "true") === (d.patient === null)) && (!q.get("patientId") || (d.patient && d.patient.id === q.get("patientId"))) && inRange(NOW, q)
        && (!s || d.no.toLowerCase().includes(s) || (d.patient && (d.patient.name.toLowerCase().includes(s) || d.patient.mrNo.toLowerCase().includes(s))) || (d.counterCustomer || "").toLowerCase().includes(s)))
      const out = pageOf(rows.map(rowDto), q); check("GET /dispenses", out, "DispensePageDto_Output", LENIENT); return json(route, 200, out)
    }
    if ((mm = p.match(/^\/dispenses\/([0-9A-Z]{26})(?:\/(slip)|\/lines\/([0-9A-Z]{26})\/return)?$/))) {
      const d = dispenses.find((x) => x.id === mm[1]); if (!d) return err(route, 404, "NOT_FOUND", "Dispense not found")
      if (m === "GET" && !mm[2] && !mm[3]) { const out = dispenseDto(d); check("GET dispense", out, "DispenseResponseDto_Output", LENIENT); return json(route, 200, out) }
      if (m === "GET" && mm[2] === "slip") {
        const out = { hospital: { name: "City Hospital", address: "Lahore", phone: null, email: null, printHeader: null }, dispenseNo: d.no, dispensedAt: NOW, customer: d.patient ? d.patient.name : d.counterCustomer, mrNo: d.patient ? [d.patient.mrNo] : [], encounterNo: d.encounterId ? [E.encounters.find((e) => e.id === d.encounterId).encId] : [],
          doctor: d.doctorId ? ["Dr Imran"] : [], dispensedBy: me.name, lines: d.lines.map((l) => ({ name: l.med.name, quantity: l.dispensed, instructions: l.instructions, batches: l.batches.map((b) => ({ batchNo: b.batchNo, expiryDate: b.expiryDate })), total: fmt(l.chargeObj.totalC) })), total: fmt(totalC(d)), received: fmt(receivedC(d)), remarks: d.remarks ? [d.remarks] : [] }
        check("GET slip", out, "DispenseSlipDto_Output", LENIENT); return json(route, 200, out)
      }
      if (m === "POST" && mm[3]) {
        check("return request", body, "ReturnDispenseLineDto")
        const l = d.lines.find((x) => x.id === mm[3]); if (!l) return err(route, 404, "NOT_FOUND", "Line not found")
        if (body.quantity > l.dispensed - l.returned) return err(route, 422, "RETURN_EXCEEDS_DISPENSED", "More was returned than was dispensed.")
        l.returned += body.quantity; l.returns.push({ id: nid(), quantity: body.quantity, reason: body.reason, restocked: body.restock })
        if (body.restock) { const b = l.med.batches.find((z) => z.id === l.batches[0].batchId); b.quantityRemaining += body.quantity; move(l.med, b, "returned", body.quantity, body.reason, d) }
        // what is kept is re-charged: the charge now covers dispensed minus returned
        l.chargeObj.qty = String(l.dispensed - l.returned)
        if (d.patient === null) l.chargeObj.receivedC = l.chargeObj.totalC // a counter customer is refunded at once: nothing owed either way
        const out = dispenseDto(d); check("return response", out, "DispenseResponseDto_Output", LENIENT); return json(route, 200, out)
      }
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement " + m + " " + p)
  }
  return { F8, F7, S, S3, E, P, U, handler, requests, violations, medicines, dispenses, movements, para, paraB, amox, brufen, panadol, old, rx, stockOf, me }
}
