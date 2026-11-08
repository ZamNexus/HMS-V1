import { expect, test, type Page } from "@playwright/test"
import type { Role } from "../src/types"

// Smoke tests. Login is now the real backend API (hospital code + identifier +
// password), so tests that need a signed-in session are SKIPPED until
// credentials and the role mapping exist (Phase 2 follow-up): they relied on
// demo accounts. Tests that do not need a session, or that stub the login
// request, still run.


// Demo accounts no longer exist and the backend's role mapping is not wired in.
async function signIn(_page: Page, _role: Role) { // eslint-disable-line @typescript-eslint/no-unused-vars
  test.skip(true, "Needs a real backend session with a mapped role (Phase 2 follow-up)")
}

const sidebar = (page: Page) => page.locator("aside")

// Menus per role are checked by src/lib/session/permissions.test.ts against the handoff's role matrix (permissions, not roles).

test("a rejected login shows the backend message and stays on login", async ({ page }) => {
  // Stubbed response: keeps CI off the real backend (and its auth rate limit).
  // The real invalid-login behaviour is checked manually against the dev backend.
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 401, code: "STUB", message: "Stubbed rejection.", requestId: "req-stub", path: "/api/v1/auth/login", timestamp: new Date().toISOString() }),
    })
  )
  await page.goto("/login")
  await page.locator("#hospitalCode").fill("H1")
  await page.locator("#identifier").fill("someone")
  await page.locator("#password").fill("pw")
  await page.getByRole("button", { name: /^sign in/i }).click()
  // exact: the toast also renders a screen-reader announcement containing the same text
  await expect(page.getByText("Stubbed rejection. (Reference: req-stub)", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("login requires hospital code, username/email and password", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: /^sign in/i }).click()
  await expect(page.getByText("Hospital code is required")).toBeVisible()
  await expect(page.getByText("Username or email is required")).toBeVisible()
  await expect(page.getByText("Password is required")).toBeVisible()
})

test("signed-out visitors are redirected from dashboard pages to login", async ({ page }) => {
  for (const path of ["/dashboard", "/patients", "/admin/users"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
})

test("unknown billing and pharmacy tabs return 404; known tabs load", async ({ request }) => {
  // The proxy only checks that the session-hint cookie exists
  const headers = { cookie: "hms_session=1" }
  for (const path of ["/billing/bogus", "/pharmacy/bogus", "/billing/Consultations"]) {
    expect((await request.get(path, { headers, maxRedirects: 0 })).status(), path).toBe(404)
  }
  for (const path of ["/billing/consultations", "/billing/expenses", "/pharmacy/inventory", "/pharmacy/dispense"]) {
    expect((await request.get(path, { headers, maxRedirects: 0 })).status(), path).toBe(200)
  }
})

test("a nurse is denied the admin pages", async ({ page }) => {
  await signIn(page, "nurse")
  await page.goto("/admin/users")
  await expect(page.getByRole("heading", { name: /403/ })).toBeVisible()
})

test("no token or credentials are written to web storage", async ({ page }) => {
  await signIn(page, "admin")
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
  expect(stored).not.toMatch(/token|password/i)
})

test("an expired session cookie shows the sign-in form, not 'Already signed in'", async ({ page, context }) => {
  await signIn(page, "admin")
  await context.clearCookies({ name: "hms_session" })
  await page.goto("/login")
  await expect(page.locator("#email")).toBeVisible()
  await expect(page.getByText("Already signed in")).toHaveCount(0)
})

test("signing out returns to login and protects the dashboard again", async ({ page }) => {
  await signIn(page, "receptionist")
  await sidebar(page).getByRole("button", { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login$/)
})

test("a receptionist registers a patient and lands on the new profile", async ({ page }) => {
  await signIn(page, "receptionist")
  // Hard-load the form; saving then navigates client-side, so the new record is
  // still in the in-memory demo data when the profile renders
  await page.goto("/patients/new")
  const name = `E2E Patient ${Date.now()}`
  await page.locator("#name").fill(name)
  await page.locator("#dob").fill("1990-05-15")
  await page.locator("#phone").fill("0300-1234567")
  await page.getByRole("button", { name: "Register Patient" }).click()
  await expect(page).toHaveURL(/\/patients\/\d+$/)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
})

test("navigation controls are real links and navigate", async ({ page }) => {
  // Landing page
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/login")
  await signIn(page, "admin")

  // Dashboard call-to-action
  const register = page.getByRole("link", { name: "Register Patient" })
  await expect(register).toHaveAttribute("href", "/patients/new")

  // Billing tabs: links with aria-current on the active one
  await page.goto("/billing/consultations")
  const tabs = page.getByRole("link", { name: "Expenses", exact: true })
  await expect(page.getByRole("link", { name: "Consultations", exact: true })).toHaveAttribute("aria-current", "page")
  await tabs.click()
  await expect(page).toHaveURL(/\/billing\/expenses$/)
  await expect(tabs).toHaveAttribute("aria-current", "page")

  // Breadcrumb and account menu
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Citi Clinic" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Profile Settings" }).click()
  await expect(page).toHaveURL(/\/profile$/)
})

test("every breadcrumb link points at a page that exists", async ({ page, request }) => {
  await signIn(page, "admin")
  const hrefs = new Set<string>()
  for (const path of ["/admin/users", "/admin/master-data", "/lab/orders/1/results", "/imaging/orders/1", "/encounters/3/discharge", "/billing/consultations/new", "/patients/1/edit", "/dashboard/stats"]) {
    await page.goto(path)
    for (const href of await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))
      hrefs.add(href)
  }
  const broken: string[] = []
  for (const href of hrefs) {
    const status = (await request.get(href, { headers: { cookie: "hms_session=1" } })).status()
    if (status !== 200) broken.push(`${href} → ${status}`)
  }
  expect(broken).toEqual([])
})

test("saving an incomplete form explains what is missing", async ({ page }) => {
  await signIn(page, "admin")
  await sidebar(page).getByRole("link", { name: "Medical Staff", exact: true }).click()
  await page.getByRole("button", { name: "Add Doctor" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Save Doctor" }).click()
  await expect(page.getByText("Please fix these fields", { exact: true })).toBeVisible()
  await expect(page.getByText("Full Name is required · Consultation Fee is required", { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible() // nothing was saved; the dialog stays open
})

test("encounter rows can be opened from the keyboard", async ({ page }) => {
  await signIn(page, "doctor")
  await sidebar(page).getByRole("link", { name: "Encounters", exact: true }).click()
  await expect(page).toHaveURL(/\/encounters$/)
  // The encounter ID badge (e.g. OPD-2024-0001), not the "New Encounter" link
  const firstEncounterLink = page.locator("main").getByRole("link", { name: /^(OPD|IPD)-\d{4}-\d+$/ }).first()
  await firstEncounterLink.focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/encounters\/\d+$/)
})
