import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { reportAllowed } from "@/components/reportsApi/ReportsApiHub"
import { LIST_KEYS, LIST_PERMISSIONS, listFromUrl } from "@/components/reportsApi/listsUi"
import { RP_GROUPS, RP_REPORTS, RP_TAKES_PERIOD, addDays, isDay, monthEnd, monthStart, periodFor, rangeFromUrl, weekStart } from "@/components/reportsApi/rpUi"
import { STATS_CHARGES, STATS_PAYMENT_TYPE, STATS_TABS, statsTabAllowed, statsTabFromUrl } from "@/components/reportsApi/statsUi"
import { ENDPOINTS } from "@/lib/services/endpoints"

// Phase 11 screens: the period presets (worked out from the hospital's date), who sees which report or tab, and the wiring. Pure logic is tested directly; the rest is checked in the source.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const has = (...perms: string[]) => (p: string) => perms.includes(p)

describe("date arithmetic is on plain days", () => {
  it("adds days across month and year ends, and across the leap day", () => {
    expect(addDays("2026-11-07", -1)).toBe("2026-11-06")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28")
  })
  it("finds the first and last day of a month", () => {
    expect(monthStart("2026-11-07")).toBe("2026-11-01")
    expect(monthEnd("2026-11-07")).toBe("2026-11-30")
    expect(monthEnd("2028-02-10")).toBe("2028-02-29")
    expect(monthEnd("2026-12-31")).toBe("2026-12-31")
  })
  it("starts a week on Monday", () => {
    expect(weekStart("2026-11-07")).toBe("2026-11-02") // a Saturday
    expect(weekStart("2026-11-02")).toBe("2026-11-02") // the Monday itself
    expect(weekStart("2026-11-08")).toBe("2026-11-02") // a Sunday belongs to the week that began on Monday
    expect(weekStart("2026-01-01")).toBe("2025-12-29")
  })
  it("accepts only real days", () => {
    expect(isDay("2026-02-29")).toBe(false)
    expect(isDay("2028-02-29")).toBe(true)
    expect(isDay("2026-11-07")).toBe(true)
    expect(isDay("2026-1-7")).toBe(false)
    expect(isDay(undefined)).toBe(false)
  })
})

describe("the period presets come from the hospital's today", () => {
  const today = "2026-11-07"
  it("Today, Yesterday, This Week, This Month and Last Month", () => {
    expect(periodFor("today", today).period).toEqual({ dateFrom: "2026-11-07", dateTo: "2026-11-07" })
    expect(periodFor("yesterday", today).period).toEqual({ dateFrom: "2026-11-06", dateTo: "2026-11-06" })
    expect(periodFor("week", today).period).toEqual({ dateFrom: "2026-11-02", dateTo: "2026-11-07" })
    expect(periodFor("month", today).period).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-07" })
    expect(periodFor("lastMonth", today).period).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-31" })
    expect(periodFor("lastMonth", "2027-01-15").period).toEqual({ dateFrom: "2026-12-01", dateTo: "2026-12-31" })
    expect(periodFor("lastMonth", "2028-03-02").period).toEqual({ dateFrom: "2028-02-01", dateTo: "2028-02-29" })
  })
  it("waits for the hospital's date: no period and no complaint while it loads", () => {
    expect(periodFor("today", null)).toEqual({ period: null, problem: null })
    expect(periodFor("month", null)).toEqual({ period: null, problem: null })
  })
  it("a custom period needs two real days in order and at most 366 days apart", () => {
    expect(periodFor("custom", today, { from: "2026-10-01", to: "2026-10-31" }).period).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-31" })
    expect(periodFor("custom", null, { from: "2026-10-01", to: "2026-10-31" }).period).not.toBeNull() // typed dates do not need the hospital's date
    expect(periodFor("custom", today, { from: "2026-10-01" })).toEqual({ period: null, problem: "Choose both dates." })
    expect(periodFor("custom", today, { from: "2026-10-31", to: "2026-10-01" }).problem).toMatch(/after the end/)
    expect(periodFor("custom", today, { from: "2026-01-01", to: "2027-01-03" }).problem).toMatch(/366/)
    expect(periodFor("custom", today, { from: "2026-01-01", to: "2027-01-02" }).problem).toBeNull()
    expect(periodFor("custom", today, { from: "2026-02-30", to: "2026-03-01" }).problem).toMatch(/both dates/)
  })
  it("an unknown range in the address bar falls back to This Month", () => {
    expect(rangeFromUrl("week")).toBe("week")
    expect(rangeFromUrl("decade")).toBe("month")
    expect(rangeFromUrl(undefined)).toBe("month")
  })
})

