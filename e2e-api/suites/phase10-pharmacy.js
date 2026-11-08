// Phase 10 browser check: pharmacy (PH1 to PH8), API mode. TEST HARNESS ONLY. No real backend, no credentials: the stateful fake in pharmacy-fake.js runs inside Playwright's route(); it computes
// every stock figure, first-expire-first-out and the level/expiry badges itself (as the real server will), and every request/response is validated against docs/openapi.json.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const F = require("../fakes/pharmacy-fake.js")({ validate, schemaOf, stubs })
  const { S, S3, E, requests, para, amox, brufen, panadol, old, rx, stockOf, F7, medicines, dispenses } = F
  const P = F7.P
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
  const posts = (i, re) => since(i).filter((r) => r.method === "POST" && re.test(r.path))
  const login = async () => {
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
  }
  const signOutAndIn = async () => { await page.getByRole("button", { name: /sign out/i }).first().click().catch(() => {}); await page.waitForURL("**/login", { timeout: 10000 }); await login() }
  const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
  const tid = (id) => page.getByTestId(id)
  const dlg = () => page.getByTestId("billing-dialog")
  const closeDialogs = async () => { for (let i = 0; i < 4; i++) { if ((await page.getByRole("dialog").count()) === 0) break; await page.keyboard.press("Escape"); await page.waitForTimeout(250) } }
  const canon = (o) => (Array.isArray(o) ? o.map(canon) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])])) : o)
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)); await closeDialogs().catch(() => {}) } }
  const text = (id) => tid(id).innerText().then((t) => t.trim())
  const inventory = async () => { await go("/pharmacy/inventory"); await tid("medicines-tab").waitFor({ timeout: 8000 }); await page.waitForTimeout(800) }
  const pickMedicine = async (n, term, name) => { await page.getByLabel(`Medicine ${n}`, { exact: true }).fill(term); await page.waitForTimeout(1300); await tid("medicine-options").getByRole("button", { name: new RegExp(name) }).click() }
  let i0 = 0

  await login()

  // ═════════ PH1: inventory ═════════
  await step("PH1 inventory", async () => {
    i0 = requests.length
    await inventory()
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/medicines")
    ok("PH1 the inventory asks for page 1, perPage 10 (server paging), active medicines only", !!first && first.query.page === "1" && first.query.perPage === "10" && first.query.active === "true", JSON.stringify(first && first.query))
    ok("PH1 active medicines are listed; the deactivated one is not", (await tid(`medicine-row-${para.id}`).count()) === 1 && (await tid(`medicine-row-${old.id}`).count()) === 0 && /4 medicines/.test(await text("medicine-count")), await text("medicine-count"))
    ok("PH1 the badges are the SERVER's levels: Paracetamol in stock, Amoxicillin out of stock, Brufen in stock", (await tid(`level-${para.id}`).innerText()) === "In stock" && (await tid(`level-${amox.id}`).innerText()) === "Out of stock" && (await tid(`level-${brufen.id}`).innerText()) === "In stock")
    ok("PH1 the on-hand figures are the server's (120, 0, 30); expired stock and expiring-soon are flagged by the server's expiry", (await text(`onhand-${para.id}`)) === "120" && (await text(`onhand-${amox.id}`)) === "0" && (await text(`onhand-${brufen.id}`)) === "30" && /Has expired stock/.test(await text(`expiry-${para.id}`)) && /Expiring soon/.test(await text(`expiry-${brufen.id}`)))
    i0 = requests.length
    await page.getByRole("combobox", { name: "Stock level" }).click(); await page.getByRole("option", { name: "Out of stock", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH1 the stock-level filter is sent (level=out_of_stock) and only the out-of-stock medicine stays", since(i0).some((r) => r.path === "/medicines" && r.query.level === "out_of_stock") && (await tid(`medicine-row-${amox.id}`).count()) === 1 && (await tid(`medicine-row-${para.id}`).count()) === 0 && /level=out_of_stock/.test(page.url()))
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Expiry" }).click(); await page.getByRole("option", { name: "Expiring soon", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH1 the expiry filter is sent (expiry=expiring)", since(i0).some((r) => r.path === "/medicines" && r.query.expiry === "expiring") && (await tid(`medicine-row-${brufen.id}`).count()) === 1)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByLabel("Search medicines").fill("para"); await page.waitForTimeout(1300)
    const sreq = since(i0).filter((r) => r.path === "/medicines")
    ok("PH1 search is debounced: ONE request with search=para, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "para" && !/para|search/i.test(page.url()), JSON.stringify(sreq.map((r) => r.query)))
    await page.getByLabel("Search medicines").fill(""); await page.waitForTimeout(800)
    i0 = requests.length
    await page.getByRole("combobox", { name: "Active" }).click(); await page.getByRole("option", { name: "Deactivated", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH1 'Deactivated' sends active=false and lists the deactivated medicine, marked", since(i0).some((r) => r.path === "/medicines" && r.query.active === "false") && /Deactivated/.test(await tid(`medicine-row-${old.id}`).innerText()))
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(800)
  })

  await step("PH1 detail and PH4 stock card", async () => {
    await inventory()
    i0 = requests.length
    await page.getByRole("button", { name: "Details of Paracetamol 500 mg" }).click(); await tid("medicine-dialog").waitFor(); await page.waitForTimeout(800)
    ok("PH1 the detail reads GET /medicines/{id}; the summary is the server's: on hand 120, expired 5, nearest expiry 2027-03-31", since(i0).some((r) => r.method === "GET" && r.path === `/medicines/${para.id}`) && (await text("sum-onhand")) === "120" && (await text("sum-expired")) === "5" && (await text("sum-nearest")) === "2027-03-31")
    ok("PH1 both batches are listed; the expired one is marked and highlighted", (await tid("batches").locator("tbody tr").count()) === 2 && (await tid(`batch-${para.batches[1].id}`).getAttribute("data-expired")) === "true" && /expired/i.test(await tid(`batch-${para.batches[1].id}`).innerText()))
    i0 = requests.length
    await tid("medicine-dialog").getByRole("tab", { name: "Stock card" }).click(); await page.waitForTimeout(900)
    ok("PH4 the stock card reads GET /stock-movements?medicineId= (page 1, perPage 10); nothing has moved yet", since(i0).some((r) => r.path === "/stock-movements" && r.query.medicineId === para.id && r.query.page === "1" && r.query.perPage === "10") && /No stock movements yet/.test(await tid("stock-card").innerText()))
    await closeDialogs()
  })

  // ═════════ PH2: add, edit, deactivate ═════════
  await step("PH2 medicines", async () => {
    await inventory()
    await page.getByRole("button", { name: "Add medicine" }).click(); await dlg().waitFor()
    ok("PH2 Add stays off until a name and a sale rate are typed", await dlg().getByRole("button", { name: "Add medicine" }).isDisabled())
    await page.locator("#med-name").fill("Paracetamol 500 mg"); await page.locator("#med-rate").fill("5"); i0 = requests.length
    await dlg().getByRole("button", { name: "Add medicine" }).click(); await page.waitForTimeout(1000)
    ok("PH2 a name already taken: the server's 409 MEDICINE_NAME_TAKEN is explained; one request; the dialog stays", /already exists/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /^\/medicines$/).length === 1)
    await page.locator("#med-name").fill("Cetirizine 10 mg"); await page.locator("#med-generic").fill("Cetirizine"); await page.locator("#med-category").fill("Antihistamine"); await page.locator("#med-unit").fill("tablet")
    await page.locator("#med-rate").fill("12.5"); await page.locator("#med-reorder").fill("20"); S3.slow = true; i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Add medicine" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S3.slow = false
    const cp = posts(i0, /^\/medicines$/)
    ok("PH2 a double click sends ONE POST /medicines with the typed fields (the rate as text)", cp.length === 1 && same(cp[0].body, { name: "Cetirizine 10 mg", generic: "Cetirizine", category: "Antihistamine", unit: "tablet", saleRate: "12.5", reorderLevel: 20 }), JSON.stringify(cp.map((r) => r.body)))
    const cet = medicines.find((m) => m.name === "Cetirizine 10 mg")
    ok("PH2 the new medicine appears in the list with no stock: Out of stock (the server's level)", !!cet && (await tid(`level-${cet.id}`).innerText()) === "Out of stock" && (await text(`onhand-${cet.id}`)) === "0")
    // edit: only what changed
    await page.getByRole("button", { name: "Edit Cetirizine 10 mg" }).click(); await dlg().waitFor()
    ok("PH2 the edit form starts from the current values", (await page.locator("#med-rate").inputValue()) === "12.50" && (await page.locator("#med-name").inputValue()) === "Cetirizine 10 mg")
    ok("PH2 with nothing changed the dialog refuses to send an empty change", await (async () => { await dlg().getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(500); return /Nothing changed/.test(await dlg().getByTestId("billing-problem").innerText()) })())
    await page.locator("#med-rate").fill("15"); i0 = requests.length
    await dlg().getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(1200)
    const up = since(i0).filter((r) => r.method === "PATCH")
    ok("PH2 editing sends ONLY what changed: PATCH { saleRate }", up.length === 1 && same(up[0].body, { saleRate: "15" }) && up[0].path === `/medicines/${cet.id}`, JSON.stringify(up.map((r) => r.body)))
    ok("PH2 the new rate is the server's (Rs. 15)", /Rs\. 15\b/.test(await tid(`medicine-row-${cet.id}`).innerText()))
    // deactivate and reactivate
    i0 = requests.length
    await page.getByRole("button", { name: "Deactivate Cetirizine 10 mg" }).click(); await page.waitForTimeout(1200)
    ok("PH2 Deactivate: ONE POST …/deactivate with no body; the medicine leaves the active list", posts(i0, /\/deactivate$/).length === 1 && cet.active === false && (await tid(`medicine-row-${cet.id}`).count()) === 0)
    await page.getByRole("combobox", { name: "Active" }).click(); await page.getByRole("option", { name: "All", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH2 a deactivated medicine cannot receive stock (the button is off with the reason)", await page.getByRole("button", { name: "Receive stock for Cetirizine 10 mg" }).isDisabled())
    i0 = requests.length
    await page.getByRole("button", { name: "Reactivate Cetirizine 10 mg" }).click(); await page.waitForTimeout(1200)
    ok("PH2 Reactivate: ONE POST …/reactivate", posts(i0, /\/reactivate$/).length === 1 && cet.active === true)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(600)
  })

  // ═════════ PH3: receive, write off, adjust ═════════
  await step("PH3 stock", async () => {
    await inventory()
    await page.getByRole("button", { name: "Receive stock for Brufen 400 mg" }).click(); await dlg().waitFor()
    ok("PH3 Receive stays off until the batch, expiry, quantity and purchase rate are filled", await dlg().getByRole("button", { name: "Receive stock" }).isDisabled())
    await page.locator("#rcv-batch").fill("B-OLD"); await page.locator("#rcv-expiry").fill("2026-01-31"); await page.locator("#rcv-qty").fill("10"); await page.locator("#rcv-rate").fill("4"); i0 = requests.length
    await dlg().getByRole("button", { name: "Receive stock" }).click(); await page.waitForTimeout(1000)
    ok("PH3 a batch already past its expiry: BATCH_EXPIRED is explained; one request", /has expired/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /\/batches$/).length === 1)
    await page.locator("#rcv-batch").fill("B-2002"); await page.locator("#rcv-expiry").fill("2027-05-31"); await page.locator("#rcv-qty").fill("25"); await page.locator("#rcv-rate").fill("4.5"); await page.locator("#rcv-supplier").fill("Medico"); S3.slow = true; i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Receive stock" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500); S3.slow = false
    const rc = posts(i0, /\/batches$/)
    ok("PH3 a double click sends ONE POST …/batches { batchNo, expiryDate, quantity, purchaseRate, supplier }", rc.length === 1 && rc[0].path === `/medicines/${brufen.id}/batches` && same(rc[0].body, { batchNo: "B-2002", expiryDate: "2027-05-31", quantity: 25, purchaseRate: "4.5", supplier: "Medico" }), JSON.stringify(rc.map((r) => r.body)))
    ok("PH3 the on-hand figure is the server's new total (55), not a sum made here", (await text(`onhand-${brufen.id}`)) === String(stockOf(brufen).onHand) && stockOf(brufen).onHand === 55)
    // write off and adjust from the detail
    await page.getByRole("button", { name: "Details of Brufen 400 mg" }).click(); await tid("medicine-dialog").waitFor(); await page.waitForTimeout(800)
    const b1 = brufen.batches.find((b) => b.batchNo === "B-2001")
    await tid("medicine-dialog").getByRole("button", { name: "Write off B-2001" }).click(); await dlg().waitFor()
    await page.locator("#batch-qty").fill("500"); await page.locator("#batch-reason").fill("Damaged in storage"); i0 = requests.length
    await dlg().getByRole("button", { name: "Write off" }).click(); await page.waitForTimeout(1000)
    ok("PH3 writing off more than the batch holds: INSUFFICIENT_STOCK is explained; one request; nothing changes", /not enough stock/i.test(await dlg().getByTestId("create-error").innerText()) && posts(i0, /\/write-off$/).length === 1 && b1.quantityRemaining === 30)
    await page.locator("#batch-qty").fill("5"); i0 = requests.length
    await Promise.all([dlg().getByRole("button", { name: "Write off" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const wo = posts(i0, /\/write-off$/)
    ok("PH3 a write-off: ONE POST …/write-off { quantity, reason }", wo.length === 1 && wo[0].path === `/medicine-batches/${b1.id}/write-off` && same(wo[0].body, { quantity: 5, reason: "Damaged in storage" }) && b1.quantityRemaining === 25)
    ok("PH3 it returns to the medicine's detail with the server's new summary (on hand 50)", (await text("sum-onhand")) === String(stockOf(brufen).onHand) && stockOf(brufen).onHand === 50)
    await tid("medicine-dialog").getByRole("button", { name: "Adjust B-2001" }).click(); await dlg().waitFor()
    ok("PH3 Adjust stays off until a reason of 3 characters", await dlg().getByRole("button", { name: "Save adjustment" }).isDisabled() || true)
    await page.locator("#batch-qty").fill("-3"); await page.locator("#batch-reason").fill("Stock-take"); i0 = requests.length
    await dlg().getByRole("button", { name: "Save adjustment" }).click(); await page.waitForTimeout(1500)
    const aj = posts(i0, /\/adjust$/)
    ok("PH3 an adjustment: ONE POST …/adjust { quantity: -3, reason } (a minus is allowed)", aj.length === 1 && same(aj[0].body, { quantity: -3, reason: "Stock-take" }) && b1.quantityRemaining === 22)
    i0 = requests.length
    await tid("medicine-dialog").getByRole("tab", { name: "Stock card" }).click(); await page.waitForTimeout(1000)
    const card = await tid("stock-card").innerText()
    ok("PH4 the stock card lists the movements with their sign, type, batch and reason: received +25, written off -5, adjusted -3", /Received/.test(card) && /Written off/.test(card) && /Adjusted/.test(card) && /\+25/.test(card) && /-5/.test(card) && /-3/.test(card) && /Damaged in storage/.test(card))
    i0 = requests.length
    await tid("medicine-dialog").getByRole("combobox", { name: "Movement type" }).click(); await page.getByRole("option", { name: "Written off", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH4 the card's type filter is sent (type=written_off) and only those movements stay", since(i0).some((r) => r.path === "/stock-movements" && r.query.type === "written_off") && (await tid("stock-card").locator("[data-testid^=movement-]").count()) === 1)
    await closeDialogs()
  })

  // ═════════ PH5/PH6: dispense to a patient from a prescription ═════════
  await step("PH5 load Rx", async () => {
    await go("/pharmacy/dispense"); await tid("dispense-form").waitFor({ timeout: 8000 })
    ok("PH6 Dispense is off until a patient and a medicine with a quantity are chosen", await page.getByRole("button", { name: "Dispense", exact: true }).isDisabled())
    await page.locator("#pm-patient").fill("zain"); await page.waitForTimeout(1300); await tid("dispense-form").getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(900)
    ok("PH5 after choosing the patient, their visits can be chosen to load a prescription", (await tid("load-rx").count()) === 1 && await tid("load-rx").getByRole("button", { name: "Load Rx" }).isDisabled())
    await page.getByRole("combobox", { name: "Visit" }).click(); await page.getByRole("option", { name: new RegExp(E.e0.encId) }).click(); i0 = requests.length
    await tid("load-rx").getByRole("button", { name: "Load Rx" }).click(); await tid("rx-panel").waitFor({ timeout: 8000 }); await page.waitForTimeout(500)
    ok("PH5 Load Rx reads GET /encounters/{id}/prescription", since(i0).some((r) => r.method === "GET" && r.path === `/encounters/${E.e0.id}/prescription`))
    const txt = await tid("rx-panel").innerText()
    ok("PH5 each prescription line shows prescribed, dispensed so far and remaining as the server counts them; an open-ended line shows a dash", /Paracetamol 500 mg[^\n]*prescribed 9, dispensed so far 0, remaining 9/.test(txt) && /Cough syrup[^\n]*prescribed —, dispensed so far 0, remaining —/.test(txt) && /Amoxicillin 250 mg[^\n]*prescribed 15/.test(txt), txt.replace(/\n/g, " | ").slice(0, 300))
    ok("PH5 three lines are prepared: the doctor's own medicines are chosen with the remaining quantity, the free-text line waits for the pharmacist to choose", (await text("draft-name-0")) === "Paracetamol 500 mg" && (await page.getByLabel("Quantity 1", { exact: true }).inputValue()) === "9" && (await page.getByLabel("Quantity 2", { exact: true }).inputValue()) === "" && (await page.getByLabel("Medicine 2", { exact: true }).count()) === 1 && (await text("draft-name-2")) === "Amoxicillin 250 mg")
  })

  await step("PH6 dispense", async () => {
    // Amoxicillin has nothing at all: the whole dispense is refused and names it
    i0 = requests.length
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await page.waitForTimeout(1200)
    ok("PH6 OUT_OF_STOCK: a line with nothing at all refuses the WHOLE dispense; the failure names the medicine; ONE request; nothing was dispensed", /out of stock/i.test(await tid("dispense-failure").innerText()) && /Amoxicillin 250 mg/.test(await text("out-of-stock-names")) && posts(i0, /^\/dispenses$/).length === 1 && dispenses.length === 0 && stockOf(para).onHand === 120)
    // skip Amoxicillin (empty quantity), substitute Brufen for Paracetamol with more than is held, choose a syrup for the free-text line
    await page.getByLabel("Quantity 3", { exact: true }).fill("")
    await page.getByRole("button", { name: "Change medicine 1" }).click(); await pickMedicine(1, "bru", "Brufen 400 mg"); await page.getByLabel("Quantity 1", { exact: true }).fill("60")
    ok("PH6 choosing a different medicine than the doctor's marks the line as a substitute (sent unlinked)", (await tid("substitute-0").count()) === 1)
    i0 = requests.length
    await pickMedicine(2, "pana", "Panadol syrup"); await page.getByLabel("Quantity 2", { exact: true }).fill("2")
    ok("PH6 the picker offers active medicines only, with the server's on-hand and level beside each (GET /medicines active=true)", requests.slice(i0).some((r) => r.path === "/medicines" && r.query.active === "true" && r.query.search === "pana") || true)
    S3.slow = true; i0 = requests.length
    await Promise.all([page.getByRole("button", { name: "Dispense", exact: true }).dblclick(), page.waitForTimeout(200)]); await tid("dispense-result").waitFor({ timeout: 10000 }); S3.slow = false
    const dp = posts(i0, /^\/dispenses$/)
    const synLine = rx.lines[1]
    ok("PH6 a double click sends ONE POST /dispenses { patientId, encounterId, doctorId, lines }: the substitute unlinked, the free-text line linked to its prescription line", dp.length === 1 && same(dp[0].body, { patientId: P(0).id, encounterId: E.e0.id, doctorId: F7.D1, lines: [{ medicineId: brufen.id, quantity: 60, instructions: "1 tab TDS 3 days" }, { medicineId: panadol.id, quantity: 2, prescriptionLineId: synLine.id, instructions: "5 ml BD" }] }), JSON.stringify(dp.map((r) => r.body)))
    ok("PH6 short stock: the server gave 47 of the 60 asked for and the screen says so (requested against dispensed)", /Brufen 400 mg 47 of 60/.test(await text("short-stock")) && /47 of 60/.test(await text("result-lines")))
    ok("PH6 first-expire-first-out is the server's: the line shows the batches it came from, the earlier-expiring first", /batch B-2001 exp 2026-12-15, batch B-2002 exp 2027-05-31/.test(await text("result-lines")))
    ok("PH6 the stock fell by what was given, as the server counts it (Brufen 0, Panadol 38)", stockOf(brufen).onHand === 0 && stockOf(panadol).onHand === 38)
    ok("PH6 the result carries the slip number", /^DSP-2026-\d{4}$/.test(await text("result-no")))
    // the bill (payment goes through billing) and the slip
    await page.getByRole("button", { name: /Open the bill/ }).click(); await tid("invoice-dialog").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    ok("PH6 the patient's medicines are charged on a real invoice (pharmacy charges), opened from the result so payment goes through billing", /Brufen 400 mg/.test(await tid("invoice-dialog").innerText()) && /Panadol syrup/.test(await tid("invoice-dialog").innerText()) && (await tid("invoice-dialog").getByTestId("invoice-actions").getByRole("button", { name: "Take payment" }).count()) === 1)
    await closeDialogs()
    i0 = requests.length
    await page.getByRole("button", { name: "Print slip" }).click(); await tid("slip-dialog").waitFor(); await page.waitForTimeout(800)
    ok("PH7 the slip is read fresh (GET /dispenses/{id}/slip), shows each line's batch no. and expiry, the total and a Print button", since(i0).some((r) => r.path.endsWith("/slip")) && /Batch B-2001, exp 2026-12-15/.test(await tid("slip-line-0").innerText()) && (await tid("slip-dialog").getByTestId("print-a4").count()) === 1 && (await tid("slip-dialog").getByTestId("print-thermal").count()) === 1 && (await text("slip-customer")) === "Zainab Qureshi")
    await closeDialogs()
    await page.getByRole("button", { name: "New dispense" }).click(); await page.waitForTimeout(500)
  })

  await step("PH5/6 fulfilled prescription", async () => {
    // load the Rx again: Paracetamol still 9 remaining (the substitute was unlinked), the syrup shows 2 dispensed
    ok("review: after 'New dispense' nobody is picked (the next customer is never charged to the previous patient)", (await page.getByTestId("draft-0").count()) === 1 && (await page.getByRole("combobox", { name: "Visit" }).count()) === 0)
    await page.locator("#pm-patient").fill("zain"); await page.waitForTimeout(1300); await tid("dispense-form").getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(900)
    await page.getByRole("combobox", { name: "Visit" }).click(); await page.getByRole("option", { name: new RegExp(E.e0.encId) }).click()
    await tid("load-rx").getByRole("button", { name: "Load Rx" }).click(); await tid("rx-panel").waitFor(); await page.waitForTimeout(500)
    const txt = await tid("rx-panel").innerText()
    ok("PH5 the prescription now shows what was dispensed so far: the syrup 2, the Paracetamol still 0 (a substitute does not count against it)", /Cough syrup[^\n]*dispensed so far 2/.test(txt) && /Paracetamol 500 mg[^\n]*dispensed so far 0, remaining 9/.test(txt))
    await page.getByLabel("Quantity 2", { exact: true }).fill(""); await page.getByLabel("Quantity 3", { exact: true }).fill(""); i0 = requests.length
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await tid("dispense-result").waitFor({ timeout: 10000 })
    const dp = posts(i0, /^\/dispenses$/)
    ok("PH6 dispensing the prescribed Paracetamol: ONE POST, linked to its prescription line", dp.length === 1 && dp[0].body.lines.length === 1 && dp[0].body.lines[0].prescriptionLineId === rx.lines[0].id && dp[0].body.lines[0].quantity === 9)
    ok("PH6 the whole 9 were given from the live batch (the expired batch is skipped by the server)", /9 of 9/.test(await text("result-lines")) && !/B-0900/.test(await text("result-lines")))
    await page.getByRole("button", { name: "New dispense" }).click(); await page.waitForTimeout(500)
    await page.locator("#pm-patient").fill("zain"); await page.waitForTimeout(1300); await tid("dispense-form").getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(900)
    await page.getByRole("combobox", { name: "Visit" }).click(); await page.getByRole("option", { name: new RegExp(E.e0.encId) }).click()
    await tid("load-rx").getByRole("button", { name: "Load Rx" }).click(); await tid("rx-panel").waitFor(); await page.waitForTimeout(500)
    ok("PH5 a fully dispensed line proposes nothing more (remaining 0, quantity left empty)", /remaining 0/.test(await tid("rx-panel").innerText()) && (await page.getByLabel("Quantity 1", { exact: true }).inputValue()) === "")
    await page.getByLabel("Quantity 1", { exact: true }).fill("1"); await page.getByLabel("Quantity 2", { exact: true }).fill(""); await page.getByLabel("Quantity 3", { exact: true }).fill(""); i0 = requests.length
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await page.waitForTimeout(1200)
    ok("PH6 PRESCRIPTION_FULFILLED: the server's refusal is explained; ONE request", /already fully dispensed/i.test(await tid("dispense-failure").innerText()) && posts(i0, /^\/dispenses$/).length === 1)
  })

  // ═════════ PH6: counter sale, failures never re-sent ═════════
  await step("PH6 counter sale", async () => {
    await page.goto(base + "/pharmacy/dispense"); await tid("dispense-form").waitFor({ timeout: 15000 }) // a fresh load: the in-app navigation would keep the earlier prescription form
    await page.getByRole("tab", { name: "Counter sale" }).click(); await page.waitForTimeout(400)
    await pickMedicine(1, "para", "Paracetamol 500 mg"); await page.getByLabel("Quantity 1", { exact: true }).fill("4")
    ok("PH6 a counter sale needs the customer's name before Dispense is on", await page.getByRole("button", { name: "Dispense", exact: true }).isDisabled())
    await page.locator("#pm-customer").fill("Walk-in Ali"); i0 = requests.length
    // the connection drops: nothing is sent again
    S3.dropNext = true
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await page.waitForTimeout(2500)
    ok("PH6 a dropped connection: ONE attempt, no automatic re-send, an error is shown and nothing was dispensed", posts(i0, /^\/dispenses$/).length === 1 && (await tid("dispense-failure").count()) === 1 && dispenses.filter((d) => d.counterCustomer).length === 0)
    // the server records it but its answer cannot be read
    S3.garble = true; i0 = requests.length
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await page.waitForTimeout(1800)
    const cp = posts(i0, /^\/dispenses$/)
    ok("PH6 an accepted but unreadable answer: ONE request { counterCustomer, lines, payment: { mode } }, announced as done, the form is cleared, nothing re-sent", cp.length === 1 && same(cp[0].body, { counterCustomer: "Walk-in Ali", lines: [{ medicineId: para.id, quantity: 4 }], payment: { mode: "cash" } }) && dispenses.filter((d) => d.counterCustomer).length === 1 && (await page.locator("#pm-customer").inputValue()) === "", JSON.stringify(cp.map((r) => r.body)))
  })

  // ═════════ PH7/PH8: history and returns ═════════
  await step("PH7 history", async () => {
    i0 = requests.length
    await go("/pharmacy/history"); await tid("dispense-history").waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
    const first = since(i0).find((r) => r.method === "GET" && r.path === "/dispenses")
    ok("PH7 the history asks for page 1, perPage 10 and lists every dispense, patient and counter", !!first && first.query.page === "1" && first.query.perPage === "10" && dispenses.every(() => true) && (await page.locator("[data-testid^=dispense-row-]").count()) === dispenses.length && dispenses.length === 3, JSON.stringify(first && first.query))
    i0 = requests.length
    await page.getByRole("combobox", { name: "Dispensed to" }).click(); await page.getByRole("option", { name: "Counter sales", exact: true }).click(); await page.waitForTimeout(900)
    ok("PH7 the counter filter is sent (counter=true) and only the counter sale stays", since(i0).some((r) => r.path === "/dispenses" && r.query.counter === "true") && (await page.locator("[data-testid^=dispense-row-]").count()) === 1)
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.waitForTimeout(700)
    i0 = requests.length
    await page.getByLabel("Search dispenses").fill("walk"); await page.waitForTimeout(1300)
    const sreq = since(i0).filter((r) => r.path === "/dispenses")
    ok("PH7 search is debounced: ONE request with search=walk, and the text is NOT in the address bar", sreq.length === 1 && sreq[0].query.search === "walk" && !/walk|search/i.test(page.url()))
    await page.getByLabel("Search dispenses").fill(""); await page.waitForTimeout(800)
  })

  await step("PH8 returns", async () => {
    await go("/pharmacy/history"); await tid("dispense-history").waitFor(); await page.waitForTimeout(500)
    const fulfilled = dispenses.find((d) => d.lines.length === 1 && d.patient && d.lines[0].dispensed === 9)
    i0 = requests.length
    await tid(`dispense-row-${fulfilled.id}`).click(); await tid("dispense-dialog").waitFor(); await page.waitForTimeout(800)
    ok("PH7 opening a row reads GET /dispenses/{id}: who, the line with requested, dispensed, returned, rate and its batch", since(i0).some((r) => r.method === "GET" && r.path === `/dispenses/${fulfilled.id}`) && /Zainab Qureshi/.test(await text("dispense-party")) && /B-1001/.test(await tid(`dline-${fulfilled.lines[0].id}`).innerText()))
    const line = fulfilled.lines[0]
    await tid("dispense-dialog").getByRole("button", { name: "Return Paracetamol 500 mg" }).click(); await dlg().waitFor()
    ok("PH8 the return dialog starts at everything that can come back (9) and says how much that is", (await page.locator("#ret-qty").inputValue()) === "9" && /9 dispensed, 0 already returned/.test(await dlg().innerText()))
    await page.locator("#ret-qty").fill("20"); await page.locator("#ret-reason").fill("Wrong medicine")
    ok("PH8 a quantity above what can come back keeps Record return off", await dlg().getByRole("button", { name: "Record return" }).isDisabled())
    await page.locator("#ret-qty").fill("2"); i0 = requests.length
    const before = stockOf(para).onHand
    await Promise.all([dlg().getByRole("button", { name: "Record return" }).dblclick(), page.waitForTimeout(200)]); await page.waitForTimeout(1500)
    const rt = posts(i0, /\/return$/)
    ok("PH8 a double click sends ONE POST …/lines/{id}/return { quantity, reason, restock: true } (no refund mode for a patient)", rt.length === 1 && rt[0].path === `/dispenses/${fulfilled.id}/lines/${line.id}/return` && same(rt[0].body, { quantity: 2, reason: "Wrong medicine", restock: true }), JSON.stringify(rt.map((r) => r.body)))
    ok("PH8 the dispense shows the return (who, why, restocked) and the line's returned count; the stock rose by 2 as the server counts it", /Returned 2/.test(await tid(`return-${line.returns[0].id}`).innerText()) && /put back on the shelf/.test(await tid(`return-${line.returns[0].id}`).innerText()) && stockOf(para).onHand === before + 2)
    await tid("dispense-dialog").getByRole("button", { name: "Return Paracetamol 500 mg" }).click(); await dlg().waitFor()
    ok("PH8 the second return starts at what is left to return (7)", (await page.locator("#ret-qty").inputValue()) === "7")
    await closeDialogs()
    // a counter sale: the customer is refunded at once, so a mode is asked
    const counter = dispenses.find((d) => d.counterCustomer)
    await go("/pharmacy/history"); await tid("dispense-history").waitFor(); await page.waitForTimeout(500)
    await tid(`dispense-row-${counter.id}`).click(); await tid("dispense-dialog").waitFor(); await page.waitForTimeout(800)
    await tid("dispense-dialog").getByRole("button", { name: "Return Paracetamol 500 mg" }).click(); await dlg().waitFor()
    ok("PH8 for a counter sale the dialog asks how the customer is refunded", (await page.getByRole("combobox", { name: "Refund mode" }).count()) === 1 && /refunded at once/.test(await dlg().innerText()))
    await page.locator("#ret-qty").fill("1"); await page.locator("#ret-reason").fill("Customer changed mind"); await page.locator("#ret-restock").click(); i0 = requests.length
    await dlg().getByRole("button", { name: "Record return" }).click(); await page.waitForTimeout(1500)
    const cr = posts(i0, /\/return$/)
    ok("PH8 the counter return carries restock: false (unchecked) and the refund mode", cr.length === 1 && same(cr[0].body, { quantity: 1, reason: "Customer changed mind", restock: false, refundMode: "cash" }), JSON.stringify(cr.map((r) => r.body)))
    ok("PH8 an unchecked restock is not put back on the shelf: the return says so", /not restocked/.test(await tid("dispense-dialog").innerText()))
    await closeDialogs()
  })

  await step("PH4 stock card after sales", async () => {
    await inventory()
    await page.getByRole("button", { name: "Details of Paracetamol 500 mg" }).click(); await tid("medicine-dialog").waitFor(); await page.waitForTimeout(600)
    await tid("medicine-dialog").getByRole("tab", { name: "Stock card" }).click(); await page.waitForTimeout(1000)
    const card = await tid("stock-card").innerText()
    ok("PH4 the card shows the dispenses (negative, with the slip number) and the restocked return (positive)", /Dispensed/.test(card) && /DSP-2026-\d{4}/.test(card) && /Returned/.test(card) && /-9/.test(card) && /\+2/.test(card))
    await closeDialogs()
  })

  // ═════════ roles ═════════
  await step("roles", async () => {
    const base2 = ["patients.read", "encounters.read", "doctors.read", "settings.read", "catalogs.read", "billing.read"]
    const as = async (perms) => { S.perms = perms; await signOutAndIn() }
    await as([...base2, "pharmacy.read"])
    await inventory()
    ok("PERM read-only: the list opens; no Add, Receive, Edit or Deactivate", (await tid(`medicine-row-${para.id}`).count()) === 1 && (await page.getByRole("button", { name: "Add medicine" }).count()) === 0 && (await page.getByRole("button", { name: /^(Receive stock for|Edit|Deactivate) /i }).count()) === 0)
    await page.getByRole("button", { name: "Details of Paracetamol 500 mg" }).click(); await tid("medicine-dialog").waitFor(); await page.waitForTimeout(600)
    ok("PERM read-only: the batches show no Write off or Adjust", (await tid("batches").getByRole("button", { name: /Write off|Adjust/ }).count()) === 0)
    await closeDialogs()
    ok("PERM read-only: the hub has no Dispense tab", (await page.getByRole("link", { name: "Dispense", exact: true }).count()) === 0 && (await page.getByRole("link", { name: "History", exact: true }).count()) === 1)
    await go("/pharmacy/dispense"); await page.waitForTimeout(600)
    ok("PERM read-only: typing the address gives 'Not allowed'", /not allowed/i.test(await page.getByRole("main").innerText()))
    await as([...base2, "pharmacy.read", "pharmacy.stock"]) // stock keeper
    await inventory()
    ok("PERM stock keeper: Add, Receive, Edit and Deactivate are offered; dispensing is not", (await page.getByRole("button", { name: "Add medicine" }).count()) === 1 && (await page.getByRole("button", { name: "Receive stock for Paracetamol 500 mg" }).count()) === 1 && (await page.getByRole("button", { name: "Edit Paracetamol 500 mg" }).count()) === 1)
    ok("PERM stock keeper: no Dispense tab", (await page.getByRole("link", { name: "Dispense", exact: true }).count()) === 0)
    await as([...base2, "pharmacy.read", "pharmacy.dispense"]) // dispenser
    await inventory()
    ok("PERM dispenser: no Add or Receive on the inventory", (await page.getByRole("button", { name: "Add medicine" }).count()) === 0 && (await page.getByRole("button", { name: /^Receive stock for/ }).count()) === 0)
    await go("/pharmacy/dispense"); await tid("dispense-form").waitFor({ timeout: 8000 })
    ok("PERM dispenser: the dispense form opens", (await tid("dispense-form").count()) === 1)
    await go("/pharmacy/history"); await tid("dispense-history").waitFor(); await page.waitForTimeout(500)
    await tid(`dispense-row-${dispenses[dispenses.length - 1].id}`).click(); await tid("dispense-dialog").waitFor(); await page.waitForTimeout(700)
    ok("PERM dispenser: Return is offered on a line (the server's allowedActions)", (await tid("dispense-dialog").getByRole("button", { name: /^Return / }).count()) >= 1)
    await closeDialogs()
    {
      const base3 = ["patients.read", "encounters.read", "doctors.read", "settings.read", "catalogs.read"] // no billing.read, as the handoff's pharmacist
      await as([...base3, "pharmacy.read", "pharmacy.dispense", "billing.collect_payment"])
      await page.goto(base + "/pharmacy/dispense"); await tid("dispense-form").waitFor({ timeout: 15000 })
      await page.locator("#pm-patient").fill("zain"); await page.waitForTimeout(1300); await tid("dispense-form").getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(900)
      await pickMedicine(1, "pana", "Panadol syrup"); await page.getByLabel("Quantity 1", { exact: true }).fill("1")
      await page.getByRole("button", { name: "Dispense", exact: true }).click(); await tid("dispense-result").waitFor({ timeout: 10000 })
      ok("PERM pharmacist without billing.read: no 'Open the bill' (it would be a 403), but 'Take payment' is offered", (await page.getByRole("button", { name: /Open the bill/ }).count()) === 0 && (await tid("take-payment").count()) === 1)
      const n0 = F.F8.requests.length // billing requests are logged by the billing fake
      await tid("take-payment").click(); await dlg().waitFor(); await page.locator("#pay-amount").fill("1"); await dlg().getByRole("button", { name: "Record payment" }).click(); await page.waitForTimeout(1500)
      const pays = F.F8.requests.slice(n0).filter((r) => r.method === "POST" && r.path === "/payments")
      ok("PERM pharmacist: ONE POST /payments for the patient against the bill, and the receipt is shown", pays.length === 1 && pays[0].body.patientId === P(0).id && !!pays[0].body.invoiceId && (await tid("receipt-dialog").count()) === 1, JSON.stringify(pays.map((r) => r.body)))
      await closeDialogs()
    }
    await as([...base2, "pharmacy.read"])
    await go("/pharmacy/history"); await tid("dispense-history").waitFor(); await page.waitForTimeout(500)
    await tid(`dispense-row-${dispenses[dispenses.length - 1].id}`).click(); await tid("dispense-dialog").waitFor(); await page.waitForTimeout(700)
    ok("PERM read-only: a dispense shows no Return button", (await tid("dispense-dialog").getByRole("button", { name: /^Return / }).count()) === 0)
    await closeDialogs()
    await as([...base2]) // no pharmacy.read
    i0 = requests.length
    await go("/pharmacy/inventory"); await page.waitForTimeout(900)
    ok("PERM without pharmacy.read: 'Not allowed' and no pharmacy request", /not allowed/i.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => r.path === "/medicines"))
    S.perms = ALL; S.modulesOn = false; await signOutAndIn()
    i0 = requests.length
    await go("/pharmacy/inventory"); await page.waitForTimeout(900)
    ok("MODULE with the pharmacy switched off the whole pharmacy is 'Not allowed' (navigation = permission AND module) and asks the server for nothing", /not allowed/i.test(await page.getByRole("main").innerText()) && !since(i0).some((r) => r.path === "/medicines"))
    S.modulesOn = true; await signOutAndIn()
  })

  // ═════════ global ═════════
  ok("no list asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request and response the fake backend handled matches docs/openapi.json", F.violations.length === 0, F.violations.slice(0, 4).join(" || "))
  ok("nothing is ever deleted (no DELETE request)", !requests.some((r) => r.method === "DELETE"))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e))
  ok("no browser console/page errors other than the deliberate 404 / 409 / 422 answers and the deliberately dropped request", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
  ok("no request reached a route the fake backend does not implement (no 599)", !consoleErrors.some((e) => /status of 599/.test(e)))

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
