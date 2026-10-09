import { expect, test, type Page } from "@playwright/test"
import { USERS } from "../src/data/users"
import { SIDEBAR_VISIBILITY } from "../src/lib/auth"
import type { Role } from "../src/types"

// Smoke tests for the demo build. Credentials and role rules come from the app's
// own modules so they can't drift. Replace the login helper when the backend
// auth (hospital code + identifier) is wired in.

// Sidebar label for each SIDEBAR_VISIBILITY key (src/components/layout/Sidebar.tsx)
const NAV_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  patients: "Patients",
  encounters: "Encounters",
  billing: "Billing & Invoices",
  laboratory: "Laboratory",
  imaging: "Imaging & Radiology",
  pharmacy: "Pharmacy Inventory",
  users: "User Access",
  doctors: "Medical Staff",
  "master-data": "Master Data",
  reports: "Analytics & Reports",
}

function account(role: Role) {
  const user = USERS.find((u) => u.role === role)
  if (!user) throw new Error(`No demo user with role ${role}`)
  return user
}

async function signIn(page: Page, role: Role) {
  const { email, password } = account(role)
  await page.goto("/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: /^(sign in|continue as)/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

const sidebar = (page: Page) => page.locator("aside")

for (const role of Object.keys(SIDEBAR_VISIBILITY) as Role[]) {
  test(`${role} signs in and sees only their sidebar sections`, async ({ page }) => {
    await signIn(page, role)
    const allowed = new Set(SIDEBAR_VISIBILITY[role])
    for (const [key, label] of Object.entries(NAV_LABELS)) {
      const link = sidebar(page).getByRole("link", { name: label, exact: true })
      if (allowed.has(key)) await expect(link, `${role} should see ${label}`).toBeVisible()
      else await expect(link, `${role} should not see ${label}`).toHaveCount(0)
    }
  })
}

test("wrong password shows an error and stays on login", async ({ page }) => {
  await page.goto("/login")
  await page.locator("#email").fill(account("admin").email)
  await page.locator("#password").fill("definitely-not-the-password")
  await page.getByRole("button", { name: /^sign in/i }).click()
  // exact: the toast also renders a screen-reader announcement containing the same text
  await expect(page.getByText("Invalid email or password.", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("signed-out visitors are redirected from dashboard pages to login", async ({ page }) => {
  for (const path of ["/dashboard", "/patients", "/admin/users"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
})

test("unknown billing and pharmacy tabs return 404; known tabs load", async ({ request }) => {
  // The demo proxy only checks that the session cookie exists
  const headers = { cookie: "hms_user=x" }
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

test("the stored session never contains the password", async ({ page }) => {
  await signIn(page, "admin")
  const stored = await page.evaluate(() => localStorage.getItem("hms_user"))
  expect(stored).toBeTruthy()
  expect(JSON.parse(stored!)).not.toHaveProperty("password")
})

test("an expired session cookie shows the sign-in form, not 'Already signed in'", async ({ page, context }) => {
  await signIn(page, "admin")
  await context.clearCookies({ name: "hms_user" })
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
