import type { DxFlag, DxImagingOrderAction, DxImagingTestAction, DxLabOrderAction, DxLabTestAction, DxPriority, DxSpecimenAction, DxStatus, DxTestStatus, ImagingOrderListOptionsApi, LabOrderListOptionsApi } from "@/lib/services"

// Pure helpers for the laboratory and imaging screens (unit-tested). The server computes `allowedActions` for the signed-in user and the record's state at the order,
// specimen and test level (handoff 8.7 and 8.8: "show exactly allowedActions"), so the buttons here are those actions, in a fixed order, and nothing else.

export const DX_STATUS_LABEL: Record<DxStatus, string> = { pending: "Pending", collected: "Collected", in_progress: "In progress", completed: "Completed", delivered: "Delivered", cancelled: "Cancelled" }
export const DX_TEST_STATUS_LABEL: Record<DxTestStatus, string> = { ordered: "Ordered", entered: "Result entered", verified: "Verified", cancelled: "Cancelled", performed: "Performed" }
export const DX_PRIORITY_LABEL: Record<DxPriority, string> = { routine: "Routine", urgent: "Urgent" }
export const DX_FLAG_LABEL: Record<NonNullable<DxFlag>, string> = { normal: "Normal", high: "High", low: "Low", critical: "Critical" }
export const SPECIMEN_STATUS_LABEL = { pending: "To collect", collected: "Collected", rejected: "Rejected" } as const

export const LAB_ORDER_ACTION_LABEL: Record<DxLabOrderAction, string> = { add_test: "Add tests", write_remarks: "Pathologist's remarks", deliver: "Mark delivered", archive: "Archive", restore: "Restore" }
export const SPECIMEN_ACTION_LABEL: Record<DxSpecimenAction, string> = { collect: "Mark collected", reject: "Reject" }
export const LAB_TEST_ACTION_LABEL: Record<DxLabTestAction, string> = { enter_result: "Enter result", verify: "Verify", amend: "Amend", cancel: "Cancel test" }
export const IMAGING_ORDER_ACTION_LABEL: Record<DxImagingOrderAction, string> = { add_test: "Add tests", deliver: "Mark delivered", archive: "Archive", restore: "Restore" }
export const IMAGING_TEST_ACTION_LABEL: Record<DxImagingTestAction, string> = { perform: "Mark performed", write_report: "Write report", sign: "Sign report", amend: "Amend", cancel: "Cancel test" }

/** The server's allowed actions in the order the buttons are shown. An action not allowed is not shown; one not in `order` is not shown either. */
export function inOrder<T extends string>(allowed: readonly T[], order: readonly T[]): T[] {
  return order.filter((a) => allowed.includes(a))
}
export const LAB_ORDER_ACTION_ORDER: readonly DxLabOrderAction[] = ["add_test", "write_remarks", "deliver", "archive", "restore"]
export const SPECIMEN_ACTION_ORDER: readonly DxSpecimenAction[] = ["collect", "reject"]
export const LAB_TEST_ACTION_ORDER: readonly DxLabTestAction[] = ["enter_result", "verify", "amend", "cancel"]
export const IMAGING_ORDER_ACTION_ORDER: readonly DxImagingOrderAction[] = ["add_test", "deliver", "archive", "restore"]
export const IMAGING_TEST_ACTION_ORDER: readonly DxImagingTestAction[] = ["perform", "write_report", "sign", "amend", "cancel"]

// ── Worklists (handoff 8.7 and 8.8): one list route, filtered by query ──

export const LAB_TABS = ["all", "collect", "bench", "verify", "handover"] as const
export type LabTab = (typeof LAB_TABS)[number]
export const LAB_TAB_LABEL: Record<LabTab, string> = { all: "All orders", collect: "To collect", bench: "Bench", verify: "Verification", handover: "Hand-over" }
/** What each lab tab asks the server for. The collection worklist is urgent-first; the bench is collected orders, verification those in progress, hand-over the completed. */
export const BENCH_VIEWS = ["collected", "in_progress"] as const
export type BenchView = (typeof BENCH_VIEWS)[number]
export const BENCH_VIEW_LABEL: Record<BenchView, string> = { collected: "Waiting for results", in_progress: "Results being entered" }
export function labTabQuery(tab: LabTab, bench: BenchView = "collected"): Pick<LabOrderListOptionsApi, "toCollect" | "status" | "sort"> {
  switch (tab) {
    case "collect": return { toCollect: true, sort: "priority:desc" }
    case "bench": return { status: bench }
    case "verify": return { status: "in_progress" }
    case "handover": return { status: "completed" }
    default: return {}
  }
}
export const IMAGING_TABS = ["all", "perform", "report", "handover"] as const
export type ImagingTab = (typeof IMAGING_TABS)[number]
export const IMAGING_TAB_LABEL: Record<ImagingTab, string> = { all: "All orders", perform: "To perform", report: "To report", handover: "Hand-over" }
export function imagingTabQuery(tab: ImagingTab): Pick<ImagingOrderListOptionsApi, "toPerform" | "toReport" | "status"> {
  switch (tab) {
    case "perform": return { toPerform: true }
    case "report": return { toReport: true }
    case "handover": return { status: "completed" }
    default: return {}
  }
}

/** Rows with a critical result first, otherwise in the order the server sent them (a stable sort). */
export function criticalFirst<T extends { hasCritical: boolean }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.hasCritical), ...rows.filter((r) => !r.hasCritical)]
}

/** The tailwind classes for a result flag: a critical value is loud, high and low are marked, normal and none are plain. */
export function flagClass(flag: DxFlag): string {
  switch (flag) {
    case "critical": return "bg-red-600 text-white font-black ring-2 ring-red-300"
    case "high": return "bg-orange-100 text-orange-800 font-bold"
    case "low": return "bg-blue-100 text-blue-800 font-bold"
    default: return "text-slate-700"
  }
}

// ── The result form ──

export interface ResultRow {
  key: string
  name: string
  unit: string | null
  value: string
  /** The reference range as text, from the test definition. */
  range: string | null
}
type SpecBand = { low?: number; high?: number } | undefined
type Spec = { key: string; name: string; unit?: string; ranges?: { any?: SpecBand; male?: SpecBand; female?: SpecBand } }
const bandText = (b: SpecBand): string | null => (b && (b.low !== undefined || b.high !== undefined) ? `${b.low ?? ""} - ${b.high ?? ""}` : null)
/** The reference range for the patient's sex (a band for "any" when the test has no sex-specific ones). */
export function rangeFor(spec: Spec, gender: "male" | "female" | "other"): string | null {
  const r = spec.ranges
  if (!r) return null
  return bandText(gender === "male" ? r.male ?? r.any : gender === "female" ? r.female ?? r.any : r.any ?? r.male ?? r.female)
}
/** One row per parameter of the test definition, filled with the current result's value (matched by key). */
export function resultRows(specs: readonly Spec[], existing: { key: string; value: string }[] | null, gender: "male" | "female" | "other"): ResultRow[] {
  return specs.map((s) => ({ key: s.key, name: s.name, unit: s.unit ?? null, value: existing?.find((p) => p.key === s.key)?.value ?? "", range: rangeFor(s, gender) }))
}
/** Only the rows the user filled in become parameters (an empty row is not sent). */
export function rowsToParameters(rows: readonly ResultRow[]): { key: string; value: string }[] {
  return rows.filter((r) => r.value.trim() !== "").map((r) => ({ key: r.key, value: r.value.trim() }))
}
