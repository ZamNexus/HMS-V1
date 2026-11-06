import { SERVICES_INVOICES } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { PATIENTS } from "@/data/patients"
import { SERVICE_CATALOG } from "@/data/services"
import { patientBillBreakdown, encounterBillBreakdown, type BillBreakdown } from "@/lib/billingAggregate"
import { legacyNumericId } from "../reference/refId"
import { moneyFromNumber } from "../moneyMath"
import type { BillSummary, BillSummaryService, ItemHistoryService, NotificationRecord, NotificationsService, ServiceUsageEntry, ServiceUsageService } from "../types"
import { mockApiError } from "./mockError"

// Mock adapters for Item History (T12), the patient / encounter bill summary and the top-bar notifications. Like the other mocks they
// read the same shared demo arrays the screens used to read directly and convert legacy numbers at this boundary only. None of the
// figures or rules here come from a backend document — they reproduce what the screens did, and the handoff lists them as demo
// behaviour. The real backend owns every one of these in API mode.

const m = moneyFromNumber

// ── Item History (T12, the audit log) ────────────────────────────
// The demo data has NO audit events for catalogue items, and this mock invents none: it returns an honest empty result for a catalogue
// item that exists. The dialog says plainly that mock mode has no audit events, so the empty list is never read as "this item was never
// changed". It deliberately does not derive entries from invoice lines — that is the separate Invoice Usage view below. The only audit-shaped
// demo data, AUDIT_LOG in data/settings.ts, is six hand-written entries about OTHER modules (Patients, Encounters, Billing, Laboratory,
// Pharmacy, Users), is read by no screen, has no documented mock purpose and none of it concerns a catalogue item — relabelling it onto a
// service would fabricate events, so it is deliberately not used here.
export const mockItemHistoryService: ItemHistoryService = {
  async list(query) {
    const numeric = legacyNumericId(query.id)
    if (numeric === null || !SERVICE_CATALOG.some((s) => s.id === numeric)) throw mockApiError(404, "NOT_FOUND", "Catalogue item not found")
    return { items: [], total: 0 }
  },
}

// ── Invoice usage (DEMO, not audit) ──────────────────────────────
// The old "Item History" dialog was this: the service-invoice lines whose name equals the service's name (matched by name, because the demo
// lines carry no catalogue id). It is kept as its own mock-only view with its own types. No actor, no action, no audit vocabulary.
export const mockServiceUsageService: ServiceUsageService = {
  async list(query) {
    const numeric = legacyNumericId(query.id)
    const service = numeric === null ? undefined : SERVICE_CATALOG.find((s) => s.id === numeric)
    if (!service) throw mockApiError(404, "NOT_FOUND", "Catalogue item not found")
    const entries: ServiceUsageEntry[] = SERVICES_INVOICES.flatMap((inv) =>
      inv.lines
        .filter((l) => l.name === service.name)
        .map((l, i) => ({
          id: `${inv.invoiceNo}-${i}`,
          invoiceNo: inv.invoiceNo,
          at: new Date(inv.date).toISOString(),
          patient: PATIENTS.find((p) => p.id === inv.patientId)?.name ?? "—",
          quantity: l.qty,
          rate: m(l.rate),
          amount: m(l.amount),
        }))
    ).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return { items: entries, total: entries.length }
  },
}

// ── Bill summary ─────────────────────────────────────────────────
// DEMO: billingAggregate's roll-up, unchanged. Its rules are not documented anywhere — imaging and pharmacy charges count as always
// received, a lab order only when "paid", and the balance is clamped at 0. They stay here (the mock adapter is allowed to read the
// demo arrays) and are NOT reproduced in API mode, where the backend supplies the figures.
function toSummary(b: BillBreakdown): BillSummary {
  return {
    consultation: m(b.consultation), services: m(b.services), laboratory: m(b.lab), imaging: m(b.imaging), medicines: m(b.medicine),
    total: m(b.total), received: m(b.received), balance: m(b.balance),
  }
}

export const mockBillSummaryService: BillSummaryService = {
  async forPatient(patientId) {
    const id = legacyNumericId(patientId)
    if (id === null) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "patientId", message: "Mock mode only supports numeric legacy ids" }])
    if (!PATIENTS.some((p) => p.id === id)) throw mockApiError(404, "NOT_FOUND", "Patient not found") // never a made-up zero balance
    return toSummary(patientBillBreakdown(id))
  },
  async forEncounter(encounterId) {
    const id = legacyNumericId(encounterId)
    if (id === null) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "encounterId", message: "Mock mode only supports numeric legacy ids" }])
    if (!ENCOUNTERS.some((e) => e.id === id)) throw mockApiError(404, "NOT_FOUND", "Encounter not found")
    return toSummary(encounterBillBreakdown(id))
  },
}

// ── Notifications ────────────────────────────────────────────────
// DEMO: the old top-bar rules, unchanged — completed lab orders, out-of-stock medicines (stock 0) and "running low" medicines (stock at or
// below the reorder level). Note the low-stock rule is `<=` here but `<` on the Dashboard tile and in the Pharmacy report: the demo
// never agreed with itself, and no document defines "low stock". The backend owns this in API mode, if it has notifications at all.
export const mockNotificationsService: NotificationsService = {
  async list() {
    const items: NotificationRecord[] = []
    const resultsReady = LAB_ORDERS.filter((o) => o.status === "Completed")
    if (resultsReady.length > 0) {
      items.push({ id: "lab-ready", title: `${resultsReady.length} Lab orders completed`, detail: "Reports available for verification", to: "/lab/orders", tone: "info" })
    }
    const outOfStock = MEDICINES.filter((x) => x.stock === 0)
    if (outOfStock.length > 0) {
      items.push({ id: "out-of-stock", title: `${outOfStock.length} Medicines out of stock`, detail: "Requires pharmacy reordering", to: "/pharmacy/inventory", tone: "danger" })
    }
    const lowStock = MEDICINES.filter((x) => x.stock > 0 && x.stock <= x.reorderLevel)
    if (lowStock.length > 0) {
      items.push({ id: "low-stock", title: `${lowStock.length} Medicines running low`, detail: "Restock before depletion", to: "/pharmacy/inventory", tone: "warning" })
    }
    return items
  },
}
