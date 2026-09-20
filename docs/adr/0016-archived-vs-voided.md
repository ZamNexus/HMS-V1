---
status: accepted
---

# Archived (clinical records) vs. Voided (financial documents) — two mechanisms, not one "soft-delete"

Round 4 of the grilling session settled that clinical/financial records should never be hard-deleted (the prototype's `PATIENTS.splice(...)` loses history entirely), grouping patients, encounters, invoices, diagnostic orders, and dispense records under one "soft-delete" label. That label conflates two genuinely different mechanisms once you look at what "undoing" each kind of record actually means.

**Archived** — Patient, Encounter, Diagnostic Order, Dispense Record: an `archived_at` timestamp, `NULL` by default. Archiving hides a record from default views/lists but is fully restorable (`archived_at` cleared) — appropriate for records that can legitimately be created by mistake and cleaned up (a duplicate patient registration, a diagnostic order placed against the wrong patient) with no accounting consequence.

**Voided** — Invoice: never hidden, never restored to active. A `voided_at` plus a required `voided_reason` marks the invoice permanently void, but it stays fully visible in financial reports and reconciliation, exactly as standard accounting practice requires — a posted financial document is never edited or hidden after the fact. If a charge was wrong, the correction is a new Invoice or Credit Note (the prototype's `ReceiptType: "Credit Note"` is already exactly this pattern), never a restore of the voided one. This is a stricter, one-way version of "don't hard-delete" than Archived, because financial records carry audit/legal weight a duplicate patient record doesn't.

Rejected: one `deleted_at` mechanism for both clinical and financial records — this either makes financial voiding too permissive (implying a voided invoice could quietly be "un-voided" and treated as if it never happened) or makes clinical archiving unnecessarily heavy (requiring a reason and permanence for what's often just tidying up a mistaken entry).
