// Phase 12 (G1) browser check: printing. TEST HARNESS ONLY. Print MEDIA is emulated and real PDFs are produced by the browser (page.pdf with the page's own @page size), so paper size, page
// count and what is hidden are checked for real. Part A uses the lab/imaging test backend (p9-fake), part B the pharmacy+billing one (p11-fake). No real backend, no credentials.
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])
const MM = 72 / 25.4

// the size and the number of pages of a PDF, read from the file the browser wrote
const pdfInfo = (buf) => {
  const s = buf.toString("latin1")
  const box = s.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
  const pages = (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length
  return { w: box ? Number(box[3]) - Number(box[1]) : NaN, h: box ? Number(box[4]) - Number(box[2]) : NaN, pages }
}
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const session = async (handler) => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1800 } })
    const page = await context.newPage()
    const consoleErrors = []
    page.on("console", (c) => { if (c.type() === "error" && !/\/(auth\/refresh|public\/hospital)/.test(c.location().url || "")) consoleErrors.push(c.text().slice(0, 200)) })
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)))
    await context.route("**/api/**", handler)
    const login = async () => {
      await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
      await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
      await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(800)
    }
    const go = async (p) => { await page.evaluate((x) => window.next.router.push(x), p); await page.waitForFunction((x) => location.pathname === x.split("?")[0], p, { timeout: 10000 }); await page.waitForTimeout(1000) }
    return { context, page, login, go, consoleErrors }
  }
  const step = async (name, fn) => { try { await fn() } catch (e) { ok(`SECTION "${name}" ran to the end`, false, String(e.message || e).split("\n")[0].slice(0, 220)) } }
  /** What the print shows: every element outside the print root that still takes space, and the dialog's clipping properties, under print media. */
  const printState = (page) => page.evaluate(() => {
    const root = document.querySelector(".print-root")
    const visibleOutside = [...document.body.querySelectorAll("*")].filter((el) => !root.contains(el) && !el.contains(root) && getComputedStyle(el).display !== "none" && !["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(el.tagName) && el.closest("[data-nextjs-toast],nextjs-portal,next-route-announcer") === null)
    const siblingsOfRootAncestors = visibleOutside.filter((el) => el.parentElement && el.parentElement.contains(root))
    const dlg = root.closest('[role="dialog"]')
    const cs = dlg ? getComputedStyle(dlg) : null
    return { siblings: siblingsOfRootAncestors.map((e) => e.tagName + "." + String(e.className).slice(0, 40)), dialog: cs ? { position: cs.position, overflow: cs.overflow + "/" + cs.overflowY, maxHeight: cs.maxHeight, transform: cs.transform, translate: cs.translate, scale: cs.scale, animation: cs.animationName, display: cs.display, className: String(dlg.className).slice(0, 160) } : null, rootHeight: root.getBoundingClientRect().height, title: document.title }
  })

  // ═════════ Part A: lab report, imaging report, tube label (A4 and label paper) ═════════
  await step("A lab and imaging", async () => {
    const F = require("../fakes/diagnostics-fake.js")({ validate, schemaOf, stubs })
    const { labC, labA, imgC } = F
    const s = await session(F.handler)
    const { page, go } = s
    await s.login()
    const tid = (id) => page.getByTestId(id)
    const closeDialogs = async () => { for (let i = 0; i < 3; i++) { if ((await page.getByRole("dialog").count()) === 0) break; await page.keyboard.press("Escape"); await page.waitForTimeout(250) } }

    await go("/lab/orders/" + labC.id); await tid("lab-order-detail").waitFor({ timeout: 8000 })
    await tid("order-actions").getByRole("button", { name: "Report" }).click(); await tid("report-dialog").waitFor(); await page.waitForTimeout(900)
    ok("G1 the lab report is a .print-root with A4 as its only paper", (await tid("lab-report").getAttribute("class")).includes("print-root") && (await tid("print-a4").count()) === 1 && (await tid("print-thermal").count()) === 0)
    await tid("print-a4").click(); await page.waitForTimeout(300)
    ok("G1 pressing Print sets the paper just for the print: html[data-paper=a4] and an A4 @page style", (await page.evaluate(() => document.documentElement.getAttribute("data-paper"))) === "a4" && (await page.evaluate(() => document.querySelector("style[data-hms-page=a4]")?.textContent ?? "")).includes("size: A4"))
    await page.emulateMedia({ media: "print" })
    const st = await printState(page)
    ok("G1 in print the rest of the app takes no space (no blank pages where the app was)", st.siblings.length === 0, JSON.stringify(st.siblings))
    ok("G1 in print the dialog is not a fixed, scrolling, clipped box any more", st.dialog && st.dialog.position === "static" && st.dialog.overflow.startsWith("visible") && st.dialog.maxHeight === "none" && (st.dialog.transform === "none" || st.dialog.transform === "matrix(1, 0, 0, 1, 0, 0)") && st.dialog.animation === "none", JSON.stringify(st.dialog))
    ok("G1 the page title carries no patient data", !new RegExp(labC.patient?.name || "ZZZZ", "i").test(st.title) && !/MR-/.test(st.title), st.title)
    const one = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    ok("G1 the lab report prints on A4 (595 x 842 pt) in one page", near(one.w, 595.3) && near(one.h, 841.9) && one.pages === 1, JSON.stringify(one))
    // a long report: 70 copies of the tests in the DOM must come out as several pages, not be cut at the dialog's edge
    await page.evaluate(() => { const r = document.querySelector(".print-root"); const t = r.querySelector("[data-testid^=print-test-]"); for (let i = 0; i < 70; i++) r.appendChild(t.cloneNode(true)) })
    const many = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    ok("G1 a long report is NOT cut at the dialog's edge: it runs over several pages", many.pages >= 3, JSON.stringify(many))
    await page.emulateMedia({ media: "screen" })
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
    ok("G1 after the print the paper settings are removed (nothing is left behind)", (await page.evaluate(() => document.documentElement.getAttribute("data-paper"))) === null && (await page.evaluate(() => document.querySelectorAll("style[data-hms-page]").length)) === 0)
    await closeDialogs()

    // the tube label
    await go("/lab/orders/" + labA.id); await tid("lab-order-detail").waitFor({ timeout: 8000 })
    const spec = labA.specimens.find((x) => x.status !== "rejected")
    await tid(`label-${spec.id}`).click(); await tid("label-dialog").waitFor(); await page.waitForTimeout(500)
    ok("G1 the tube label shows the tube number, the patient, the MR number, the specimen type and the order number", /^SPM-\d{4}-\d{6}$/.test(await tid("label-specimen-no").innerText()) && (await tid("label-patient").innerText()) === labA.patient.name && (await tid("label-mr").innerText()) === labA.patient.mrNo && (await tid("specimen-label").innerText()).includes("EDTA whole blood") && /LAB-\d{4}-\d{4}/.test(await tid("specimen-label").innerText()), (await tid("specimen-label").innerText()).replace(/\n/g, " | ") + " :: expected " + [spec.specimenNo, labA.patient.name, labA.patient.mrNo, spec.specimenType, labA.orderNo].join(" / "))
    await tid("print-label").click(); await page.waitForTimeout(300)
    ok("G1 the label prints on its own paper: html[data-paper=label] and a 50 x 25 mm @page", (await page.evaluate(() => document.documentElement.getAttribute("data-paper"))) === "label" && (await page.evaluate(() => document.querySelector("style[data-hms-page=label]")?.textContent ?? "")).includes("50mm 25mm"))
    await page.emulateMedia({ media: "print" })
    const lab = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    ok("G1 the label comes out at 50 x 25 mm on ONE page", near(lab.w, 50 * MM, 2) && near(lab.h, 25 * MM, 2) && lab.pages === 1, JSON.stringify(lab))
    await page.emulateMedia({ media: "screen" }); await page.evaluate(() => window.dispatchEvent(new Event("afterprint"))); await closeDialogs()
    // a rejected tube has no label
    const rejected = labA.specimens.find((x) => x.status === "rejected") || null
    ok("G1 a rejected tube is not offered a label", rejected === null || (await tid(`label-${rejected.id}`).count()) === 0)

    // imaging
    await go("/imaging/orders/" + imgC.id); await tid("imaging-order-detail").waitFor({ timeout: 8000 })
    const rep = tid("order-actions").getByRole("button", { name: "Report" })
    if (await rep.count()) {
      await rep.click(); await tid("report-dialog").waitFor(); await page.waitForTimeout(900)
      ok("G1 the imaging report is a .print-root printed on A4", (await tid("imaging-report").getAttribute("class")).includes("print-root") && (await tid("print-a4").count()) === 1)
      await closeDialogs()
    } else ok("G1 the imaging report is a .print-root printed on A4", false, "no Report button on the chosen imaging order")
    ok("A no browser errors other than deliberate answers", s.consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e)).length === 0, s.consoleErrors.join(" | "))
    await s.context.close()
  })

  // ═════════ Part B: receipt and dispense slip (A4 and the 80 mm roll) ═════════
  await step("B receipt and slip", async () => {
    const F = require("../fakes/reports-fake.js")({ validate, schemaOf, stubs })
    const { rcPay, P } = F
    const s = await session(F.handler)
    const { page, go } = s
    await s.login()
    const tid = (id) => page.getByTestId(id)
    const closeDialogs = async () => { for (let i = 0; i < 3; i++) { if ((await page.getByRole("dialog").count()) === 0) break; await page.keyboard.press("Escape"); await page.waitForTimeout(250) } }

    await go("/billing/payments"); await page.waitForTimeout(800)
    await tid(`payment-row-${rcPay.id}`).click(); await tid("receipt-dialog").waitFor(); await page.waitForTimeout(900)
    ok("G1 the receipt offers A4 and an 80 mm roll", (await tid("print-a4").count()) === 1 && (await tid("print-thermal").count()) === 1 && /Print A4/.test(await tid("print-a4").innerText()) && /80 mm/.test(await tid("print-thermal").innerText()))
    await tid("print-thermal").click(); await page.waitForTimeout(300)
    ok("G1 the roll sets html[data-paper=thermal] and an 80 mm @page", (await page.evaluate(() => document.documentElement.getAttribute("data-paper"))) === "thermal" && (await page.evaluate(() => document.querySelector("style[data-hms-page=thermal]")?.textContent ?? "")).includes("80mm"))
    await page.emulateMedia({ media: "print" })
    const w = await page.evaluate(() => ({ width: document.querySelector(".print-root").getBoundingClientRect().width, grid: getComputedStyle(document.querySelector(".print-root .grid")).gridTemplateColumns }))
    ok("G1 on the roll the receipt is one narrow column (72 mm wide, the three account boxes stacked)", near(w.width, 72 * 96 / 25.4, 6) && !/ .+ /.test(w.grid.trim().replace(/\s+/g, " ")) , JSON.stringify(w))
    const pdf = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    ok("G1 the roll PDF is 80 mm wide", near(pdf.w, 80 * MM, 2) && pdf.pages >= 1, JSON.stringify(pdf))
    await page.emulateMedia({ media: "screen" }); await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
    await tid("print-a4").click(); await page.waitForTimeout(300); await page.emulateMedia({ media: "print" })
    const a4 = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    ok("G1 the same receipt on A4 is A4", near(a4.w, 595.3) && near(a4.h, 841.9), JSON.stringify(a4))
    await page.emulateMedia({ media: "screen" }); await page.evaluate(() => window.dispatchEvent(new Event("afterprint"))); await closeDialogs()

    // the dispense slip: make a dispense through the screen, then print its slip
    await go("/pharmacy/dispense"); await tid("dispense-form").waitFor({ timeout: 8000 })
    await page.locator("#pm-patient").fill("zain"); await page.waitForTimeout(1300); await tid("dispense-form").getByText("Zainab Qureshi").first().click(); await page.waitForTimeout(900)
    await page.getByLabel("Medicine 1", { exact: true }).fill("pana"); await page.waitForTimeout(1300); await tid("medicine-options").getByRole("button", { name: /Panadol syrup/ }).click()
    await page.getByLabel("Quantity 1", { exact: true }).fill("1")
    await page.getByRole("button", { name: "Dispense", exact: true }).click(); await tid("dispense-result").waitFor({ timeout: 10000 })
    await page.getByRole("button", { name: "Print slip" }).click(); await tid("slip-dialog").waitFor(); await page.waitForTimeout(900)
    ok("G1 the dispense slip offers A4 and an 80 mm roll", (await tid("print-a4").count()) === 1 && (await tid("print-thermal").count()) === 1 && (await tid("dispense-slip").getAttribute("class")).includes("print-root"))
    await tid("print-thermal").click(); await page.waitForTimeout(300); await page.emulateMedia({ media: "print" })
    const slip = pdfInfo(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    const st = await printState(page)
    ok("G1 the slip on the roll is 80 mm wide and the rest of the app is out of the layout", near(slip.w, 80 * MM, 2) && st.siblings.length === 0, JSON.stringify({ slip, siblings: st.siblings }))
    await page.emulateMedia({ media: "screen" })
    ok("B no browser errors other than deliberate answers", s.consoleErrors.filter((e) => !/status of (400|401|403|404|409|422|500)|net::ERR_FAILED/.test(e)).length === 0, s.consoleErrors.join(" | "))
    await s.context.close()
  })

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
