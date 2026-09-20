---
status: accepted
---

# Multi-batch pharmacy inventory with FEFO dispensing and per-line batch traceability

`Medicine` in the prototype is single-batch: one `batchNo`/`expiry`/`stock` per medicine row, and dispensing just decrements `Medicine.stock` directly (`PharmacyPage.tsx`, capped at available stock via `Math.min(r.qty, med.stock)`). Real pharmacy inventory needs multiple batches per medicine arriving over time at different costs/expiries, and expiry-driven dispensing order.

`medicine_batches` (`medicine_id` FK, `location_id` FK — batches are physically at one Location per [ADR-0008](./0008-locations-under-tenant.md), `batch_no`, `expiry_date`, `quantity_received`, `quantity_remaining`, `purchase_rate`, `received_date`, `supplier` as free text, matching the prototype's existing plain-string `Medicine.supplier` rather than inventing a new Supplier catalog nobody asked for). Dispensing selects non-expired batches at that location ordered by `expiry_date` ascending (first-expire-first-out) and draws down `quantity_remaining` from each until the requested quantity is satisfied — carrying forward the prototype's existing negative-stock guardrail (a dispense can never exceed total available quantity across all valid batches).

Because FEFO can span multiple batches for a single dispensed line (partial quantity from an almost-expired batch, the remainder from a fresher one), a `dispense_line_batch_allocation` table (`dispense_line_id`, `batch_id`, `quantity`) records exactly which batch(es) fulfilled each line — not a single `batch_id` FK directly on the dispense line. This is the one piece that isn't obvious from "just add batches": it exists specifically for recall traceability — if a batch is recalled, this table is what answers "which patients received medicine from it," which is the entire point of doing multi-batch inventory correctly rather than as a cosmetic addition.

Expired batches are excluded from FEFO selection automatically (a query filter on `expiry_date`), but `quantity_remaining` isn't silently zeroed when a batch expires — writing off expired stock is a deliberate pharmacist action (adjusts `quantity_remaining`, requires a reason, logged via the audit trail per [ADR-0015](./0015-audit-log-mechanism.md)), because physically destroying or returning expired stock is a real action that needs its own record, not an automatic side effect of a date passing.

Rejected: a single `batch_id` FK directly on the dispense line — simpler, but loses recall traceability the moment a dispense spans more than one batch, which FEFO guarantees will happen routinely for any medicine dispensed faster than a single batch's quantity lasts. Also rejected: automatically zeroing expired stock — silently erasing inventory data without a recorded reason is exactly the kind of unaudited mutation the audit-log decision exists to prevent.
