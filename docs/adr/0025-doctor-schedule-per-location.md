---
status: accepted
---

# Doctor availability moves from Doctor to StaffLocation

The prototype's `Doctor.availableDays`/`hoursFrom`/`hoursTo` (`src/types/index.ts:28-48`) are flat, single-valued fields — one schedule per doctor, no location dimension, because the prototype itself is single-location. ADR-0008 already established doctors can cover multiple branches on different days, which a flat schedule on `Doctor` structurally cannot represent.

`available_days`, `hours_from`, and `hours_to` move off `Doctor` and onto `StaffLocation` — the doctor's schedule is expressed per (doctor, location) pair, since that join table already exists specifically to represent multi-branch staffing. A doctor covering Location A on Mon/Wed and Location B on Tue/Thu is two `StaffLocation` rows, each with its own days/hours, rather than one ambiguous set of fields on `Doctor`.

Rejected: keeping schedule fields flat on `Doctor` — can't represent the multi-location case ADR-0008 exists for. Also rejected: a separate `DoctorSchedule` entity with finer-grained slot support — that's what phase 2's deferred slot-conflict/availability engine (ADR-0012) will need, not what a "which days at which branch" MVP requires; building it now would repeat the premature-generality mistake ADR-0002 avoided by rejecting a configurable permissions table.
