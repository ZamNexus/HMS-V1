---
status: accepted
---

# Appointment status lifecycle

`Appointment` is a new entity (round 1 of the grilling session) with no prototype code to ground against — `/appointments` is a `ComingSoon` stub with zero data-layer footprint. The status lifecycle needs to be precise enough that check-in and Encounter-creation logic have an unambiguous state to act on.

Six states: `requested → confirmed → arrived → completed`, with `cancelled` and `no_show` as terminal exits from `requested`/`confirmed`. `requested` exists separately from `confirmed` even though v1 booking is staff-only (no patient self-service, no availability-conflict engine) — front-desk staff taking a phone booking often need to pencil in a tentative slot pending a callback to confirm with the doctor, and the distinction costs nothing (one enum value) while phase 2's slot-management logic will need exactly this seam to attach conflict-checking to. `arrived` marks the patient physically checked in at reception, distinct from `completed`, because a real waiting-room gap exists between check-in and the doctor actually starting the consultation — this also gives reception/nursing staff a live "who's checked in and waiting" queue view, matching the token-number queue the prototype's `Encounter.tokenNo` already implies.

`completed` means, precisely, "this Appointment was converted into an Encounter" — not "the whole clinical visit including discharge is finished." That's deliberately narrower than it might first appear: once an Encounter exists, tracking the rest of the visit's lifecycle (open → discharged → cancelled) is `Encounter.status`'s job, not Appointment's. Appointment stops updating once conversion happens; there's no ongoing sync between the two records' statuses. `Encounter.appointment_id` (nullable) is the one-way link — not every Encounter originates from an Appointment (walk-ins), but every completed Appointment has exactly one Encounter.

Rejected: mirroring/syncing Appointment.status with the linked Encounter's lifecycle (e.g. advancing Appointment to a "discharged" state) — this duplicates state Encounter already owns and creates two sources of truth for the same fact. Also rejected: skipping the `requested`/`confirmed` distinction for v1 since nothing enforces availability yet — cheap to keep now, expensive to retrofit once phase 2 booking logic and any reporting on request-to-confirmation rates already assume a two-stage flow.
