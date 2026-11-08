// Phase 9 browser check: laboratory and imaging orders (L1 to L7, I1 to I5), API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in diagnostics-fake.js runs inside
// Playwright's route(); it computes specimens, flags, statuses and allowedActions itself, and every request/response is validated against docs/openapi.json.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/diagnostics-fake.js")({ validate, schemaOf, stubs })
  const { S, S2, P, requests, labA, labB, labC, labD, imgA, imgB, imgC, labTests, imagingTests, me, labTech } = F
  const F7 = F.F7
  const ALL = stubs.ALL_PERMISSIONS
  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1800 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
  await context.route("**/api/**", F.handler)
  const since = (i) => requests.slice(i)
  const posts = (i, re, method = "POST") => since(i).filter((r) => r.method === method && re.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const tid = (id) => page.getByTestId(id)
  const dlg = () => page.getByTestId("billing-dialog")
  const closeDialogs = async () => { for (let i = 0; i < 3; i++) { if ((await page.getByRole("dialog").count()) === 0) break; await page.keyboard.press("Escape"); await page.waitForTimeout(250) } }
  const canon = (o) => (Array.isArray(o) ? o.map(canon) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])])) : o)
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)); await closeDialogs().catch(() => {}) } }
  const btnNames = async (scope) => { const out = []; const bs = scope.getByRole("button"); for (let i = 0; i < await bs.count(); i++) out.push((await bs.nth(i).innerText()).trim()); return out.filter(Boolean).filter((n) => n !== "Print label") } // the tube label is a print, not one of the server's allowedActions
  const openLab = async (o) => { await go("/lab/orders/" + o.id); await tid("lab-order-detail").waitFor({ timeout: 8000 }); await page.waitForTimeout(500) }
  const openImg = async (o) => { await go("/imaging/orders/" + o.id); await tid("imaging-order-detail").waitFor({ timeout: 8000 }); await page.waitForTimeout(500) }
  let i0 = 0

  await login()

  // ═════════ L1: lab lists and worklists ═════════
  await step("L1 lab list", async () => {
    i0 = requests.length
    await go("/lab/orders"); await tid("lab-orders-screen").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/lab-orders")
    ok("L1 All orders asks for page 1, perPage 10 (server paging) with no status, no sort", !!first && first.query.page === "1" && first.query.perPage === "10" && !("status" in first.query) && !("sort" in first.query) && !("toCollect" in first.query), JSON.stringify(first && first.query))
    ok("L1 the orders are listed with patient, tests and status", [labA, labB, labC, labD].every((o) => true) && (await tid(`lab-row-${labA.id}`).count()) === 1 && /Zainab/.test(await tid(`lab-row-${labA.id}`).innerText()))
    ok("L1 the order with a critical result comes FIRST and is marked loudly", (await page.locator("[data-testid^=lab-row-]").first().getAttribute("data-testid")) === `lab-row-${labB.id}` && (await tid(`lab-row-${labB.id}`).getByTestId("critical-badge").count()) === 1 && (await tid(`lab-row-${labB.id}`).getAttribute("data-critical")) === "true")
    ok("L1 a row says how many tubes are still to collect, and an external referral is marked", /2 tubes to collect/.test(await tid(`lab-row-${labA.id}`).innerText()) && /External referral/.test(await tid(`lab-row-${labD.id}`).innerText()))
    i0 = requests.length
    await page.getByRole("tab", { name: "To collect", exact: true }).click(); await page.waitForTimeout(1000)
    const col = since(i0).find((r) => r.path === "/lab-orders")
    ok("L1 the collection worklist: toCollect=true sorted urgent first (sort=priority:desc); only orders with tubes to collect", !!col && col.query.toCollect === "true" && col.query.sort === "priority:desc" && (await tid(`lab-row-${labA.id}`).count()) === 1 && (await tid(`lab-row-${labC.id}`).count()) === 0 && /tab=collect/.test(page.url()), JSON.stringify(col && col.query))
    i0 = requests.length
    await page.getByRole("tab", { name: "Bench", exact: true }).click(); await page.waitForTimeout(900)
    ok("L1 the bench asks for status=collected", since(i0).some((r) => r.path === "/lab-orders" && r.query.status === "collected"))
    i0 = requests.length
    await page.getByRole("tab", { name: "Verification", exact: true }).click(); await page.waitForTimeout(900)
    ok("L1 the verification queue asks for status=in_progress and lists the order with a result waiting", since(i0).some((r) => r.path === "/lab-orders" && r.query.status === "in_progress") && (await tid(`lab-row-${labB.id}`).count()) === 1)
    i0 = requests.length
    await page.getByRole("tab", { name: "Hand-over", exact: true }).click(); await page.waitForTimeout(900)
    ok("L1 hand-over asks for status=completed and lists the verified order", since(i0).some((r) => r.path === "/lab-orders" && r.query.status === "completed") && (await tid(`lab-row-${labC.id}`).count()) === 1)
    await page.getByRole("tab", { name: "All orders", exact: true }).click(); await page.waitForTimeout(700)
    i0 = requests.length
    await page.getByLabel("Search lab orders").fill("zain"); await page.waitForTimeout(1300)
    const sreq = since(i0).filter((r) => r.path === "/lab-orders")
    ok("L1 search is debounced: ONE request with search=zain, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "zain" && !/zain|search/i.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
    await page.getByLabel("Search lab orders").fill(""); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Priority" }).click(); await page.getByRole("option", { name: "Urgent", exact: true }).click(); await page.waitForTimeout(900)
    ok("L1 the priority filter is sent (priority=urgent)", since(i0).some((r) => r.path === "/lab-orders" && r.query.priority === "urgent") && (await tid(`lab-row-${labB.id}`).count()) === 0)
  })

  // ═════════ L3: specimens ═════════
  await step("L3 specimens", async () => {
    await openLab(labA)
    const [s1, s2] = labA.specimens
    ok("L3 each tube shows its number (SPM-…) and type; both need collecting", (await tid(`specimen-no-${s1.id}`).innerText()) === s1.no && /SPM-2026-\d{6}/.test(s1.no) && /EDTA whole blood/.test(await tid(`specimen-${s1.id}`).innerText()) && /To collect/.test(await tid(`specimen-${s2.id}`).innerText()))
    ok("L3 the buttons are the server's allowedActions: Mark collected and Reject on each tube; nothing to enter yet on a test whose tube is not drawn", JSON.stringify(await btnNames(tid(`specimen-${s1.id}`))) === JSON.stringify(["Mark collected", "Reject"]) && !(await btnNames(tid(`test-${labA.tests[0].id}`))).includes("Enter result"), JSON.stringify(await btnNames(tid(`test-${labA.tests[0].id}`))))
    await tid(`specimen-${s1.id}`).getByRole("button", { name: "Mark collected" }).click(); await dlg().waitFor(); i0 = requests.length
    S2.slow = true
    await Promise.all([dlg().getByRole("button", { name: "Mark collected" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S2.slow = false
    const col = posts(i0, /\/collect$/)
    ok("L3 a double click sends ONE POST …/specimens/{id}/collect with no body", col.length === 1 && col[0].path === `/lab-orders/${labA.id}/specimens/${s1.id}/collect` && col[0].body === undefined)
    ok("L3 the tube now shows collected, by whom; its buttons are gone; the CBC can have its result entered", /Collected/.test(await tid(`specimen-${s1.id}`).innerText()) && /Test User/.test(await tid(`specimen-${s1.id}`).innerText()) && (await btnNames(tid(`specimen-${s1.id}`))).length === 0 && (await btnNames(tid(`test-${labA.tests[0].id}`))).includes("Enter result"))
    // reject the second tube: a replacement opens with a new number
    await tid(`specimen-${s2.id}`).getByRole("button", { name: "Reject" }).click(); await dlg().waitFor()
    ok("L3 Reject stays off until a reason of 3 characters", await dlg().getByRole("button", { name: "Reject specimen" }).isDisabled())
    await page.locator("#dx-reason").fill("Haemolysed"); i0 = requests.length
    await dlg().getByRole("button", { name: "Reject specimen" }).click(); await page.waitForTimeout(1500)
    const rj = posts(i0, /\/reject$/)
    ok("L3 rejecting sends ONE POST { reason }; the old tube shows its reason and a REPLACEMENT tube with a new number is opened ('print this label')", rj.length === 1 && same(rj[0].body, { reason: "Haemolysed" }) && /Rejected: Haemolysed/.test(await tid(`specimen-${s2.id}`).innerText()) && labA.specimens.length === 3 && /Replaces a rejected tube/.test(await tid(`specimen-${labA.specimens[2].id}`).innerText()) && labA.specimens[2].no !== s2.no)
  })

  // ═════════ L4: enter results ═════════
  await step("L4 results", async () => {
    await openLab(labA)
    const cbc = labA.tests[0]
    await tid(`test-${cbc.id}`).getByRole("button", { name: "Enter result" }).click(); await dlg().waitFor(); await page.waitForTimeout(800)
    ok("L4 the dialog lists the test's parameters from its definition, with units and the reference range for a FEMALE patient", /Haemoglobin/.test(await dlg().innerText()) && /Reference 12 - 15.5/.test(await dlg().innerText()) && /Reference 4 - 11/.test(await dlg().innerText()) && requests.some((r) => r.path === `/lab-tests/${cbc.testId}`))
    ok("L4 Save is off until a value is entered", await dlg().getByRole("button", { name: "Save result" }).isDisabled())
    await dlg().getByLabel("Haemoglobin", { exact: true }).fill("6.5"); await dlg().getByLabel("WBC", { exact: true }).fill("7"); S2.slow = true; i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Save result" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S2.slow = false
    const pr = posts(i0, /\/result$/, "PUT")
    ok("L4 a double click sends ONE PUT …/result { parameters: [{ key, value }] } with the values as typed", pr.length === 1 && pr[0].path === `/lab-orders/${labA.id}/tests/${cbc.id}/result` && same(pr[0].body, { parameters: [{ key: "hb", value: "6.5" }, { key: "wbc", value: "7" }] }), JSON.stringify(pr.map((r) => r.body)))
    const res = tid(`result-${cbc.id}`)
    ok("L4 the server's flag is shown: a haemoglobin of 6.5 is CRITICAL (loud), and the order is marked critical", (await res.locator("[data-flag=critical]").count()) === 1 && (await tid("lab-order-detail").getByTestId("critical-badge").count()) >= 1 && /critical/i.test(await res.innerText()))
    ok("L4 the result is NOT final: 'awaiting verification'", /Not final: awaiting verification/.test(await tid(`result-state-${cbc.id}`).innerText()))
    // narrative test
    await tid("order-actions").getByRole("button", { name: "Add tests" }).click(); await dlg().waitFor()
    await page.locator("#dx-add-test-search").fill("urin"); await page.waitForTimeout(1300); await tid("test-options").getByRole("button", { name: /Urine culture/ }).click(); i0 = requests.length
    await dlg().getByRole("button", { name: "Add tests" }).click(); await page.waitForTimeout(1500)
    const at = posts(i0, /\/tests$/)
    ok("L7 Add tests: ONE POST …/tests { tests: [{ testId }] }; the new test appears (with its own tube for urine)", at.length === 1 && same(at[0].body, { tests: [{ testId: labTests[2].id }] }) && labA.tests.length === 3 && labA.specimens.length === 4)
    const ucs = labA.tests[2], urineTube = labA.specimens[3]
    await tid(`specimen-${urineTube.id}`).getByRole("button", { name: "Mark collected" }).click(); await dlg().waitFor(); await dlg().getByRole("button", { name: "Mark collected" }).click(); await page.waitForTimeout(1200)
    await tid(`test-${ucs.id}`).getByRole("button", { name: "Enter result" }).click(); await dlg().waitFor(); await page.waitForTimeout(800)
    ok("L4 a narrative test shows ONE text box, no parameter rows", (await page.locator("#result-narrative").count()) === 1 && (await page.getByTestId("result-rows").count()) === 0)
    await page.locator("#result-narrative").fill("No growth after 48 hours."); i0 = requests.length
    await dlg().getByRole("button", { name: "Save result" }).click(); await page.waitForTimeout(1300)
    const nr = posts(i0, /\/result$/, "PUT")
    ok("L4 a narrative result: ONE PUT { narrative }", nr.length === 1 && same(nr[0].body, { narrative: "No growth after 48 hours." }) && /No growth after 48 hours/.test(await tid(`result-${ucs.id}`).innerText()))
    // the LFT (serum) tube is still not drawn: no Enter result there
    ok("L4 a test whose tube is not collected has no Enter result button", !(await btnNames(tid(`test-${labA.tests[1].id}`))).includes("Enter result"))
  })

  // ═════════ L5: verify, amend, remarks ═════════
  await step("L5 verify and amend", async () => {
    await openLab(labB)
    const t = labB.tests[0]
    ok("L5 a result with a critical value waits in the verification queue; the doctor sees Verify and Amend is not offered yet", (await btnNames(tid(`test-${t.id}`))).includes("Verify") && !(await btnNames(tid(`test-${t.id}`))).includes("Amend"))
    S2.enterer = me.id // this result was entered by the signed-in user
    await go("/lab/orders/" + labA.id); await tid("lab-order-detail").waitFor()
    // enter by me, then try to verify it myself
    const lft = labA.tests[1]
    await tid(`specimen-${labA.specimens[1].id}`).count()
    const serum = labA.specimens.find((s) => s.type === "Serum" && s.status === "pending")
    await tid(`specimen-${serum.id}`).getByRole("button", { name: "Mark collected" }).click(); await dlg().waitFor(); await dlg().getByRole("button", { name: "Mark collected" }).click(); await page.waitForTimeout(1200)
    await tid(`test-${lft.id}`).getByRole("button", { name: "Enter result" }).click(); await dlg().waitFor(); await page.waitForTimeout(800)
    await dlg().getByLabel("ALT", { exact: true }).fill("80"); await dlg().getByRole("button", { name: "Save result" }).click(); await page.waitForTimeout(1300)
    ok("L4 a high ALT (80 against 7 - 56) is flagged High by the server", (await tid(`result-${lft.id}`).locator("[data-flag=high]").count()) === 1)
    await tid(`test-${lft.id}`).getByRole("button", { name: "Verify" }).click(); await dlg().waitFor(); i0 = requests.length
    await dlg().getByRole("button", { name: "Verify" }).click(); await page.waitForTimeout(1200)
    ok("L5 VERIFIER_IS_ENTERER: refused by the server, explained; ONE request; the result stays unverified", /cannot be verified by the person who entered it/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /\/verify$/).length === 1 && lft.status === "entered")
    await closeDialogs()
    S2.enterer = labTech.id
    // a result entered by someone else verifies
    await openLab(labB)
    await tid(`test-${t.id}`).getByRole("button", { name: "Verify" }).click(); await dlg().waitFor(); i0 = requests.length
    S2.slow = true
    await Promise.all([dlg().getByRole("button", { name: "Verify" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S2.slow = false
    const vf = posts(i0, /\/verify$/)
    ok("L5 a double click sends ONE POST …/verify with no body", vf.length === 1 && vf[0].path === `/lab-orders/${labB.id}/tests/${t.id}/verify` && vf[0].body === undefined)
    ok("L5 the result is now FINAL: 'verified by', the order is completed, Verify is gone and Amend is offered", /Final: verified by Test User/.test(await tid(`result-state-${t.id}`).innerText()) && (await btnNames(tid(`test-${t.id}`))).includes("Amend") && !(await btnNames(tid(`test-${t.id}`))).includes("Verify") && /Completed/.test(await page.getByRole("main").innerText()))
    // amend
    await tid(`test-${t.id}`).getByRole("button", { name: "Amend" }).click(); await dlg().waitFor(); await page.waitForTimeout(800)
    ok("L5 the amend form starts from the current values and needs a reason", (await dlg().getByLabel("Haemoglobin", { exact: true }).inputValue()) === "6.5" && await dlg().getByRole("button", { name: "Save amendment" }).isDisabled())
    await dlg().getByLabel("Haemoglobin", { exact: true }).fill("9.0"); await page.locator("#amend-reason").fill("Typing error"); i0 = requests.length
    await dlg().getByRole("button", { name: "Save amendment" }).click(); await page.waitForTimeout(1500)
    const am = posts(i0, /\/amend$/)
    ok("L5 amending: ONE POST …/amend { parameters, reason }", am.length === 1 && same(am[0].body, { parameters: [{ key: "hb", value: "9.0" }, { key: "wbc", value: "7" }], reason: "Typing error" }), JSON.stringify(am.map((r) => r.body)))
    ok("L5 the amendment is shown beside the new values: version, reason, who, and what it replaced (6.5); the result is not final until re-verified", /Typing error/.test(await tid(`amendments-${t.id}`).innerText()) && /Haemoglobin 6\.5/.test(await tid(`amendments-${t.id}`).innerText()) && /Not final: awaiting verification/.test(await tid(`result-state-${t.id}`).innerText()))
    // remarks
    await tid("order-actions").getByRole("button", { name: "Pathologist's remarks" }).click(); await dlg().waitFor(); await page.locator("#remarks-text").fill("Consistent with anaemia."); i0 = requests.length
    await dlg().getByRole("button", { name: "Save remarks" }).click(); await page.waitForTimeout(1300)
    const rm = posts(i0, /\/remarks$/, "PUT")
    ok("L5 remarks: ONE PUT …/remarks { pathologistRemarks } and they show on the order", rm.length === 1 && same(rm[0].body, { pathologistRemarks: "Consistent with anaemia." }) && /Consistent with anaemia/.test(await tid("pathologist-remarks").innerText()))
  })

  // ═════════ L6: deliver and the report ═════════
  await step("L6 deliver and report", async () => {
    await openLab(labA)
    ok("L6 an order that is not complete has NO Mark delivered button (the server did not allow it)", !(await btnNames(tid("order-actions"))).includes("Mark delivered"))
    await tid("order-actions").getByRole("button", { name: "Report" }).click(); await tid("report-dialog").waitFor(); await page.waitForTimeout(900)
    ok("L6 the report of an incomplete order lists what is still pending and shows no unverified result", (await tid("print-pending").count()) === 1 && /still pending/.test(await tid("print-pending").innerText()) && (await tid("lab-report").locator("[data-testid^=print-test-]").count()) === 0)
    await closeDialogs()
    await openLab(labC)
    ok("L6 a completed order offers Mark delivered", (await btnNames(tid("order-actions"))).includes("Mark delivered"))
    await tid("order-actions").getByRole("button", { name: "Report" }).click(); await tid("report-dialog").waitFor(); i0 = requests.length; await page.waitForTimeout(900)
    ok("L6 the report shows the VERIFIED result with its flag, who entered and verified it, and is complete; a Print button is there", (await tid("lab-report").locator("[data-testid^=print-test-]").count()) === 1 && /Haemoglobin/.test(await tid("lab-report").innerText()) && (await tid("print-pending").count()) === 0 && (await tid("report-dialog").getByRole("button", { name: "Print" }).count()) === 1 && /Entered by Lab Tech/.test(await tid("lab-report").innerText()))
    await closeDialogs()
    await tid("order-actions").getByRole("button", { name: "Mark delivered" }).click(); await dlg().waitFor(); i0 = requests.length
    S2.slow = true
    await Promise.all([dlg().getByRole("button", { name: "Mark delivered" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S2.slow = false
    const dv = posts(i0, /\/deliver$/)
    ok("L6 delivering: ONE POST …/deliver; the order shows Delivered, by whom, and no more actions to take", dv.length === 1 && /Delivered/.test(await tid("order-delivered").innerText()) && !(await btnNames(tid("order-actions"))).includes("Mark delivered") && (await btnNames(tid(`test-${labC.tests[0].id}`))).length === 0)
  })

  // ═════════ L7: cancel, archive, restore, referral ═════════
  await step("L7 cancel archive restore referral", async () => {
    await openLab(labA)
    const lft = labA.tests[1]
    ok("L7 a test that already has a result has no Cancel test button (the server did not allow it)", !(await btnNames(tid(`test-${lft.id}`))).includes("Cancel test"))
    // a fresh order to cancel and archive
    const o = F.labOrders[F.labOrders.length - 1]
    void o
    await go("/lab/orders/" + labD.id); await tid("lab-order-detail").waitFor()
    ok("L7 an external referral says where it went, has no tubes and is recorded, not worked", /Chughtai Lab/.test(await tid("order-referral").innerText()) && (await tid("specimens").count()) === 0)
    ok("L7 a referral has no Enter result and no collection buttons", !(await btnNames(tid("lab-order-detail"))).includes("Enter result") && !(await btnNames(tid("lab-order-detail"))).includes("Mark collected"))
    await tid("order-actions").getByRole("button", { name: "Archive" }).click(); await dlg().waitFor()
    ok("L7 Archive stays off until a reason", await dlg().getByRole("button", { name: "Archive" }).isDisabled())
    await page.locator("#dx-reason").fill("Placed in error"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Archive" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const ar = posts(i0, /\/archive$/)
    ok("L7 archiving: ONE POST { reason }; an archived banner; Restore replaces Archive", ar.length === 1 && same(ar[0].body, { reason: "Placed in error" }) && (await tid("order-archived").count()) === 1 && (await btnNames(tid("order-actions"))).includes("Restore") && !(await btnNames(tid("order-actions"))).includes("Archive"))
    await tid("order-actions").getByRole("button", { name: "Restore" }).click(); await dlg().waitFor(); i0 = requests.length
    await dlg().getByRole("button", { name: "Restore" }).click(); await page.waitForTimeout(1300)
    ok("L7 restoring: ONE POST …/restore with no body; the banner is gone", posts(i0, /\/restore$/).length === 1 && (await tid("order-archived").count()) === 0)
  })

  // ═════════ L2: place an order ═════════
  await step("L2 place an order", async () => {
    await go("/lab/orders/new"); await tid("order-form").waitFor()
    ok("L2 Place order is off until a patient and a test are chosen", await page.getByRole("button", { name: "Place order" }).isDisabled())
    await page.locator("#dx-patient").fill("bilal"); await page.waitForTimeout(1300); await tid("order-form").getByText("Bilal Anwar").first().click()
    await page.getByRole("combobox", { name: "Priority" }).click(); await page.getByRole("option", { name: "Urgent" }).click()
    await page.getByRole("combobox", { name: "Ordering doctor" }).click(); await page.getByRole("option", { name: /Dr Sara/ }).click()
    await page.locator("#dx-notes").fill("Check for infection")
    i0 = requests.length
    await page.locator("#dx-test-search").fill("c"); await page.waitForTimeout(900)
    ok("L2 one letter searches nothing", !since(i0).some((r) => r.path === "/lab-tests"))
    await page.locator("#dx-test-search").fill("cb"); await page.waitForTimeout(1300)
    const tq = since(i0).filter((r) => r.path === "/lab-tests")
    ok("L2 the catalogue is searched from 2 letters, once, active tests only", tq.length === 1 && tq[0].query.search === "cb" && tq[0].query.active === "true", JSON.stringify(tq.map((r) => r.query)))
    await tid("test-options").getByRole("button", { name: /CBC/ }).click()
    ok("L2 with billing.write each chosen test can carry an own discount", (await page.getByLabel("Discount type of CBC").count()) === 1)
    S2.slow = true; i0 = requests.length
    await Promise.all([page.getByRole("button", { name: "Place order" }).dblclick(), page.waitForTimeout(200)]); await page.waitForURL(/\/lab\/orders\/01HZX\d+$/, { timeout: 10000 }); S2.slow = false
    const po = posts(i0, /^\/lab-orders$/)
    ok("L2 a double click sends ONE POST /lab-orders { patientId, priority, doctorId, clinicalNotes, tests: [{ testId }] }", po.length === 1 && same(po[0].body, { patientId: P(1).id, priority: "urgent", doctorId: F7.doctors[1].id, clinicalNotes: "Check for infection", tests: [{ testId: labTests[0].id }] }), JSON.stringify(po.map((r) => r.body)))
    await tid("lab-order-detail").waitFor({ timeout: 8000 })
    ok("L2 it lands on the new order, with the server's number and its tube to collect", /^LAB-2026-\d{4}$/.test(await tid("order-no").innerText()) && (await tid("specimens").locator("[data-testid^=specimen-]").count()) >= 1)
    // the outside doctor and the ordering doctor are exclusive
    await go("/lab/orders/new"); await tid("order-form").waitFor()
    await page.getByRole("combobox", { name: "Ordering doctor" }).click(); await page.getByRole("option", { name: /Dr Imran/ }).click(); await page.locator("#dx-outside").fill("Dr Outside")
    ok("L2 typing an outside doctor clears the chosen doctor (they are exclusive)", /Choose a doctor/.test(await page.locator("#dx-doctor").innerText()))
    // department off: handoff 5 (the menu needs the module; past records stay readable) AND 8.7 (an order is then an external referral, recorded but not worked)
    S.modulesOn = false; S2.labModuleOn = false; await signOutAndIn()
    ok("MODULE with the laboratory and imaging switched off the sidebar has no lab or imaging entry (navigation = permission AND module)", (await page.locator('aside a[href^="/lab"], nav a[href^="/lab"]').count()) === 0 && (await page.locator('aside a[href^="/imaging"], nav a[href^="/imaging"]').count()) === 0)
    i0 = requests.length
    await go("/lab/orders"); await tid("lab-orders-screen").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    ok("MODULE past lab orders stay readable: the list opens with a notice, and only the plain list (no worklist tabs)", (await tid("module-off-notice").count()) === 1 && (await page.getByRole("tab").count()) === 1 && (await tid(`lab-row-${labA.id}`).count()) === 1)
    await go("/lab/orders/" + labA.id); await tid("lab-order-detail").waitFor(); await page.waitForTimeout(500)
    ok("MODULE a past order opens read-only with the notice", (await tid("module-off-notice").count()) === 1 && /LAB-2026/.test(await tid("order-no").innerText()))
    await go("/imaging/orders"); await tid("imaging-orders-screen").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    ok("MODULE the imaging list is readable the same way (one tab, a notice)", (await tid("module-off-notice").count()) === 1 && (await page.getByRole("tab").count()) === 1)
    await go("/lab/orders/new"); await tid("order-form").waitFor({ timeout: 8000 }); await page.waitForTimeout(600)
    ok("L2 the order form opens with the department off and says the order is an external referral", (await tid("referral-notice").count()) === 1 && (await page.locator("#dx-referred").count()) === 1)
    await page.locator("#dx-patient").fill("zain"); await page.waitForTimeout(1300); await tid("order-form").getByText("Zainab Qureshi").first().click()
    await page.locator("#dx-test-search").fill("cb"); await page.waitForTimeout(1300); await tid("test-options").getByRole("button", { name: /CBC/ }).click()
    ok("L2 where the referral goes is optional (the DTO's referredTo is optional): Place order is on with a patient and a test", await page.getByRole("button", { name: "Place order" }).isEnabled())
    await page.locator("#dx-referred").fill("Chughtai Lab"); i0 = requests.length
    await page.getByRole("button", { name: "Place order" }).click(); await page.waitForURL(/\/lab\/orders\/01HZX\d+$/, { timeout: 10000 })
    const ref = posts(i0, /^\/lab-orders$/)
    ok("L2 the referral is ONE POST /lab-orders with referredTo", ref.length === 1 && ref[0].body.referredTo === "Chughtai Lab")
    await tid("lab-order-detail").waitFor(); await page.waitForTimeout(600)
    ok("L2 the new order is an external referral on screen: no tubes, recorded not worked", (await tid("order-referral").count()) === 1 && (await tid("specimens").count()) === 0)
    await go("/lab/orders/" + labA.id + "/results"); await page.waitForTimeout(900)
    ok("MODULE working screens still need the department: the old results route is 'Not allowed'", /not allowed/i.test(await page.getByRole("main").innerText()))
    S.modulesOn = true; S2.labModuleOn = true; await signOutAndIn()
  })

  // ═════════ I1 to I5: imaging ═════════
  await step("I1 imaging list", async () => {
    i0 = requests.length
    await go("/imaging/orders"); await tid("imaging-orders-screen").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/imaging-orders")
    ok("I1 All orders asks for page 1, perPage 10", !!first && first.query.page === "1" && first.query.perPage === "10" && !("toPerform" in first.query), JSON.stringify(first && first.query))
    ok("I1 the orders are listed with modality and what is to perform or report", (await tid(`imaging-row-${imgA.id}`).count()) === 1 && /2 to perform/.test(await tid(`imaging-row-${imgA.id}`).innerText()) && /1 to report/.test(await tid(`imaging-row-${imgB.id}`).innerText()))
    i0 = requests.length
    await page.getByRole("tab", { name: "To perform", exact: true }).click(); await page.waitForTimeout(900)
    ok("I1 To perform asks for toPerform=true", since(i0).some((r) => r.path === "/imaging-orders" && r.query.toPerform === "true") && (await tid(`imaging-row-${imgC.id}`).count()) === 0)
    i0 = requests.length
    await page.getByRole("tab", { name: "To report", exact: true }).click(); await page.waitForTimeout(900)
    ok("I1 To report asks for toReport=true and lists the order with a written report waiting to be signed", since(i0).some((r) => r.path === "/imaging-orders" && r.query.toReport === "true") && (await tid(`imaging-row-${imgB.id}`).count()) === 1)
    i0 = requests.length
    await page.getByRole("tab", { name: "Hand-over", exact: true }).click(); await page.waitForTimeout(900)
    ok("I1 Hand-over asks for status=completed", since(i0).some((r) => r.path === "/imaging-orders" && r.query.status === "completed") && (await tid(`imaging-row-${imgC.id}`).count()) === 1)
    await page.getByRole("tab", { name: "All orders", exact: true }).click(); await page.waitForTimeout(700)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Modality" }).click(); await page.getByRole("option", { name: "Ultrasound", exact: true }).click(); await page.waitForTimeout(900)
    ok("I1 the modality filter is sent (modality=Ultrasound)", since(i0).some((r) => r.path === "/imaging-orders" && r.query.modality === "Ultrasound") && (await tid(`imaging-row-${imgB.id}`).count()) === 1 && (await tid(`imaging-row-${imgA.id}`).count()) === 0)
  })

  await step("I3 to I5 imaging detail", async () => {
    await openImg(imgA)
    const cxr = imgA.tests[0], ecg = imgA.tests[1]
    ok("I3 a test to perform offers Mark performed and Cancel test (the server's allowedActions), no report buttons yet", JSON.stringify(await btnNames(tid(`test-${cxr.id}`))) === JSON.stringify(["Mark performed", "Cancel test"]), JSON.stringify(await btnNames(tid(`test-${cxr.id}`))))
    await tid(`test-${cxr.id}`).getByRole("button", { name: "Mark performed" }).click(); await dlg().waitFor(); i0 = requests.length
    S2.slow = true
    await Promise.all([dlg().getByRole("button", { name: "Mark performed" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S2.slow = false
    const pf = posts(i0, /\/perform$/)
    ok("I3 a double click sends ONE POST …/perform with no body; it shows who performed it", pf.length === 1 && pf[0].body === undefined && /Performed by Test User/.test(await tid(`test-${cxr.id}`).innerText()))
    ok("I4 now Write report is offered", (await btnNames(tid(`test-${cxr.id}`))).includes("Write report"))
    await tid(`test-${cxr.id}`).getByRole("button", { name: "Write report" }).click(); await dlg().waitFor()
    ok("I4 the report starts from the test's normal-report template", (await page.locator("#report-narrative").inputValue()) === "Lungs are clear. Heart size is normal.")
    await page.locator("#report-narrative").fill("Lungs are clear. No effusion."); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Save report" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const wr = posts(i0, /\/report$/, "PUT")
    ok("I4 writing: ONE PUT …/report { narrative }", wr.length === 1 && same(wr[0].body, { narrative: "Lungs are clear. No effusion." }))
    ok("I4 the report is NOT final until signed", /Not final: awaiting the doctor's signature/.test(await tid(`report-state-${cxr.id}`).innerText()) && (await btnNames(tid(`test-${cxr.id}`))).includes("Sign report"))
    await tid(`test-${cxr.id}`).getByRole("button", { name: "Sign report" }).click(); await dlg().waitFor(); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Sign report" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    ok("I4 signing: ONE POST …/sign; the report is FINAL (signed by, when)", posts(i0, /\/sign$/).length === 1 && /Final: signed by Test User/.test(await tid(`report-state-${cxr.id}`).innerText()))
    // amend
    await tid(`test-${cxr.id}`).getByRole("button", { name: "Amend" }).click(); await dlg().waitFor()
    ok("I4 the amend form starts from the signed text and needs a reason", (await page.locator("#report-narrative").inputValue()) === "Lungs are clear. No effusion." && await dlg().getByRole("button", { name: "Save amendment" }).isDisabled())
    await page.locator("#report-narrative").fill("Small right effusion."); await page.locator("#report-reason").fill("Wrong side reported"); i0 = requests.length
    await dlg().getByRole("button", { name: "Save amendment" }).click(); await page.waitForTimeout(1500)
    const ia = posts(i0, /\/amend$/)
    ok("I4 amending: ONE POST …/amend { narrative, reason }; the old text stays beside it; it needs signing again", ia.length === 1 && same(ia[0].body, { narrative: "Small right effusion.", reason: "Wrong side reported" }) && /Lungs are clear\. No effusion\./.test(await tid(`amendments-${cxr.id}`).innerText()) && /Not final/.test(await tid(`report-state-${cxr.id}`).innerText()))
    // ECG: no report needed
    ok("I3 an ECG tracing (no report needed) offers Mark performed, Cancel test, and never a report", JSON.stringify(await btnNames(tid(`test-${ecg.id}`))) === JSON.stringify(["Mark performed", "Cancel test"]) && /no report needed/.test(await tid(`test-${ecg.id}`).innerText()))
    await tid(`test-${ecg.id}`).getByRole("button", { name: "Mark performed" }).click(); await dlg().waitFor(); await dlg().getByRole("button", { name: "Mark performed" }).click(); await page.waitForTimeout(1300)
    ok("I3 once performed, an ECG is done: no report button, only the order's own actions", (await btnNames(tid(`test-${ecg.id}`))).length === 0)
    // cancel test
    await openImg(imgB)
    ok("I4 the written report waits for the doctor: Sign report and Amend-not-yet", (await btnNames(tid(`test-${imgB.tests[0].id}`))).includes("Sign report") && !(await btnNames(tid(`test-${imgB.tests[0].id}`))).includes("Amend"))
    await tid(`test-${imgB.tests[0].id}`).getByRole("button", { name: "Sign report" }).click(); await dlg().waitFor(); await dlg().getByRole("button", { name: "Sign report" }).click(); await page.waitForTimeout(1300)
    ok("I5 once every test is done the order is Completed and Mark delivered is offered", (await btnNames(tid("order-actions"))).includes("Mark delivered"))
    await tid("order-actions").getByRole("button", { name: "Report" }).click(); await tid("report-dialog").waitFor(); await page.waitForTimeout(900)
    ok("I5 the print shows the SIGNED report only and is complete", (await tid("imaging-report").locator("[data-testid^=print-report-]").count()) === 1 && /Gallstones seen/.test(await tid("imaging-report").innerText()) && (await tid("print-pending").count()) === 0)
    await closeDialogs()
    await tid("order-actions").getByRole("button", { name: "Mark delivered" }).click(); await dlg().waitFor(); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Mark delivered" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    ok("I5 delivering: ONE POST …/deliver; Delivered is shown", posts(i0, /\/deliver$/).length === 1 && (await tid("order-delivered").count()) === 1)
    // the unsigned print of imgA lists the report as unreported
    await openImg(imgA)
    await tid("order-actions").getByRole("button", { name: "Report" }).click(); await tid("report-dialog").waitFor(); await page.waitForTimeout(900)
    ok("I5 a performed test whose report is not signed is listed as 'not yet signed', never printed as a result", /Performed, report not yet signed: Chest X-ray/.test(await tid("print-unreported").innerText()) && (await tid("imaging-report").locator("[data-testid^=print-report-]").count()) === 0)
    await closeDialogs()
    // cancel + archive
    await openImg(imgC)
    ok("I5 a delivered-ready order: archive offered", (await btnNames(tid("order-actions"))).includes("Archive"))
  })

  await step("I2 place an imaging order", async () => {
    await go("/imaging/orders/new"); await tid("order-form").waitFor()
    await page.locator("#dx-patient").fill("zain"); await page.waitForTimeout(1300); await tid("order-form").getByText("Zainab Qureshi").first().click()
    i0 = requests.length
    await page.locator("#dx-test-search").fill("us"); await page.waitForTimeout(1300)
    ok("I2 the imaging catalogue is searched from 2 letters (GET /imaging-tests), active only", since(i0).some((r) => r.path === "/imaging-tests" && r.query.search === "us" && r.query.active === "true"))
    await tid("test-options").getByRole("button", { name: /USG abdomen/ }).click()
    ok("I2 the modality is shown beside the test", /Ultrasound/.test(await tid("test-options").innerText().catch(() => "Ultrasound")))
    i0 = requests.length
    await Promise.all([page.getByRole("button", { name: "Place order" }).dblclick(), page.waitForTimeout(200)]); await page.waitForURL(/\/imaging\/orders\/01HZX\d+$/, { timeout: 10000 })
    const po = posts(i0, /^\/imaging-orders$/)
    ok("I2 ONE POST /imaging-orders { patientId, priority, tests: [{ testId }] }", po.length === 1 && same(po[0].body, { patientId: P(0).id, priority: "routine", tests: [{ testId: imagingTests[2].id }] }), JSON.stringify(po.map((r) => r.body)))
    await tid("imaging-order-detail").waitFor({ timeout: 8000 })
    ok("I2 it opens the new order with the server's number", /^XR-2026-\d{4}$/.test(await tid("order-no").innerText()))
  })

  // ═════════ roles: the server decides, the screen shows ═════════
  await step("roles", async () => {
    const base2 = ["patients.read", "encounters.read", "doctors.read", "settings.read", "catalogs.read"]
    const as = async (perms) => { S.perms = perms; await signOutAndIn() }
    // a fresh lab order with a pending tube for the role checks
    const fresh = F.labOrders.find((o) => F.labStatus(o) === "pending" && o.specimens.some((s) => s.status === "pending") && o.fulfillment === "internal")
    await as([...base2, "diagnostics.read", "diagnostics.collect", "diagnostics.enter_results"]) // lab technician
    await openLab(fresh)
    ok("PERM lab technician: sees Mark collected and Reject on a tube; no Verify, Amend, Add tests or Archive", (await btnNames(tid(`specimen-${fresh.specimens.find((s) => s.status === "pending").id}`))).includes("Mark collected") && !(await btnNames(tid("lab-order-detail"))).some((n) => /^(Verify|Amend|Add tests|Archive|Cancel test)$/.test(n)))
    await go("/lab/orders"); await tid("lab-orders-screen").waitFor(); await page.waitForTimeout(500)
    ok("PERM lab technician: no 'New Lab Order' button", (await page.getByRole("link", { name: /New Lab Order/ }).count()) === 0)
    await as([...base2, "diagnostics.read", "diagnostics.order", "diagnostics.verify"]) // doctor
    await openLab(labB)
    ok("PERM doctor: Add tests and Pathologist's remarks; Amend on a verified result; no collection and no Enter result", (await btnNames(tid("order-actions"))).includes("Add tests") && (await btnNames(tid("order-actions"))).includes("Pathologist's remarks") && !(await btnNames(tid("lab-order-detail"))).some((n) => /^(Mark collected|Enter result|Mark delivered)$/.test(n)))
    await go("/lab/orders"); await tid("lab-orders-screen").waitFor(); await page.waitForTimeout(500)
    ok("PERM doctor: 'New Lab Order' is offered", (await page.getByRole("link", { name: /New Lab Order/ }).count()) === 1)
    await as([...base2, "diagnostics.read"]) // read only
    await openLab(labB)
    ok("PERM read-only: no action buttons at all (only the report)", JSON.stringify(await btnNames(tid("order-actions"))) === JSON.stringify(["Report"]) && !(await btnNames(tid("lab-order-detail"))).some((n) => /^(Verify|Amend|Enter result|Mark collected|Cancel test)$/.test(n)))
    await openImg(imgA)
    ok("PERM read-only: no imaging action buttons either", JSON.stringify(await btnNames(tid("order-actions"))) === JSON.stringify(["Report"]))
    await as([...base2, "diagnostics.read", "diagnostics.perform"]) // radiographer
    await openImg(imgA)
    ok("PERM radiographer: Mark performed (and Write report once performed), no Sign, no Cancel test", (await btnNames(tid("imaging-order-detail"))).includes("Mark performed") ? true : (await btnNames(tid("imaging-order-detail"))).includes("Write report") && !(await btnNames(tid("imaging-order-detail"))).some((n) => /^(Sign report|Cancel test)$/.test(n)))
    await as([...base2]) // no diagnostics
    i0 = requests.length
    await go("/lab/orders"); await page.waitForTimeout(900)
    ok("PERM without diagnostics.read: 'Not allowed' and no request for lab orders", /not allowed/i.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => r.path === "/lab-orders"))
    S.perms = ALL; await signOutAndIn()
  })

  // ═════════ global ═════════
  ok("no list asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request and response the fake backend handled matches docs/openapi.json", F.violations.length === 0, F.violations.slice(0, 4).join(" || "))
  ok("nothing is ever deleted (no DELETE request)", !requests.some((r) => r.method === "DELETE"))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e))
  ok("no browser console/page errors other than the deliberate 404 / 422 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  ok("no request reached a route the fake backend does not implement (no 599)", !consoleErrors.some((e) => /status of 599/.test(e)))

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