describe("who sees which report", () => {
  it("revenue and balances need reports.read; the day close either that or billing.read; accounts billing.read", () => {
    expect(reportAllowed("revenue", has("reports.read"))).toBe(true)
    expect(reportAllowed("revenue", has("billing.read"))).toBe(false)
    expect(reportAllowed("balances", has("reports.read"))).toBe(true)
    expect(reportAllowed("daily-transactions", has("billing.read"))).toBe(true)
    expect(reportAllowed("daily-transactions", has("reports.read"))).toBe(true)
    expect(reportAllowed("daily-transactions", has("patients.read"))).toBe(false)
    expect(reportAllowed("accounts", has("billing.read"))).toBe(true)
    expect(reportAllowed("accounts", has("reports.read"))).toBe(false)
  })
  it("the Lists report is offered to anyone who can read at least one of its lists", () => {
    expect(reportAllowed("lists", has("patients.read"))).toBe(true)
    expect(reportAllowed("lists", has("catalogs.read"))).toBe(true)
    expect(reportAllowed("lists", has("encounters.check_in"))).toBe(true)
    expect(reportAllowed("lists", has("billing.read"))).toBe(false)
  })
  it("each list needs its own read permission", () => {
    expect(LIST_PERMISSIONS.patients).toEqual(["patients.read"])
    expect(LIST_PERMISSIONS.doctors).toEqual(["doctors.read"])
    expect(LIST_PERMISSIONS.admitted).toEqual(["encounters.read", "encounters.check_in"])
    for (const k of ["services", "panels", "expense-heads", "lab-tests"] as const) expect(LIST_PERMISSIONS[k]).toEqual(["catalogs.read"])
    expect(listFromUrl("doctors")).toBe("doctors")
    expect(listFromUrl("nonsense")).toBe("patients")
  })
  it("every report and every list is in the hub and in a group", () => {
    expect([...RP_GROUPS.flatMap((g) => g.reports)].sort()).toEqual([...RP_REPORTS].sort())
    expect(LIST_KEYS).toHaveLength(7)
  })
})

describe("every report in the handoff has a route and a screen (Phase 13)", () => {
  it("every report of the handoff is on the list, and none is tagged 'Not connected'", () => {
    expect(read("src/components/reportsApi/ReportsApiHub.tsx")).not.toMatch(/Not connected|ContractPending|awaiting/)
    for (const r of ["daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics", "prescriptions"]) expect(RP_REPORTS as readonly string[]).toContain(r)
  })
  it("every report that is asked for a period takes the period bar; prescription history has its own filters", () => {
    expect([...RP_TAKES_PERIOD].sort()).toEqual(["cash-flow", "daily", "daily-transactions", "demographics", "expense", "lab", "opd", "pharmacy", "revenue"])
    expect(RP_TAKES_PERIOD.has("prescriptions" as never)).toBe(false)
  })
  it("the hub draws the generic document report for the seven period reports and prescription history on its own tab", () => {
    const src = read("src/components/reportsApi/ReportsApiHub.tsx")
    expect(src).toContain('const DOC_KINDS: readonly RpReport[] = ["daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics"]')
    expect(src).toContain("<DocReport kind={active as DocReportKind} period={result.period} />")
    expect(src).toContain("<PrescriptionHistory />")
  })
  it("the legacy, demo-shaped report keys stay null: the screens use the reportsApi.* routes and no payload is guessed for the old ones", () => {
    for (const k of ["reports.dailySummary", "reports.opdStatistics", "reports.laboratory", "reports.pharmacy", "reports.demographics", "reports.prescriptionHistory"] as const) expect(ENDPOINTS[k]).toBeNull()
  })
})

