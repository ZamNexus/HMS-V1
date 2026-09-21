---
status: accepted
---

# IPD room charges: BedAssignment history + daily rate per Ward, billed as regular service lines

Confirmed: this clinic's real IPD workflow moves patients between wards mid-stay (ICU → General/Private, etc.), and room charges are billed on a running daily basis rather than computed once at discharge — the prototype never modeled either (`Encounter.bed_id` is a single nullable FK per ADR-0003, and `billingAggregate.ts` has no room component at all).

Two additions. First, a `BedAssignment` table (`id`, `encounter_id` FK, `bed_id` FK, `assigned_at`, `released_at` nullable) replaces `Encounter.bed_id` as the source of truth for where a patient is/was during an IPD stay — one row per ward/bed segment, closed (`released_at` set) on transfer or discharge, at most one open row per encounter at a time. This is the same "derived, not stored" principle ADR-0003 already established for occupancy, extended one level: a bed's current occupant is now derived from the `BedAssignment` row with `released_at IS NULL`, not from `Encounter.bed_id` directly (which is removed).

Second, `Ward` gains `daily_rate` (rate varies by ward type — Private costs more than General, ICU more than Private). Room charges post as ordinary `InvoiceLine`s with `source_type = 'room'`, `source_id` = the `BedAssignment` segment they belong to, `rate_snapshot` = that ward's `daily_rate` at billing time (same snapshot convention as every other rate in this schema — ADR-0007, ADR-0011 — so a rate change next year doesn't rewrite last month's bills), and `qty` = the number of days billed on that line. Whether posting happens once per day (a scheduled job walking open `BedAssignment`s) or is computed retroactively per segment at discharge is a service-layer/scheduling decision for the NestJS architecture phase, not a schema decision — either way produces the same `InvoiceLine` shape, and the cumulative stay total is simply the sum of all `source_type = 'room'` lines on the invoice.

Rejected: a single `bed_id` on Encounter with one lump-sum room charge at discharge — doesn't survive ward transfers, which are confirmed to happen routinely for this clinic. Also rejected: computing room charges from `Encounter`'s admission/discharge dates directly rather than `BedAssignment` segments — loses which ward (and therefore which rate) applied to each part of the stay.
