import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  IMAGING_ORDER_ACTION_ORDER, IMAGING_TAB_LABEL, IMAGING_TABS, IMAGING_TEST_ACTION_LABEL, IMAGING_TEST_ACTION_ORDER, LAB_ORDER_ACTION_LABEL, LAB_ORDER_ACTION_ORDER, LAB_TAB_LABEL, LAB_TABS, LAB_TEST_ACTION_LABEL,
  LAB_TEST_ACTION_ORDER, SPECIMEN_ACTION_LABEL, SPECIMEN_ACTION_ORDER, criticalFirst, flagClass, imagingTabQuery, inOrder, labTabQuery, rangeFor, resultRows, rowsToParameters,
} from "@/components/diagnostics/dxUi"
import { testLinesOf, type PickedTest } from "@/components/diagnostics/TestPicker"

// Phase 9 screens: the rules that decide what is shown (the server's allowedActions, in a fixed order), the worklist queries, the result form's rows and the wiring.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")

describe("buttons are exactly the server's allowedActions", () => {
  it("only an allowed action is shown, in the fixed order, whatever order the server sent them in", () => {
    expect(inOrder(["cancel", "verify"], LAB_TEST_ACTION_ORDER)).toEqual(["verify", "cancel"])
    expect(inOrder(["archive", "add_test", "deliver"], LAB_ORDER_ACTION_ORDER)).toEqual(["add_test", "deliver", "archive"])
    expect(inOrder(["reject", "collect"], SPECIMEN_ACTION_ORDER)).toEqual(["collect", "reject"])
    expect(inOrder(["sign", "write_report"], IMAGING_TEST_ACTION_ORDER)).toEqual(["write_report", "sign"])
    expect(inOrder([], LAB_TEST_ACTION_ORDER)).toEqual([])
  })
  it("property: for every subset of the actions, the buttons are that subset, each once, and every action has a label", () => {
    const groups = [
      [LAB_ORDER_ACTION_ORDER, LAB_ORDER_ACTION_LABEL], [SPECIMEN_ACTION_ORDER, SPECIMEN_ACTION_LABEL], [LAB_TEST_ACTION_ORDER, LAB_TEST_ACTION_LABEL],
      [IMAGING_ORDER_ACTION_ORDER, null], [IMAGING_TEST_ACTION_ORDER, IMAGING_TEST_ACTION_LABEL],
    ] as const
    for (const [order, labels] of groups) {
      const all = [...order] as string[]
      for (let m = 0; m < 1 << all.length; m++) {
        const subset = all.filter((_, i) => m & (1 << i))
        const shuffled = [...subset].reverse()
        const shown = inOrder(shuffled as never[], order as never[]) as string[]
        expect(new Set(shown).size, "each once").toBe(shown.length)
        expect([...shown].sort(), "exactly the allowed ones").toEqual([...subset].sort())
      }
      if (labels) for (const a of all) expect((labels as Record<string, string>)[a], a).toBeTruthy()
    }
  })
  it("an action the code does not know is never shown", () => {
    expect(inOrder(["cancel", "teleport"] as never[], LAB_TEST_ACTION_ORDER)).toEqual(["cancel"])
  })
})

describe("worklists are one route with a different query (handoff 8.7 and 8.8)", () => {
  it("lab: the collection worklist is toCollect urgent-first; the bench is collected, verification in progress, hand-over completed", () => {
    expect(labTabQuery("all")).toEqual({})
    expect(labTabQuery("collect")).toEqual({ toCollect: true, sort: "priority:desc" })
    expect(labTabQuery("bench")).toEqual({ status: "collected" })
    expect(labTabQuery("bench", "in_progress")).toEqual({ status: "in_progress" }) // handoff 8.7: the bench is collected, THEN in progress
    expect(labTabQuery("verify")).toEqual({ status: "in_progress" })
    expect(labTabQuery("handover")).toEqual({ status: "completed" })
    for (const t of LAB_TABS) expect(LAB_TAB_LABEL[t]).toBeTruthy()
  })
  it("imaging: to perform, to report and hand-over", () => {
    expect(imagingTabQuery("all")).toEqual({})
    expect(imagingTabQuery("perform")).toEqual({ toPerform: true })
    expect(imagingTabQuery("report")).toEqual({ toReport: true })
    expect(imagingTabQuery("handover")).toEqual({ status: "completed" })
    for (const t of IMAGING_TABS) expect(IMAGING_TAB_LABEL[t]).toBeTruthy()
  })
  it("rows with a critical result come first and the rest keep the server's order", () => {
    const rows = [{ id: "a", hasCritical: false }, { id: "b", hasCritical: true }, { id: "c", hasCritical: false }, { id: "d", hasCritical: true }]
    expect(criticalFirst(rows).map((r) => r.id)).toEqual(["b", "d", "a", "c"])
    expect(criticalFirst([])).toEqual([])
  })
  it("a critical flag is loud, high and low are marked, normal and none are plain", () => {
    expect(flagClass("critical")).toMatch(/bg-red-600/)
    expect(flagClass("high")).toMatch(/orange/)
    expect(flagClass("low")).toMatch(/blue/)
    expect(flagClass("normal")).toBe(flagClass(null))
  })
})

