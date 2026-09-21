---
status: accepted
---

# PatientPanel join for dual coverage; billing stays against primary panel only

`Patient.panel_id` was a single nullable FK, but this clinic's patients can carry more than one panel (e.g. an employer panel plus a personal insurance policy) — primary and secondary coverage, confirmed as a real requirement, not speculative.

`Patient.panel_id` is replaced by a `PatientPanel` join table (`patient_id`, `panel_id`, `priority: primary | secondary`, `policy_no` nullable — the patient's member/policy number under that specific panel, since it's rarely the same across two different insurers). A patient can have zero, one, or more `PatientPanel` rows.

Billing and commission logic continues to run against the patient's `primary` `PatientPanel` only, for now — `InvoiceLine.panel_commission_rate_snapshot` (ADR-0022) reads the primary panel's rate, exactly as before. Secondary coverage is captured and queryable (for correspondence, future claims, reporting) but does not split an invoice line's amount between two payers. Real coordination-of-benefits billing — which payer is billed first, percentage splits, secondary-claims-the-remainder logic — is its own feature, not a byproduct of this schema change, and isn't being built here.

Rejected: building real split-claim billing now — meaningfully bigger scope (payer-order rules, partial-payment reconciliation across two panels) than "record that a patient has two panels," and nothing so far has required it on day one. Also rejected: keeping `panel_id` singular and bolting on a `secondary_panel_id` column — doesn't scale past two, and a join table costs nothing extra here.
