import { expect, test, type Page } from "@playwright/test"
import { USERS } from "../src/data/users"

// Every <label for> and aria-labelledby must point at a real element, and ids
// must be unique (generated ids use React.useId, plus a row key inside lists).

async function signInAsAdmin(page: Page) {
  const admin = USERS.find((u) => u.role === "admin")!
  await page.goto("/login")
  await page.locator("#email").fill(admin.email)
  await page.locator("#password").fill(admin.password)
  await page.getByRole("button", { name: /^sign in/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function labelProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = []
    const counts = new Map<string, number>()
    for (const el of Array.from(document.querySelectorAll("[id]"))) counts.set(el.id, (counts.get(el.id) ?? 0) + 1)
    for (const [id, n] of counts) if (n > 1) problems.push(`duplicate id "${id}" (${n}x)`)
    for (const label of Array.from(document.querySelectorAll("label[for]"))) {
      const id = label.getAttribute("for")!
      if (!document.getElementById(id)) problems.push(`label "${label.textContent?.trim()}" points at missing #${id}`)
    }
    for (const el of Array.from(document.querySelectorAll("[aria-labelledby]"))) {
      for (const id of el.getAttribute("aria-labelledby")!.split(/\s+/)) if (!document.getElementById(id)) problems.push(`aria-labelledby points at missing #${id}`)
    }
    return { problems, labelled: document.querySelectorAll("label[for]").length }
  })
}

const PAGES: { path: string; open?: string; next?: boolean }[] = [
  { path: "/patients/new" },
  // Step 1 is only the patient search; check the Details step
  { path: "/encounters/new?patientId=1", next: true },
  { path: "/billing/consultations/new" },
  { path: "/billing/services/new" },
  { path: "/lab/orders/new" },
  { path: "/imaging/orders/new" },
  { path: "/lab/orders/1/results" },
  { path: "/encounters/3/discharge" },
  { path: "/pharmacy/dispense" },
  { path: "/admin/doctors", open: "Add Doctor" },
  { path: "/admin/users", open: "Add User" },
  { path: "/admin/master-data", open: "Add Service" },
  { path: "/billing/expenses", open: "Record Expense" },
]

test("form labels resolve and ids are unique", async ({ page }) => {
  test.setTimeout(120_000)
  await signInAsAdmin(page)
  const failures: string[] = []
  for (const { path, open, next } of PAGES) {
    await page.goto(path)
    await page.waitForLoadState("networkidle")
    if (open) await page.getByRole("button", { name: open }).first().click()
    if (next) await page.getByRole("button", { name: "Next" }).click()
    const { problems, labelled } = await labelProblems(page)
    if (labelled === 0) failures.push(`${path}${open ? ` → ${open}` : ""}: no linked labels found`)
    for (const p of problems) failures.push(`${path}${open ? ` → ${open}` : ""}: ${p}`)
  }
  expect(failures).toEqual([])
})

test("clicking a label focuses its field", async ({ page }) => {
  await signInAsAdmin(page)
  await page.goto("/admin/doctors")
  await page.getByRole("button", { name: "Add Doctor" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByText("Consultation Fee (Rs.) *", { exact: true }).click()
  await expect(dialog.getByLabel("Consultation Fee (Rs.) *")).toBeFocused()
})
