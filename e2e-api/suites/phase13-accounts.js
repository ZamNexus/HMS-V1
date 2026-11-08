// Phase 13 browser check: Billing > Expenses and Bank, the cash drawer's opening, API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in accounts-fake.js runs inside
// Playwright's route(). It enforces the handoff's request rules and error codes; the SHAPE of what it answers is my assumption (the handoff does not list the fields), so nothing here is
// evidence about the real backend. The production build under test has the demo seam replaced by its stub, so any read of demo data would throw and fail the page.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const { formatMoneyString } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/moneyMath.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/accounts-fake.js")({ validate, schemaOf, stubs })
  const { S, A, requests, violations, banks, expenses, txs, live, expenseHeads, CAT_ELEC, CAT_SAL, fmt, TODAY, U } = F
  const ALL = stubs.ALL_PERMISSIONS
  const base = process.argv[2]
  const M = formatMoneyString
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1800 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "") && !/status of (4\d\d|5\d\d)/.test(c.text())) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const gets = (i, re) => since(i).filter((r) => r.method === "GET" && re.test(r.path))
  const writes = (i, method, re) => since(i).filter((r) => r.method === method && re.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const tid = (id) => page.getByTestId(id)
  const text = (id) => tid(id).innerText().then((t) => t.trim())
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)) } }
  const rows = (prefix) => page.locator(`[data-testid^="${prefix}"]`)
  const dialog = () => page.getByRole("dialog")
  const pick = async (scope, name, option) => { await scope.getByRole("combobox", { name, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); await page.waitForTimeout(500) }
  const open = async (tab) => { await page.goto(base + "/billing/" + tab); await tid(tab === "expenses" ? "expenses-tab" : "bank-tab").waitFor({ timeout: 15000 }); await page.waitForTimeout(1200) }
  const sumC = () => live().reduce((n, e) => n + e.amountC, 0)
  let i0 = 0

  await login()

  // ═════════ Expenses: list, totals, paging ═════════
  await step("Expenses list", async () => {
    i0 = requests.length
    await open("expenses")
    const list = gets(i0, /^\/expenses$/)
    ok("X1 the tab asks GET /expenses once, page 1 of 10, and does not ask for voided rows", list.length === 1 && list[0].query.page === "1" && list[0].query.perPage === "10" && list[0].query.includeVoided === undefined, JSON.stringify(list.map((r) => r.query)))
    ok("X1 ten rows are shown, newest day first", (await rows("expense-row-").count()) === 10)
    ok("X1 the total is the SERVER's totalAmount for the view (the voided row is not in it), with the count of expenses", (await text("expenses-total")).includes(M(fmt(sumC()))) && /14 expenses/.test(await text("expenses-total")), await text("expenses-total"))
    const first = rows("expense-row-").first()
    const firstText = await first.innerText()
    ok("X1 a row shows the day, description, category name, way of paying, reference and amount", /Expense 01/.test(firstText) && /Salaries/.test(firstText) && /Cash/.test(firstText) && /RCPT-0/.test(firstText) && firstText.includes(M("1000.00")), firstText.replace(/\s+/g, " "))
    const bankRow = page.locator('[data-testid^="expense-row-"]', { hasText: "Generator fuel (bank)" })
    ok("X1 a bank-paid row names its bank account", /HBL/.test(await bankRow.innerText()) && /Bank transfer/.test(await bankRow.innerText()))
    ok("X1 the voided row is not listed", (await page.locator('[data-testid^="expense-row-"]', { hasText: "Entered twice" }).count()) === 0)
    ok("X1 the footer says 1-10 of 14", /Showing 1–10 of 14 expenses/.test(await page.getByText(/Showing \d/).first().innerText()))
    i0 = requests.length
    await page.getByRole("button", { name: /next/i }).click(); await page.waitForTimeout(1000)
    const p2 = gets(i0, /^\/expenses$/)
    ok("X1 Next asks page 2 and shows the other four rows", p2.length === 1 && p2[0].query.page === "2" && (await rows("expense-row-").count()) === 4 && /page=2/.test(page.url()))
    await page.getByRole("button", { name: /prev/i }).click(); await page.waitForTimeout(800)
  })

  // ═════════ Expenses: filters ═════════
  await step("Expenses filters", async () => {
    i0 = requests.length
    await pick(page, "Category", "Salaries")
    let q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 a category filter sends categoryId, goes back to page 1 and only that category is listed", q.categoryId === CAT_SAL && q.page === "1" && (await rows("expense-row-").allInnerTexts()).every((t) => /Salaries/.test(t)) && /category=/.test(page.url()), JSON.stringify(q))
    i0 = requests.length
    await pick(page, "Paid by", "Cheque")
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 a way-of-paying filter sends mode=cheque", q.mode === "cheque" && q.categoryId === CAT_SAL)
    i0 = requests.length
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(1000)
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 Clear filters sends none of them again", q.categoryId === undefined && q.mode === undefined && q.search === undefined && q.dateFrom === undefined && !/category=|mode=/.test(page.url()), JSON.stringify(q))
    i0 = requests.length
    await pick(page, "Bank account", "HBL (0011-2233)")
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 a bank filter sends bankAccountId and lists only that account's expense", q.bankAccountId === banks[0].id && (await rows("expense-row-").count()) === 1)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByLabel("Search expenses").fill("fuel"); await page.waitForTimeout(1500)
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 search is debounced into ONE request with search=fuel and finds the row", gets(i0, /^\/expenses$/).length === 1 && q.search === "fuel" && (await rows("expense-row-").count()) === 1)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByLabel("From", { exact: true }).fill("2026-11-05"); await page.getByLabel("To", { exact: true }).fill("2026-11-06"); await page.waitForTimeout(1200)
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    ok("X1 a date range sends dateFrom and dateTo and lists only those days", q.dateFrom === "2026-11-05" && q.dateTo === "2026-11-06" && (await rows("expense-row-").allInnerTexts()).every((t) => /2026-11-0[56]/.test(t)), JSON.stringify(q))
    i0 = requests.length
    await page.getByLabel("From", { exact: true }).fill("2026-11-07"); await page.waitForTimeout(900)
    ok("X1 a start after the end is explained and NO request is sent", (await tid("expenses-range-problem").count()) === 1 && gets(i0, /^\/expenses$/).length === 0)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByLabel("Show voided").check(); await page.waitForTimeout(1000)
    q = gets(i0, /^\/expenses$/).at(-1)?.query ?? {}
    const voidedRow = page.locator('[data-testid^="expense-row-"][data-voided="true"]')
    ok("X1 Show voided sends includeVoided=true and the voided row appears marked, with its reason on open", q.includeVoided === "true" && (await voidedRow.count()) === 1 && /Voided/.test(await voidedRow.innerText()))
    await voidedRow.click(); await tid("expense-dialog").waitFor()
    ok("X1 a voided expense shows the reason and offers neither Correct nor Void", /duplicate/.test(await text("expense-voided")) && (await tid("expense-dialog").getByRole("button", { name: "Correct" }).count()) === 0 && (await tid("expense-dialog").getByRole("button", { name: "Void" }).count()) === 0)
    await tid("expense-dialog").getByRole("button", { name: "Close" }).first().click()
    await page.getByLabel("Show voided").uncheck(); await page.waitForTimeout(800)
  })

  // ═════════ Record an expense ═════════
  await step("Record expense", async () => {
    await page.getByRole("button", { name: "Record expense" }).first().click(); await dialog().waitFor()
    ok("X2 Record is disabled until the date, category, description and amount are there", await dialog().getByRole("button", { name: "Record expense", exact: true }).isDisabled())
    await dialog().locator("#exp-amount").fill("abc"); await pick(dialog(), "Category", "Electricity"); await dialog().locator("#exp-description").fill("Cash for tea")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(500)
    ok("X2 an amount that is not money is explained and NOTHING is sent", /amount/i.test(await text("billing-problem")) && writes(i0, "POST", /^\/expenses$/).length === 0)
    await dialog().locator("#exp-amount").fill("1500")
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1500)
    const post = writes(i0, "POST", /^\/expenses$/)
    ok("X2 a cash expense is ONE POST with exactly the handoff's fields and NO bank account", post.length === 1 && JSON.stringify(Object.keys(post[0].body).sort()) === JSON.stringify(["amount", "categoryId", "date", "description", "mode"]) && post[0].body.mode === "cash" && post[0].body.amount === "1500" && post[0].body.date === TODAY && post[0].body.categoryId === CAT_ELEC, JSON.stringify(post[0]?.body))
    ok("X2 the dialog closes and the list is read again with the new row first", (await dialog().count()) === 0 && gets(i0, /^\/expenses$/).length >= 1 && /Cash for tea/.test(await rows("expense-row-").first().innerText()))
    ok("X2 the total moved by exactly the new amount (the server's figure)", (await text("expenses-total")).includes(M(fmt(sumC()))))

    // bank-paid
    await page.getByRole("button", { name: "Record expense" }).first().click(); await dialog().waitFor()
    await dialog().locator("#exp-amount").fill("2750.50"); await pick(dialog(), "Category", "Salaries"); await dialog().locator("#exp-description").fill("Staff transport"); await dialog().locator("#exp-reference").fill("TRX-9")
    await pick(dialog(), "Paid by", "Card")
    ok("X2 choosing a bank mode asks for the bank account and holds the button until one is chosen", (await dialog().locator("#exp-bank").count()) === 1 && (await dialog().getByRole("button", { name: "Record expense", exact: true }).isDisabled()))
    ok("X2 only ACTIVE bank accounts are offered", await (async () => { await dialog().getByRole("combobox", { name: "Bank account", exact: true }).click(); const names = await page.getByRole("option").allInnerTexts(); await page.keyboard.press("Escape"); return names.length === 2 && !names.some((n) => /Old Bank/.test(n)) })())
    await pick(dialog(), "Bank account", "HBL (0011-2233)")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1500)
    const bp = writes(i0, "POST", /^\/expenses$/)
    ok("X2 a bank-paid expense carries bankAccountId and referenceNo in the SAME single request", bp.length === 1 && bp[0].body.mode === "card" && bp[0].body.bankAccountId === banks[0].id && bp[0].body.referenceNo === "TRX-9" && bp[0].body.amount === "2750.50", JSON.stringify(bp[0]?.body))
    ok("X2 the server posted the bank entry itself (the app sent no /bank-transactions request)", writes(i0, "POST", /^\/bank-transactions/).length === 0 && txs.some((t) => t.kind === "expense" && t.description === "Staff transport"))

    // domain errors
    await page.getByRole("button", { name: "Record expense" }).first().click(); await dialog().waitFor()
    await dialog().locator("#exp-amount").fill("10"); await pick(dialog(), "Category", "Electricity"); await dialog().locator("#exp-description").fill("Future dated"); await dialog().locator("#exp-date").fill("2026-12-01")
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1000)
    ok("X2 DATE_IN_FUTURE (422) is explained in words and the form stays open", /in the future/i.test(await text("create-error")) && (await dialog().count()) === 1)
    await dialog().locator("#exp-date").fill(TODAY)
    expenseHeads[0].active = false
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1000)
    ok("X2 CATEGORY_INACTIVE (422) is explained when the category was switched off meanwhile", /category is inactive/i.test(await text("create-error")))
    expenseHeads[0].active = true
    await dialog().getByRole("button", { name: "Cancel" }).click()

    await page.getByRole("button", { name: "Record expense" }).first().click(); await dialog().waitFor()
    await dialog().locator("#exp-amount").fill("10"); await pick(dialog(), "Category", "Electricity"); await dialog().locator("#exp-description").fill("Inactive bank"); await pick(dialog(), "Paid by", "Cheque"); await pick(dialog(), "Bank account", "Meezan (9988-7766)")
    banks[1].active = false
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1000)
    ok("X2 BANK_ACCOUNT_INACTIVE (422) is explained", /bank account is inactive/i.test(await text("create-error")))
    banks[1].active = true
    await dialog().getByRole("button", { name: "Cancel" }).click()
  })

  // ═════════ Correct and void ═════════
  await step("Correct and void", async () => {
    await page.reload(); await tid("expenses-tab").waitFor(); await page.waitForTimeout(1200)
    const row = page.locator('[data-testid^="expense-row-"]', { hasText: "Cash for tea" })
    await row.click(); await tid("expense-dialog").waitFor()
    ok("X2 the details show everything the server sent, as received", (await tid("expense-dialog").getByTestId("server-document").count()) === 1 && /Cash for tea/.test(await tid("expense-dialog").innerText()))
    await tid("expense-dialog").getByRole("button", { name: "Correct" }).click(); await dialog().waitFor()
    ok("X2 a correction cannot change how it was paid (no mode or bank choice, only the note)", (await dialog().locator("#exp-mode").count()) === 0 && /cannot be changed/.test(await text("exp-paid-by")))
    i0 = requests.length
    await dialog().getByRole("button", { name: "Save correction" }).click(); await page.waitForTimeout(500)
    ok("X2 saving without a change is refused in words and sends NOTHING", /Nothing changed/.test(await text("billing-problem")) && writes(i0, "PATCH", /^\/expenses\//).length === 0)
    const target = expenses.find((e) => e.description === "Cash for tea")
    await dialog().locator("#exp-description").fill("Cash for tea and milk")
    await dialog().getByRole("button", { name: "Save correction" }).click(); await page.waitForTimeout(1500)
    const patch = writes(i0, "PATCH", new RegExp(`^/expenses/${target.id}$`))
    ok("X2 PATCH carries ONLY the changed field plus expectedUpdatedAt", patch.length === 1 && JSON.stringify(Object.keys(patch[0].body).sort()) === JSON.stringify(["description", "expectedUpdatedAt"]) && patch[0].body.description === "Cash for tea and milk", JSON.stringify(patch[0]?.body))
    ok("X2 the list shows the corrected text after the refresh", (await page.locator('[data-testid^="expense-row-"]', { hasText: "Cash for tea and milk" }).count()) === 1)
    // amount spelled differently is not a change
    await page.locator('[data-testid^="expense-row-"]', { hasText: "Cash for tea and milk" }).click(); await tid("expense-dialog").getByRole("button", { name: "Correct" }).click(); await dialog().waitFor()
    i0 = requests.length
    await dialog().locator("#exp-amount").fill("1500.0")
    await dialog().getByRole("button", { name: "Save correction" }).click(); await page.waitForTimeout(500)
    ok("X2 '1500.0' for '1500.00' is the same amount: nothing changed, nothing sent", /Nothing changed/.test(await text("billing-problem")) && writes(i0, "PATCH", /^\/expenses\//).length === 0)
    // stale edit
    await dialog().locator("#exp-description").fill("Edited meanwhile elsewhere")
    A.bumpExpense = target.id
    await dialog().getByRole("button", { name: "Save correction" }).click(); await page.waitForTimeout(1000)
    ok("X2 EXPENSE_CHANGED (409) tells the user it was changed by someone else", /changed by someone else/i.test(await text("create-error")))
    await dialog().getByRole("button", { name: "Cancel" }).click(); await page.waitForTimeout(500)

    // void
    const before = sumC()
    await page.reload(); await tid("expenses-tab").waitFor(); await page.waitForTimeout(1200)
    await page.locator('[data-testid^="expense-row-"]', { hasText: "Staff transport" }).click(); await tid("expense-dialog").waitFor()
    await tid("expense-dialog").getByRole("button", { name: "Void", exact: true }).click(); await dialog().waitFor()
    await dialog().locator("#exp-void-reason").fill("no")
    ok("X2 a reason of fewer than three characters keeps Void disabled", await dialog().getByRole("button", { name: "Void expense" }).isDisabled())
    await dialog().locator("#exp-void-reason").fill("paid twice")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Void expense" }).click(); await page.waitForTimeout(1500)
    const staff = expenses.find((e) => e.description === "Staff transport")
    const vp = writes(i0, "POST", new RegExp(`^/expenses/${staff.id}/void$`))
    ok("X2 void is ONE POST with only the reason", vp.length === 1 && JSON.stringify(vp[0].body) === JSON.stringify({ reason: "paid twice" }))
    ok("X2 the voided expense leaves the list and the server's total drops by its amount", (await page.locator('[data-testid^="expense-row-"]', { hasText: "Staff transport" }).count()) === 0 && (await text("expenses-total")).includes(M(fmt(sumC()))) && sumC() === before - staff.amountC)
  })

  // ═════════ Bank: balances, statement, entries ═════════
  await step("Bank", async () => {
    i0 = requests.length
    await open("bank")
    ok("X3 balances: ONE GET /bank-balances", gets(i0, /^\/bank-balances$/).length === 1)
    const bal = await tid("bank-balances").innerText()
    ok("X3 each active account's balance and the total are the server's figures, as sent", banks.filter((b) => b.active).every((b) => bal.includes(M(fmt(F.balanceOf(b))))) && bal.includes(M(fmt(banks.filter((b) => b.active).reduce((n, b) => n + F.balanceOf(b), 0)))), bal.replace(/\s+/g, " ").slice(0, 200))
    const st = gets(i0, /^\/bank-accounts\/[^/]+\/statement$/)
    ok("X3 the statement is asked for the first active account for this month so far (2026-11-01 to 2026-11-07), once", st.length === 1 && st[0].path.includes(banks[0].id) && st[0].query.dateFrom === "2026-11-01" && st[0].query.dateTo === TODAY, JSON.stringify(st.map((r) => [r.path, r.query])))
    const exp = F.statementOf(banks[0], "2026-11-01", TODAY)
    ok("X3 opening and closing are the server's figures", (await text("statement-opening")) === M(exp.opening) && (await text("statement-closing")) === M(exp.closing), `${await text("statement-opening")} / ${await text("statement-closing")}`)
    ok("X3 the entries table lists every entry in the period with the server's running balance", (await rows("statement-entries-row-").count()) === exp.entries.length && (await tid("statement-entries").innerText()).includes(M(exp.entries.at(-1).runningBalance)))
    i0 = requests.length
    await pick(page, "Statement account", "Meezan (9988-7766)")
    const st2 = gets(i0, /^\/bank-accounts\/[^/]+\/statement$/)
    ok("X3 choosing another account asks ITS statement", st2.length === 1 && st2[0].path.includes(banks[1].id))
    await pick(page, "Statement account", "HBL (0011-2233)")
    i0 = requests.length
    await page.getByLabel("Statement from").fill("2026-11-07"); await page.waitForTimeout(900) // 11-07 to 11-07 is valid and is asked
    i0 = requests.length
    await page.getByLabel("Statement to").fill("2026-11-01"); await page.waitForTimeout(900)
    ok("X3 an inverted period is explained and NO statement is asked", (await page.getByText("Choose a valid period").count()) >= 1 && gets(i0, /statement/).length === 0)
    await page.getByLabel("Statement from").fill("2026-11-01"); await page.getByLabel("Statement to").fill(TODAY); await page.waitForTimeout(900)

    // record an entry
    await page.getByRole("button", { name: "Record entry" }).click(); await dialog().waitFor()
    await dialog().getByRole("combobox", { name: "Kind", exact: true }).click()
    const kinds = await page.getByRole("option").allInnerTexts(); await page.keyboard.press("Escape")
    ok("X4 the entry kinds offered are the five a user may enter; the automatic 'expense' kind is not one of them", kinds.length === 5 && !kinds.some((k) => /^expense/i.test(k)), kinds.join(" | "))
    await dialog().locator("#bank-amount").fill("2500"); await dialog().locator("#bank-description").fill("Cash banked today")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Record entry" }).click(); await page.waitForTimeout(1500)
    const bt = writes(i0, "POST", /^\/bank-transactions$/)
    ok("X4 the entry is ONE POST with exactly the handoff's fields", bt.length === 1 && JSON.stringify(Object.keys(bt[0].body).sort()) === JSON.stringify(["amount", "bankAccountId", "date", "description", "kind"]) && bt[0].body.kind === "deposit" && bt[0].body.bankAccountId === banks[0].id && bt[0].body.date === TODAY, JSON.stringify(bt[0]?.body))
    const exp2 = F.statementOf(banks[0], "2026-11-01", TODAY)
    ok("X4 the statement and the balances are read again; the closing moved by the entry", gets(i0, /statement/).length >= 1 && gets(i0, /^\/bank-balances$/).length >= 1 && (await text("statement-closing")) === M(exp2.closing))

    // void an entry; the automatic expense entry offers no Void
    const depositRow = page.locator('[data-testid^="statement-entries-row-"]', { hasText: "Cash banked today" })
    ok("X4 an entry the user made offers Void; the entry posted by an expense does not", (await depositRow.getByRole("button", { name: /Void entry/ }).count()) === 1 && (await page.locator('[data-testid^="statement-entries-row-"]', { hasText: /Generator fuel/ }).getByRole("button", { name: /Void entry/ }).count()) === 0)
    await depositRow.getByRole("button", { name: /Void entry/ }).click(); await dialog().waitFor()
    await dialog().locator("#bank-void-reason").fill("typed twice")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Void entry", exact: true }).click(); await page.waitForTimeout(1500)
    const dep = txs.find((t) => t.description === "Cash banked today")
    const bv = writes(i0, "POST", new RegExp(`^/bank-transactions/${dep.id}/void$`))
    ok("X4 voiding an entry is ONE POST with only the reason, and the closing is back where it was", bv.length === 1 && JSON.stringify(bv[0].body) === JSON.stringify({ reason: "typed twice" }) && (await text("statement-closing")) === M(F.statementOf(banks[0], "2026-11-01", TODAY).closing))
  })

  // ═════════ Cash drawer ═════════
  await step("Cash drawer", async () => {
    ok("X5 the opening has not been set: the card says so and offers to set it", /not been set/.test(await text("drawer-unset")) && (await page.getByRole("button", { name: "Set the opening cash" }).count()) === 1)
    await page.getByRole("button", { name: "Set the opening cash" }).click(); await dialog().waitFor()
    await dialog().locator("#drawer-amount").fill("15000")
    A.drawer = { amount: "1.00", date: "2026-11-01" } // somebody else set it first
    i0 = requests.length
    await dialog().getByRole("button", { name: "Set opening cash" }).click(); await page.waitForTimeout(1200)
    ok("X5 OPENING_BALANCE_EXISTS (409) is explained and the value is not overwritten", /opening balance already exists/i.test(await text("create-error")) && A.drawer.amount === "1.00")
    await dialog().getByRole("button", { name: "Cancel" }).click()
    A.drawer = null
    await page.reload(); await tid("bank-tab").waitFor(); await page.waitForTimeout(1200)
    await page.getByRole("button", { name: "Set the opening cash" }).click(); await dialog().waitFor()
    await dialog().locator("#drawer-amount").fill("15000")
    i0 = requests.length
    await dialog().getByRole("button", { name: "Set opening cash" }).click(); await page.waitForTimeout(1500)
    const put = writes(i0, "PUT", /^\/cash-drawer\/opening$/)
    ok("X5 setting it is ONE PUT { amount, date } with the hospital's today", put.length === 1 && JSON.stringify(put[0].body) === JSON.stringify({ amount: "15000", date: TODAY }), JSON.stringify(put[0]?.body))
    ok("X5 afterwards the card shows the amount and the day, and there is no way to set it again", (await text("drawer-set")).includes(M("15000.00")) && (await page.getByRole("button", { name: "Set the opening cash" }).count()) === 0)

    // a cash expense before the opening day is refused by the server
    await open("expenses")
    await page.getByRole("button", { name: "Record expense" }).first().click(); await dialog().waitFor()
    await dialog().locator("#exp-amount").fill("10"); await pick(dialog(), "Category", "Electricity"); await dialog().locator("#exp-description").fill("Before the opening"); await dialog().locator("#exp-date").fill("2026-11-05")
    await dialog().getByRole("button", { name: "Record expense", exact: true }).click(); await page.waitForTimeout(1000)
    ok("X2 BEFORE_CASH_OPENING (422) is explained", /before the cash drawer/i.test(await text("create-error")))
    await dialog().getByRole("button", { name: "Cancel" }).click()
  })

  // ═════════ Permissions ═════════
  await step("Permissions", async () => {
    // settings.write is a separate permission: accounts.write alone can record entries but cannot set the drawer's opening
    S.perms = ALL.filter((p) => p !== "settings.write"); await signOutAndIn()
    const kept = A.drawer; A.drawer = null
    await open("bank")
    ok("PERM accounts.write without settings.write: Record entry is offered, setting the opening is NOT", (await page.getByRole("button", { name: "Record entry" }).count()) === 1 && (await page.getByRole("button", { name: "Set the opening cash" }).count()) === 0 && /not been set/.test(await text("drawer-unset")))
    A.drawer = kept

    S.perms = ALL.filter((p) => p !== "accounts.write" && p !== "settings.write"); await signOutAndIn()
    await open("expenses")
    ok("PERM accounts.read only: the list shows and there is NO Record expense button", (await rows("expense-row-").count()) > 0 && (await page.getByRole("button", { name: "Record expense" }).count()) === 0)
    await rows("expense-row-").first().click(); await tid("expense-dialog").waitFor()
    ok("PERM accounts.read only: the details offer neither Correct nor Void", (await tid("expense-dialog").getByRole("button", { name: "Correct" }).count()) === 0 && (await tid("expense-dialog").getByRole("button", { name: "Void", exact: true }).count()) === 0)
    await tid("expense-dialog").getByRole("button", { name: "Close" }).first().click()
    await open("bank")
    ok("PERM accounts.read only: no Record entry, no Void, no way to set the opening", (await page.getByRole("button", { name: "Record entry" }).count()) === 0 && (await page.getByRole("button", { name: /Void entry/ }).count()) === 0 && (await page.getByRole("button", { name: "Set the opening cash" }).count()) === 0)

    S.perms = ALL.filter((p) => p !== "accounts.read" && p !== "accounts.write"); await signOutAndIn()
    i0 = requests.length
    await page.goto(base + "/billing/expenses"); await page.waitForTimeout(1500)
    ok("PERM without accounts.read: /billing/expenses is the 'Not allowed' page (the route guard) and /expenses is NOT asked", /Not allowed/.test(await page.locator("body").innerText()) && gets(i0, /^\/expenses$/).length === 0 && gets(i0, /^\/bank-/).length === 0, page.url().replace(base, "") + " | " + (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-170) + " | " + JSON.stringify(since(i0).filter((r) => r.method === "GET").map((r) => r.path)).slice(0, 120))
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ Failure ═════════
  await step("Failure", async () => {
    A.failAccounts = true
    i0 = requests.length
    await page.goto(base + "/billing/expenses"); await tid("error-state").first().waitFor({ timeout: 25000 }).catch(() => {})
    ok("X1 a failing server shows the error with a retry, not an empty list", (await tid("error-state").count()) >= 1 && (await rows("expense-row-").count()) === 0)
    A.failAccounts = false
    await page.waitForTimeout(6000) // the retry button may wait out a cool-down
    await page.getByRole("button", { name: /try again|retry/i }).first().click({ timeout: 15000 }); await page.waitForTimeout(1500)
    ok("X1 Retry reads the list again and shows the rows", (await rows("expense-row-").count()) > 0)
  })

  ok("the fake saw no request that broke the spec or the handoff's rules", violations.length === 0, violations.slice(0, 3).join(" | "))
  ok("no console error or page error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "))
  await browser.close()
  for (const [s, n, e] of results) console.log(`${s} ${n}${e && s === "FAIL" ? "  -> " + e : ""}`)
  console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`)
})().catch((e) => { console.log("SCRIPT ERROR", e.stack || e); process.exit(1) })
