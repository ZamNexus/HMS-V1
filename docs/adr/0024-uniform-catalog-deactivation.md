---
status: accepted
---

# Catalog deactivation is one uniform rule, no per-catalog exceptions

The prototype's `active`/`isActive` toggle (`src/pages/admin/MasterDataPage.tsx`, across services/banks/panels/guardian-relations/ECG-ultrasound tests) is a bare switch with no guard or reference check anywhere — deactivating something with live references is silently allowed today. Medicine and lab tests don't even carry the field in the prototype. Whether the real schema needs stricter handling for any specific catalog — Medicine in particular, given FEFO/stock — was open.

One rule, applied identically to every catalog (`ServiceCatalogItem`, `Medicine`, `Panel`, `BankAccount`, `GuardianRelationItem`, `ExpenseCategory`, `Doctor`): `active = false` hides the row from "pick a new one" selectors; every existing FK to it stays valid and fully resolvable forever; no cascading effect on already-created records. Medicine is not special-cased — a medicine with `MedicineBatch.quantity_remaining > 0` can still be deactivated; that only stops new `PrescriptionLine`s from selecting it, it doesn't stop dispensing down existing batches or invalidate `PrescriptionLine`s already written against it.

This is deliberately a *different* mechanism from Archived (ADR-0016), not the same one applied to catalogs: Archived is a restorable hide-from-view state for records that can be created by mistake (a duplicate patient, a misfiled diagnostic order); catalog deactivation is permanent-until-manually-reversed and only ever affects *future* selectability, never existing data. **Medicine specifically uses this catalog mechanism (`active` boolean), not Archived (`archived_at`)** — the data model previously gave Medicine an `archived_at` field by analogy by mistake; it should be `active` like every other catalog.

Rejected: special-casing Medicine to block deactivation while stock remains — adds a stock-check code path for one catalog only, for a guard the prototype never had and no clinic has asked for; a deactivated-with-stock medicine is a business situation staff can already see and handle without a system-enforced block.
