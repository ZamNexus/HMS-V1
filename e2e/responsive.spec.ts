import { expect, test } from "@playwright/test"
import { USERS } from "../src/data/users"

// Guards against the page itself scrolling sideways (content wider than the
// screen). Wide tables are fine as long as they scroll inside their own container.

const PAGES = [
  "/", "/login", "/dashboard", "/patients", "/patients/1", "/patients/new",
  "/encounters", "/encounters/new", "/encounters/1", "/billing/consultations",
  "/lab/orders", "/pharmacy/inventory", "/reports", "/admin/users", "/admin/master-data",
]

const SIZES = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
}

for (const [label, viewport] of Object.entries(SIZES)) {
  test(`no page scrolls sideways on ${label} (${viewport.width}px)`, async ({ browser }) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const admin = USERS.find((u) => u.role === "admin")!
    await page.goto("/login")
    await page.locator("#email").fill(admin.email)
    await page.locator("#password").fill(admin.password)
    await page.getByRole("button", { name: /^sign in/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    const overflowing: string[] = []
    for (const path of PAGES) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (extra > 0) overflowing.push(`${path} (+${extra}px)`)
    }
    await context.close()
    expect(overflowing, `pages wider than ${viewport.width}px`).toEqual([])
  })
}
