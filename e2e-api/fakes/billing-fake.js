// Phase 8 fake backend, TEST HARNESS ONLY. A stateful billing server (invoices, charges, payments, receipts, accounts) layered on the Phase 7 fake (patients, visits,
// doctors, auth). The FAKE does the arithmetic, as the real server will: the screens must only show what it sends. Every request body and every response is
// validated against docs/openapi.json.
module.exports = function createFake({ validate, schemaOf, stubs }) {
  const F7 = require("./encounters-fake.js")({ validate, schemaOf, stubs })
  const { S, E, P, U } = F7
  const NOW = "2026-11-07T10:00:00.000Z"
  const LENIENT = { lenientStringArrays: true }
  const violations = F7.violations
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const requests = []
  const S2 = { slow: false, dropNext: false, garbleNext: false, ids: 800 }
  const nid = () => U(++S2.ids)
  const toC = (s) => Math.round(parseFloat(s) * 100)
  const fmt = (c) => (c / 100).toFixed(2)
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0)

  const svc = [
    { id: U(700), code: "XR1", name: "X-ray chest", category: "Radiology", rate: "800.00" },
    { id: U(701), code: "ECG", name: "ECG", category: "Cardiology", rate: "500.00" },
    { id: U(702), code: "DRS", name: "Dressing", category: "Procedures", rate: "400.00" },
  ]
  const panel = { id: U(710), name: "State Life", type: "insurance", contactPerson: "Mr Aslam", phone: "+923001234567", commissionPct: "0.00", discountPct: "0.00", billingMode: "panel_billed", active: true, createdAt: NOW }
  const panelOwedC = { v: 1200000 } // Rs. 12,000.00
  const creditOf = new Map() // patientId -> cents
  const doctorFor = (encId) => { const e = E.encounters.find((x) => x.id === encId); return e ? { id: e.doctorId, name: F7.doctors.find((d) => d.id === e.doctorId).name } : null }

  const mkCharge = (inv, o) => ({ id: nid(), invId: inv.id, sourceType: "service", description: "Service", rateC: 0, qty: "1", discC: 0, receivedC: 0, payer: "patient", panel: null, voided: false, voidedAt: null, voidedReason: null, chargedAt: NOW, serviceDate: "2026-11-07", ...o,
    get grossC() { return Math.round(this.rateC * parseFloat(this.qty)) }, get totalC() { return this.grossC - this.discC } })
  const invoices = []
  const mkInvoice = (o) => { const inv = { id: nid(), no: `INV-2026-${String(invoices.length + 1).padStart(4, "0")}`, issuedAt: NOW, patient: null, counterCustomer: null, encounterId: null, voided: false, voidedAt: null, voidedReason: null, charges: [], ...o }; invoices.push(inv); return inv }

  const e0 = E.e0, e2 = E.e2
  const invA = mkInvoice({ issuedAt: "2026-11-06T09:00:00.000Z", patient: P(5), encounterId: e2.id })
  invA.charges.push(mkCharge(invA, { sourceType: "consultation", description: "Consultation: Dr Imran", rateC: 150000, receivedC: 50000, chargedAt: "2026-11-06T09:00:00.000Z" }))
  invA.charges.push(mkCharge(invA, { sourceType: "diagnostic", description: "Lab: CBC", rateC: 60000, chargedAt: "2026-11-06T09:30:00.000Z" }))
  invA.charges.push(mkCharge(invA, { sourceType: "service", description: "ECG", rateC: 50000, chargedAt: "2026-11-06T09:40:00.000Z" }))
  const invB = mkInvoice({ issuedAt: "2026-11-07T09:00:00.000Z", patient: P(0), encounterId: e0.id })
  invB.charges.push(mkCharge(invB, { sourceType: "consultation", description: "Consultation: Dr Imran", rateC: 150000 }))
  const invC = mkInvoice({ issuedAt: "2026-11-07T08:00:00.000Z", patient: null, counterCustomer: "Walk-in Ali" })
  invC.charges.push(mkCharge(invC, { sourceType: "pharmacy", description: "Paracetamol 500 mg x 10", rateC: 30000, receivedC: 30000, payer: "counter" }))
  const invD = mkInvoice({ issuedAt: "2026-11-05T09:00:00.000Z", patient: P(1), voided: true, voidedAt: "2026-11-05T10:00:00.000Z", voidedReason: "Entered twice" })
  invD.charges.push(mkCharge(invD, { sourceType: "service", description: "Dressing", rateC: 40000, voided: true, voidedAt: "2026-11-05T10:00:00.000Z", voidedReason: "Entered twice" }))
  const invE = mkInvoice({ issuedAt: "2026-11-06T12:00:00.000Z", patient: P(1) })
  invE.charges.push(mkCharge(invE, { sourceType: "service", description: "Dressing", rateC: 40000 }))

  const live = (inv) => inv.charges.filter((c) => !c.voided)
  const outC = (c) => c.totalC - c.receivedC
  const totalsOf = (inv) => {
    const a = live(inv)
    const gross = sum(a, (c) => c.grossC), disc = sum(a, (c) => c.discC), total = sum(a, (c) => c.totalC), received = sum(a, (c) => c.receivedC)
    return { gross, disc, total, received, balance: total - received, patientBalance: sum(a.filter((c) => c.payer === "patient"), outC), panelBalance: sum(a.filter((c) => c.payer === "panel"), outC) }
  }
  const statusOf = (inv) => { if (inv.voided) return "voided"; const t = totalsOf(inv); return t.total > 0 && t.balance === 0 ? "paid" : t.received > 0 ? "partial" : "unpaid" }
  const visitRef = (inv, withStatus) => { if (!inv.encounterId) return null; const e = E.encounters.find((x) => x.id === inv.encounterId); return withStatus ? { id: e.id, encId: e.encId, type: e.type, status: e.status } : { id: e.id, encId: e.encId, type: e.type } }
  const patRef = (p) => (p ? { id: p.id, mrNo: p.mrNo, name: p.name } : null)
  const chargeDto = (c) => ({ id: c.id, sourceType: c.sourceType, description: c.description, rate: fmt(c.rateC), qty: c.qty, gross: fmt(c.grossC), discountAmount: fmt(c.discC), discountPct: "0", netAmount: fmt(c.grossC - c.discC), gstPct: "0", gstAmount: "0.00",
    totalAmount: fmt(c.totalC), received: fmt(c.receivedC), outstanding: fmt(outC(c)), payer: c.payer, panel: c.panel, chargedAt: c.chargedAt, serviceDate: c.serviceDate, voided: c.voided, voidedAt: c.voidedAt, voidedReason: c.voidedReason })
  const detailDto = (inv) => { const t = totalsOf(inv); return { id: inv.id, invoiceNo: inv.no, issuedAt: inv.issuedAt, status: statusOf(inv), patient: patRef(inv.patient), counterCustomer: inv.counterCustomer, encounter: visitRef(inv, true),
    totals: { gross: fmt(t.gross), discount: fmt(t.disc), net: fmt(t.gross - t.disc), gst: "0.00", total: fmt(t.total), received: fmt(t.received), balance: fmt(t.balance), patientBalance: fmt(t.patientBalance), panelBalance: fmt(t.panelBalance) },
    charges: inv.charges.map(chargeDto), voidedAt: inv.voidedAt, voidedReason: inv.voidedReason } }
  const summaryDto = (inv) => { const t = totalsOf(inv); return { id: inv.id, invoiceNo: inv.no, issuedAt: inv.issuedAt, status: statusOf(inv), patient: patRef(inv.patient), counterCustomer: inv.counterCustomer, encounter: visitRef(inv, false),
    total: fmt(t.total), discount: fmt(t.disc), received: fmt(t.received), balance: fmt(t.balance), sourceTypes: [...new Set(inv.charges.map((c) => c.sourceType))] } }
  const patientOutC = (pid) => sum(invoices.filter((i) => i.patient && i.patient.id === pid && !i.voided), (i) => totalsOf(i).patientBalance)
  const accountOf = (pid) => ({ outstanding: fmt(patientOutC(pid)), credit: fmt(creditOf.get(pid) ?? 0) })

  const receipts = []
  let rn = 30
  const hospital = { name: "City Hospital", nameUr: null, address: "Lahore", phone: null, printHeader: null, currencyCode: "PKR" }
  const mkReceipt = (o) => { const r = { id: nid(), receiptNo: `RCT-2026-${String(++rn).padStart(4, "0")}`, type: "payment", mode: "cash", amountC: 0, receivedAt: NOW, payer: null, invoice: null, reference: null, notes: null, settled: [], keptC: 0, account: { outstanding: "0.00", credit: "0.00" }, ...o }; receipts.push(r); return r }
  const rowDto = (r) => ({ id: r.id, receiptNo: r.receiptNo, type: r.type, mode: r.mode, amount: fmt(r.amountC), receivedAt: r.receivedAt, payer: r.payer, invoice: r.invoice, receivedBy: { id: F7.D1, name: "Test User" }, reference: r.reference, notes: r.notes })
  const receiptDto = (r) => ({ ...rowDto(r), hospital, settled: r.settled.map((s) => ({ chargeId: s.chargeId, invoiceNo: s.invoiceNo, description: s.description, amount: fmt(s.amountC) })), keptAsCredit: fmt(r.keptC), account: r.account })
  const patientPayer = (p) => ({ kind: "patient", id: p.id, mrNo: p.mrNo, name: p.name })
  // pay the patient's share of an invoice's charges in order; returns what was settled
  const settle = (inv, cents) => { const settled = []; let left = cents; for (const c of live(inv).filter((x) => x.payer === "patient")) { const take = Math.min(left, outC(c)); if (take > 0) { c.receivedC += take; left -= take; settled.push({ chargeId: c.id, invoiceNo: inv.no, description: c.description, amountC: take }) } } return { settled, left } }

  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, details) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...(details ? { details } : {}) })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const inRange = (iso, q) => { const d = iso.slice(0, 10); return (!q.get("dateFrom") || d >= q.get("dateFrom")) && (!q.get("dateTo") || d <= q.get("dateTo")) }
  // a write is answered after the work is done; failures can be injected to prove the screen never re-sends
  const answer = async (route, status, body, schema, what, opts) => {
    check(what, body, schema, opts)
    if (S2.garbleNext) { S2.garbleNext = false; return route.fulfill({ status, contentType: "text/html", body: "<html>ok</html>" }) }
    return json(route, status, body)
  }

  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method(), q = url.searchParams
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(q), body })
    const isWrite = m !== "GET"
    const billing = /^\/(invoices|charges|payments|advances|refunds|credit-notes)(\/|$)/.test(p) || /^\/patients\/[0-9A-Z]{26}\/(account|apply-credit)$/.test(p) || /^\/panels\/[0-9A-Z]{26}\/account$/.test(p) || /^\/encounters\/[0-9A-Z]{26}\/invoice$/.test(p) || p === "/services" || p === "/panels"
    if (!billing) return F7.handler(route)
    if (isWrite && S2.slow) await new Promise((r) => setTimeout(r, 700))
    if (isWrite && S2.dropNext) { S2.dropNext = false; return route.abort("failed") }
    let mm
    if (m === "GET" && p === "/panels") { const out = pageOf([panel], q); check("GET /panels", out, "PanelPageDto_Output", LENIENT); return json(route, 200, out) }
    if (m === "GET" && p === "/services") { const s = (q.get("search") || "").toLowerCase(); const out = pageOf(svc.filter((x) => !s || x.name.toLowerCase().includes(s)).map((x) => ({ ...x, gstPct: "0", discountPct: "0", active: true, createdAt: NOW })), q); check("GET /services", out, "ServicePageDto_Output", LENIENT); return json(route, 200, out) }
    if ((mm = p.match(/^\/panels\/([0-9A-Z]{26})\/account$/)) && m === "GET") { const out = { outstanding: fmt(panelOwedC.v), credit: "0.00" }; check("GET panel account", out, "AccountDto_Output"); return json(route, 200, out) }
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})\/account$/)) && m === "GET") { const out = accountOf(mm[1]); check("GET patient account", out, "AccountDto_Output"); return json(route, 200, out) }
    if ((mm = p.match(/^\/encounters\/([0-9A-Z]{26})\/invoice$/)) && m === "GET") {
      const inv = invoices.find((i) => i.encounterId === mm[1]); if (!inv) return err(route, 422, "NOTHING_BILLED", "Nothing has been billed on this visit yet.")
      const out = detailDto(inv); check("GET visit invoice", out, "InvoiceDetailDto_Output", LENIENT); return json(route, 200, out)
    }
    if (p === "/invoices" && m === "GET") {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const s = (q.get("search") || "").toLowerCase()
      const rows = invoices.filter((i) => (!q.get("sourceType") || i.charges.some((c) => c.sourceType === q.get("sourceType"))) && (!q.get("status") || statusOf(i) === q.get("status")) && (!q.get("patientId") || (i.patient && i.patient.id === q.get("patientId")))
        && (!q.get("encounterId") || i.encounterId === q.get("encounterId")) && (!q.get("encounterType") || (!!i.encounterId && E.encounters.find((x) => x.id === i.encounterId).type === q.get("encounterType"))) && inRange(i.issuedAt, q) && (!s || i.no.toLowerCase().includes(s) || (i.patient && (i.patient.name.toLowerCase().includes(s) || i.patient.mrNo.toLowerCase().includes(s))) || (i.counterCustomer || "").toLowerCase().includes(s)))
        .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
      const out = pageOf(rows.map(summaryDto), q); check("GET /invoices", out, "InvoicePageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (p === "/invoices" && m === "POST") {
      check("POST /invoices request", body, "CreateInvoiceDto")
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const inv = mkInvoice({ patient, encounterId: body.encounterId ?? null })
      for (const l of body.charges) { const s = svc.find((x) => x.id === l.serviceId); if (!s) { invoices.pop(); return err(route, 404, "NOT_FOUND", "A service does not exist here.") } inv.charges.push(mkCharge(inv, { sourceType: "service", description: s.name, rateC: l.rate ? toC(l.rate) : toC(s.rate), qty: String(l.qty ?? "1") })) }
      return answer(route, 201, detailDto(inv), "InvoiceDetailDto_Output", "POST /invoices response", LENIENT)
    }
    if ((mm = p.match(/^\/invoices\/([0-9A-Z]{26})$/)) && m === "GET") {
      const inv = invoices.find((i) => i.id === mm[1]); if (!inv) return err(route, 404, "NOT_FOUND", "Invoice not found")
      const out = detailDto(inv); check("GET /invoices/{id}", out, "InvoiceDetailDto_Output", LENIENT); return json(route, 200, out)
    }
    if ((mm = p.match(/^\/invoices\/([0-9A-Z]{26})\/(charges|discount|void)$/)) && m === "POST") {
      const inv = invoices.find((i) => i.id === mm[1]); if (!inv) return err(route, 404, "NOT_FOUND", "Invoice not found")
      if (inv.voided) return err(route, 422, "INVOICE_VOIDED", "This invoice is voided.")
      if (inv.patient === null) return err(route, 422, "COUNTER_SALE", "A counter sale has no billing actions.")
      if (mm[2] === "charges") {
        check("POST charges request", body, "AddChargesDto")
        for (const l of body.charges) { const s = svc.find((x) => x.id === l.serviceId); if (!s) return err(route, 404, "NOT_FOUND", "A service does not exist here."); inv.charges.push(mkCharge(inv, { sourceType: "service", description: s.name, rateC: l.rate ? toC(l.rate) : toC(s.rate), qty: String(l.qty ?? "1") })) }
        return answer(route, 201, detailDto(inv), "InvoiceDetailDto_Output", "POST charges response", LENIENT)
      }
      if (mm[2] === "discount") {
        check("POST discount request", body, "InvoiceDiscountDto")
        const a = live(inv), gross = sum(a, (c) => c.grossC)
        const wantC = body.discount.type === "percent" ? Math.round(gross * parseFloat(body.discount.value) / 100) : toC(body.discount.value)
        if (wantC > gross) return err(route, 422, "DISCOUNT_TOO_LARGE", "The discount is larger than the bill.")
        let left = wantC; for (const c of a) { const take = Math.min(left, c.grossC); c.discC = take; left -= take }
        return answer(route, 200, detailDto(inv), "InvoiceDetailDto_Output", "POST discount response", LENIENT)
      }
      check("POST void request", body, "VoidDto")
      const e = inv.encounterId ? E.encounters.find((x) => x.id === inv.encounterId) : null
      if (e && e.status === "open") return err(route, 422, "ENCOUNTER_OPEN", "The visit is still under way.")
      inv.voided = true; inv.voidedAt = NOW; inv.voidedReason = body.reason; inv.charges.forEach((c) => { c.voided = true; c.voidedAt = NOW; c.voidedReason = body.reason })
      return answer(route, 200, detailDto(inv), "InvoiceDetailDto_Output", "POST void response", LENIENT)
    }
    if ((mm = p.match(/^\/charges\/([0-9A-Z]{26})\/void$/)) && m === "POST") {
      check("POST charge void request", body, "VoidDto")
      const inv = invoices.find((i) => i.charges.some((c) => c.id === mm[1])); if (!inv) return err(route, 404, "NOT_FOUND", "Charge not found")
      const c = inv.charges.find((x) => x.id === mm[1])
      if (c.voided) return err(route, 422, "CHARGE_VOIDED", "This charge is already voided.")
      if (c.sourceType === "diagnostic") return err(route, 422, "CHARGE_FROM_LAB_ORDER", "Cancel the test instead.")
      if (c.receivedC > 0) return err(route, 422, "CHARGE_PAID", "Money has been received on this charge.")
      c.voided = true; c.voidedAt = NOW; c.voidedReason = body.reason
      return answer(route, 200, detailDto(inv), "InvoiceDetailDto_Output", "POST charge void response", LENIENT)
    }
    if (p === "/charges" && m === "GET") {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const rows = invoices.flatMap((i) => i.charges.map((c) => ({ i, c }))).filter(({ i, c }) => (q.get("includeVoided") === "true" || !c.voided) && (!q.get("sourceType") || c.sourceType === q.get("sourceType")) && (!q.get("payer") || c.payer === q.get("payer")) && (!q.get("diagnosticType") || c.dxType === q.get("diagnosticType")) && (!q.get("modality") || c.modality === q.get("modality"))
        && (!q.get("patientId") || (i.patient && i.patient.id === q.get("patientId"))) && (!q.get("doctorId") || (doctorFor(i.encounterId) || {}).id === q.get("doctorId")) && inRange(c.chargedAt, q)).sort((a, b) => (a.c.chargedAt < b.c.chargedAt ? 1 : -1))
      const out = pageOf(rows.map(({ i, c }) => ({ id: c.id, chargedAt: c.chargedAt, serviceDate: c.serviceDate, sourceType: c.sourceType, description: c.description, patient: patRef(i.patient), counterCustomer: i.counterCustomer, invoice: { id: i.id, invoiceNo: i.no },
        doctor: doctorFor(i.encounterId), panel: c.panel, payer: c.payer, totalAmount: fmt(c.totalC), received: fmt(c.receivedC), outstanding: fmt(outC(c)), voided: c.voided })), q)
      check("GET /charges", out, "ChargeRegisterPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if (p === "/payments" && m === "GET") {
      if (Number(q.get("perPage") || 25) > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
      const rows = receipts.filter((r) => (!q.get("type") || r.type === q.get("type")) && (!q.get("mode") || r.mode === q.get("mode")) && inRange(r.receivedAt, q)).sort((a, b) => (a.receiptNo < b.receiptNo ? 1 : -1))
      const out = pageOf(rows.map(rowDto), q); check("GET /payments", out, "PaymentPageDto_Output", LENIENT); return json(route, 200, out)
    }
    if ((mm = p.match(/^\/payments\/([0-9A-Z]{26})$/)) && m === "GET") { const r = receipts.find((x) => x.id === mm[1]); if (!r) return err(route, 404, "NOT_FOUND", "Receipt not found"); const out = receiptDto(r); check("GET receipt", out, "ReceiptDto_Output", LENIENT); return json(route, 200, out) }
    if (p === "/payments" && m === "POST") {
      check("POST /payments request", body, "RecordPaymentDto")
      if (!!body.patientId === !!body.panelId) return err(route, 400, "VALIDATION_FAILED", "Choose a patient or a panel.")
      if (body.panelId) {
        const amt = toC(body.amount); if (amt > panelOwedC.v && !body.excessAsAdvance) return err(route, 422, "OVERPAYMENT", "That is more than the panel owes.", { owed: fmt(panelOwedC.v) })
        const take = Math.min(amt, panelOwedC.v); panelOwedC.v -= take
        const r = mkReceipt({ type: "payment", mode: body.mode, amountC: amt, payer: { kind: "panel", id: panel.id, name: panel.name }, reference: body.reference ?? null, notes: body.notes ?? null, account: { outstanding: fmt(panelOwedC.v), credit: "0.00" }, keptC: amt - take })
        return answer(route, 201, receiptDto(r), "ReceiptDto_Output", "POST panel payment response", LENIENT)
      }
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const amt = toC(body.amount)
      const inv = body.invoiceId ? invoices.find((i) => i.id === body.invoiceId) : null
      if (body.invoiceId && !inv) return err(route, 404, "NOT_FOUND", "Invoice not found")
      if (inv && inv.voided) return err(route, 422, "INVOICE_VOIDED", "This invoice is voided.")
      const owed = inv ? totalsOf(inv).patientBalance : patientOutC(patient.id)
      if (amt > owed && !body.excessAsAdvance) return err(route, 422, "OVERPAYMENT", "That is more than is owed.", { owed: fmt(owed) })
      let settled = [], left = amt
      if (inv) ({ settled, left } = settle(inv, amt))
      else for (const i of invoices.filter((x) => x.patient && x.patient.id === patient.id && !x.voided)) { const r2 = settle(i, left); settled.push(...r2.settled); left = r2.left }
      if (left > 0) creditOf.set(patient.id, (creditOf.get(patient.id) ?? 0) + left)
      const r = mkReceipt({ type: "payment", mode: body.mode, amountC: amt, payer: patientPayer(patient), invoice: inv ? { id: inv.id, invoiceNo: inv.no } : null, reference: body.reference ?? null, notes: body.notes ?? null, settled, keptC: left, account: accountOf(patient.id) })
      return answer(route, 201, receiptDto(r), "ReceiptDto_Output", "POST /payments response", LENIENT)
    }
    if (p === "/advances" && m === "POST") {
      check("POST /advances request", body, "RecordAdvanceDto")
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const amt = toC(body.amount); creditOf.set(patient.id, (creditOf.get(patient.id) ?? 0) + amt)
      const r = mkReceipt({ type: "advance", mode: body.mode, amountC: amt, payer: patientPayer(patient), keptC: amt, reference: body.reference ?? null, notes: body.notes ?? null, account: accountOf(patient.id) })
      return answer(route, 201, receiptDto(r), "ReceiptDto_Output", "POST /advances response", LENIENT)
    }
    if ((mm = p.match(/^\/patients\/([0-9A-Z]{26})\/apply-credit$/)) && m === "POST") {
      check("POST apply-credit request", body, "ApplyCreditDto")
      const pid = mm[1], credit = creditOf.get(pid) ?? 0
      if (credit === 0) return err(route, 422, "INSUFFICIENT_CREDIT", "There is no credit to apply.")
      const targets = body.invoiceId ? invoices.filter((i) => i.id === body.invoiceId) : invoices.filter((i) => i.patient && i.patient.id === pid && !i.voided)
      const owed = sum(targets, (i) => totalsOf(i).patientBalance); if (owed === 0) return err(route, 422, "NOTHING_TO_APPLY", "There is nothing to apply the credit to.")
      let want = Math.min(credit, owed, body.amount ? toC(body.amount) : credit), applied = 0
      for (const i of targets) { const r2 = settle(i, want); const used = want - r2.left; applied += used; want = r2.left }
      creditOf.set(pid, credit - applied)
      return answer(route, 200, { applied: fmt(applied), account: accountOf(pid) }, "AppliedCreditDto_Output", "POST apply-credit response")
    }
    if (p === "/refunds" && m === "POST") {
      check("POST /refunds request", body, "RecordRefundDto")
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const amt = toC(body.amount), credit = creditOf.get(patient.id) ?? 0
      if (amt > credit) return err(route, 422, "INSUFFICIENT_CREDIT", "Only unused credit can be refunded.")
      creditOf.set(patient.id, credit - amt)
      const r = mkReceipt({ type: "refund", mode: body.mode, amountC: amt, payer: patientPayer(patient), reference: body.reference ?? null, notes: body.reason, account: accountOf(patient.id) })
      return answer(route, 201, receiptDto(r), "ReceiptDto_Output", "POST /refunds response", LENIENT)
    }
    if (p === "/credit-notes" && m === "POST") {
      check("POST /credit-notes request", body, "RecordCreditNoteDto")
      const patient = F7.patients.find((x) => x.id === body.patientId); if (!patient) return err(route, 404, "NOT_FOUND", "The patient does not exist here.")
      const inv = body.invoiceId ? invoices.find((i) => i.id === body.invoiceId) : null
      const owed = inv ? totalsOf(inv).patientBalance : patientOutC(patient.id), amt = toC(body.amount)
      if (amt > owed) return err(route, 422, "CREDIT_NOTE_EXCEEDS_OWED", "The credit note is larger than what is owed.", { owed: fmt(owed) })
      let left = amt; for (const c of (inv ? live(inv) : invoices.filter((i) => i.patient && i.patient.id === patient.id && !i.voided).flatMap(live)).filter((x) => x.payer === "patient")) { const take = Math.min(left, outC(c)); c.discC += take; left -= take }
      const r = mkReceipt({ type: "credit_note", mode: null, amountC: amt, payer: patientPayer(patient), invoice: inv ? { id: inv.id, invoiceNo: inv.no } : null, notes: body.reason, account: accountOf(patient.id) })
      return answer(route, 201, receiptDto(r), "ReceiptDto_Output", "POST /credit-notes response", LENIENT)
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement " + m + " " + p)
  }
  return { F7, S, S2, E, P, U, handler, requests, violations, invoices: { invA, invB, invC, invD, invE }, panel, svc, creditOf, receipts, panelOwedC, fmt, toC, accountOf, patientOutC, mkInvoice, mkCharge, allInvoices: invoices, mkReceipt }
}
