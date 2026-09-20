---
status: accepted
---

# Bed and patient admission status are derived, not stored

The prototype stores `Bed.status`/`Bed.patientId` and `Patient.status` as columns kept in sync by application code across three separate code paths (IPD admission, discharge, and a manual admin "cycle bed status" screen) — and they drift, because none of the three paths knows about the others. Patient.status in particular is never actually updated by admission/discharge at all in the current code.

For the real schema, a bed's occupancy and a patient's "currently admitted" status are **not stored columns** — they're derived by querying for an open IPD Encounter referencing that bed/patient. There is exactly one source of truth (the Encounter lifecycle), so there's no code path that can leave occupancy out of sync with reality. The admin "cycle bed status" screen is replaced with a narrower "mark bed under maintenance" action, which is legitimately independent stored state (maintenance isn't tied to any encounter) rather than a general-purpose status override that could silently contradict an open encounter.

Trade-off accepted: occupancy checks become a query (`EXISTS open IPD encounter for this bed`) instead of a column read, which is slightly more expensive but eliminates an entire class of drift bugs that existed in the prototype.
