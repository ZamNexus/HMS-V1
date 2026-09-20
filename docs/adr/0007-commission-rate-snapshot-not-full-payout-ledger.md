---
status: accepted
---

# Snapshot commission rates on invoice lines; defer the full payout ledger

`Doctor.share_pct` and `Panel.commission_pct` exist as plain rate fields with nothing computing actual payouts against them. Building a full payout ledger (approval workflow, payment scheduling, payout batches) before any client has asked for it is speculative complexity we're deliberately not taking on yet.

Instead, each `invoice_line` stores the doctor/panel commission rate **as it was at billing time** (a snapshot, not a live join to `Doctor.share_pct`), alongside the computed owed-commission amount for that line. This is cheap to add now and hard to add correctly later — if a doctor's share percentage changes six months from now, historical invoice lines must still reflect the rate that applied when they were billed, and that history is unrecoverable if we don't capture it at write time. A future `payouts` table can be built later as a straightforward aggregation over lines already carrying this data (sum owed-commission by doctor/panel over a date range) — the hard part (accurate historical rate attribution) is solved now, the workflow part (approvals, payment runs) is deferred until a client actually needs it.
