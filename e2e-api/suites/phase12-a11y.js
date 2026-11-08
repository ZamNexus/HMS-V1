// Phase 12 (G2) accessibility check: axe-core's structural rules run against the rendered screens in API mode (test backends, no real server). Colour contrast is a design review, not
// part of this scan. The scan reports a rule once per screen with the offending elements, so a fix can be targeted.
const fs = require("fs")
const { chromium } = require("@playwright/test")
process.chdir(require("path").resolve(__dirname, "../.."))
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")
const RULES = ["button-name", "link-name", "input-button-name", "label", "select-name", "aria-dialog-name", "aria-input-field-name", "aria-toggle-field-name", "aria-command-name", "image-alt", "duplicate-id", "duplicate-id-aria", "duplicate-id-active",
  "aria-required-attr", "aria-valid-attr", "aria-valid-attr-value", "aria-allowed-attr", "aria-required-children", "aria-required-parent", "aria-roles", "document-title", "html-has-lang", "html-lang-valid", "frame-title", "tabindex", "nested-interactive", "empty-table-header", "th-has-data-cells", "scope-attr-valid", "page-has-heading-one", "heading-order", "valid-lang", "meta-viewport"]
const results = []
const ok = (name, cond, extra = "") => results.push([cond ? "PASS" : "FAIL", name, extra])

;(async () => {
  const { validate, schemaOf } = await import(require("url").pathToFileURL(require("path").resolve(__dirname, "../../src/lib/services/http/specValidate.ts")).href)
  const stubs = require("../fakes/auth-stubs.js")
  const base = process.argv[2]
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) })
  const run = async (label, handler, paths, extra) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1600 } })
    const page = await context.newPage()
    await context.route("**/api/**", handler)
    await page.goto(base + "/login"); await page.locator("#hospitalCode").waitFor({ timeout: 15000 })
    // the sign-in page itself, before anyone is signed in
    const scan = async (name) => {
      await page.evaluate(AXE) // CDP evaluate: not subject to the page's Content-Security-Policy
      const res = await page.evaluate(async (rules) => {
        const r = await window.axe.run(document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 110) + " :: " + (n.html || "").slice(0, 90).replace(/\s+/g, " ")) }))
      }, RULES)
      ok(`A11Y ${label}: ${name}`, res.length === 0, res.map((v) => `${v.id}(${v.impact}) x${v.count}: ${v.sample.join(" || ")}`).join("  ;;  ").slice(0, 900))
    }
    await scan("/login")
    await page.locator("#hospitalCode").fill("H1"); await page.locator("#identifier").fill("tester"); await page.locator("#password").fill("pw")
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForURL("**/dashboard", { timeout: 15000 }); await page.waitForTimeout(1500)
    for (const [p, wait] of paths) {
      try { await page.goto(base + p); await page.waitForTimeout(wait || 1800); await scan(p) } catch (e) { ok(`A11Y ${label}: ${p}`, false, String(e.message).split("\n")[0].slice(0, 200)) }
    }
    if (extra) await extra(page, scan)
    await context.close()
  }

  const F11 = require("../fakes/reports-fake.js")({ validate, schemaOf, stubs })
  await run("billing/pharmacy/reports", F11.handler, [
    ["/dashboard"], ["/patients"], ["/appointments"], ["/encounters"], ["/billing/consultations"], ["/billing/payments"], ["/billing/transactions"], ["/billing/expenses"],
    ["/pharmacy/inventory"], ["/pharmacy/dispense"], ["/pharmacy/history"],
    ["/reports"], ["/reports?report=daily-transactions"], ["/reports?report=balances"], ["/reports?report=accounts"], ["/reports?report=lists"], ["/reports?report=daily"],
    ["/dashboard/stats"], ["/dashboard/stats?tab=opdipd"], ["/dashboard/stats?tab=summary"],
  ], async (page, scan) => {
    await page.goto(base + "/billing/payments"); await page.waitForTimeout(1200)
    await page.getByTestId(`payment-row-${F11.rcPay.id}`).click(); await page.getByTestId("receipt-dialog").waitFor(); await page.waitForTimeout(700); await scan("receipt dialog")
    await page.keyboard.press("Escape")
    await page.goto(base + "/pharmacy/inventory"); await page.waitForTimeout(1500)
    await page.getByRole("button", { name: "Add medicine" }).click(); await page.getByTestId("billing-dialog").waitFor(); await page.waitForTimeout(500); await scan("add medicine dialog")
  })

  const F9 = require("../fakes/diagnostics-fake.js")({ validate, schemaOf, stubs })
  await run("lab/imaging", F9.handler, [["/lab/orders"], ["/lab/orders/" + F9.labC.id], ["/lab/orders/" + F9.labA.id], ["/imaging/orders"], ["/imaging/orders/" + F9.imgC.id], ["/lab/orders/new"]])

  for (const r of results) console.log(r.join(" | "))
  console.log(`TOTAL ${results.length}  PASS ${results.filter((r) => r[0] === "PASS").length}  FAIL ${results.filter((r) => r[0] === "FAIL").length}`)
  await browser.close()
})().catch((e) => {
  for (const r of results) console.log(r.join(" | "))
  console.log("SCRIPT ERROR:", String(e.stack || e).slice(0, 2500))
  process.exit(1)
})
