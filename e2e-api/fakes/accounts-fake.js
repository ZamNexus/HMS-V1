// Phase 13 fake backend, TEST HARNESS ONLY. Stateful expenses, bank accounts and entries, statements, the cash drawer's opening, the dashboard, the remaining reports and the prescription list,
// layered on the reports fake (so on pharmacy, billing and encounters). What the FAKE enforces is the handoff's own text: the request bodies and query parameters of 8.10 / 8.11, the
// permissions and the error codes (409 OPENING_BALANCE_EXISTS / EXPENSE_CHANGED; 422 DATE_IN_FUTURE, CATEGORY_INACTIVE, BANK_ACCOUNT_INACTIVE, BEFORE_OPENING_BALANCE,
// BEFORE_CASH_OPENING, VOID_THROUGH_EXPENSE). What it ANSWERS with is MY ASSUMPTION: the handoff does not list the fields of these answers, so the shapes below are one plausible
// choice, not the contract. The screens read them defensively and show report bodies as received; no check here may be read as evidence about the real backend.
module.exports = function createFake({ validate, schemaOf, stubs }) {
  const F11 = require("./reports-fake.js")({ validate, schemaOf, stubs })
  const { F10, F8, F7, S, S4, U, TODAY, fmt, day, expenseHeads } = F11
  const NOW = "2026-11-07T10:00:00.000Z"
  const requests = F11.requests
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, details) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...(details ? { details } : {}) })
  const has = (p) => S.perms.includes(p)
  const A = { seq: 12000, failAccounts: false, failDashboard: false, dashNull: [], dashRevenueC: 1250000, drawer: null, bumpExpense: null, dashHits: 0, tick: 0 }
  const nid = () => U(++A.seq)
  const DATE = /^\d{4}-\d{2}-\d{2}$/
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
  const MODES = ["cash", "bank_transfer", "cheque", "card"]
  const KINDS = ["opening_balance", "deposit", "withdrawal", "other_credit", "other_debit"]
  const CREDIT = new Set(["opening_balance", "deposit", "other_credit"])
  const cents = (s) => { const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(s)); return m ? Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2)) : NaN }

  // ── reference data
  const banks = [
    { id: U(1600), bankName: "HBL", accountTitle: "Clinic Operating", accountNo: "0011-2233", branch: "Main", active: true, createdAt: NOW },
    { id: U(1601), bankName: "Meezan", accountTitle: "Clinic Savings", accountNo: "9988-7766", branch: null, active: true, createdAt: NOW },
    { id: U(1602), bankName: "Old Bank", accountTitle: "Closed account", accountNo: "0000-1111", branch: null, active: false, createdAt: NOW },
  ]
  const bankRef = (b) => (b ? { id: b.id, name: `${b.bankName} ${b.accountNo}` } : null)
  const catOf = (id) => expenseHeads.find((c) => c.id === id)

  // ── bank entries (the ledger); kind "expense" is posted by the server for a bank-paid expense
  const txs = []
  const mkTx = (o) => { const t = { id: nid(), bankAccountId: o.bankAccountId, date: o.date, kind: o.kind, amountC: o.amountC, description: o.description, referenceNo: o.referenceNo ?? null, voided: false, expenseId: o.expenseId ?? null, createdAt: NOW }; txs.push(t); return t }
  const txOut = (t) => ({ id: t.id, bankAccountId: t.bankAccountId, date: t.date, kind: t.kind, amount: fmt(t.amountC), description: t.description, referenceNo: t.referenceNo, voided: t.voided, createdAt: t.createdAt })
  mkTx({ bankAccountId: banks[0].id, date: day(-30), kind: "opening_balance", amountC: 10000000, description: "Opening balance" })
  mkTx({ bankAccountId: banks[0].id, date: day(-10), kind: "deposit", amountC: 2500000, description: "Cash banked", referenceNo: "DEP-1" })
  mkTx({ bankAccountId: banks[1].id, date: day(-20), kind: "opening_balance", amountC: 5000000, description: "Opening balance" })

  // ── expenses
  const expenses = []
  const mkExpense = (o) => {
    const e = { id: nid(), date: o.date, categoryId: o.categoryId, description: o.description, amountC: o.amountC, mode: o.mode, bankAccountId: o.bankAccountId ?? null, referenceNo: o.referenceNo ?? null, voided: false, voidReason: null, updatedAt: NOW, createdAt: new Date(Date.parse(NOW) + (++A.tick) * 1000).toISOString(), version: 1 }
    expenses.push(e)
    if (e.mode !== "cash") e.txId = mkTx({ bankAccountId: e.bankAccountId, date: e.date, kind: "expense", amountC: e.amountC, description: e.description, referenceNo: e.referenceNo, expenseId: e.id }).id
    return e
  }
  const expenseOut = (e) => ({
    id: e.id, date: e.date, description: e.description, amount: fmt(e.amountC), mode: e.mode, category: { id: e.categoryId, name: catOf(e.categoryId)?.name ?? "?" }, bankAccount: bankRef(banks.find((b) => b.id === e.bankAccountId)),
    referenceNo: e.referenceNo, voided: e.voided, voidReason: e.voidReason, createdAt: e.createdAt, updatedAt: e.updatedAt,
  })
  const [CAT_ELEC, CAT_SAL, CAT_OLD] = expenseHeads.map((c) => c.id)
  for (let i = 0; i < 12; i++) mkExpense({ date: day(-i), categoryId: i % 3 === 0 ? CAT_SAL : CAT_ELEC, description: `Expense ${String(i + 1).padStart(2, "0")}`, amountC: 100000 + i * 10000, mode: "cash", referenceNo: i === 0 ? "RCPT-0" : null })
  mkExpense({ date: day(-2), categoryId: CAT_ELEC, description: "Generator fuel (bank)", amountC: 450000, mode: "bank_transfer", bankAccountId: banks[0].id, referenceNo: "TRX-77" })
  mkExpense({ date: day(-3), categoryId: CAT_SAL, description: "Cheque to supplier", amountC: 300000, mode: "cheque", bankAccountId: banks[1].id, referenceNo: "CHQ-12" })
  const voidedSeed = mkExpense({ date: day(-4), categoryId: CAT_ELEC, description: "Entered twice", amountC: 77700, mode: "cash" })
  voidedSeed.voided = true; voidedSeed.voidReason = "duplicate"
  const live = () => expenses.filter((e) => !e.voided)

  // ── answers whose fields are my assumption
  const inRange = (d, q) => (!q.get("dateFrom") || d >= q.get("dateFrom")) && (!q.get("dateTo") || d <= q.get("dateTo"))
  const statementOf = (b, from, to) => {
    const mine = txs.filter((t) => t.bankAccountId === b.id && !t.voided).sort((a, c) => a.date.localeCompare(c.date) || a.createdAt.localeCompare(c.createdAt))
    const signed = (t) => (CREDIT.has(t.kind) ? t.amountC : -t.amountC)
    const opening = mine.filter((t) => t.date < from).reduce((n, t) => n + signed(t), 0)
    let run = opening
    const entries = mine.filter((t) => t.date >= from && t.date <= to).map((t) => { run += signed(t); return { id: t.id, date: t.date, kind: t.kind, description: t.description, referenceNo: t.referenceNo, amount: fmt(t.amountC), runningBalance: fmt(run), voided: false } })
    return { opening: fmt(opening), entries, closing: fmt(run) }
  }
  const balanceOf = (b) => txs.filter((t) => t.bankAccountId === b.id && !t.voided).reduce((n, t) => n + (CREDIT.has(t.kind) ? t.amountC : -t.amountC), 0)
  const dashboard = () => {
    const d = {
      visits: { today: 14, yesterday: 11, mine: { today: 3, open: 1 } }, admitted: { total: 5, male: 2, female: 3, other: 0 }, lab: { pending: 4, doneToday: 9 }, imaging: { pending: 1, doneToday: 2 },
      pharmacy: { dispensedToday: 20, dispensedYesterday: 18, lowStock: { count: 6, outOfStock: 0, first: [] } },
      revenue: { today: fmt(A.dashRevenueC), yesterday: "980000.00", last7Days: Array.from({ length: 7 }, (_, i) => ({ date: day(i - 6), revenue: fmt(100000 * (i + 1)) })) },
      patientFlow: { last7Days: [3, 5, 4, 6, 2, 7, 8].map((n, i) => ({ date: day(i - 6), patients: n })), total: 35 },
    }
    for (const k of A.dashNull) d[k] = null
    return d
  }
  const rxRows = Array.from({ length: 23 }, (_, i) => ({ id: nid(), date: day(-(i % 9)), patient: { id: F11.P(1).id, mrNo: F11.P(1).mrNo, name: F11.P(1).name }, doctor: i % 2 ? { id: F7.D1, name: "Dr Imran" } : { id: F7.doctors[1].id, name: "Dr Sara" }, medicineText: i % 3 ? "Amoxicillin 500 mg" : "Paracetamol 500 mg", dose: "1 tab", frequency: "BD", duration: `${3 + (i % 4)} days` }))
  const reportBody = (name, q) => {
    const period = { dateFrom: q.get("dateFrom"), dateTo: q.get("dateTo") }
    switch (name) {
      case "daily-summary": return { period, patientsRegistered: 12, visits: 40, revenue: "12500.00", byDay: [{ date: period.dateFrom, visits: 9, revenue: "2500.00" }, { date: period.dateTo, visits: 31, revenue: "10000.00" }] }
      case "opd": return { period, totalVisits: 40, byDoctor: [{ doctor: { id: F7.D1, name: "Dr Imran" }, visits: 25 }, { doctor: { id: F7.doctors[1].id, name: "Dr Sara" }, visits: 15 }] }
      case "demographics": return { period, byGender: [{ gender: "male", patients: 7 }, { gender: "female", patients: 5 }], byAgeGroup: [{ group: "0-12", patients: 2 }, { group: "13-40", patients: 6 }, { group: "41+", patients: 4 }] }
      case "lab": return { period, orders: 18, completed: 15, byTest: [{ test: "CBC", orders: 9 }, { test: "LFT", orders: 6 }], revenue: "15600.00" }
      case "pharmacy": return { period, dispensed: 52, expiringWithinDays: q.get("expiringWithinDays") ? Number(q.get("expiringWithinDays")) : 30, expiring: [{ medicine: "Amoxicillin 500 mg", batch: "B-17", expiresOn: "2026-12-01", quantity: 40 }], lowStock: [{ medicine: "Paracetamol 500 mg", onHand: 12, reorderLevel: 50 }] }
      case "financial-summary": return { period, revenue: "12500.00", ...(has("accounts.read") ? { expenses: { total: fmt(live().filter((e) => inRange(e.date, q)).reduce((n, e) => n + e.amountC, 0)) }, bank: { total: fmt(banks.reduce((n, b) => n + balanceOf(b), 0)) }, cashFlow: { net: "800.00" } } : { expenses: null, bank: null, cashFlow: null }) }
      case "revenue/daily": return { period, ...(q.get("sourceType") ? { sourceType: q.get("sourceType") } : {}), days: Array.from({ length: 5 }, (_, i) => ({ date: day(i - 4), revenue: fmt((i + 1) * 150000 + (q.get("sourceType") ? 0 : 50000)) })) }
      case "cash-flow": return q.get("date") ? { date: q.get("date"), opening: "1000.00", cashIn: "5200.00", cashOut: "1300.00", closing: "4900.00" } : { period, opening: "1000.00", cashIn: "52000.00", cashOut: "13000.00", closing: "40000.00", byDay: [{ date: period.dateFrom, cashIn: "26000.00", cashOut: "6500.00" }] }
      case "expenses": return { period, total: fmt(live().filter((e) => inRange(e.date, q)).reduce((n, e) => n + e.amountC, 0)), byCategory: expenseHeads.slice(0, 2).map((c) => ({ category: { id: c.id, name: c.name }, total: fmt(live().filter((e) => e.categoryId === c.id && inRange(e.date, q)).reduce((n, e) => n + e.amountC, 0)) })), byMode: MODES.map((m) => ({ mode: m, total: fmt(live().filter((e) => e.mode === m && inRange(e.date, q)).reduce((n, e) => n + e.amountC, 0)) })) }
    }
  }
  const REPORT_PERM = { "daily-summary": "reports.read", opd: "reports.read", demographics: "reports.read", lab: "reports.read", pharmacy: "reports.read", "financial-summary": "reports.read", "revenue/daily": "reports.read", "cash-flow": "accounts.read", expenses: "accounts.read" }

  const pageOf = (data, q, extra) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 25); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) }, ...(extra || {}) } }
  const bad = (route, message, details) => err(route, 400, "VALIDATION_FAILED", message, details)
  const bodyDayOk = (route, d) => (DATE.test(String(d)) && !Number.isNaN(Date.parse(d)) ? null : bad(route, "date must be YYYY-MM-DD"))

  const MINE = /^\/(expenses|bank-accounts|bank-balances|bank-transactions|cash-drawer|dashboard|prescriptions)(\/|$)|^\/reports\/(daily-summary|opd|demographics|lab|pharmacy|financial-summary|revenue\/daily|cash-flow|expenses)$/
  const handler = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api\/v1/, ""), m = req.method(), q = url.searchParams
    if (!MINE.test(p)) return F11.handler(route)
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined } catch { body = "NOT-JSON" }
    requests.push({ method: m, path: p, query: Object.fromEntries(q), body })
    const perPage = Number(q.get("perPage") || 25)
    if (perPage > 100) return bad(route, "perPage too large")
    const accounts = /^\/(expenses|bank-balances|bank-transactions|cash-drawer)/.test(p) || /^\/bank-accounts\/[^/]+\/statement$/.test(p)
    if (accounts && A.failAccounts) return err(route, 500, "INTERNAL", "Accounts are unavailable.")

    // ── the dashboard
    if (p === "/dashboard" && m === "GET") { A.dashHits++; if (A.failDashboard) return err(route, 500, "INTERNAL", "The dashboard could not be produced."); return json(route, 200, dashboard()) }

    // ── reports
    const rep = /^\/reports\/(.+)$/.exec(p)
    if (rep && m === "GET") {
      const name = rep[1]
      if (!has(REPORT_PERM[name])) return err(route, 403, "FORBIDDEN", `You need ${REPORT_PERM[name]}.`)
      if (S4.failReports) return err(route, 500, "INTERNAL", "The report could not be produced.")
      if (name === "cash-flow" && q.get("date") && (q.get("dateFrom") || q.get("dateTo"))) return bad(route, "Ask for date or a period, not both.")
      if (!(name === "cash-flow" && q.get("date"))) {
        const from = q.get("dateFrom"), to = q.get("dateTo")
        if (!from || !to || !DATE.test(from) || !DATE.test(to)) return bad(route, "dateFrom and dateTo are required.")
        if (from > to) return bad(route, "dateFrom is after dateTo.")
        if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366) return bad(route, "A report covers at most 366 days.")
      } else if (!DATE.test(q.get("date"))) return bad(route, "date must be YYYY-MM-DD")
      if (name === "revenue/daily" && q.get("sourceType") && !["consultation", "service", "diagnostic", "pharmacy", "room"].includes(q.get("sourceType"))) return bad(route, "sourceType is not valid")
      if (name === "pharmacy" && q.get("expiringWithinDays") && !(Number(q.get("expiringWithinDays")) >= 1 && Number(q.get("expiringWithinDays")) <= 3650)) return bad(route, "expiringWithinDays is 1 to 3650")
      return json(route, 200, reportBody(name, q))
    }

    // ── prescriptions
    if (p === "/prescriptions" && m === "GET") {
      if (!has("encounters.read")) return err(route, 403, "FORBIDDEN", "You need encounters.read.")
      for (const k of ["patientId", "doctorId", "medicineId"]) if (q.get(k) && !ULID.test(q.get(k))) return bad(route, `${k} is not a valid id`)
      if ((q.get("dateFrom") && !DATE.test(q.get("dateFrom"))) || (q.get("dateTo") && !DATE.test(q.get("dateTo")))) return bad(route, "bad date")
      const s = (q.get("search") || "").toLowerCase()
      const rows = rxRows.filter((r) => inRange(r.date, q) && (!q.get("doctorId") || r.doctor.id === q.get("doctorId")) && (!s || r.medicineText.toLowerCase().includes(s) || r.doctor.name.toLowerCase().includes(s) || r.patient.name.toLowerCase().includes(s)))
      return json(route, 200, pageOf(rows, q))
    }

    // ── bank accounts' statements
    const st = /^\/bank-accounts\/([^/]+)\/statement$/.exec(p)
    if (st && m === "GET") {
      if (!has("accounts.read")) return err(route, 403, "FORBIDDEN", "You need accounts.read.")
      const b = banks.find((x) => x.id === st[1]); if (!b) return err(route, 404, "NOT_FOUND", "No such bank account.")
      const from = q.get("dateFrom"), to = q.get("dateTo")
      if (!from || !to || !DATE.test(from) || !DATE.test(to) || from > to) return bad(route, "dateFrom and dateTo are required, in order.")
      return json(route, 200, statementOf(b, from, to))
    }
    if (p === "/bank-accounts" && m === "GET") {
      if (!has("accounts.read")) return err(route, 403, "FORBIDDEN", "You need accounts.read.")
      const s = (q.get("search") || "").toLowerCase()
      const out = pageOf(banks.filter((b) => (q.get("active") === null || String(b.active) === q.get("active")) && (!s || b.bankName.toLowerCase().includes(s) || b.accountNo.includes(s))), q)
      const e = validate(out, schemaOf("BankAccountPageDto_Output", "draft"), { lenientStringArrays: true, source: "draft" })
      if (e.length) F11.violations.push(`GET /bank-accounts: ${e.slice(0, 3).join("; ")}`)
      return json(route, 200, out)
    }
    if (p.startsWith("/bank-accounts")) return err(route, 404, "NOT_FOUND", "No such route in the fake.")

    if (p === "/bank-balances" && m === "GET") {
      if (!has("accounts.read")) return err(route, 403, "FORBIDDEN", "You need accounts.read.")
      const list = banks.filter((b) => b.active).map((b) => ({ bankAccount: bankRef(b), balance: fmt(balanceOf(b)) }))
      return json(route, 200, { accounts: list, total: fmt(banks.filter((b) => b.active).reduce((n, b) => n + balanceOf(b), 0)) })
    }

    // ── the cash drawer's opening
    if (p === "/cash-drawer/opening") {
      if (m === "GET") { if (!has("accounts.read")) return err(route, 403, "FORBIDDEN", "You need accounts.read."); return A.drawer ? json(route, 200, A.drawer) : err(route, 404, "NOT_FOUND", "The cash drawer's opening has not been set.") }
      if (m === "PUT") {
        if (!has("settings.write")) return err(route, 403, "FORBIDDEN", "You need settings.write.")
        if (!body || typeof body !== "object" || Object.keys(body).sort().join() !== "amount,date") return bad(route, "Send { amount, date } only.")
        if (!/^\d+(\.\d{1,2})?$/.test(String(body.amount))) return bad(route, "amount is a decimal string")
        const dErr = bodyDayOk(route, body.date); if (dErr) return dErr
        if (A.drawer) return err(route, 409, "OPENING_BALANCE_EXISTS", "The opening balance has already been set.")
        A.drawer = { amount: fmt(cents(body.amount)), date: body.date }
        return json(route, 200, A.drawer)
      }
    }

    // ── expenses
    if (p === "/expenses" && m === "GET") {
      if (!has("accounts.read")) return err(route, 403, "FORBIDDEN", "You need accounts.read.")
      for (const k of ["dateFrom", "dateTo"]) if (q.get(k) && !DATE.test(q.get(k))) return bad(route, `${k} is not a date`)
      if (q.get("mode") && !MODES.includes(q.get("mode"))) return bad(route, "mode is not valid")
      for (const k of ["categoryId", "bankAccountId"]) if (q.get(k) && !ULID.test(q.get(k))) return bad(route, `${k} is not a valid id`)
      if (q.get("includeVoided") && !["true", "false"].includes(q.get("includeVoided"))) return bad(route, "includeVoided is true or false")
      const s = (q.get("search") || "").toLowerCase()
      const rows = expenses.filter((e) => inRange(e.date, q) && (q.get("includeVoided") === "true" || !e.voided) && (!q.get("categoryId") || e.categoryId === q.get("categoryId")) && (!q.get("mode") || e.mode === q.get("mode"))
        && (!q.get("bankAccountId") || e.bankAccountId === q.get("bankAccountId")) && (!s || e.description.toLowerCase().includes(s) || (e.referenceNo || "").toLowerCase().includes(s)))
        .sort((a, b) => (q.get("sort") === "date:asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || b.createdAt.localeCompare(a.createdAt))
      return json(route, 200, pageOf(rows.map(expenseOut), q, { totalAmount: fmt(rows.filter((e) => !e.voided).reduce((n, e) => n + e.amountC, 0)) }))
    }
    if (p === "/expenses" && m === "POST") {
      if (!has("accounts.write")) return err(route, 403, "FORBIDDEN", "You need accounts.write.")
      if (!body || typeof body !== "object") return bad(route, "A JSON body is required.")
      const allowed = new Set(["date", "categoryId", "description", "amount", "mode", "bankAccountId", "referenceNo"])
      const extra = Object.keys(body).filter((k) => !allowed.has(k)); if (extra.length) return bad(route, `Unknown field: ${extra[0]}`)
      if (!DATE.test(String(body.date))) return bad(route, "date must be YYYY-MM-DD")
      if (!ULID.test(String(body.categoryId))) return bad(route, "categoryId is not a valid id")
      if (typeof body.description !== "string" || !body.description.trim() || body.description.length > 500) return bad(route, "description is 1 to 500 characters")
      if (!/^\d+(\.\d{1,2})?$/.test(String(body.amount)) || !(cents(body.amount) > 0)) return bad(route, "amount is a positive decimal string")
      if (!MODES.includes(body.mode)) return bad(route, "mode is not valid")
      if (body.mode === "cash" && body.bankAccountId !== undefined) return bad(route, "A cash expense has no bankAccountId.")
      if (body.mode !== "cash" && !ULID.test(String(body.bankAccountId))) return bad(route, "A bank-paid expense needs bankAccountId.")
      if (body.date > TODAY) return err(route, 422, "DATE_IN_FUTURE", "The date is in the future.")
      const cat = catOf(body.categoryId); if (!cat) return err(route, 404, "NOT_FOUND", "No such category.")
      if (!cat.active) return err(route, 422, "CATEGORY_INACTIVE", "That category is no longer in use.")
      let bank = null
      if (body.mode !== "cash") {
        bank = banks.find((b) => b.id === body.bankAccountId); if (!bank) return err(route, 404, "NOT_FOUND", "No such bank account.")
        if (!bank.active) return err(route, 422, "BANK_ACCOUNT_INACTIVE", "That bank account is no longer in use.")
        const opening = txs.find((t) => t.bankAccountId === bank.id && t.kind === "opening_balance" && !t.voided)
        if (opening && body.date < opening.date) return err(route, 422, "BEFORE_OPENING_BALANCE", "The date is before the account's opening balance.")
      } else if (A.drawer && body.date < A.drawer.date) return err(route, 422, "BEFORE_CASH_OPENING", "The date is before the cash drawer's opening.")
      const e = mkExpense({ date: body.date, categoryId: body.categoryId, description: body.description.trim(), amountC: cents(body.amount), mode: body.mode, bankAccountId: bank ? bank.id : null, referenceNo: body.referenceNo ?? null })
      return json(route, 201, expenseOut(e))
    }
    const ex = /^\/expenses\/([^/]+)(\/void)?$/.exec(p)
    if (ex) {
      const e = expenses.find((x) => x.id === ex[1])
      if (!has(m === "GET" ? "accounts.read" : "accounts.write")) return err(route, 403, "FORBIDDEN", "You do not have permission.")
      if (!e) return err(route, 404, "NOT_FOUND", "No such expense.")
      if (m === "GET" && !ex[2]) return json(route, 200, expenseOut(e))
      if (m === "PATCH" && !ex[2]) {
        if (!body || typeof body !== "object") return bad(route, "A JSON body is required.")
        const allowed = new Set(["date", "categoryId", "description", "amount", "referenceNo", "expectedUpdatedAt"])
        const extra = Object.keys(body).filter((k) => !allowed.has(k)); if (extra.length) return bad(route, `Unknown field: ${extra[0]}`)
        if (Object.keys(body).filter((k) => k !== "expectedUpdatedAt").length === 0) return bad(route, "Nothing to change.")
        if (A.bumpExpense === e.id) { e.updatedAt = "2026-11-07T11:30:00.000Z"; A.bumpExpense = null }
        if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== e.updatedAt) return err(route, 409, "EXPENSE_CHANGED", "This expense was changed by someone else.")
        if (e.voided) return err(route, 422, "VALIDATION_FAILED", "A voided expense cannot be corrected.")
        if (body.date !== undefined) { if (!DATE.test(String(body.date))) return bad(route, "date must be YYYY-MM-DD"); if (body.date > TODAY) return err(route, 422, "DATE_IN_FUTURE", "The date is in the future."); e.date = body.date }
        if (body.categoryId !== undefined) { const cat = catOf(body.categoryId); if (!cat) return err(route, 404, "NOT_FOUND", "No such category."); if (!cat.active) return err(route, 422, "CATEGORY_INACTIVE", "That category is no longer in use."); e.categoryId = body.categoryId }
        if (body.description !== undefined) e.description = String(body.description)
        if (body.amount !== undefined) { if (!(cents(body.amount) > 0)) return bad(route, "amount is a positive decimal string"); e.amountC = cents(body.amount) }
        if ("referenceNo" in body) e.referenceNo = body.referenceNo
        e.updatedAt = new Date(Date.parse(e.updatedAt) + 60000).toISOString(); e.version++
        const t = txs.find((x) => x.id === e.txId); if (t) { t.date = e.date; t.amountC = e.amountC; t.description = e.description; t.referenceNo = e.referenceNo }
        return json(route, 200, expenseOut(e))
      }
      if (m === "POST" && ex[2]) {
        if (!body || typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 500) return bad(route, "reason is 3 to 500 characters")
        if (e.voided) return err(route, 409, "ALREADY_VOIDED", "This expense is already voided.")
        e.voided = true; e.voidReason = body.reason.trim(); e.updatedAt = new Date(Date.parse(e.updatedAt) + 60000).toISOString()
        const t = txs.find((x) => x.id === e.txId); if (t) t.voided = true
        return json(route, 200, expenseOut(e))
      }
    }

    // ── bank entries
    if (p === "/bank-transactions" && m === "POST") {
      if (!has("accounts.write")) return err(route, 403, "FORBIDDEN", "You need accounts.write.")
      if (!body || typeof body !== "object") return bad(route, "A JSON body is required.")
      const allowed = new Set(["bankAccountId", "date", "kind", "amount", "description", "referenceNo"])
      const extra = Object.keys(body).filter((k) => !allowed.has(k)); if (extra.length) return bad(route, `Unknown field: ${extra[0]}`)
      if (body.kind === "expense") return bad(route, 'kind "expense" is posted by the server and cannot be entered.')
      if (!KINDS.includes(body.kind)) return bad(route, "kind is not valid")
      if (!ULID.test(String(body.bankAccountId))) return bad(route, "bankAccountId is not a valid id")
      if (!DATE.test(String(body.date))) return bad(route, "date must be YYYY-MM-DD")
      if (!/^\d+(\.\d{1,2})?$/.test(String(body.amount)) || !(cents(body.amount) > 0)) return bad(route, "amount is a positive decimal string")
      if (typeof body.description !== "string" || !body.description.trim()) return bad(route, "description is required")
      const bank = banks.find((b) => b.id === body.bankAccountId); if (!bank) return err(route, 404, "NOT_FOUND", "No such bank account.")
      if (!bank.active) return err(route, 422, "BANK_ACCOUNT_INACTIVE", "That bank account is no longer in use.")
      if (body.date > TODAY) return err(route, 422, "DATE_IN_FUTURE", "The date is in the future.")
      const t = mkTx({ bankAccountId: bank.id, date: body.date, kind: body.kind, amountC: cents(body.amount), description: body.description.trim(), referenceNo: body.referenceNo ?? null })
      return json(route, 201, txOut(t))
    }
    const tx = /^\/bank-transactions\/([^/]+)(\/void)?$/.exec(p)
    if (tx) {
      const t = txs.find((x) => x.id === tx[1])
      if (!has(m === "GET" ? "accounts.read" : "accounts.write")) return err(route, 403, "FORBIDDEN", "You do not have permission.")
      if (!t) return err(route, 404, "NOT_FOUND", "No such bank entry.")
      if (m === "GET" && !tx[2]) return json(route, 200, txOut(t))
      if (m === "POST" && tx[2]) {
        if (!body || typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 500) return bad(route, "reason is 3 to 500 characters")
        if (t.kind === "expense") return err(route, 422, "VOID_THROUGH_EXPENSE", "Void the expense instead; its bank entry follows.")
        if (t.voided) return err(route, 409, "ALREADY_VOIDED", "This entry is already voided.")
        t.voided = true
        return json(route, 200, txOut(t))
      }
    }
    return err(route, 404, "NOT_FOUND", "No such route in the fake.")
  }
  return { ...F11, F11, handler, requests, A, banks, expenses, txs, rxRows, expenseOut, statementOf, balanceOf, dashboard, reportBody, mkExpense, live, CAT_ELEC, CAT_SAL, CAT_OLD, cents }
}
