import type { ChargeListOptions } from "@/lib/services"

// Financial Statistics in API mode (handoff 8.11): the tabs read the existing registers, one query per tab. Permissions: the registers need billing.read, the Expenses and Bank tabs accounts.read; the page itself needs reports.read.
export const STATS_TABS = ["services", "checkups", "lab", "medicine", "xray", "ecg", "ultrasound", "receipts", "payments", "opdipd", "summary", "expenses", "bank", "graphs"] as const
export type StatsTab = (typeof STATS_TABS)[number]
export const STATS_LABEL: Record<StatsTab, string> = {
  summary: "Summary", services: "Services", checkups: "Checkups", lab: "Lab Tests", medicine: "Medicine", xray: "X-Rays", ecg: "ECG", ultrasound: "Ultrasound",
  receipts: "Receipts", payments: "Payments", expenses: "Expenses", bank: "Bank", graphs: "Graphs", opdipd: "OPD/IPD",
}
/** The charge filter of each charges tab (handoff 8.11): `sourceType=service|consultation|pharmacy`, `diagnosticType=lab`, `modality=X-Ray|ECG|Ultrasound`. */
export const STATS_CHARGES: Partial<Record<StatsTab, Pick<ChargeListOptions, "sourceType" | "diagnosticType" | "modality">>> = {
  services: { sourceType: "service" }, checkups: { sourceType: "consultation" }, medicine: { sourceType: "pharmacy" },
  lab: { diagnosticType: "lab" }, xray: { modality: "X-Ray" }, ecg: { modality: "ECG" }, ultrasound: { modality: "Ultrasound" },
}
/** `GET /payments?type=advance` (Receipts) and `type=payment` (Payments). */
export const STATS_PAYMENT_TYPE: Partial<Record<StatsTab, "advance" | "payment">> = { receipts: "advance", payments: "payment" }
export function statsTabAllowed(tab: StatsTab, can: (p: string) => boolean): boolean {
  if (tab === "expenses" || tab === "bank") return can("accounts.read")
  if (tab === "summary" || tab === "graphs") return can("reports.read")
  return can("billing.read")
}
export const statsTabFromUrl = (v: string | undefined): StatsTab | undefined => STATS_TABS.find((t) => t === v)
