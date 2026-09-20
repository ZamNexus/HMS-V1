---
status: accepted
---

# FK-with-fallback: normalize catalog references without blocking entry

Several prototype fields shadow a real catalog but store free text instead of a reference: `Patient.guardianRelation` (matches `GuardianRelationItem.name`), `Encounter.prescription[].medicine` (matches `Medicine.name`), `ServicesInvoice.LineItem.name` (matches a `ServiceCatalogItem`), `BankTransaction.bank` (matches `BankAccount.bankName`) — plus diagnosis, which normalizes against ICD-10 and additionally changes cardinality (see [ADR-0014](./0014-icd10-and-diagnosis-cardinality.md)). The alternative to normalizing any of these was a strict FK-only model requiring every value to match an existing catalog row.

The pattern applied to each field: an always-populated text/label column (what's shown on screen and on printed documents, and the source of truth if the catalog entry is later renamed or removed) plus a nullable FK column (populated only when the value matches a catalog row, used for reporting/analytics joins). This is the same snapshot shape already established for pricing ([ADR-0007](./0007-commission-rate-snapshot-not-full-payout-ledger.md), [ADR-0011](./0011-diagnostic-order-unification.md)) — a denormalized label alongside an optional normalized link — applied here to catalog identity instead of price. A row with the FK null but the text populated is, by construction, exactly the query for "entered outside the catalog, needs reconciliation" — no separate workflow table is needed for that; it falls out of the schema shape itself.

Rejected: strict FK-only (a receptionist blocked from registering a patient because their guardian relation isn't cataloged, or a doctor unable to finish a prescription because a medicine isn't in inventory yet — a support ticket waiting to happen, for no real benefit over the fallback shape). Also rejected: text-only with no FK at all — loses every report/analytics query that needs to group by catalog identity, exactly the gap the original grilling session flagged in the prototype.
