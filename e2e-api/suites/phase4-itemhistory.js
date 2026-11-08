// Phase 4 browser check: S12 Expense categories, S13 Bank accounts, D8 Item History (API mode). TEST HARNESS ONLY. A stateful fake backend inside
// Playwright's route(); every request body and response is validated against docs/openapi.draft.json (the PROPOSED contract these screens follow).
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])
const U = (n) => "01HZX" + String(n).padStart(21, "0")
const NOW = "2026-11-07T10:00:00.000Z"

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const LENIENT = { lenientStringArrays: true }
  const violations = []
  const check = (what, value, schemaName, opts) => { const e = validate(value, schemaOf(schemaName), opts); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const checkDraft = (what, value, schemaName) => { const e = validate(value, schemaOf(schemaName, "draft"), { source: "draft" }); if (e.length) violations.push(`${what}: ${e.slice(0, 3).join("; ")}`) }
  const permEnum = new Set(schemaOf("AuthUserDto_Output").properties.permissions.items.enum)
  const forCheck = (u) => ({ ...u, permissions: u.permissions.filter((p) => permEnum.has(p)) })

  const S = { perms: stubs.ALL_PERMISSIONS, n: 0, cookie: false, slowSave: false }
  const services = [{ id: U(100), code: "SVC-01", name: "Service 01", category: "Procedure", rate: "1800.00", gstPct: "0.00", discountPct: "0.00", active: true, createdAt: NOW }]
  const cats = Array.from({ length: 12 }, (_, i) => ({ id: U(400 + i), name: `Cat ${String(i + 1).padStart(2, "0")}`, active: i !== 3, createdAt: NOW }))
  const banks = [
    { id: U(500), bankName: "HBL", accountTitle: "Citi Clinic", accountNo: "PK36 SCBL 0000", branch: "Main Branch", active: true, createdAt: NOW },
    { id: U(501), bankName: "UBL", accountTitle: "Clinic Savings", accountNo: "UBL-12345", branch: null, active: false, createdAt: NOW },
  ]
  const audit = (entityType, entityId) => {
    if (entityType === "service_catalog_item") return [
      { id: U(700), occurredAt: "2026-11-05T09:30:00.000Z", action: "updated", actor: { id: U(900), name: "Dr Admin" }, changes: { rate: { from: "1500.00", to: "1800.00" }, active: { from: true, to: false } } },
      { id: U(701), occurredAt: "2026-11-01T08:00:00.000Z", action: "created", actor: null, changes: null },
    ]
    return [{ id: U(702), occurredAt: "2026-11-02T08:00:00.000Z", action: "created", actor: { id: U(900), name: "Dr Admin" }, changes: null }]
  }
  const requests = []
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  const err = (route, status, code, message, extra = {}) => json(route, status, { statusCode: status, code, message, requestId: "req-" + code, path: "/x", timestamp: NOW, ...extra })
  const pageOf = (data, q) => { const page = Number(q.get("page") || 1), per = Number(q.get("perPage") || 20); return { data: data.slice((page - 1) * per, page * per), meta: { page, perPage: per, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / per)) } } }
  const issue = () => "tok-" + ++S.n
  const matchActive = (q, x) => q.get("active") === null || String(x.active) === q.get("active")

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
    // the dashboard now reads today's appointments and the low-stock medicines (Phase 11): none here
    if (m === "GET" && (p === "/appointments" || p === "/medicines")) return json(route, 200, { data: [], meta: { page: 1, perPage: 10, total: 0, totalPages: 1 } })
    if (m === "GET" && p === "/patients") return json(route, 200, { data: [], meta: { page: 1, perPage: 10, total: 0, totalPages: 1 } })
    if (m === "GET" && p === "/services") { const out = pageOf(services, url.searchParams); check("GET /services", out, "ServicePageDto_Output", LENIENT); return json(route, 200, out) }
    // ── audit entries (proposed contract section 3)
    if (m === "GET" && p === "/audit-entries") {
      const q = url.searchParams
      if (!q.get("entityType") || !q.get("entityId")) return err(route, 400, "VALIDATION_FAILED", "entityType and entityId are required")
      const out = pageOf(audit(q.get("entityType"), q.get("entityId")), q); checkDraft("GET /audit-entries", out, "AuditEntryPageDto_Output"); return json(route, 200, out)
    }
    // ── expense categories
    let mm
    if (p === "/expense-categories" && m === "GET") {
      const q = url.searchParams, s = (q.get("search") || "").toLowerCase()
      const rows = cats.filter((x) => (!s || x.name.toLowerCase().includes(s)) && matchActive(q, x))
      const out = pageOf(rows, q); checkDraft("GET /expense-categories", out, "ExpenseCategoryPageDto_Output"); return json(route, 200, out)
    }
    if (p === "/expense-categories" && m === "POST") {
      checkDraft("POST /expense-categories request", body, "CreateExpenseCategoryDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      if (cats.some((x) => x.name.toLowerCase() === body.name.toLowerCase())) return err(route, 409, "EXPENSE_CATEGORY_NAME_TAKEN", "An expense category with this name already exists.")
      const rec = { id: U(600 + cats.length), name: body.name, active: true, createdAt: NOW }
      cats.push(rec); checkDraft("POST /expense-categories response", rec, "ExpenseCategoryResponseDto_Output"); return json(route, 201, rec)
    }
    if ((mm = p.match(/^\/expense-categories\/([0-9A-Z]{26})$/)) && m === "PATCH") {
      checkDraft("PATCH /expense-categories request", body, "UpdateExpenseCategoryDto")
      const x = cats.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "no")
      if (cats.some((y) => y.id !== x.id && y.name.toLowerCase() === body.name.toLowerCase())) return err(route, 409, "EXPENSE_CATEGORY_NAME_TAKEN", "An expense category with this name already exists.")
      x.name = body.name; checkDraft("PATCH /expense-categories response", x, "ExpenseCategoryResponseDto_Output"); return json(route, 200, x)
    }
    if ((mm = p.match(/^\/expense-categories\/([0-9A-Z]{26})\/(deactivate|reactivate)$/)) && m === "POST") {
      const x = cats.find((y) => y.id === mm[1]); x.active = mm[2] === "reactivate"; checkDraft("expense category (de)activate", x, "ExpenseCategoryResponseDto_Output"); return json(route, 200, x)
    }
    // ── bank accounts
    if (p === "/bank-accounts" && m === "GET") {
      const q = url.searchParams, s = (q.get("search") || "").toLowerCase()
      const rows = banks.filter((x) => (!s || [x.bankName, x.accountTitle, x.accountNo].some((v) => v.toLowerCase().includes(s))) && matchActive(q, x))
      const out = pageOf(rows, q); checkDraft("GET /bank-accounts", out, "BankAccountPageDto_Output"); return json(route, 200, out)
    }
    if (p === "/bank-accounts" && m === "POST") {
      checkDraft("POST /bank-accounts request", body, "CreateBankAccountDto")
      if (S.slowSave) await new Promise((r) => setTimeout(r, 700))
      if (banks.some((x) => x.accountNo === body.accountNo)) return err(route, 409, "BANK_ACCOUNT_NO_TAKEN", "That account number is already registered.")
      const rec = { id: U(650 + banks.length), bankName: body.bankName, accountTitle: body.accountTitle, accountNo: body.accountNo, branch: body.branch ?? null, active: true, createdAt: NOW }
      banks.push(rec); checkDraft("POST /bank-accounts response", rec, "BankAccountResponseDto_Output"); return json(route, 201, rec)
    }
    if ((mm = p.match(/^\/bank-accounts\/([0-9A-Z]{26})$/)) && m === "PATCH") {
      checkDraft("PATCH /bank-accounts request", body, "UpdateBankAccountDto")
      const x = banks.find((y) => y.id === mm[1]); if (!x) return err(route, 404, "NOT_FOUND", "no")
      for (const k of ["bankName", "accountTitle", "accountNo"]) if (k in body) x[k] = body[k]
      if ("branch" in body) x.branch = body.branch === "" ? null : body.branch
      checkDraft("PATCH /bank-accounts response", x, "BankAccountResponseDto_Output"); return json(route, 200, x)
    }
    if ((mm = p.match(/^\/bank-accounts\/([0-9A-Z]{26})\/(deactivate|reactivate)$/)) && m === "POST") {
      const x = banks.find((y) => y.id === mm[1]); x.active = mm[2] === "reactivate"; checkDraft("bank account (de)activate", x, "BankAccountResponseDto_Output"); return json(route, 200, x)
    }
    if (stubs.tryHandleHome(route, m, p)) return
    return err(route, 599, "UNEXPECTED", "the test backend does not implement this")
  }

  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
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
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x, p, { timeout: 10000 }); await page.waitForTimeout(900) }
  const closed = () => page.waitForFunction(() => !document.querySelector("[role=dialog]"), null, { timeout: 8000 })
  const expText = () => page.getByTestId("expense-categories-tab").innerText()
  const bankText = () => page.getByTestId("bank-accounts-tab").innerText()

  await login()
  await go("/admin/master-data")
  await page.getByTestId(`service-row-${U(100)}`).waitFor({ timeout: 8000 })

  // ───────────── D8 Item History on the services tab ─────────────
  let i0 = requests.length
  const hist = page.getByRole("button", { name: "Item History for Service 01" })
  ok("D8 the Item History button is enabled for a user with audit.read", (await hist.count()) === 1 && (await hist.isEnabled()))
  await hist.click(); await page.getByTestId("item-history-dialog").waitFor({ timeout: 8000 }); await page.waitForTimeout(600)
  const areq = since(i0).find((r) => r.path === "/audit-entries")
  ok("D8 it asks GET /audit-entries with entityType=service_catalog_item and the service's id", !!areq && areq.query.entityType === "service_catalog_item" && areq.query.entityId === U(100) && areq.query.perPage === "100", JSON.stringify(areq && areq.query))
  const dlg = await page.getByTestId("item-history-dialog").innerText()
  ok("D8 each change reads 'Field: from → to' (rate, active as Yes/No) and the newest entry is first", /Rate: 1500\.00 → 1800\.00/.test(dlg) && /Active: Yes → No/.test(dlg) && dlg.indexOf("Updated") < dlg.indexOf("Created"), dlg.replace(/\n/g, " | ").slice(0, 300))
  ok("D8 a change by the system (no actor) shows 'System'; a named actor shows the name", /System/.test(dlg) && /Dr Admin/.test(dlg))
  await page.getByTestId("item-history-dialog").getByRole("button", { name: "Close" }).first().click(); await closed()
  i0 = requests.length
  await hist.click(); await page.getByTestId("item-history-dialog").waitFor(); await page.waitForTimeout(500)
  ok("D8 opening it again reads the log fresh (it is never cached)", since(i0).filter((r) => r.path === "/audit-entries").length === 1)
  await page.keyboard.press("Escape"); await closed()

  // ───────────── S12 expense categories ─────────────
  i0 = requests.length
  await page.getByRole("tab", { name: "Expense Categories" }).click()
  await page.getByTestId("expense-categories-tab").waitFor({ timeout: 8000 }); await page.getByTestId(`expense-category-row-${U(400)}`).waitFor({ timeout: 8000 })
  const first = since(i0).find((r) => r.path === "/expense-categories")
  ok("S12 the tab loads GET /expense-categories page 1, perPage 10 (server-side paging)", !!first && first.query.page === "1" && first.query.perPage === "10", JSON.stringify(first && first.query))
  let text = await expText()
  ok("S12 inactive categories are listed too (Cat 04) and page 2 is not shown yet", text.includes("Cat 04") && !text.includes("Cat 11"))
  i0 = requests.length
  await page.getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(900)
  ok("S12 next page asks the server for page 2", since(i0).some((r) => r.path === "/expense-categories" && r.query.page === "2") && (await expText()).includes("Cat 11"))
  await page.getByRole("button", { name: /prev/i }).click(); await page.waitForTimeout(700)
  i0 = requests.length
  await page.getByLabel("Search expense categories").fill("Cat 07"); await page.waitForTimeout(1200)
  const sreq = since(i0).filter((r) => r.path === "/expense-categories")
  ok("S12 search is debounced: ONE request with search=Cat 07 on page 1; not in the address bar", sreq.length === 1 && sreq[0].query.search === "Cat 07" && sreq[0].query.page === "1" && !/Cat/.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
  await page.getByLabel("Search expense categories").fill(""); await page.waitForTimeout(900)
  i0 = requests.length
  await page.getByTestId("expense-categories-tab").getByRole("combobox", { name: "Status" }).click(); await page.getByRole("option", { name: "Inactive" }).click(); await page.waitForTimeout(900)
  ok("S12 the status filter is sent (active=false) and shows only the inactive one", since(i0).some((r) => r.path === "/expense-categories" && r.query.active === "false") && (await expText()).includes("Cat 04") && !(await expText()).includes("Cat 01"))
  await page.getByTestId("expense-categories-tab").getByRole("combobox", { name: "Status" }).click(); await page.getByRole("option", { name: "All", exact: true }).click(); await page.waitForTimeout(700)

  // create: a too-short name is refused with nothing sent; a double click sends one POST
  i0 = requests.length
  await page.getByRole("button", { name: "Add Category" }).click()
  await page.getByLabel("Category Name *").fill("x"); await page.getByRole("button", { name: "Save Category" }).click(); await page.waitForTimeout(400)
  ok("S12 a 1-character name is refused on the form (2 to 80 characters) and nothing is sent", /2 to 80/.test(await page.getByRole("dialog").innerText()) && since(i0).filter((r) => r.method === "POST").length === 0)
  await page.getByLabel("Category Name *").fill("Utilities")
  S.slowSave = true
  await Promise.all([page.getByRole("button", { name: "Save Category" }).dblclick(), page.waitForTimeout(100)])
  await closed(); S.slowSave = false
  const cposts = since(i0).filter((r) => r.method === "POST" && r.path === "/expense-categories")
  ok("S12 create: a double click sends ONE POST with exactly { name }", cposts.length === 1 && JSON.stringify(cposts[0].body) === JSON.stringify({ name: "Utilities" }), JSON.stringify(cposts.map((r) => r.body)))
  // duplicate name
  await page.getByRole("button", { name: "Add Category" }).click()
  await page.getByLabel("Category Name *").fill("utilities"); await page.getByRole("button", { name: "Save Category" }).click(); await page.waitForTimeout(700)
  const dtext = await page.getByRole("dialog").innerText()
  ok("S12 a duplicate name (409 EXPENSE_CATEGORY_NAME_TAKEN) shows the message on the field, the support reference, and 'Show the existing category'", /already exists|already used/.test(dtext) && /Support reference/.test(dtext) && /Show the existing category/.test(dtext), dtext.replace(/\n/g, " | ").slice(0, 260))
  i0 = requests.length
  await page.getByRole("button", { name: "Show the existing category" }).click(); await closed(); await page.waitForTimeout(1200)
  ok("S12 'Show the existing category' searches for it", since(i0).some((r) => r.path === "/expense-categories" && r.query.search === "utilities") && (await expText()).includes("Utilities"))
  // rename
  i0 = requests.length
  await page.getByRole("button", { name: "Edit Utilities" }).click()
  await page.getByLabel("Category Name *").fill("Utilities and Rent"); await page.getByRole("button", { name: "Save Category" }).click(); await closed(); await page.waitForTimeout(800)
  const cpatch = since(i0).find((r) => r.method === "PATCH")
  ok("S12 rename sends PATCH { name } and says past expenses keep their name", !!cpatch && JSON.stringify(cpatch.body) === JSON.stringify({ name: "Utilities and Rent" }))
  // deactivate / reactivate
  await page.getByLabel("Search expense categories").fill(""); await page.waitForTimeout(900)
  await page.getByLabel("Search expense categories").fill("Utilities"); await page.waitForTimeout(1200)
  i0 = requests.length
  await page.getByRole("switch", { name: /Deactivate Utilities and Rent/ }).click(); await page.waitForTimeout(1000)
  ok("S12 the switch deactivates through POST /expense-categories/{id}/deactivate", since(i0).some((r) => r.path.endsWith("/deactivate")) && cats.find((c) => c.name === "Utilities and Rent").active === false)
  await page.getByRole("switch", { name: /Reactivate Utilities and Rent/ }).click(); await page.waitForTimeout(1000)
  ok("S12 and reactivates through POST /expense-categories/{id}/reactivate", since(i0).some((r) => r.path.endsWith("/reactivate")) && cats.find((c) => c.name === "Utilities and Rent").active === true)
  i0 = requests.length
  await page.getByRole("button", { name: "Item History for Utilities and Rent" }).click(); await page.getByTestId("item-history-dialog").waitFor(); await page.waitForTimeout(600)
  ok("D8 the expense category's history asks entityType=expense_category", since(i0).some((r) => r.path === "/audit-entries" && r.query.entityType === "expense_category"))
  await page.keyboard.press("Escape"); await closed()

  // ───────────── S13 bank accounts ─────────────
  i0 = requests.length
  await page.getByRole("tab", { name: "Banks" }).click()
  await page.getByTestId(`bank-row-${U(500)}`).waitFor({ timeout: 8000 })
  ok("S13 the tab loads GET /bank-accounts page 1, perPage 10", since(i0).some((r) => r.path === "/bank-accounts" && r.query.page === "1" && r.query.perPage === "10"))
  text = await bankText()
  ok("S13 bank, title, account number and branch are listed; a missing branch shows a dash; the inactive one is listed too", /HBL/.test(text) && /Citi Clinic/.test(text) && /PK36 SCBL 0000/.test(text) && /Main Branch/.test(text) && /UBL-12345/.test(text))
  // validation
  i0 = requests.length
  await page.getByRole("button", { name: "Add Bank Account" }).click()
  await page.getByLabel("Bank Name *").fill("MCB"); await page.getByLabel("Account Title *").fill("Clinic Current"); await page.getByLabel("Account No. *").fill("12#45")
  await page.getByRole("button", { name: "Save Account" }).click(); await page.waitForTimeout(400)
  ok("S13 a bad account number is refused on the form (letters, digits, spaces, hyphens; 4 to 34) and nothing is sent", /letters, digits/.test(await page.getByRole("dialog").innerText()) && since(i0).filter((r) => r.method === "POST").length === 0)
  await page.getByLabel("Account No. *").fill("MCB-777888")
  S.slowSave = true
  await Promise.all([page.getByRole("button", { name: "Save Account" }).dblclick(), page.waitForTimeout(100)])
  await closed(); S.slowSave = false
  const bposts = since(i0).filter((r) => r.method === "POST" && r.path === "/bank-accounts")
  ok("S13 create: a double click sends ONE POST; the empty branch is left out", bposts.length === 1 && JSON.stringify(Object.keys(bposts[0].body).sort()) === JSON.stringify(["accountNo", "accountTitle", "bankName"]), JSON.stringify(bposts.map((r) => r.body)))
  // duplicate account number
  await page.getByRole("button", { name: "Add Bank Account" }).click()
  await page.getByLabel("Bank Name *").fill("MCB"); await page.getByLabel("Account Title *").fill("Other"); await page.getByLabel("Account No. *").fill("MCB-777888")
  await page.getByRole("button", { name: "Save Account" }).click(); await page.waitForTimeout(700)
  const btext = await page.getByRole("dialog").innerText()
  ok("S13 a duplicate account number (409 BANK_ACCOUNT_NO_TAKEN) is shown on the number field with 'Show the existing account'", /already registered|already used/.test(btext) && /Show the existing account/.test(btext), btext.replace(/\n/g, " | ").slice(0, 260))
  await page.getByRole("button", { name: "Cancel" }).click(); await closed()
  // edit: only the changed field; an emptied branch clears it
  i0 = requests.length
  await page.getByRole("button", { name: "Edit HBL PK36 SCBL 0000" }).click()
  await page.getByLabel("Account Title *").fill("Citi Clinic Main"); await page.getByRole("button", { name: "Save Account" }).click(); await closed(); await page.waitForTimeout(800)
  const bp1 = since(i0).find((r) => r.method === "PATCH")
  ok("S13 edit sends PATCH with ONLY the changed accountTitle", !!bp1 && JSON.stringify(bp1.body) === JSON.stringify({ accountTitle: "Citi Clinic Main" }), JSON.stringify(bp1 && bp1.body))
  i0 = requests.length
  await page.getByRole("button", { name: "Edit HBL PK36 SCBL 0000" }).click()
  await page.getByLabel("Branch").fill(""); await page.getByRole("button", { name: "Save Account" }).click(); await closed(); await page.waitForTimeout(800)
  const bp2 = since(i0).find((r) => r.method === "PATCH")
  ok("S13 emptying the branch sends branch: null (it clears it)", !!bp2 && JSON.stringify(bp2.body) === JSON.stringify({ branch: null }) && banks[0].branch === null, JSON.stringify(bp2 && bp2.body))
  i0 = requests.length
  await page.getByRole("button", { name: "Edit HBL PK36 SCBL 0000" }).click(); await page.getByRole("button", { name: "Save Account" }).click(); await closed(); await page.waitForTimeout(500)
  ok("S13 saving without a change sends nothing", since(i0).filter((r) => r.method === "PATCH").length === 0)
  // deactivate / reactivate
  i0 = requests.length
  await page.getByRole("switch", { name: /Deactivate HBL PK36 SCBL 0000/ }).click(); await page.waitForTimeout(1000)
  ok("S13 the switch deactivates through POST /bank-accounts/{id}/deactivate", since(i0).some((r) => r.path === `/bank-accounts/${U(500)}/deactivate`) && banks[0].active === false)
  await page.getByRole("switch", { name: /Reactivate HBL PK36 SCBL 0000/ }).click(); await page.waitForTimeout(1000)
  ok("S13 and reactivates it", banks[0].active === true)
  i0 = requests.length
  await page.getByRole("button", { name: "Item History for HBL PK36 SCBL 0000" }).click(); await page.getByTestId("item-history-dialog").waitFor(); await page.waitForTimeout(600)
  ok("D8 the bank account's history asks entityType=bank_account", since(i0).some((r) => r.path === "/audit-entries" && r.query.entityType === "bank_account" && r.query.entityId === U(500)))
  await page.keyboard.press("Escape"); await closed()

  // Clinic Settings history uses the hospital id
  i0 = requests.length
  await page.getByRole("tab", { name: "Clinic Settings" }).click(); await page.getByTestId("clinic-settings-tab").waitFor({ timeout: 8000 })
  await page.getByRole("button", { name: "Item History for Clinic Settings" }).click(); await page.getByTestId("item-history-dialog").waitFor(); await page.waitForTimeout(600)
  ok("D8 Clinic Settings history asks entityType=clinic_settings with the hospital's id", since(i0).some((r) => r.path === "/audit-entries" && r.query.entityType === "clinic_settings" && r.query.entityId === U(901)), JSON.stringify(since(i0).filter((r) => r.path === "/audit-entries").map((r) => r.query)))
  await page.keyboard.press("Escape"); await closed()
  ok("S12/S13 nothing is ever deleted (no DELETE request in the whole run)", !requests.some((r) => r.method === "DELETE"))

  // ───────────── permissions ─────────────
  // no audit.read, no catalogs.write, no accounts.read: read-only catalogue user
  S.perms = ["patients.read", "catalogs.read", "settings.read", "encounters.read", "doctors.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); i0 = requests.length
  await go("/admin/master-data"); await page.getByTestId(`service-row-${U(100)}`).waitFor({ timeout: 8000 })
  ok("PERM without audit.read there is no Item History button, and /audit-entries is never requested", (await page.getByRole("button", { name: /Item History for/ }).count()) === 0 && !requests.slice(i0).some((r) => r.path === "/audit-entries"))
  ok("PERM without accounts.read the Banks tab is not offered at all", (await page.getByRole("tab", { name: "Banks" }).count()) === 0)
  await page.getByRole("tab", { name: "Expense Categories" }).click(); await page.getByTestId("expense-categories-tab").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
  ok("PERM read-only user (catalogs.read only): no 'Add Category', no Edit buttons, the switches are disabled, no history button", (await page.getByRole("button", { name: "Add Category" }).count()) === 0 && (await page.getByRole("button", { name: /^Edit / }).count()) === 0 && (await page.getByRole("switch", { name: /Deactivate Cat 01/ }).isDisabled()) && (await page.getByRole("button", { name: /Item History for/ }).count()) === 0)
  // audit.read + accounts.read, but no catalogs.write
  S.perms = ["patients.read", "catalogs.read", "accounts.read", "audit.read", "settings.read"]
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {})
  await page.waitForURL("**/login", { timeout: 10000 })
  await login(); await go("/admin/master-data"); await page.getByTestId(`service-row-${U(100)}`).waitFor({ timeout: 8000 })
  await page.getByRole("tab", { name: "Banks" }).click(); await page.getByTestId(`bank-row-${U(500)}`).waitFor({ timeout: 8000 })
  ok("PERM accounts.read + audit.read without catalogs.write: the Banks tab and the history buttons show; Add and Edit do not", (await page.getByRole("button", { name: "Add Bank Account" }).count()) === 0 && (await page.getByRole("button", { name: /^Edit / }).count()) === 0 && (await page.getByRole("button", { name: /Item History for/ }).count()) >= 1)

  // ───────────── global ─────────────
  ok("no GET asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request/response the fake backend handled matches the specification (openapi.json, and openapi.draft.json for the proposed routes)", violations.length === 0, violations.slice(0, 4).join(" || "))
  const known = ["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/settings", "/settings/modules", "/public/hospital", "/patients", "/services", "/audit-entries", "/appointments", "/medicines", "/dashboard", "/reports/cash-flow"]
  const unexpected = requests.filter((r) => !known.includes(r.path) && !r.path.startsWith("/expense-categories") && !r.path.startsWith("/bank-accounts"))
  ok("no request reached a route the test backend does not implement", unexpected.length === 0, unexpected.map((r) => r.method + " " + r.path).join(", "))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (401|403|404|409|422|500)/.test(e))
  ok("no browser console/page errors other than the deliberate 409 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