describe("the result form", () => {
  const specs = [
    { key: "hb", name: "Haemoglobin", unit: "g/dL", ranges: { male: { low: 13, high: 17 }, female: { low: 12, high: 15.5 } } },
    { key: "wbc", name: "WBC", unit: "x10^9/L", ranges: { any: { low: 4, high: 11 } } },
    { key: "note", name: "Note" },
  ]
  it("reference ranges follow the patient's sex, fall back to the 'any' band, and are empty when there is none", () => {
    expect(rangeFor(specs[0], "female")).toBe("12 - 15.5")
    expect(rangeFor(specs[0], "male")).toBe("13 - 17")
    expect(rangeFor(specs[1], "female")).toBe("4 - 11")
    expect(rangeFor(specs[2], "male")).toBeNull()
  })
  it("one row per parameter of the definition, filled from the current result by key", () => {
    const rows = resultRows(specs, [{ key: "hb", value: "9.1" }], "female")
    expect(rows.map((r) => [r.key, r.value, r.range])).toEqual([["hb", "9.1", "12 - 15.5"], ["wbc", "", "4 - 11"], ["note", "", null]])
    expect(resultRows(specs, null, "male")[0].value).toBe("")
  })
  it("only the rows filled in become parameters; blanks are not sent and values are trimmed", () => {
    const rows = resultRows(specs, null, "male").map((r) => (r.key === "hb" ? { ...r, value: " 14.2 " } : r))
    expect(rowsToParameters(rows)).toEqual([{ key: "hb", value: "14.2" }])
    expect(rowsToParameters(resultRows(specs, null, "male"))).toEqual([])
  })
})

describe("test lines", () => {
  const t = (over: Partial<PickedTest> = {}): PickedTest => ({ id: "t1", name: "CBC", rateText: "600.00", modality: null, discountType: "", discountValue: "", ...over })
  it("an own discount is sent only when a type and a value were typed", () => {
    expect(testLinesOf([t()])).toEqual([{ testId: "t1", discount: undefined }])
    expect(testLinesOf([t({ discountType: "percent", discountValue: "10" })])).toEqual([{ testId: "t1", discount: { type: "percent", value: "10" } }])
    expect(testLinesOf([t({ discountType: "amount", discountValue: " " })])[0].discount).toBeUndefined()
  })
})

describe("the screens are wired as the handoff says", () => {
  it("the six lab and imaging routes show the new screens in API mode and keep the demo's own pages otherwise", () => {
    const pairs: [string, string, string][] = [
      ["src/app/(dashboard)/lab/orders/page.tsx", "<LabOrdersScreen />", "<MockLabOrderListPage />"],
      ["src/app/(dashboard)/lab/orders/[id]/page.tsx", "<LabOrderDetailScreen />", "<MockLabOrderDetailPage />"],
      ["src/app/(dashboard)/lab/orders/new/page.tsx", '<OrderForm kind="lab" />', "<MockLabOrderFormPage />"],
      ["src/app/(dashboard)/imaging/orders/page.tsx", "<ImagingOrdersScreen />", "<MockImagingOrderListPage />"],
      ["src/app/(dashboard)/imaging/orders/[id]/page.tsx", "<ImagingOrderDetailScreen />", "<MockImagingOrderDetailPage />"],
      ["src/app/(dashboard)/imaging/orders/new/page.tsx", '<OrderForm kind="imaging" />', "<MockImagingOrderFormPage />"],
    ]
    for (const [file, api, mock] of pairs) {
      const src = read(file)
      expect(src, file).toContain(api)
      expect(src, file).toContain(mock)
      expect(src, file).toContain('dxDataSource === "api"')
    }
    expect(read("src/app/(dashboard)/lab/orders/[id]/results/page.tsx")).toContain("router.replace(`/lab/orders/${id}`)")
  })
  it("the detail screens render buttons only through inOrder(allowedActions, ...) at the order, specimen and test level", () => {
    const lab = read("src/components/diagnostics/LabOrderDetailScreen.tsx")
    for (const call of ["inOrder(o.allowedActions, LAB_ORDER_ACTION_ORDER)", "inOrder(s.allowedActions, SPECIMEN_ACTION_ORDER)", "inOrder(t.allowedActions, LAB_TEST_ACTION_ORDER)"]) expect(lab, call).toContain(call)
    const img = read("src/components/diagnostics/ImagingOrderDetailScreen.tsx")
    for (const call of ["inOrder(o.allowedActions, IMAGING_ORDER_ACTION_ORDER)", "inOrder(t.allowedActions, IMAGING_TEST_ACTION_ORDER)"]) expect(img, call).toContain(call)
  })
  it("a result is final only when verified, a report only when signed, and a print is read fresh", () => {
    expect(read("src/components/diagnostics/LabOrderDetailScreen.tsx")).toContain("Not final: awaiting verification")
    expect(read("src/components/diagnostics/ImagingOrderDetailScreen.tsx")).toContain("Not final: awaiting the doctor's signature")
    expect(read("src/components/diagnostics/PrintViews.tsx")).toContain("gcTime: 0")
  })
  it("every write goes through the single-request dialog; none retries", () => {
    for (const f of ["DxDialogs", "LabDialogs", "ImagingDialogs"]) expect(read(`src/components/diagnostics/${f}.tsx`), f).toContain("BillingActionDialog")
    expect(read("src/components/billing/BillingActionDialog.tsx")).not.toMatch(/retry|setTimeout/)
  })
  it("worklists are 15 s with a 30 s poll, server-paged (10), and the search text stays out of the address bar", () => {
    for (const f of ["LabOrdersScreen", "ImagingOrdersScreen"]) {
      const src = read(`src/components/diagnostics/${f}.tsx`)
      expect(src, f).toContain("...CACHE_CLASSES.worklist")
      expect(src, f).toContain("const PAGE_SIZE = 10")
      expect(src, f).not.toMatch(/url\.set\(\{[^}]*search/)
    }
  })
  it("the order form asks for a department switched off as an external referral and offers discounts only with billing.write", () => {
    const src = read("src/components/diagnostics/OrderForm.tsx")
    expect(src).toContain("referredTo")
    expect(src).toContain('can("diagnostics.order")')
    expect(src).toContain('allowDiscount={can("billing.write")}')
  })
})
