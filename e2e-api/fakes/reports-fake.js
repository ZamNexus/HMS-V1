// Phase 11 fake backend, TEST HARNESS ONLY. A stateful reports server (revenue, collections, outstanding and the patients who owe) over a small dated ledger, plus the lists the Lists report
// reads (lab tests, expense heads) and extra charges/receipts for the Financial Statistics registers, layered on the pharmacy fake (so on billing and encounters). The FAKE computes every report
// figure from its ledger for the asked period, as the real server will: the screens must only show what it sends. Every request and response is validated against docs/openapi.json.
module.exports = function createFake({ validate, schemaOf, stubs }) {
  const F10 = require("./pharmacy-fake.js")({ validate, schemaOf, stubs })
  const { F8, F7, S, E, P, U } = F10
  const NOW = "2026-11-07T10:00:00.000Z", TODAY = "2026-11-07"
  const LENIENT = { lenientStringArrays: true }
  const violations = F7.violations
  const check = (what, value, schemaName, opts, source) => { const e = validate(value, schemaOf(schemaName, source), { ...opts, ...(source ? { source } : {}) }); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const requests = []
  const S4 = { failReports: false, seq: 8000 }
  const nid = () => U(++S4.seq)
  const fmt = F8.fmt
  const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10)
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, details) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...(details ? { details } : {}) })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const has = (p) => S.perms.includes(p)

  const doc1 = { id: F7.D1, name: "Dr Imran" }, doc2 = { id: F7.doctors[1].id, name: "Dr Sara" }
  const panelRef = { id: F8.panel.id, name: F8.panel.name }
  const me = { id: F7.D1, name: "Test User" }, rec2 = { id: U(960), name: "Reception Two" }

  // ── the dated ledger the reports are computed from (cents)
  const day = (n) => addDays(TODAY, n)
  const sales = [
    { d: day(0), src: "consultation", doc: doc1, panel: null, rev: 150000, gst: 0, disc: 0, voided: 0 },
    { d: day(0), src: "diagnostic", doc: doc1, panel: null, rev: 60000, gst: 0, disc: 5000, voided: 0 },
    { d: day(0), src: "pharmacy", doc: doc2, panel: null, rev: 40000, gst: 6800, disc: 0, voided: 0 },
    { d: day(0), src: "service", doc: doc2, panel: panelRef, rev: 90000, gst: 0, disc: 0, voided: 0 },
    { d: day(0), src: "service", doc: doc2, panel: null, rev: 0, gst: 0, disc: 0, voided: 30000 },
    { d: day(-1), src: "consultation", doc: doc1, panel: null, rev: 150000, gst: 0, disc: 0, voided: 0 },
    { d: day(-4), src: "room", doc: doc2, panel: null, rev: 200000, gst: 0, disc: 10000, voided: 0 }, // 2026-11-03, in this week and this month
    { d: day(-6), src: "consultation", doc: doc1, panel: null, rev: 300000, gst: 0, disc: 0, voided: 0 }, // 2026-11-01, the first of the month
    { d: day(-23), src: "service", doc: doc1, panel: panelRef, rev: 500000, gst: 0, disc: 0, voided: 0 }, // 2026-10-15, last month
    { d: day(-37), src: "consultation", doc: doc2, panel: null, rev: 100000, gst: 0, disc: 0, voided: 0 }, // 2026-10-01, last month
  ]
  const creditNotes = [{ d: day(0), c: 5000 }, { d: day(-4), c: 20000 }]
  const takings = [
    { d: day(0), mode: "cash", user: me, c: 200000, ref: 0, n: 3 },
    { d: day(0), mode: "card", user: me, c: 50000, ref: 10000, n: 1 },
    { d: day(0), mode: "bank_transfer", user: rec2, c: 120000, ref: 0, n: 2 },
    { d: day(-1), mode: "cash", user: rec2, c: 150000, ref: 0, n: 1 },
    { d: day(-23), mode: "cheque", user: me, c: 500000, ref: 0, n: 1 },
  ]
  const inP = (d, q) => d >= q.from && d <= q.to
  const sum = (rows, f) => rows.reduce((n, r) => n + f(r), 0)
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); (m.get(k) || m.set(k, []).get(k)).push(r) } return [...m.values()] }

  const revenueOf = (q) => {
    const rows = sales.filter((s) => inP(s.d, q)), cn = sum(creditNotes.filter((x) => inP(x.d, q)), (x) => x.c)
    const gross = sum(rows, (s) => s.rev)
    return {
      period: { dateFrom: q.from, dateTo: q.to }, grossRevenue: fmt(gross), creditNotes: fmt(cn), netRevenue: fmt(gross - cn), gstCollected: fmt(sum(rows, (s) => s.gst)), discountsGiven: fmt(sum(rows, (s) => s.disc)), voided: fmt(sum(rows, (s) => s.voided)),
      bySource: group(rows.filter((s) => s.rev > 0), (s) => s.src).map((g) => ({ sourceType: g[0].src, charges: g.length, revenue: fmt(sum(g, (s) => s.rev)), gst: fmt(sum(g, (s) => s.gst)) })),
      byDoctor: group(rows.filter((s) => s.rev > 0), (s) => s.doc.id).map((g) => ({ doctor: g[0].doc, charges: g.length, revenue: fmt(sum(g, (s) => s.rev)), commission: fmt(Math.round(sum(g, (s) => s.rev) / 10)) })),
      byPanel: group(rows.filter((s) => s.rev > 0 && s.panel), (s) => s.panel.id).map((g) => ({ panel: g[0].panel, charges: g.length, revenue: fmt(sum(g, (s) => s.rev)), commission: "0.00" })),
    }
  }
  const collectionsOf = (q) => {
    const rows = takings.filter((t) => inP(t.d, q)), rc = sum(rows, (t) => t.c), rf = sum(rows, (t) => t.ref)
    return {
      period: { dateFrom: q.from, dateTo: q.to }, received: fmt(rc), refunded: fmt(rf), net: fmt(rc - rf),
      byMode: group(rows, (t) => t.mode).map((g) => ({ mode: g[0].mode, received: fmt(sum(g, (t) => t.c)), refunded: fmt(sum(g, (t) => t.ref)) })),
      byCollector: group(rows, (t) => t.user.id).map((g) => ({ user: g[0].user, receipts: sum(g, (t) => t.n), received: fmt(sum(g, (t) => t.c)), refunded: fmt(sum(g, (t) => t.ref)) })),
    }
  }
  const owedPatients = Array.from({ length: 13 }, (_, i) => ({ patient: { id: U(3000 + i), mrNo: `MR-2026-${String(900 + i).padStart(4, "0")}`, name: `Debtor ${String(i + 1).padStart(2, "0")}`, phone: i % 4 === 3 ? "" : `+92300555${String(1000 + i)}` }, outstandingC: (13 - i) * 150000, oldestUnpaid: addDays(TODAY, -(i * 9 + 3)) }))
  const outstanding = () => ({
    asOf: TODAY,
    patients: { total: fmt(sum(owedPatients, (p) => p.outstandingC)), aging: { days0to30: "650000.00", days31to60: "480000.00", days61to90: "300000.00", over90: "150000.00" } },
    panels: { total: "1200000.00", aging: { days0to30: "700000.00", days31to60: "500000.00", days61to90: "0.00", over90: "0.00" } },
    byPanel: [{ panel: panelRef, outstanding: "1200000.00" }],
  })

  // ── other lists the Lists report reads
  const labTests = [["CBC", "CBC", "Haematology", "EDTA whole blood", "600.00"], ["LFT", "Liver function", "Biochemistry", "Serum", "900.00"], ["UR", "Urine routine", "Urine Analysis", "Urine", "250.00"]]
    .map(([code, name, category, specimenType, rate], i) => ({ id: U(1000 + i), code, name, category, specimenType, rate, gstPct: "0", discountPct: "0", turnaroundHours: 4, narrative: false, parameters: [], active: true, createdAt: NOW }))
  const expenseHeads = [["Electricity", true], ["Salaries", true], ["Old rent", false]].map(([name, active], i) => ({ id: U(1500 + i), name, active, createdAt: NOW }))

  // ── extra charges and receipts for the Financial Statistics registers
  const invX = F8.mkInvoice({ issuedAt: NOW, patient: P(1), encounterId: E.e0.id })
  const kinds = [
    { sourceType: "diagnostic", description: "Lab: Lipid profile", rateC: 120000, dxType: "lab" },
    { sourceType: "diagnostic", description: "Imaging: Chest X-ray", rateC: 80000, dxType: "imaging", modality: "X-Ray" },
    { sourceType: "diagnostic", description: "Imaging: ECG", rateC: 50000, dxType: "imaging", modality: "ECG" },
    { sourceType: "diagnostic", description: "Imaging: Abdomen ultrasound", rateC: 200000, dxType: "imaging", modality: "Ultrasound" },
    { sourceType: "pharmacy", description: "Pharmacy: Paracetamol", rateC: 5000 },
  ]
  for (const k of kinds) invX.charges.push(F8.mkCharge(invX, { ...k, chargedAt: NOW }))
  const rcAdv = F8.mkReceipt({ type: "advance", mode: "cash", amountC: 100000, payer: { kind: "patient", id: P(1).id, mrNo: P(1).mrNo, name: P(1).name }, receivedAt: NOW })
  const rcPay = F8.mkReceipt({ type: "payment", mode: "card", amountC: 50000, payer: { kind: "patient", id: P(1).id, mrNo: P(1).mrNo, name: P(1).name }, receivedAt: NOW })

  const MINE = /^\/reports(\/|$)|^\/(lab-tests|expense-categories)$/
  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method(), q = url.searchParams
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(q), body })
    if (!MINE.test(p) || m !== "GET") return F10.handler(route)
    const perPage = Number(q.get("perPage") || 25)
    if (perPage > 100) return err(route, 400, "VALIDATION_FAILED", "perPage too large")
    if (p.startsWith("/reports")) {
      if (!has("reports.read")) return err(route, 403, "FORBIDDEN", "You do not have permission to read reports.")
      if (S4.failReports) return err(route, 500, "INTERNAL", "The report could not be produced.")
      if (p === "/reports/outstanding") { const out = outstanding(); check("GET /reports/outstanding", out, "OutstandingReportDto_Output"); return json(route, 200, out) }
      if (p === "/reports/outstanding/patients") {
        const rows = [...owedPatients].sort((a, b) => b.outstandingC - a.outstandingC).map((x) => ({ patient: x.patient, outstanding: fmt(x.outstandingC), oldestUnpaid: x.oldestUnpaid }))
        const out = pageOf(rows, q); check("GET /reports/outstanding/patients", out, "PatientBalancePageDto_Output", LENIENT); return json(route, 200, out)
      }
      if (p === "/reports/revenue" || p === "/reports/collections") {
        const from = q.get("dateFrom"), to = q.get("dateTo")
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return err(route, 400, "VALIDATION_FAILED", "dateFrom and dateTo are required.")
        if (from > to) return err(route, 400, "VALIDATION_FAILED", "dateFrom is after dateTo.")
        if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366) return err(route, 400, "VALIDATION_FAILED", "A report covers at most 366 days.")
        const out = p === "/reports/revenue" ? revenueOf({ from, to }) : collectionsOf({ from, to })
        check("GET " + p, out, p === "/reports/revenue" ? "RevenueReportDto_Output" : "CollectionsReportDto_Output"); return json(route, 200, out)
      }
      return err(route, 404, "NOT_FOUND", "No such report.")
    }
    if (p === "/lab-tests") { const s = (q.get("search") || "").toLowerCase(); const out = pageOf(labTests.filter((t) => !s || t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s)), q); check("GET /lab-tests", out, "LabTestPageDto_Output", LENIENT); return json(route, 200, out) }
    if (p === "/expense-categories") {
      const s = (q.get("search") || "").toLowerCase()
      const out = pageOf(expenseHeads.filter((e) => (q.get("active") === null || String(e.active) === q.get("active")) && (!s || e.name.toLowerCase().includes(s))), q); check("GET /expense-categories", out, "ExpenseCategoryPageDto_Output", LENIENT, "draft"); return json(route, 200, out)
    }
    return F10.handler(route)
  }
  return { F10, F8, F7, S, S4, E, P, U, handler, requests, violations, sales, creditNotes, takings, owedPatients, labTests, expenseHeads, revenueOf, collectionsOf, outstanding, invX, rcAdv, rcPay, day, TODAY, me, rec2, panelRef, fmt }
}
