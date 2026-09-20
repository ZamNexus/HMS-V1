---
status: accepted
---

# One invoice ledger, not five parallel billable entities

The prototype fragments billing across `ConsultationInvoice`, `ServicesInvoice`, `LabOrder` charges, `ImagingOrder` charges, and `DispenseRecord` — each independently payable — while `Encounter` *also* carries its own fee/payment fields and can optionally spawn a separate `ConsultationInvoice`. A `billingAggregate.ts` helper stitches these into one patient ledger only at read time, and falls back to the Encounter's own fee when no `ConsultationInvoice` exists — meaning an Encounter's consultation charge is ambiguously either inline on the Encounter or a child invoice row, decided implicitly by which path created it.

We're replacing all of this with one `invoices` / `invoice_lines` table per tenant. Each line carries a `source_type` (`consultation | service | diagnostic | pharmacy`) and a reference to the record that generated it (Encounter, Diagnostic Order, Dispense Record, ...). `Encounter` no longer carries its own fee/payment columns — every charge, including the base consultation fee, is always an `invoice_line`, closing the dual-path ambiguity. This gives the product one real ledger for statements, outstanding-balance reporting, and tax handling instead of five parallel entities reconciled ad hoc on every read.

Whether the patient/checkout experience *presents* this as one combined bill or split per department (consultation separate from pharmacy separate from lab, e.g. for clinics that want separate department accounting on the printed receipt) is a per-clinic display setting layered on top of the same underlying lines — not a second storage model. A disabled Module ([ADR-0006](./0006-module-toggles-and-external-referrals.md)) means the corresponding order never generates an invoice line in the first place (an externally-referred diagnostic order isn't billed here), so "no pharmacy/lab at this clinic" falls out naturally rather than needing special-cased billing logic.

Rejected: keeping today's five separate invoice-like entities and continuing to reconcile them at read time — that's exactly the ambiguity (Encounter's dual billing path) we're removing.