describe("Financial Statistics tabs", () => {
  it("each charges tab reads its own filter (handoff 8.11) and each payments tab its type", () => {
    expect(STATS_CHARGES.services).toEqual({ sourceType: "service" })
    expect(STATS_CHARGES.checkups).toEqual({ sourceType: "consultation" })
    expect(STATS_CHARGES.medicine).toEqual({ sourceType: "pharmacy" })
    expect(STATS_CHARGES.lab).toEqual({ diagnosticType: "lab" })
    expect(STATS_CHARGES.xray).toEqual({ modality: "X-Ray" })
    expect(STATS_CHARGES.ecg).toEqual({ modality: "ECG" })
    expect(STATS_CHARGES.ultrasound).toEqual({ modality: "Ultrasound" })
    expect(STATS_PAYMENT_TYPE).toEqual({ receipts: "advance", payments: "payment" })
  })
  it("every one of the 14 tabs has a route now, including Summary, Expenses, Bank and Graphs", () => {
    expect(read("src/components/reportsApi/StatsApiHub.tsx")).not.toMatch(/Not connected|ContractPending|awaiting/)
    expect(STATS_TABS).toHaveLength(14)
    const src = read("src/components/reportsApi/StatsApiHub.tsx")
    expect(src).toContain('<DocReport kind="financial-summary" period={result.period} />')
    expect(src).toContain("<RevenueGraph period={result.period} />")
    expect(src).toContain("<ExpensesApiTab period={result.period} />")
    expect(src).toContain("<BankApiTab period={result.period} />")
  })
  it("the registers need billing.read, Expenses and Bank accounts.read, Summary and Graphs reports.read", () => {
    expect(statsTabAllowed("services", has("billing.read"))).toBe(true)
    expect(statsTabAllowed("services", has("reports.read"))).toBe(false)
    expect(statsTabAllowed("opdipd", has("billing.read"))).toBe(true)
    expect(statsTabAllowed("expenses", has("accounts.read"))).toBe(true)
    expect(statsTabAllowed("bank", has("billing.read"))).toBe(false)
    expect(statsTabAllowed("summary", has("reports.read"))).toBe(true)
    expect(statsTabAllowed("graphs", has("billing.read"))).toBe(false)
    expect(statsTabFromUrl("lab")).toBe("lab")
    expect(statsTabFromUrl("zzz")).toBeUndefined()
  })
})

describe("the wiring", () => {
  it("no report component adds up, rounds or re-derives a figure (the server's text is shown as sent)", () => {
    for (const f of ["RevenueTab", "DayCloseTab", "BalancesTab", "ListsApi", "ReportsApiHub", "StatsApiHub", "PeriodBar"]) {
      const code = read(`src/components/reportsApi/${f}.tsx`)
      expect(code, f).not.toMatch(/\.reduce\(|addMoney|subMoney|sumMoney|parseFloat|toFixed|Number\(.*(revenue|received|outstanding|amount)/)
    }
    expect(read("src/components/reportsApi/rpUi.ts")).not.toMatch(/\.reduce\(/)
  })
  it("the Lists report is server-paged: it never loads every row of a list", () => {
    const src = read("src/components/reportsApi/ListsApi.tsx")
    expect(src).not.toMatch(/listAll/)
    expect(src).toContain("const PAGE_SIZE = 10")
    expect(src).toContain('type: "ipd", status: "open"')
  })
  it("the reports and statistics pages switch to the new screens only in API mode, under a Suspense boundary", () => {
    for (const [file, mock, hub] of [["src/app/(dashboard)/reports/page.tsx", "MockReportsPage", "ReportsApiHub"], ["src/app/(dashboard)/dashboard/stats/page.tsx", "MockStatsPage", "StatsApiHub"]] as const) {
      const src = read(file)
      expect(src, file).toContain(`function ${mock}()`)
      expect(src, file).toContain('if (dataSource !== "api") return ')
      expect(src, file).toContain(`<${hub} />`)
      expect(src, file).toContain("<Suspense")
    }
  })
  it("the dashboard's two list widgets ask for a few rows, show each only to who may read it, and keep the server's order", () => {
    const src = read("src/components/dashboard/DashboardListsApi.tsx")
    expect(src).toContain("UP_NEXT_ROWS = 8")
    expect(src).toContain("RECENT_PATIENTS_ROWS = 5")
    expect(src).toContain('can("appointments.read")')
    expect(src).toContain('can("patients.read")')
    expect(src).not.toMatch(/\.sort\(/)
    const page = read("src/app/(dashboard)/dashboard/page.tsx")
    expect(page).toContain('{dataSource === "api" && <DashboardListsApi />}')
    expect(page).toContain('dataSource === "api" ? Promise.resolve({ items: [], total: 0 }) : loadRecentPatients(signal)') // no page of 100 patients on every load
  })
  it("the registers can be given the screen's own period and a locked charge kind", () => {
    const src = read("src/components/billing/RegistersTabs.tsx")
    expect(src).toContain("period?: RpPeriod | null")
    expect(src).toContain("lock?: Pick<ChargeListOptions")
    expect(src).toContain("{period === undefined && <DateRange")
    const inv = read("src/components/billing/InvoicesTab.tsx")
    expect(inv).toContain("lockType?:")
    expect(inv).toContain("enabled: allowed && period !== null")
  })
})
