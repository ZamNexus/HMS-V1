---
status: accepted
---

# InvoiceLine snapshots doctor and panel commission independently

ADR-0007 said each invoice line stores "the doctor/panel commission rate" as a snapshot, phrased ambiguously enough that the data model built a single `commission_rate_snapshot`/`owed_commission_amount` pair — leaving unclear what happens when both apply to the same line (a panel-covered patient seeing a commission-earning doctor).

They're independent payables, not alternatives: a doctor earns commission for seeing the patient regardless of who's paying the bill, and a panel commission/rebate is a separate relationship between the clinic and the insurer/corporate account. `InvoiceLine` gets two snapshot pairs — `doctor_commission_rate_snapshot`/`doctor_owed_commission_amount` and `panel_commission_rate_snapshot`/`panel_owed_commission_amount` — each populated independently. A line can have neither, either, or both filled in, depending on whether the seeing doctor has a `commission_pct` and whether the patient's `panel_id` points at a panel with its own `commission_pct`.

Rejected: one shared commission snapshot pair — collapses two genuinely independent payables into one field, meaning the system can't correctly account for both a doctor and a panel on the same billed line without ambiguity about which rate the single field actually captured.
