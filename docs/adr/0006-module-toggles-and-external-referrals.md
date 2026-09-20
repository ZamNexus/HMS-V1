---
status: accepted
---

# Per-tenant module toggles, with structured external-referral records

Not every clinic on the platform runs its own pharmacy, lab, or imaging department in-house, but doctors at those clinics still need to prescribe medicine and order tests — the patient just gets fulfillment elsewhere. The alternative on the table was letting those clinics fall back to free-text clinical notes ("refer to XYZ Lab") instead of structured records.

Each tenant has an `enabled_modules` set (`pharmacy`, `lab`, `imaging`, `ipd`, ...) in clinic settings. Regardless of which modules are enabled, the structured record types (`LabOrder`, `ImagingOrder`, prescription lines) are always creatable — they carry a `fulfillment: internal | external_referral` flag (plus an optional "referred to" org reference/free text). A disabled module means charges from that order type don't appear on the tenant's own invoices and there's no internal fulfillment workflow (no dispense queue, no lab result entry) — but the order itself still exists, so the patient's medical history and reporting stay complete regardless of which departments a given clinic runs.

Rejected: free-text-only referrals for clinics without a given module. That would mean the same clinical fact (patient was prescribed X, or ordered test Y) is sometimes a queryable structured record and sometimes an unqueryable text blob depending on tenant configuration — a two-tier experience that would complicate every report and every future feature built on top of these record types.
