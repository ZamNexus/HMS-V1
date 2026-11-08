# Frontend ⇄ Backend integration handoff — Users, Roles, Doctors, Patients, Encounters, Laboratory, Imaging, Pharmacy, Billing, Reports, Dashboard, Item History

> **Update (Phase 5A):** `docs/openapi.json` is now in the repo, and Patients, Organisations, Guardian relations and the `/auth/me` parser are connected to it (11 of 93 endpoint keys set; not verified live). Statements below that say "nothing is connected" or "87 of 88 keys are null" describe the state **before** Phase 5A. See "Phase 5A" before section 3.

**Status:** the frontend is *prepared*. Backend compatibility is **unconfirmed and untested**; no
real-backend verification has been done (no credentials, no contract).

**Source of truth:** the OpenAPI specification (`docs/openapi.json` in the HMS-backend repo, or
`/api/docs` on a locally run backend). `HMS API Reference.pdf` in this repo is only a 3-page
overview with no per-endpoint schemas. **Every endpoint path, method, request field, response field
and permission name below is "requires confirmation from the OpenAPI spec" unless it is listed in §1.**

> Retraction: earlier versions of this document and of `endpoints.ts` said certain routes "exist" or
> "do not exist" based on the HTTP status of *unauthenticated* requests (401/404). That is not
> evidence either way. Those statements were removed; nothing here relies on them.

## 1. What the provided documentation actually states

| Statement (HMS API Reference overview) | Where it is reflected |
|---|---|
| API v1, prefix `/api/v1`; Bearer access token; httpOnly refresh cookie; call with `credentials: 'include'` | `src/lib/api/client.ts` |
| Route `/api/*` through a Next.js rewrite to the server | `next.config.ts` (`BACKEND_URL`, server-only) |
| Money = string (`"1500.00"`), instants = ISO-8601 UTC, dates = `YYYY-MM-DD`, ids = ULID | `src/lib/api/types.ts`, `src/lib/api/convert.ts` (§3) |
| One error envelope; branch on `code`, show `requestId` | `ApiError`, `errorSummary` |
| `GET /api/v1/auth/me` "returns the signed-in user's permissions — build navigation from those" | `endpoints.ts` (`auth.me`), `NAV_PERMISSIONS` (empty) |
| Each operation states who may call it (public / any signed-in user / platform admin / a clinic permission) | `RoleGate`/sidebar are UI-only; the backend decides |
| Tags include Auth ("Staff sign-in, **Sessions**, and the signed-in user"), Users ("Staff accounts, managed by a hospital admin"), Public ("unauthenticated lookups for the sign-in screen") | Not implemented beyond login — contracts for sessions/public lookups are not available |

Nothing else (user/doctor/role endpoints, payloads, permission names, session endpoints) is documented in the overview.

## 2. Operations the existing screens need

All HTTP details are **requires confirmation** (`null` in `src/lib/services/endpoints.ts`, mapper stubs in
`src/lib/services/http/mappers.ts`). Until filled in, API mode makes no request and shows "Backend not
connected yet … awaiting the backend contract."

| Operation | Screen / component | Endpoint key | Method / path | Request & response | Frontend status |
|---|---|---|---|---|---|
| List users (search, paging) | `admin/users` | `users.list` | ⏳ | ⏳ `userListQuery`, `parseUserList` | prepared |
| Create user | `UserSheet` | `users.create` | ⏳ | ⏳ `userPayload`, `parseUser` | prepared |
| Update user | `UserSheet` | `users.update` | ⏳ | ⏳ | prepared |
| Activate / deactivate user | row power button | `users.setActive` | ⏳ (may share the update route) | ⏳ `userActivePayload` | prepared |
| List doctors (search, paging) | `admin/doctors` | `doctors.list` | ⏳ | ⏳ `doctorListQuery`, `parseDoctorList` | prepared |
| Create / update doctor (incl. active flag) | `DoctorModal` | `doctors.create` / `doctors.update` | ⏳ | ⏳ `doctorPayload`, `parseDoctor` | prepared |
| Signed-in user's permissions | none yet | `auth.me` | `GET /auth/me` (documented) | schema ⏳ — `parseCurrentUser` pending | endpoint set, **not called** by login |

Paging (`page`/`pageSize`) and `search` are what the screens send to the mapper; whether the backend supports
them, and under what parameter names, is unconfirmed (if it doesn't, return `{}` from the `*ListQuery` mapper and
slice/filter in `parse*List`).

### UI features with no documented backend contract (kept in the UI, not in the integration contract)
* **Reset password** (key button in Users). Mock adapter only; the HTTP adapter reports "awaiting contract".
* **Role picker options** in the user form. Mock adapter only; the HTTP adapter reports "awaiting contract" and the
  picker shows that message (it never invents roles). How roles are represented/assigned must come from the spec.
* **Doctor profile photo** (`photoUrl`, a browser data URL). File storage (task T13) is not built; the doctor mapper
  must not send it as base64.
* **Delete** — the UI only deactivates; no delete operation is assumed.

### Questions for Mujtaba
1. Provide `docs/openapi.json` (or confirm `/api/docs` locally) — this answers most items.
2. Are doctors separate records or users with a clinical role? Where do availability days/hours live (e.g. a schedule resource)?
3. `/auth/me` response schema and the permission names; which permission gates each sidebar section and `/admin/*`.
4. Session endpoints (refresh / logout) and the public lookup for the sign-in screen — contracts, if the frontend should use them.
5. Role model: is there a role concept the UI must show/assign, or only permissions?
6. Is search/paging server-side for users and doctors, and with which parameters?
7. Decimal scale for money fields (the overview example shows two decimals).

## 2b. Patients (Phase 4B)

**Integration status legend** — *Prepared*: frontend service/screen ready, backend contract missing. *Connected*: wired to a
**documented** contract. *Verified*: tested against the real backend. **Nothing in Patients is Connected or Verified**:
the provided API Reference lists a "Patients" tag but **no Patients endpoint, schema or pagination rule**, and there is no OpenAPI spec in the project.

| Operation | Screen / component | Endpoint key | Method / path | Request & response | Status |
|---|---|---|---|---|---|
| List + search + status filter + paging | `patients/page.tsx` | `patients.list` | CONTRACT REQUIRED | `patientListQuery`, `parsePatientList` | Prepared |
| Get one patient | `patients/[id]/page.tsx`, edit form | `patients.get` | CONTRACT REQUIRED | `parsePatient` | Prepared |
| Create | `PatientForm` (register; "Save & OPD/IPD Ticket") | `patients.create` | CONTRACT REQUIRED | `patientPayload`, `parsePatient` | Prepared |
| Update | `PatientForm` (edit) | `patients.update` | CONTRACT REQUIRED | `patientPayload`, `parsePatient` | Prepared |
| Delete | "Delete Patient" in edit form | `patients.delete` | CONTRACT REQUIRED — and whether the backend deletes, deactivates or forbids it | — | Prepared |
| Patient picker / search | `shared/PatientPicker.tsx` (used by encounters, billing, lab, imaging, pharmacy) | `patients.list` | CONTRACT REQUIRED | same as list | Prepared (see "legacy bridge") |
| Duplicate-phone warning | `PatientForm` (on phone blur) | `patients.list` | CONTRACT REQUIRED | advisory only; failure never blocks saving | Prepared |

### What the screens do today
* **Default/dev (mock):** all of the above work end to end through `patientsService` (verified in a real browser with only the login request stubbed:
  list, search, IPD filter, paging, detail, edit, create, unknown-id, validation, picker). The mock adapter mutates the shared `PATIENTS` array, so the ~25 other
  modules that read it directly stay consistent.
* **API mode (production default):** every Patients screen shows a clear error/"awaiting the backend contract" state; **no request is sent** (verified by
  intercepting the network), no mock rows or counts are displayed, the MR number is not invented ("Assigned on registration"), and the organisation picker is disabled.

### Mapping decisions
* `PatientRecord` = the legacy `Patient` model with `id: string` and `panelId: string | null` (opaque). `PatientInput` excludes `mrNo`, `age`, `registrationDate`
  — which of these the backend assigns/returns is **CONTRACT REQUIRED**; the mock assigns them.
* Dates stay `YYYY-MM-DD` strings (`dob`, `registrationDate`); the mapper must throw on a malformed date rather than let the UI render `Invalid Date`.
  Use `isUlid` for ids; no money field exists on a patient (balances are below).
* `PatientInput.photoUrl` is a browser data URL — **do not send as base64**; file storage (T13) is not built.
* `status` (`active`/`ipd`/`inactive`) is how the UI filters; whether `ipd` is a patient field or derived from encounters is **CONTRACT REQUIRED**.
* Form validation (`components/patients/patientSchema.ts`, unchanged rules: name ≥ 2 chars, DOB required, phone `03XX-XXXXXXX`, optional valid email, remarks ≤ 500) is
  client-side only; backend `VALIDATION_FAILED` details are shown on a failed save.

### Legacy bridge (shared dependencies, not Patients work)
`PatientPicker` still emits the **legacy numeric-id `Patient`** because encounters, billing, lab, imaging and pharmacy are not migrated. `toLegacyPatient` throws for
a non-numeric id (a real ULID), so the picker reports that instead of passing an invalid id. Those modules must migrate before API mode is usable end to end.

### Patient balances (not integrated)
"Pre Balance" (`PatientInfoPanel`), the edit-form "Outstanding Balance", the detail page's billing tab and the Patient Balances report all derive from
`patientBillBreakdown`, i.e. **mock billing/encounter/lab/imaging/pharmacy data**. The Task List says a Patient Balances report exists on the backend, but no contract is
available, and balances must not be computed from partial API data. They remain mock-only; for a patient without a legacy id (real backend patient) they are
**hidden / "not yet connected"**, never shown as Rs 0. Needed: the balance/report endpoint contract (or the billing contracts it is derived from).

### Other shared dependencies left on mock
Organisations/panels (`data/organisations`), guardian relations, "Last Visit" (encounters), visits/lab/imaging/pharmacy/invoice tabs on the detail page, dashboard and reports.

### Questions for Mujtaba (Patients)
1. List/get/create/update (and delete?) paths and schemas; which fields are server-assigned (MR number, age, registration date)?
2. Search: which parameter(s), and which fields does it match (name, MR no., phone)? Is there a status filter, and is "IPD" a patient attribute?
3. Pagination parameters and total count in the list response.
4. Is a duplicate-phone check done by the backend (error code) or should the UI keep the advisory lookup?
5. Delete semantics (hard delete, deactivate, forbidden) and the permission required.
6. Patient balance: dedicated endpoint, or derived from billing/reports (Patient Balances report)?

### Tests (frontend-only, controlled data — not backend verification)
`src/lib/services/patients.test.ts` (mock service CRUD/search/filter/paging, adapter inert while unconfirmed, no request even with a path configured and mapping pending,
legacy bridge, picker term, duplicate phone), `src/components/patients/patientSchema.test.ts` (form validation). Browser check with the login request stubbed
(mock mode and API mode) was run ad hoc and is not part of CI.

## 2c. Shared reference data (Phase 4C)

Patients, doctors, organisations and guardian relations are read synchronously from `src/data/*` by ~25 modules. This phase adds a shared,
asynchronous access layer **without migrating those modules** (several belong to Encounters/Billing/Lab/Imaging/Pharmacy/Reports, which are out of scope).
Nothing here is connected to the backend: `doctors.*` and `patients.*` are CONTRACT REQUIRED, and organisations / guardian relations have **no** endpoint keys at all
(independent resource? nested in patient responses? under the "Settings"/"Catalogs" tags? — unconfirmed), so in API mode they report "awaiting the backend contract".

### Architecture (all under `src/lib/`)
| Piece | File | Purpose |
|---|---|---|
| Id rules | `services/reference/refId.ts` | `refKey` (number and string forms share one key); `legacyNumericId` (**only** canonical integers → number; ULIDs, `"007"`, `"1e3"`, `-1`, unsafe ints → `null`, never coerced) |
| Lookup | `services/reference/lookup.ts` | `buildLookup(items, idOf).get(id)` — works with a legacy numeric `doctorId` and a ULID alike; unknown ids → `undefined` |
| Full lists | `services/reference/listAll.ts` | pages through a list service (`page`/`pageSize`/`total`) and reports `complete`; capped, never loops forever |
| Shared loader | `services/reference/cache.ts` | one in-flight request per key, TTL reuse, failures never cached, prefix invalidation |
| Invalidation | `invalidatingService` in `services/index.ts` | successful create/update/remove on doctors, patients, organisations, guardian relations drops the cache |
| Services | `services/mock/reference.ts`, `http/reference.ts`; `doctorsService`, `patientsService` | mock adapters share the demo arrays; HTTP adapters are inert |
| Hooks | `useReferenceData.ts` | `useDoctors()`, `useOrganisations()`, `useGuardianRelations()` → `{ items, lookup, active, complete, loading, error, reload }`; `usePatient(id)` → `{ data, loading, error, reload }` |

Mock mode uses TTL 0 (unmigrated screens mutate the demo arrays directly, so nothing may be cached); API mode uses 30 s plus invalidation on mutation.
All hooks accept `enabled=false` (or no id) to skip the request. Ids are **never** converted string → number except through `legacyNumericId`.

**Migration recipe** for a screen that reads `DOCTORS`/`activeDoctors()`/`PANELS` directly:
`const { lookup, active, loading, error } = useDoctors()` → `lookup.get(row.doctorId)?.name ?? "—"`, options from `active`, plus loading/error/empty states.
`complete === false` means the list was truncated and lookups may miss real records: the mapper must support listing everything (or a by-id fetch) — CONTRACT REQUIRED.

### Consumers: migrated
| Consumer | Change |
|---|---|
| `patients/page.tsx` (list), `patients/[id]/page.tsx` (detail), `PatientForm` | patients via `patientsService`/`usePatient` (4B + shared hook) |
| `patients/[id]/page.tsx` | doctor names via `useDoctors(enabled only for legacy patients)`; organisation name via `useOrganisations` |
| `PatientForm` | organisation + guardian-relation pickers and their quick-add dialogs via the shared services/hooks (disabled with the pending-contract message in API mode; existing value kept) |
| `shared/PatientPicker.tsx` | search via `patientsService` (4B); emits legacy `Patient` only if its ids are canonical integers |
| `shared/QuickAddDoctorDialog.tsx` | creates via `doctorsService`; calls `onCreated` only with a faithful numeric id; in API mode it reports the pending contract instead of creating a **local-only** doctor (this fixes a hazard noted in §5) |
| `admin/users`, `admin/doctors` | via services (Phase 3) |

### Consumers deliberately left on synchronous mock data
Classified by what they depend on (counts are direct references to `PATIENTS`/`getPatient`, `DOCTORS`/`activeDoctors`, `PANELS`/`getPanel`, `GUARDIAN_RELATIONS`).

| Group | Files | Why unchanged | Can migrate when |
|---|---|---|---|
| ~~Encounters~~ | `encounters/page`, `encounters/new`, `encounters/[id]`, `encounters/[id]/discharge` | **migrated in Phase 4D — see §2d** | — |
| **Billing, Expenses, Bank** | `billing/[tab]/BillingHub`, `billing/consultations/new`, `billing/services/new`, Master Data → Banks and Expense Categories | **migrated in Phase 4H — see §2i** (frontend-prepared; every operation CONTRACT REQUIRED) | Billing / T6 / T7 contracts |
| **Lab** | `lab/orders/*` | **migrated in Phase 4E — see §2e** | — |
| **Imaging** | `imaging/orders/*` | **migrated in Phase 4F — see §2f** | — |
| **Pharmacy** | `pharmacy/[tab]/PharmacyHub` | **migrated in Phase 4G — see §2g; corrected and re-verified in Phase 4G.1 — see §2h** | — |
| **Reports** | `components/reports/*` (twelve screens) and `reports/page.tsx` | **migrated in Phase 4I — see §2j** (frontend-prepared; every report operation CONTRACT REQUIRED) | Reports contracts (T8 / T9; "already covered" Revenue, Daily Transactions, Patient Balances) |
| **Dashboard, Financial Statistics** | `dashboard/page`, `DashboardCharts`, `dashboard/stats` | **migrated in Phase 4J — see §2k** (frontend-prepared; every operation CONTRACT REQUIRED) | T10 / T11 contracts |
| **Master data** | `admin/master-data/page` (organisations, guardian relations, lab tests, services…) | its own CRUD UI over the mock arrays; shares them with the mock services, so state stays consistent. **The Services Catalog tab and its Item History were migrated in Phase 4K — see §2l** (the Panels, Wards, Guardian Relations, Diseases and Clinic Settings tabs were unchanged in 4K and **leaked demo data in API mode; fixed in the Post-4K.1 audit — `MockModeOnly`**) | Master-data/Catalogs contracts |
| **Shared balance panel** | `shared/PatientInfoPanel` (`getPanel` + the Pre Balance) | **the Pre Balance migrated in Phase 4K — see §2l** (it comes from `billSummaryService`; the organisation name moved from `getPanel` to `useOrganisations` in the Post-4K.1 audit) | Billing/balance contract |
| **Unmigratable alone** | any consumer doing `getPatient(Number(param))` or `DOCTORS.find(d => d.userId === id)` with ids from the URL/records | `Number("01ARZ…")` is `NaN`; they need their parent module's ids to become strings first | with their parent module |

### Dependencies for the Encounters integration (superseded by §2d)
1. Encounters contract (list/get/create/update, discharge, bed allocation) and whether `patientId`/`doctorId` are ULIDs.
2. A by-id or list-all strategy for patients and doctors (`complete`, paging) so encounter rows can resolve names; a batch lookup if lists are large.
3. Wards/beds contract (admission uses bed allocation); organisations only if encounters show panels.
4. Migrate the encounter screens to `useDoctors()`/`usePatient()`, switch `?patientId=` handling to string ids, and replace `activeDoctors()`.
5. `QuickAddDoctorDialog` host forms must move to string doctor ids before real doctors can be created from them.

### Unconfirmed contracts (this phase)
Organisations (list/create), guardian relations (list/create), doctor list-all/paging, patient by-id batch lookup. All CONTRACT REQUIRED; no endpoint keys were added for the first two.

### Tests
`src/lib/services/reference.test.ts` (24): id rules, lookup (number/string/ULID), `listAll` paging/caps/errors, shared loader (dedupe, TTL, TTL 0, failure not cached, prefix invalidation),
`invalidatingService`, doctor-lookup parity with the old `DOCTORS.find`, patient→legacy bridge parity with the old picker output, organisation/guardian mapping, inert HTTP adapters.
Hook rendering (loading/error/empty) has no DOM test environment in this project, so it was verified in a real browser (mock and API mode, login request stubbed; not part of CI).

## 2d. Encounters (Phase 4D)

**Four things that must not be confused**
1. *Backend functionality documented* — **only existence**. The Task List says encounters, wards and beds are "already covered, no task needed"; the API Reference overview lists "encounters" among the API's areas; T2/T5 say orders/dispensing "start from an encounter"; T8 counts "IPD admissions, discharges". There are **no endpoints, schemas, statuses, discharge rules or server-generated-field rules** in any provided document.
2. *Frontend preparation completed* — yes (below): service boundary, adapters, screens, ids, states, tests.
3. *Frontend connected to a confirmed API contract* — **none**. Every Encounters/wards operation is CONTRACT REQUIRED.
4. *Live backend integration verified* — **none** (no spec, no credentials). Browser runs below used a stubbed login only.

### Screens audited
| Screen | Mock/numeric-id dependencies before | Now |
|---|---|---|
| `encounters/page.tsx` (list) | `ENCOUNTERS`, `PATIENTS.find`, `DOCTORS.find`; client-side filter/sort/search | `encountersService.list` (type, date range, search, paging; newest first); names via `usePatients` / `useDoctors`; loading/error/empty states; pagination above 25 |
| `encounters/new/page.tsx` (4-step wizard) | `getPatient(Number(?patientId))`, `activeDoctors()`, `DOCTORS.find`, numeric `doctorId`, `WARDS`, client-side `nextEncounterId`/`nextTokenNo`, direct `ENCOUNTERS.push` + bed mutation | `PatientRecordPicker` + `usePatient(?patientId)` (string id, never `Number()`); `useDoctors().active`; `useWards`; `encountersService.create`; totals via `encounterTotals`; saving/error state; token only suggested in mock mode |
| `encounters/[id]/page.tsx` (detail) | `getEncounter(Number)`, `getPatient`, `DOCTORS`, `encountersForPatient`, `encounterBillBreakdown` | `useEncounter`, `usePatient`, `useDoctors`, history via `encountersService.list({patientId})`; bill summary/billing tab only for a numeric-id encounter, otherwise "not yet connected" |
| `encounters/[id]/discharge/page.tsx` | `getEncounter`, `getPatient`, direct `ENCOUNTERS[idx] =` write and `WARDS` bed mutation | `encountersService.discharge` (mock does the same writes); toast claims the bed is free only if the service says `bedReleased === true` |
| Patient/doctor selection, ward/bed selection | `PatientPicker` (legacy numeric), `activeDoctors()`, `WARDS` | string-id picker, shared hooks, `wardsService` |
| Status & billing summaries | `StatusBadge` over legacy statuses; bill from the mock billing aggregate | statuses unchanged (mapper must map to `open|discharged|cancelled`); aggregate hidden for non-numeric ids |

### Services implemented (all under `src/lib/services/`)
* `EncountersService` — `list`, `get`, `create`, `discharge`; `WardsService` — `list`. Types: `EncounterRecord`, `EncounterInput`, `DischargeInput`, `DischargeResult` (`bedReleased: boolean | null`), `WardRecord`, `BedRecord`. No `update`: no screen edits an encounter.
* Endpoint keys `encounters.list|get|create|discharge`, `wards.list` — **all `null`**. Pending mappers in `http/mappers.ts`: `encounterListQuery`, `parseEncounterList`, `parseEncounter`, `encounterPayload`, `dischargePayload`, `parseDischargeResult`, `wardListQuery`, `parseWardList`.
* `mock/encounters.ts` — same shared arrays as before (billing, lab, imaging, pharmacy, reports and the dashboard keep reading them). `encounterHelpers.ts` — `encounterFilterOptions`, `encounterTotals` (the wizard's original formulas).
* Hooks: `useEncounter`, `useWards`, `usePatients(ids)` (added to `useReferenceData.ts`); `encountersService` invalidates the `encounter` and `wards` caches after create/discharge.
* Shared UI: `PatientRecordPicker` (string ids) alongside the legacy `PatientPicker` (unchanged for billing/lab/imaging/pharmacy); `QuickAddDoctorDialog` gained `onCreatedRecord` for migrated hosts.

### ID compatibility
Encounter, patient, doctor and ward ids are opaque strings in `EncounterRecord`/`EncounterInput`. **Whether `patientId`/`doctorId` are ULIDs is not assumed.** The mock adapter converts to the legacy numeric ids only through `legacyNumericId` and **rejects** anything else with a 400 (no `NaN`, no `"007"` → 7). Links to unmigrated modules pass the encounter/patient id through unchanged (`?encounterId=…&patientId=…`); those modules still `Number()` them and will only work for numeric ids until migrated.

### Behaviour by mode
| | Mock (dev default) | API (production default) |
|---|---|---|
| List / detail / history | from the shared demo arrays, via the service | error state "awaiting the backend contract"; no rows, no counts, no amounts |
| New encounter | works end to end (OPD and IPD with a ward/bed); token suggested | cannot start: the picker reports the pending contract and Next stays disabled; no token invented; nothing is sent |
| Discharge | frees the bed, toast says so | error state; if later connected, the bed claim depends on `bedReleased` |
| Bill summary / billing tab | mock aggregate (numeric ids) | "not yet connected" notice |
| Requests to the backend | none | none (verified by network interception) |

### Pre-existing behaviour deliberately left unchanged
The wizard's *Date & Time* field is ignored on save (the encounter gets "now"); *Save Draft* does the same as *Save Encounter*; the discharge *follow-up date/instructions* are collected but the legacy model never stored them (the mock still doesn't; they are sent to the real adapter's `DischargeInput`).

### Contract required — exact questions for the backend developer
1. List/get/create/discharge: method, path, request body, response body. How are encounters paged, sorted (the UI now relies on **newest first**) and filtered (type, date range, patient, free-text search over patient name / MR no. / encounter no.)?
2. Are `patientId`, `doctorId`, ward and bed ids ULIDs? Are wards and beds referenced by id or by name (`ward`, `bedNo`)? Do list responses embed patient/doctor names, or must the UI fetch them (we currently fetch each distinct patient by id — a batch endpoint or embedded summary is needed for large pages)?
3. Which fields are server-generated: encounter number (`OPD-…`/`IPD-…`), daily token, date/time (does the API accept the wizard's date/time?), status, `netTotal`, `balance`? Does the server recompute the consultation totals from fee/discount?
4. Encounter statuses and the legal transitions (the UI knows `open`, `discharged`, `cancelled`); which statuses allow discharge; can an OPD encounter be discharged?
5. Does creating an IPD encounter allocate the bed (and fail with a conflict if it is taken), and does discharge release it? What does the response say (`bedReleased`)?
6. Discharge fields: which of discharge date, diagnosis, summary, condition, follow-up date/instructions does the API store? Is the condition a fixed list?
7. How is the consultation fee/payment captured — on the encounter, as a separate consultation invoice (billing), or both? (The Task List says consultation billing is covered separately.)
8. Permissions required for each operation.
9. Money fields as decimal strings (`parseMoney`/`formatMoney`); instant vs date formats for `date`, `dischargeDate`, `followUpDate`.

### Tests (frontend-only, controlled data — not backend verification)
`src/lib/services/encounters.test.ts` (26): contract-pending behaviour (all endpoints `null`, inert adapter, no request even with paths configured and mapping pending, no response guessing); mock list (order, type/date/patient filters, search, paging, 404 incl. ULID); create (server-style fields, shared arrays, **ULID ids rejected**, IPD bed occupation, unavailable/unknown bed or ward rejected, no-ward IPD allowed); discharge (fields, bed release, double discharge 409, unknown 404, no-bed → `bedReleased=false`); wards; id handling; cache invalidation; `encounterTotals` table; `encounterFilterOptions`. Screens (loading/error/empty/not-found, wizard, discharge) were verified in a real browser, **mock and API mode, login request stubbed** — 18/18 and 10/10 for Encounters, plus the Patients/reference suites re-run for regressions and the legacy picker/info panel/quick-add on unmigrated forms. These browser runs are ad hoc, not part of CI.

### Remaining blockers / dependants
* Everything above: **CONTRACT REQUIRED**, plus a development login for live verification.
* Billing, lab, imaging, pharmacy, reports and the dashboard still read `ENCOUNTERS`/`WARDS`/`PATIENTS`/`DOCTORS` directly and still `Number()` the ids in their links; until they migrate, API mode is only usable for the migrated screens, and an IPD admission made through the real backend would not appear in them.
* `MEDICINES` (prescription medicine picker in the wizard) is pharmacy master data and stays mock. *(Superseded in Phase 4K.1: the picker now goes through the pharmacy medicine service — §2m.)*

## 2e. Laboratory — T1 diagnostics catalog + T2 lab orders (Phase 4E)

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List marks **T1 and T2 "Done, merged to Development"** and describes what they cover (below). It publishes **no endpoints, request/response schemas, id formats, pagination or server-generated-field lists**; the API Reference overview lists "lab" as an area and nothing more. The Task List itself says the mock data "defines what each screen needs; it is not an API contract".
2. *Frontend preparation completed* — yes (below).
3. *Frontend connected to a confirmed API contract* — **none**. Every lab operation is CONTRACT REQUIRED.
4. *Live backend integration verified* — **none** (no spec, no credentials). Browser runs used a stubbed login only.

### What the documents say (and nothing more)
* **T1:** lab tests have a code, name, category (Haematology, Biochemistry, Serology, Urine Analysis, Cardiology, Radiology), rate, turnaround hours, and either parameters (unit, normal low/high) or a narrative result; ECG/Ultrasound tests have code, name, fee, remarks, active flag. Backend: "CRUD **and deactivate** for lab tests and ECG/USG tests on the existing services catalog, plus validation of the parameter list" (`DiagnosticCatalogExtension` off `ServiceCatalogItem`).
* **T2:** lab number (`LB-…`), priority Normal/Urgent, sample type and id, collected by, clinical notes, several tests per order with discount and GST, results per parameter with a High/Low/Critical flag or narrative text, pathologist remarks, performed by and verified by. Statuses **Pending → Collected → In Progress → Completed → Delivered**; orders start from an encounter or as walk-ins. Backend: create, list and search; status transitions; result entry and verification; **auto-flagging against normal ranges**; **charges posted when earned (ADR-0047)**; **a sequence for lab numbers**; a print-ready result payload. Decision: **a second doctor verifies before printing (ADR-0051)**.

### Screens and files inspected (existing behaviour recorded before changing anything)
| Screen / file | What it does today |
|---|---|
| `lab/orders/page.tsx` | list; status chips (All/Pending/Collected/In Progress/Completed/Delivered); search by patient, order no., MR no.; "N Pending" badge; "Enter Results"/"Print Report" row actions |
| `lab/orders/new/page.tsx` | patient (picker), optional encounter link, ordering doctor (+quick add), priority, clinical notes, sample type, tests by category with rate / turnaround, per-test Dis% / GST% / Package, flat discount, payment mode, "New Test" quick add |
| `lab/orders/[id]/page.tsx` | detail; **Mark Collected / Start Processing / Mark Delivered**; per-test result summary; remarks/performed/verified |
| `lab/orders/[id]/results/page.tsx` | result entry: parameter values with live High/Low preview, narrative reports (+ "Normal Study"), single-value tests, remarks, performed by (signed-in name), verified by (free text), Save / Save & Mark Complete |
| `admin/master-data/page.tsx` → *Lab & Imaging Tests*, *ECG/Ultrasound* tabs | catalog list (category filter), add, edit; ECG/USG add, edit and **active switch** |
| `shared/QuickAddLabTestDialog.tsx` | quick-register a test (shared with the imaging form, which was migrated in Phase 4F) |
| Readers of lab data **left unchanged** | `data/lab`, `data/labTests`: imaging order form (*migrated in Phase 4F; the once-at-module-load catalogue snapshot described here is gone*), `billingAggregate`, top-bar "results ready" notifications, `LabReport`/`ListsReport`/`DailySummaryReport`/`DailyTransactionsReport`/`RevenueReport`, dashboard stats, patient detail lab tab |

### Services, mappers and hooks implemented (`src/lib/services/`)
* `LabTestsService` (list, create, update), `EcgUltrasoundTestsService` (list, create, update incl. `active`), `LabOrdersService` (list, get, create, **transition**, **enterResults**). Types: `LabTestRecord`, `LabTestInput`, `EcgUltrasoundTestRecord`, `LabOrderRecord`, `LabOrderInput`, `LabResultEntryInput` (**values only — no flag is sent**; the Task List says the server flags).
* Endpoint keys `labTests.*`, `ecgTests.*`, `labOrders.*` (11) — **all `null`**. Pending mappers in `http/mappers.ts`: list queries, parsers and payload builders for each.
* `http/lab.ts` (inert adapters), `mock/lab.ts` (same shared arrays as before, validation instead of silent coercion), `labHelpers.ts` (`flagFor`, `labLineTotal`, `labOrderTotals`, `isLegalLabTransition`, `LAB_FILTERS`).
* Hooks: `useLabTests`, `useLabOrder` (shared cache, invalidated by lab mutations). `QuickAddLabTestDialog` creates through the service and offers `onCreatedRecord` (migrated hosts) next to the legacy numeric `onCreated` (no screen uses it since Phase 4F migrated imaging; kept so an unmigrated form can).
* Screens migrated: order list / new / detail / result entry, and the two Master Data catalog tabs — each with loading, error (+ "Try again"), empty and not-found states.

### ID compatibility
Order, test, patient, doctor and encounter ids are opaque strings in the lab records/inputs; **no id format is assumed**. The mock adapter converts to legacy numeric ids only through `legacyNumericId` and rejects anything else (a ULID, "007", an unknown test or encounter) with a 400 and stores nothing. The new-order form passes `?patientId=` / `?encounterId=` through untouched.

### Behaviour by mode
| | Mock (dev default) | API (production default) |
|---|---|---|
| Order list / detail | demo orders via the service; Pending badge = Pending total | error state "awaiting the backend contract"; no rows, no counts, **no Pending badge** |
| New order | works end to end; next order number previewed | catalog shows a contract-pending error (no mock tests, no prices); order number "assigned on save" (documented as server-side); patient picker reports the pending contract; **Save disabled** |
| Workflow | Collected → In Progress → results → Completed → Delivered; illegal moves rejected (409) | error states; nothing is sent |
| Result entry | values saved; mock auto-flags like the server would | error state |
| Catalog tabs | list/filter/add/edit/active via the service (shared with the order form) | error states, no mock rows |
| Requests to the backend | none | none (verified by network interception) |

### Where the documents and the current UI differ (flagged, **not** changed — each needs a design/contract decision)
1. **Deactivate for lab tests** is documented for the backend; the UI's lab test has no active flag and no deactivate (ECG/USG does).
2. **Verification (ADR-0051):** the UI has a free-text "Verified By", optional, with no check that the verifier is a second doctor, and "Save & Mark Complete" does not require it.
3. **Flags:** the server auto-flags; the UI previews High/Low itself and the mock mimics it. "Critical" is never produced (no thresholds exist). Single-value tests are always flagged "Normal" (pre-existing).
4. **Charges "posted when earned":** the form sets paid/unpaid at creation and shows a total; whether the backend posts charges at creation or on a later step is unknown.
5. Pre-existing and untouched: *Collection Date/Time* is ignored on save; the detail page's test *Code*/*Category* columns show "—"; "Enter Result" per test links to the same page; results can be entered in any status; printing is `window.print()` (the print-ready payload is not used); the catalog editor cannot edit parameters/narrative/units.

### Contract required — exact questions for the backend developer
1. **Catalog:** routes/schemas for lab tests and ECG/USG tests (are they the generic services catalog?). How are parameters (unit, normal low/high) and the narrative flag represented, and may the UI create/edit them? How does "deactivate" work and should the UI show it for lab tests? Search/category filter/paging parameters.
2. **Orders:** routes/schemas for list, get, create, status transition and result entry/verification. List filters (status, patient, free text over patient name / MR no. / lab no.), paging, and **newest-first** ordering.
3. **Ids:** are test, order, patient, doctor, encounter ids ULIDs? Does an order reference an encounter or a walk-in how?
4. **Server-generated fields:** lab number, sample id, date/time, status, line charges, total, payment status — which are generated/recomputed? Does the API accept the form's collection date/time?
5. **Charges:** are charges posted at order creation or when "earned" (which step)? What does the order's payment mode/status mean then?
6. **Flags:** values and thresholds for High/Low/Critical; are flags returned per parameter? Single-value tests?
7. **Transitions:** one route or several; which are legal; who may perform each; can an order be cancelled?
8. **Verification:** how is the second-doctor verification captured (doctor id?), must it differ from the performer, and is it required before Completed/printing? Is "performed by" derived from the token?
9. **Money:** decimal strings for rate, charges, discounts, GST, total (`parseMoney`/`formatMoney`); GST rate/percent representation.
10. **Print:** what is the print-ready result payload, and should the UI use it instead of `window.print()`?
11. **Permissions** required for each operation and for the catalog tabs.

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/lab.test.ts` (30): contract-pending behaviour (all 11 endpoints `null`, inert adapters, no request even with paths configured and mapping pending, no response guessing, **static guard that the HTTP adapters import nothing from `src/data` or the mock adapters**); mock catalog (filters, search, paging, defaults, update keeps parameters, validation, 404); ECG/USG incl. active toggle; orders (newest first, filters, search, paging, 404 incl. ULID); create (server-style fields, totals with discount/package/flat, credit unpaid, encounter link, **ULID/unknown ids rejected with nothing stored**); workflow (legal path, illegal 409, 404); result entry (auto-flags High/Low/Normal/none, narrative, single-value, remarks/performed/verified, partial vs complete); helpers; cache invalidation.
* Loading/error/empty/success **screen** states and the full workflow were verified in a real browser — **mock and API mode, login request stubbed**: Laboratory 32/32 (mock) and 14/14 (API), plus the Encounters, Patients/reference-data and legacy-form suites re-run for regressions. **Caveat:** Master Data is admin-gated and a stubbed login has no role, so the harness set a UI role in React state to render those tabs (a test device only; it says nothing about backend authorization). These browser runs are ad hoc, not part of CI.

### Remaining blockers / limitations
* All of the above is **CONTRACT REQUIRED**; live verification also needs a development login.
* Pharmacy, billing, reports, dashboard, the top-bar notifications and the patient detail lab tab still read `LAB_ORDERS`/`LAB_TESTS` directly and `Number()` ids in their links; until they migrate, API mode only covers the migrated lab screens, and an order created through the real backend would not appear in them.
* The UI/document differences listed above are open design decisions. (The imaging form's catalogue snapshot was fixed in Phase 4F.)

## 2f. Imaging — T3 (Phase 4F)

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List marks **T3 "Done, merged to Development"** and describes it in three lines (below). It publishes **no endpoints, request/response schemas, id formats, pagination or server-generated-field lists**; the API Reference overview only lists "imaging" as an area. The Task List says the mock data "defines what each screen needs; it is not an API contract".
2. *Frontend preparation completed* — yes (below).
3. *Frontend connected to a confirmed API contract* — **none**. Every imaging operation is CONTRACT REQUIRED.
4. *Live backend integration verified* — **none** (no spec, no credentials). Browser runs used a stubbed login only.

### What the documents say (and nothing more)
* **T3 — Imaging (X-Ray) orders:** "an X-Ray number, tests, discount, total, payment mode and the same status flow as lab. Results are narrative." Schema: "the same `DiagnosticOrder` with `type` = imaging." Build: "reuses T2's service with a narrative-only result path and its own sequence." Task table: "order, perform, report signed by one doctor, billing"; screens: imaging orders list / new / detail, and the encounter's "New Imaging Order". The table's title lists X-Ray, Ultrasound, Doppler, Echo and ECG; the detailed section says "X-Ray".
* **Decided:** an imaging report is **signed by the reporting doctor alone (ADR-0052)**. **ECG/USG is billed through imaging orders (T3)**; the Reports task says the ECG/ultrasound tab "can be filled from them".
* **Open questions in the Task List:** does the reporting doctor (sonologist, radiologist) get a per-study fee ("for now only the referring doctor earns commission")? **Image upload waits on T13** (file storage — S3-compatible, signed uploads; not built).
* Nothing else: no paths, no statuses beyond "the same status flow as lab", no permissions, no id format.

### Audit — existing behaviour recorded before changing anything
| Screen / file | What it did |
|---|---|
| `imaging/orders/page.tsx` | list of `IMAGING_ORDERS` sorted newest first; chips All / Pending / In Progress / Completed / Delivered (**no Collected**); search by patient name, X-Ray number, MR no. (all client-side); "N Pending" badge; "total imaging orders" count; "Print Report" (`window.print()`) on Completed/Delivered rows; no paging |
| `imaging/orders/new/page.tsx` | patient (legacy `PatientPicker`, `getPatient(Number(?patientId))`), optional encounter link (`ENCOUNTERS`, `?encounterId`), ordering doctor (`activeDoctors()`, + quick add), a **Date/Time input that was never saved**, payment mode, tests = `LAB_TESTS` filtered to **Radiology and Cardiology at module load** (so a quick-added test did not appear until reload), per-test Dis% / GST% / Package, flat discount, notes (stored on **every test line** as `remarks`), total; save pushed into `IMAGING_ORDERS` and generated the X-Ray number (`nextXrNo`) and id client-side |
| `imaging/orders/[id]/page.tsx` | detail from `IMAGING_ORDERS`; buttons **Start Processing** (Pending → In Progress), **Mark Completed** (In Progress → Completed), **Mark Delivered** (Completed → Delivered), **Print Report**; test table with the stored narrative result (read-only) and a **disabled "Upload Image"** button titled "PACS integration planned — Phase 2" |
| *Result / report entry* | **no screen exists** — narrative results only appear on seeded demo orders. There is no reporting-doctor or signature field, no verification step, and no upload |
| `data/imaging.ts`, `types ImagingOrder` | order = id, xrNo, patientId, encounterId, doctorId, date, tests (`LabOrderTest`), discount, total, paymentMode, status. No priority, no payment status, no sample, no reporting doctor |
| Direct dependants **left unchanged** (still read `IMAGING_ORDERS`) | `billingAggregate` (encounter and standalone-patient billing roll-ups), `DailyTransactionsReport`, `dashboard/stats` (X-Rays tab), patient detail page "imaging" tab (hidden for non-legacy ids) |
| Dependencies on other modules | Patients (`PatientRecordPicker`, `usePatient(s)`), Encounters (`encountersService.list`), Doctors (`useDoctors`, `QuickAddDoctorDialog`), **Laboratory** (the test catalogue — see below; the quick-add test dialog) |

### Services, mappers and hooks implemented (`src/lib/services/`)
* `ImagingOrdersService` — `list`, `get`, `create`, `transition`, `enterReport`. Types `ImagingOrderRecord`, `ImagingOrderInput`, `ImagingReportInput` (narrative text per test only — **no reporting doctor, no signature**; ADR-0052 says the doctor signs, but how that is captured is unknown, so nothing is invented).
* Endpoint keys `imagingOrders.list/get/create/transition/enterReport` — **all `null`** (5). Pending mappers in `http/mappers.ts` (`imagingOrderListQuery`, `parseImagingOrderList`, `parseImagingOrder`, `imagingOrderPayload`, `imagingTransitionPayload`, `imagingReportPayload`) with the contract questions in a comment.
* `http/imaging.ts` (inert adapter on the shared `callEndpoint`), `mock/imaging.ts` (mutates the shared `IMAGING_ORDERS`; rejects non-numeric ids with a 400), `imagingHelpers.ts` (`IMAGING_FILTERS`, `imagingFilterStatus`, `isLegalImagingTransition`, `isImagingTest`, `IMAGING_CATEGORIES`). Money arithmetic is Laboratory's (`labLineTotal`, `labOrderTotals`) — imaging lines carry the same discount / GST / package settings.
* Hook `useImagingOrder(id)` (shared cache key `imagingOrder:<id>`, invalidated by every successful imaging mutation). The catalogue is **`useLabTests()`** filtered by `isImagingTest`.
* **No new catalogue service and no new catalogue endpoint key.** The UI's existing behaviour — imaging draws on the lab catalogue's Radiology and Cardiology tests — is kept, so imaging inherits the `labTests.list` contract question (§2e). Whether imaging has its own catalogue, or also uses the ECG/ultrasound tests, is CONTRACT REQUIRED.
* Screens migrated: order list, new order, detail — each with loading, error (+ "Try again"), empty and not-found states, and debounced server-side search, status chips and paging (25 rows) on the list.
* `QuickAddLabTestDialog` is unchanged functionally (it only gained a comment fix). The imaging form uses its `onCreatedRecord`: a new Radiology/Cardiology test is listed and selected immediately (the old snapshot is gone); a test registered in another category is added to the shared catalogue but, instead of being silently selected, a toast says imaging lists Radiology and Cardiology tests only.

### ID compatibility
Order, test, patient, doctor and encounter ids are opaque strings in the imaging records and inputs; **no id format is assumed**. `?patientId=` / `?encounterId=` are passed through untouched (never `Number()`-ed). The mock adapter converts to legacy numeric ids only through `legacyNumericId` and rejects anything else (a ULID, "007", an unknown test or encounter) with a 400 and stores nothing.

### Behaviour by mode
| | Mock (dev default) | API (production default) |
|---|---|---|
| Order list / detail | demo orders via the service; Pending badge = the Pending total | error state "awaiting the backend contract"; no rows, no counts, **no Pending badge** |
| New order | works end to end; next X-Ray number previewed in the header | catalogue shows a contract-pending error (no mock tests, no prices); the number is "assigned on save" (documented as server-side); the patient picker reports the pending contract; `?patientId` loads no mock patient; **Save disabled** |
| Workflow | Start Processing → Mark Completed → Mark Delivered; illegal moves rejected (409) | error states; nothing is sent |
| Report entry | service-level only (no screen): narrative stored per test, empty text rejected | error (service inert) |
| Upload Image | disabled, as before | disabled, as before |
| Requests to the backend | none | none (verified by network interception) |

### Where the documents and the current UI differ (flagged, **not** changed — each needs a design/contract decision)
1. **No report-entry screen.** The Task List describes order → perform → report signed by one doctor. The UI can only display a narrative; nobody can enter one. The service has `enterReport`, but no screen calls it (adding one is new UI, not preparation).
2. **Reporting doctor / signature (ADR-0052)** has no field anywhere in the UI or the types. Not modelled, deliberately.
3. **Status flow:** the Task List says "the same status flow as lab" (Pending → Collected → In Progress → Completed → Delivered). The UI skips **Collected** (no chip, no button) and can complete an order with no report; "Mark Completed" is a plain status button. Whether imaging uses Collected is unknown.
4. **ECG / ultrasound / Doppler / Echo:** the Task List says ECG/USG are billed through imaging orders. The form lists the lab catalogue's Radiology and Cardiology tests only (ECG is a Cardiology lab test, USG a Radiology one) and never reads the separate ECG/Ultrasound catalogue.
5. **Charges / payment:** the form takes a payment mode and stores a total at creation; there is no payment status on an imaging order (the lab order has one) and no "posted when earned" concept in the UI. Whether charges post at creation or later is unknown.
6. **Reporting-doctor fee:** an open Task List question — nothing in the UI.
7. Pre-existing and untouched: the *Date/Time* input is ignored on save; one "Remarks / Notes" is copied onto every test line; "Print Report" is `window.print()`; results can't be edited after completion (no edit screen at all).

### Contract required — exact questions for the backend developer
1. **Routes:** are imaging orders served by T2's routes (with a type field/filter) or their own? Routes/schemas for list, get, create, status change and report entry.
2. **Catalogue:** which catalogue do imaging orders pick from — lab tests in Radiology/Cardiology (what the UI does), the ECG/USG catalogue, or a dedicated one? Can the quick-add dialog still create the tests?
3. **Ids:** are order, test, patient, doctor and encounter ids ULIDs? How is an order linked to an encounter, and a walk-in expressed?
4. **Server-generated fields:** X-Ray number (own sequence — format?), date/time, status, line charges, total — which are generated or recomputed? Does the API accept the form's Date/Time?
5. **Money:** decimal strings for rate, charges, discount, GST, total (`parseMoney`/`formatMoney`); the representation of the discount percent and GST percent and the package flag.
6. **Statuses and transitions:** is "Collected" used for imaging? One route or several; which are legal; may an order complete without a report; can it be cancelled; who may do each?
7. **Report:** the narrative field per test or per order? Who is the reporting doctor — chosen by the UI (a doctor id) or derived from the token? How is "signed by one doctor" (ADR-0052) represented, and can a signed report be amended?
8. **Billing:** are charges posted at creation or when earned (ADR-0047)? What does the payment mode mean then? Is the referring-doctor commission calculated by the server?
9. **List:** filters (status, patient, free text over patient name / MR no. / X-Ray no.), paging, **newest-first** ordering.
10. **Print:** is there a print-ready report payload (as T2 has) the UI should use instead of `window.print()`?
11. **Images (T13):** upload/storage contract, size/type limits, and whether the "Upload Image" button should stay disabled until it exists.
12. **Permissions** required for each operation.

### Impact on Laboratory and other modules
* **Laboratory:** unchanged behaviour. The lab catalogue is now shared by two migrated screens (lab order form, imaging order form) through `useLabTests`, so a catalogue contract change affects both; a test registered from either form invalidates the same cache. `LAB_ORDERS` is untouched by imaging (covered by a test). Lab regression suites were re-run (below).
* **Other unmigrated readers:** `billingAggregate`, the daily transactions report, the dashboard X-Rays tab and the patient detail imaging tab still read `IMAGING_ORDERS`. In mock mode they stay consistent because the mock adapter mutates that same array (verified: an order created through the service shows on the dashboard's X-Rays tab). In API mode they would show demo orders and **an order created through the real backend would not appear in them** until they migrate.
* **Legacy forms:** `PatientPicker` (numeric ids) is now only used by billing forms; the lab and imaging forms use `PatientRecordPicker`. The "legacy picker + info panel" browser check still passes for all three screens but no longer exercises imaging as a legacy host.

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/imaging.test.ts` (23): contract-pending behaviour (all 5 endpoints `null`; inert adapter sends no request even with hypothetical paths configured and the mapping pending; no response guessing; **static guard that the HTTP adapters import nothing from `src/data` or the mock adapters**); mock list/get (string ids, newest first, filters, search, paging, 404 incl. ULID); create (server-style fields, own number sequence, laboratory orders untouched, totals with discount/package/flat discount, encounter link, **ULID/"007"/unknown ids rejected with nothing stored**); workflow (legal path, illegal moves 409 including Collected, 404); narrative report entry (per-test storage, validation, 404, no reporting doctor/signature stored); helpers (transitions, chips, catalogue categories, a test added through the shared catalogue service is usable); cache invalidation (imaging mutations refresh imaging caches only).
* Screen states and the full workflow were verified in a real browser — **mock and API mode, login request stubbed only**: Imaging 28/28 (mock) and 12/12 (API, zero backend requests), plus regression re-runs of Laboratory (32 mock / 14 API), Encounters (18 / 10), Patients and reference data (26 / 16) and the legacy-form check (3). These runs are ad hoc, not part of CI. The Laboratory run still uses a UI-role harness for the admin-gated Master Data tabs (a test device only).

### Remaining blockers / limitations
* All of the above is **CONTRACT REQUIRED**; live verification also needs a development login.
* No report-entry screen, reporting doctor, signature, Collected step or image upload exist in the UI; adding them needs the answers above (and T13 for images).
* Billing, reports, the dashboard and the patient detail imaging tab remain on demo data (see §5).

## 2g. Pharmacy — T4 inventory + T5 dispensing (Phase 4G)

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List marks **T4 and T5 "Done, merged to Development"** and describes them (below). It publishes **no endpoints, request/response schemas, id formats, pagination or server-generated-field lists**; the API Reference overview only lists "pharmacy" as an area. The Task List says the mock data "defines what each screen needs; it is not an API contract".
2. *Frontend preparation completed* — yes (below).
3. *Frontend connected to a confirmed API contract* — **none**. Every pharmacy operation is CONTRACT REQUIRED.
4. *Live backend integration verified* — **none** (no spec, no credentials). Browser runs used a stubbed login only.

### What the documents say (and nothing more)
* **T4 — Pharmacy inventory:** frontend fields "medicine name, generic, category, unit, purchase and sale rate, stock, batch, expiry, reorder level, supplier". Schema: `Medicine` plus `MedicineBatch` (received, remaining, expiry, purchase rate, write-off) per **ADR-0017**. Build: "medicine CRUD, receive stock as a batch, write-off and adjustment, and a stock view with low-stock and near-expiry filters."
* **T5 — Pharmacy dispensing:** frontend "a dispense number (`DIS-...`), lines with prescribed vs dispensed quantity, a discount per line and per record, GST, an 'included in package' flag, payment mode, dispensed by, notes. History has a list with search." Schema: `DispenseRecord`, `DispenseLine`, `DispenseLineBatchAllocation` exist; **"there's no dispense number field; discount and GST would sit on the charges."** Build: "dispense from an encounter's prescription or walk-in, **FEFO batch allocation inside a transaction, refusal on short stock, charges posted, and returns/voids**."
* **Open question in the Task List:** "Pharmacy GST and 'included in package': which hospital uses packages, and what's the GST rate on medicines?" — unanswered.
* **Future backend work that reads pharmacy (not built):** T9 Pharmacy report ("sales, stock value, expiring"), T10 dashboard ("low stock, dispensed today"), T11 financial statistics (medicines). The frontend's Pharmacy report and dashboard stay on demo data.
* Nothing else: no paths, no statuses, no permissions, no id format, no stock units, no return/void rules.

### Audit — existing behaviour recorded before changing anything
| Screen / file | What it did |
|---|---|
| `pharmacy/[tab]/PharmacyHub.tsx` (3 tabs: inventory / dispense / history; `tabs.ts`, `[tab]/page.tsx` give the static routes and a real 404 for other tabs) | everything below, all against `MEDICINES` and `DISPENSE_RECORDS` imported from `src/data` and mutated in place |
| Header tiles | Total Items; Inventory Value (= stock × **sale** rate); Low Stock (stock > 0 and < reorder level); Expiring Soon (0–30 days) — all computed over the whole list |
| Inventory tab | search by name/generic (client-side); filter All / Low Stock / Out of Stock / Expiring Soon / Expired; low-stock and out-of-stock alert banners; table (medicine, generic, category, batch no., expiry, stock + unit, sale rate, status badge); no paging |
| Status badge rule | Expired (past expiry) beats Out of Stock (stock 0) beats Expiring Soon (≤ 30 days) beats Low Stock (< reorder level) |
| Add / Edit Medicine | name, generic, category (static list), **one batch number, one expiry date, stock quantity**, sale rate, reorder level. **New medicines silently got unit "Tablet" and purchase rate = 60 % of the sale rate** (the dialog has no such fields). Edit also rewrote the stock directly. No delete / deactivate. Supplier, unit and purchase rate not editable |
| Adjust Stock | Add or Remove a quantity with an optional reason (**the reason was never stored**); removing more than on hand **silently floored the stock at 0** |
| Dispense tab | patient (legacy `PatientPicker`, `getPatient(Number(?patientId))`), optional encounter (`ENCOUNTERS`), optional doctor (+ quick add), "Load Rx" from the encounter's prescription (medicine **matched to the inventory by name text**, qty 1), medicine rows (qty, instructions, discount %, "included in package"), pharmacist remarks, flat discount %, GST %, payment mode Cash / Card / On Account, Print Receipt (`window.print()`) |
| Dispense rules in the UI | **short stock is not refused**: dispensed = min(asked, stock) and the summary shows "(partial: n)"; a row with qty 0 still produced a zero line; stock was checked per row against the full shelf in the preview but deducted sequentially (clamped at 0) at save, so the **same medicine on two rows could be previewed as dispensable twice**; "dispensed by" was hard-coded **"Omar Farooq"**; the dispense number (`nextDispenseNo`) and id were generated client-side; the summary header showed the next number |
| Totals | line = (dispensed × rate, or 0 if package) less line discount %; subtotal = Σ lines; flat discount % off the subtotal; GST % on top |
| History tab | `DISPENSE_RECORDS` newest first, search by patient name or dispense number (client-side), table (number, date, patient, medicines, total, dispensed by, print icon → `window.print()`); no paging, no detail screen |
| Returns, voids, write-off, "receive stock as a batch", FEFO, batch allocation | **not present in the UI** |
| Direct dependants **left unchanged** (still read `MEDICINES` / `DISPENSE_RECORDS`) | `dashboard/page.tsx` (low / critical stock tiles), `dashboard/stats` (Medicine tab), `Topbar` (stock notifications), `PharmacyReport`, `DailySummaryReport`, `DailyTransactionsReport`, `RevenueReport`, `billingAggregate` (encounter and standalone-patient billing roll-ups), `patients/[id]` (dispense tab, hidden for non-legacy ids), `encounters/new` (**prescription medicine picker reads `MEDICINES`** — free-text medicine names) |
| Links into pharmacy | encounter detail → `/pharmacy/dispense?encounterId=&patientId=`; patient detail → `/pharmacy/dispense?patientId=` (ids passed through as strings) |
| Dependencies on other modules | Patients (`PatientRecordPicker`, `usePatient(s)`), Encounters (`encountersService.list`, the prescription), Doctors (`useDoctors`, `QuickAddDoctorDialog`), Billing/Payments (none directly: payment mode is just stored; `billingAggregate` reads the records) |

### Services, mappers and hooks implemented (`src/lib/services/`)
* `MedicinesService` — `list`, `create`, `update`, `adjustStock`; `DispensingService` — `list`, `create`. Types `MedicineRecord`, `MedicineInput` (**no unit, purchase rate or supplier — the dialog has none, and nothing invents them for the backend**), `StockAdjustmentInput`, `DispensingRecord`, `DispenseLineRecord`, `DispenseInput` (**no dispense number, no per-line dispensed quantity or totals, no "dispensed by"** — server-generated or derived, CONTRACT REQUIRED which), `DispenseLineInput` (the quantity asked for).
* Endpoint keys `medicines.list/create/update/adjustStock` and `dispensing.list/create` — **all `null`** (6). Pending mappers in `http/mappers.ts` (`medicineListQuery`, `parseMedicineList`, `parseMedicine`, `medicinePayload`, `stockAdjustmentPayload`, `dispenseListQuery`, `parseDispenseList`, `parseDispense`, `dispensePayload`) with the contract questions in a comment.
* `http/pharmacy.ts` (inert adapters on the shared `callEndpoint`), `mock/pharmacy.ts` (mutates the shared `MEDICINES` / `DISPENSE_RECORDS`; rejects non-numeric ids with a 400; validates everything **before** touching stock), `pharmacyHelpers.ts` (`medicineStatus`, `matchesInventoryFilter`, `inventorySummary`, `planDispense`, `dispenseTotals` — the screens' rules, shared by the page and the mock so the preview and the saved record cannot disagree).
* `pharmacyContract.ts` (Phase 4G.1): `pharmacyContractStatus(source)` — in API mode an operation is available only when its `ENDPOINTS` key is set; drives the banner, panels and disabled actions (see "Behaviour by mode"). `pharmacyHelpers.ts` also gained `findStockShortfalls` in 4G.1.
* Hook `useMedicines()` (shared cache key `medicines`; `useMedicines(false)` skips the request entirely, which the hub uses while the list endpoint is unset). **Dispensing also invalidates it** (stock changed), as do medicine create / update / stock adjustment. The header tiles and both stock-aware tabs share one catalogue request.
* Screens migrated: the header tiles, Inventory (list, filters, alerts, Add/Edit, Adjust Stock), Dispense and History — each with loading, error (+ "Try again"), empty states and disabled-while-saving buttons; History gains debounced server-side search and paging at 25 rows. The inventory screen still filters client-side over the full catalogue (so the tiles and alerts see every medicine); a server-side stock view with low-stock / near-expiry filters is documented for the backend but its shape is unknown.
* **No new API client, no duplicated infrastructure.**

### ID compatibility
Medicine, dispense, patient, doctor and encounter ids are opaque strings in the pharmacy records and inputs; **no id format is assumed**. `?patientId=` / `?encounterId=` are passed through untouched (never `Number()`-ed). The mock adapter converts to legacy numeric ids only through `legacyNumericId` and rejects anything else (a ULID, "007", an unknown medicine or encounter) with a 400, stores nothing, and leaves stock unchanged (even when the bad line is the second one). The "(id)" suffix beside a medicine name, and the "#id" chip in the summary, show only for short numeric ids.

### Behaviour by mode
*(Updated in Phase 4G.1 — the API column below replaces the Phase 4G wording, which showed "Couldn't load" error states and left the dispense form on screen with only the submit button disabled.)*

| | Mock (dev default) | API (production default), while any endpoint key is `null` |
|---|---|---|
| Page | no banner | a page banner: "Pharmacy is not connected to the backend" — the API contract has not been provided, no request is sent, no demo data is shown — listing each operation awaiting a contract |
| Header tiles | derived from the loaded list | **"—"** for all four (not 0, not demo numbers); no stock alerts |
| Inventory | demo medicines via the service; filters, alerts, Add / Edit / Adjust stock work end to end | the table is replaced by a **"Inventory is unavailable … this is not an empty inventory"** panel (never "No medicines found"); search, filter and **Add Medicine disabled** (hint "Awaiting the backend API contract"); the dialogs cannot be opened and their Save buttons are disabled too |
| Dispense | works end to end; next number previewed; **refuses short stock** (see Phase 4G.1) | the form is **not rendered**: a "Dispensing is unavailable" panel replaces it (no patient picker, medicine rows, summary, dispense number or Dispense & Finish); `?patientId=` / `?encounterId=` deep links show the same panel, no mock patient or prescription |
| History | demo records via the service | a "Dispense history is unavailable" panel; no rows, no "No dispense records" empty state |
| Requests to the backend | none | **none** — while the list endpoint is unset the screens do not even call the service; the adapters would throw `NotConnectedError` before any network call regardless |
| Fallback to mock | not applicable | **none** (`resolveDataSource`: no runtime fallback; a static test guards the HTTP adapters and the hub against importing demo data) |

The gating comes from `src/lib/services/pharmacyContract.ts` (`pharmacyContractStatus`): in API mode an operation is "available" only when its key in `ENDPOINTS` is set. When the backend developer fills the keys, the banner, panels and disabled states disappear on their own. It inspects only the endpoint table — it never probes the network and never guesses a route. (If a key is set but its mapper in `http/mappers.ts` is still `pending`, the call throws `NotConnectedError` and the existing error states apply.)

### Intentional behaviour changes (all mock-mode; none alters a documented rule)
1. A dispense line with **quantity ≤ 0 or not a number is now rejected** (400, nothing stored); before, it produced a zero-quantity line.
2. **Stock is consumed row by row** in both the preview and the save, so the same medicine on two rows cannot be dispensed beyond the shelf (the preview used to overstate).
3. A rejected dispense changes nothing (validation precedes the stock deduction).
4. History search is debounced and the list pages at 25 rows. Header tiles show "—" / "…" instead of a number when the catalogue is unavailable / loading.
5. `dispensedBy` stays the demo name `"Omar Farooq"` **in the mock only**; the form never sends it, so the backend never receives an invented attribution.
6. **(Phase 4G.1) Short stock is now refused, not partially dispensed** — see "Phase 4G.1" below. This supersedes the Phase 4G wording in items 2–3 above where they described clamping to the shelf.

### Where the documents and the current UI differ (flagged, **not** changed — each needs a design/contract decision)
1. **Batches (ADR-0017):** the backend models `Medicine` + `MedicineBatch`; the UI has **one batch per medicine** (batch no., expiry, stock on the medicine) and the edit dialog overwrites stock/batch/expiry directly.
2. **"Receive stock as a batch", write-off, adjustment:** the UI has a single flat Add / Remove dialog (reason unused; removal floors at 0). Which backend operation each maps to is unknown.
3. **Short stock — RESOLVED in the mock and the screen (Phase 4G.1):** the Task List says the backend refuses, and the mock adapter and Dispense screen now refuse too (no partial line, no zero line). What stays unknown is the **real error code / body** the backend returns for a refusal (the mock reuses its generic 400 field-error shape) and whether the UI should offer anything beyond "reduce the quantity".
4. **FEFO / batch allocation:** nothing in the UI picks or shows a batch for a line.
5. **Dispense number:** the Task List says the table has **no number field**; the UI shows and stores a `DIS-YYYY-NNNN` number generated client-side. Who generates it, and its format, is open.
6. **Charges:** discount and GST "would sit on the charges" in the backend; the UI has a per-line discount, a record-level flat discount % and GST % and a package flag, and stores payment mode Cash / Card / On Account. When charges post, and what "On Account" means for billing, is unknown. The GST rate and package use are an open Task List question (the form defaults to 0 %).
7. **Returns / voids:** documented for the backend; no UI.
8. **Prescription link:** a prescription line names its medicine as free text; the UI matches the inventory **by name** and defaults the quantity to 1. How a prescription refers to inventory is unknown.
9. **Medicine master data:** unit, purchase rate and supplier are in the documented field list but the dialog collects none; there is no delete/deactivate although T4 says "CRUD".
10. **Thresholds:** low stock (< reorder level) and near expiry (≤ 30 days) are UI conventions; the Task List says only that the stock view has "low-stock and near-expiry filters". "Inventory value" is stock × sale rate; T9's "stock value" basis is unknown.
11. Pre-existing and untouched: Print Receipt / history print are `window.print()`; no dispense detail screen; the medicine category list is a static UI constant.

### Contract required — exact questions for the backend developer
1. **Routes and schemas** for medicine list / create / update, stock receive, adjustment and write-off, dispense list / create (and returns / voids). Does the catalogue list return per-batch rows or an aggregate with a batch list?
2. **Ids:** are medicine, batch, dispense, patient, doctor and encounter ids ULIDs? How is a dispense linked to an encounter (or expressed as walk-in)?
3. **Stock model:** how should the UI show stock, batch and expiry for a medicine with several batches (one number? the earliest-expiring batch?). Are low-stock and near-expiry computed by the server — with which thresholds — and are they list filters or flags?
4. **Stock changes:** do "receive stock as a batch", "adjustment" and "write-off" map to the UI's single Add / Remove dialog, or should the UI gain separate actions (batch number, expiry, purchase rate on receive)? Is the reason stored? May a removal exceed stock?
5. **Medicine fields:** unit, purchase rate, supplier, category (fixed list or free text?), generic — which are required on create? Is there a deactivate/delete?
6. **Dispense number:** since the table has no number field, how is the `DIS-...` number generated and returned, and in what format?
7. **Short stock:** the backend refuses ("refusal on short stock") — with which error code/body, and does it name the offending line(s)? The frontend now blocks the submit and asks the user to reduce the quantity (no partial dispense); is that the intended workflow? Are zero-quantity lines allowed? Is stock re-checked inside the dispensing transaction (so two simultaneous dispenses cannot both succeed)?
8. **Batch allocation (FEFO):** is it returned per line (batch, quantity)? Must the UI show it on the receipt/history?
9. **Quantities:** integers only, or fractional (liquids)? What does "unit" mean for a line's quantity?
10. **Charges and money:** decimal strings for rates, line totals, subtotal, net payable (`parseMoney`/`formatMoney`); are the discount % / GST % sent and the totals recomputed by the server? When are charges posted, and what do Cash / Card / On Account mean for billing?
11. **Dispensed by / dispensing doctor:** derived from the token, or sent? Is the doctor optional?
12. **Prescription:** how does a dispense reference an encounter's prescription line (id, or the medicine's name)? Does dispensing mark prescription lines as fulfilled?
13. **Returns and voids:** routes, rules, effect on stock and billing, and whether the UI should offer them.
14. **List behaviour:** filters (patient, free text over patient name / dispense number / medicine), paging, **newest-first** ordering for History; paging and search for the catalogue.
15. **Permissions** for each operation. And the Task List's open question: the GST rate on medicines and which hospital uses packages.

### Impact on other modules
* **Billing:** unchanged. `billingAggregate` (encounter and standalone-patient roll-ups) and the daily-transactions / revenue / daily-summary reports still read `DISPENSE_RECORDS`; in mock mode they stay consistent because the mock adapter mutates the same array (verified: a dispense created through the service appears on the dashboard's Medicine tab). In API mode they would show demo records and **a dispense made through the real backend would not appear in them** until they migrate.
* **Dashboard / top bar / Pharmacy report:** still read `MEDICINES` (low / critical stock, notifications, stock and expiry tables). Mock mode stays consistent; API mode would show demo stock.
* **Encounters:** *(Phase 4K.1: the wizard's medicine picker now reads the pharmacy medicine service and is contract-pending in API mode — §2m.)* At the end of this phase the prescription medicine picker on the encounter wizard still read `MEDICINES` (free-text names); the encounter detail's "Dispense Medicine" link now lands on a migrated screen that matches prescription names against the (service-provided) catalogue.
* **Patients:** the detail page's dispense tab still reads `DISPENSE_RECORDS` (hidden for non-legacy ids).
* **Laboratory / Imaging:** unaffected (covered by a unit test and by regression runs). `QuickAddDoctorDialog` is shared and now used by pharmacy through `onCreatedRecord`.
* **Legacy forms:** `PatientPicker` (numeric ids) is now used only by the billing forms. *(Superseded in Phase 4H: the billing forms moved to `PatientRecordPicker`; the legacy picker's only remaining consumer is `components/reports/DailyTransactionsReport.tsx`.)*

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/pharmacy.test.ts` (**45 since Phase 4G.1**, was 31; the Phase 4G.1 additions are listed in its own section below): contract-pending behaviour (all 6 endpoints `null`; inert adapters send no request even with hypothetical paths configured and the mapping pending; no response guessing; **static guard that the HTTP adapters import nothing from `src/data` or the mock adapters**); mock inventory (string ids, search by name/generic, paging, create with the dialog's old demo defaults, validation with nothing stored, update keeps unit/purchase rate/supplier, 404 incl. ULID, stock add/remove/floor at 0, zero/negative/NaN quantity rejected); mock dispensing (list newest first, filters, search, paging, create with server-style fields and totals, number sequence, encounter link and unknown-encounter rejection, optional doctor, laboratory/imaging data untouched); **stock consistency** (exact deduction, partial dispense and never below zero, same medicine on two rows, package line stocked but not charged, bad quantity / **ULID / "007" / unknown ids rejected with stock unchanged even when the second line is bad**); helpers (status precedence, filters incl. the exact 30-day boundary, header summary, `planDispense`, `dispenseTotals`); cache invalidation (stock-changing mutations drop the cached medicines, failed ones do not).
* *(Phase 4G record — superseded by the Phase 4G.1 browser runs below, which re-ran everything against the corrected screens; the API-mode expectations here, e.g. "Couldn't load" error states, no longer describe the screen.)* Screen states and the full workflows were verified in a real browser — **mock and API mode, login request stubbed only**: Pharmacy 36/36 (mock, two consecutive runs) and 14/14 (API, zero backend requests): inventory tiles/alerts/search/filters/add/edit/stock adjustment, a partial dispense with a net payable check, stock consistency across tabs, history, dashboard visibility, encounter-link prescription pre-fill, and quick-add doctor. Regression re-runs: Laboratory (32 mock / 14 API), Imaging (28 / 12), Encounters (18 / 10), Patients and reference data (26 mock / 16 API) and the legacy-form check (3). These runs are ad hoc, not part of CI.
* **Known flakiness (test environment, not the app):** on the webpack **dev** server the Patients/reference-data mock suite passed 26/26 in four of six runs and timed out at varying steps (once at login) in the others; no assertion failed in any run. Scripts must wait for the login page to hydrate (`networkidle` + ~1.5 s) before signing in, and use `/^Next/` rather than `/Next/` for wizard buttons (the Next.js dev-tools button also matches).

### Remaining blockers / limitations
* All of the above is **CONTRACT REQUIRED**; live verification also needs a development login.
* No batch, receive-stock, write-off, return/void or FEFO behaviour exists in the UI; adding them needs the answers above. (Short-stock refusal exists since Phase 4G.1.)
* Billing, reports, the dashboard, the top bar, the encounter wizard's medicine picker and the patient detail dispense tab remain on demo pharmacy data (see §5). *(The top bar and the wizard's picker were migrated in Phases 4K and 4K.1.)*

## 2h. Pharmacy — Phase 4G.1 corrections and verification

*Scope: Pharmacy only (`PharmacyHub.tsx`, the Pharmacy services and their tests, `index.ts` exports, this document). No other module, no billing / reports / dashboard / patients / encounters consumer, no backend, no authentication code changed.*

**The four levels, as of Phase 4G.1**
1. *Backend functionality documented* — unchanged: the Task List describes T4 / T5 (below); **no routes or schemas are published**.
2. *Frontend-prepared* — yes: services, adapters, hooks, screens, contract-pending states, tests.
3. *Connected to a confirmed API contract* — **none.** All six Pharmacy endpoint keys are still `null`; no path was added or guessed.
4. *Verified against a live backend* — **none.** The browser runs below used a stubbed login and intercepted network; a successful build with the placeholder `BACKEND_URL` proves nothing about connectivity.

### 1. Short stock is refused (Task List T5)
* **Requirement (verbatim, Task List, "T5 — Pharmacy dispensing", Build):** "dispense from an encounter's prescription or walk-in, FEFO batch allocation inside a transaction, **refusal on short stock**, charges posted, and returns/voids."
* **Before:** the mock adapter and screen dispensed `min(asked, stock)`, showed "(partial: n)", and could record a zero-quantity line.
* **Now:** `mock/pharmacy.ts` `create` validates ids and quantities, then runs `findStockShortfalls` (new, `pharmacyHelpers.ts`); if **any** line asks for more than is on the shelf — the same medicine on several lines draws on one shelf, so the line that crosses it is the one reported — the **whole** dispense is refused (400 `VALIDATION_FAILED`, message "Insufficient stock — nothing was dispensed", one `lines.N.quantity` detail per short line: "<medicine>: <asked> requested, <n> in stock"). Only after that does stock leave the shelf, with a plain subtraction (the old `Math.max(0, …)` clamp is gone because it can no longer be reached). A refused dispense stores no record, consumes no dispense number and changes no stock for any medicine. Exactly the stock on hand is accepted.
* `planDispense` no longer clamps: what is asked for is what is charged and dispensed (dispensed = prescribed on every record the mock creates).
* **Screen:** a short row shows a red "Insufficient stock — N <unit> available" badge (only the crossing row when the same medicine is on two rows); the summary no longer shows "(partial)"; a message names the medicine(s) and says nothing is dispensed on short stock; **Dispense & Finish is disabled** while any row is short. The real backend error code / body for a refusal is **not documented** (backend question 7).
* **Not added** (undocumented): any other inventory rule — no batch, expiry or FEFO checks, no change to the stock-adjust "floor at 0", no returns.
* **Tests (Vitest, `pharmacy.test.ts`):** exact-stock dispense succeeds and leaves 0; the same medicine on two rows succeeds in full when the total fits; refusal of a single line over stock; one over refused but exactly the stock accepted; an out-of-stock medicine refused; **only the second line short → whole dispense refused and the first line's stock untouched**; same medicine on two rows adding up to more than the shelf; every short line reported; a refusal consumes no dispense number; sufficient stock still deducts every line; **invalid ids and quantities (unknown id, ULID, "007", 0, −4, NaN, Infinity) after a valid first line cause no stock change and no record**; `findStockShortfalls` unit tests; a refused dispense does not invalidate the cached medicines. *Mutation check:* with the refusal disabled temporarily, 8 of these tests failed; the code was restored.

### 2. API-mode contract-pending behaviour
See the "Behaviour by mode" table above (rewritten in this phase). Summary: banner + per-tab "not connected — contract required" panels instead of empty states; tiles "—"; Add / Edit / Adjust disabled; Dispense form not rendered; **zero Pharmacy requests**; no fallback to mock; no invented medicines, stock, prices, batches, records or dispense numbers. Mock mode is unchanged apart from the short-stock refusal.
* **Pharmacy sends requests in API mode: no.** Verified in a real browser by recording every request whose path starts with `/api` (everything except the stubbed login was to be answered 599): **0 requests** across inventory, dispense (including a `?patientId=1&encounterId=1` deep link), history and tab switching.
* **Known leak outside Pharmacy (not changed — cross-module consumers stay as documented):** in API mode the **top-bar notification bell still shows a badge** (seen as "2" in the browser) because `Topbar.tsx` counts low / out-of-stock from the demo `MEDICINES` array; the dashboard tiles do the same. Pharmacy's own screens show nothing; these consumers will show demo stock until they migrate.

### 3. ESLint — the three Pharmacy warnings
Whole project (`npm run lint`): **39 warnings → 36 warnings, 0 errors before and after.** The three warnings were all in `PharmacyHub.tsx`; all three are gone and no suppression comment was added:
| Warning | Cause | Fix |
|---|---|---|
| `react-hooks/set-state-in-effect` (Adjust Stock dialog) | an effect reset type / quantity / reason when a medicine was chosen | state reset derived during render when the `medicine` prop changes (React's documented "adjust state on prop change" pattern) — same trigger, same result, one fewer render pass |
| `react-hooks/set-state-in-effect` (Add / Edit Medicine dialog) | an effect reloaded the eight fields when the target changed | same pattern, keyed on `target` (`med` is a function of `target`, so it fires exactly when the effect did) |
| `react-hooks/purity` (`Date.now()` in the table row) | days-to-expiry computed inline in render | uses the shared `daysToExpiry` helper, the identical formula that already drives the status badge. **Honest note:** the helper still reads the clock; the rule can no longer see it, but the expiry colouring is intentionally time-dependent |
Behaviour preserved, checked in the browser: reopening Add Medicine / Adjust Stock starts blank; Edit shows the chosen medicine's values and a different medicine shows its own. The remaining 36 warnings are outside Pharmacy and untouched (e.g. `auth.tsx`, `QuickAddLabTestDialog.tsx`, `use-toast.ts`).

### 4. Browser verification actually executed (Phase 4G.1)
Real Microsoft Edge (Playwright `channel: "msedge"`, headless) against `next build` + `next start` production servers (ports 3101 mock, 3102 API-default). **Test technique, not authentication:** only `POST /api/v1/auth/login` was stubbed to return a fake token; nothing here says anything about real authentication, roles or the backend. Pharmacy needs no role harness. Scripts are ad hoc (session scratchpad), **not part of CI**.
| Run | Result |
|---|---|
| Pharmacy, **mock** (`p4g1-mock.js`) | **46 / 46** — tiles, filters, add / edit / adjust (and dialog resets), short-stock refusal UI (8 of 8 allowed, 9 refused, two rows of one medicine), a successful dispense with exact stock deltas (Amoxil 8 → 0, Panadol 500 → 489), history (13 records, none for blocked attempts), dashboard visibility, prescription pre-fill, quick-add doctor, lab / imaging / encounters / patients lists still load, 0 backend requests, 0 console errors |
| Pharmacy, **API** (`p4g1-api.js`) | **21 / 21** — banner; contract-pending panels on all three tabs; "not an empty inventory"; tiles "—"; Add Medicine / search / filter disabled and a forced click opens no dialog; dispense form absent; no mock names or `DIS-` numbers anywhere; **0 `/api` requests after login**; 0 console errors |
| Regression, API | Laboratory 14/14, Imaging 12/12, Encounters 10/10, Patients 16/16 |
| Regression, mock | Laboratory 32/32, Imaging 28/28, Encounters 18/18, Patients 26/26, legacy forms 3/3 (each on a fresh server) |
Two defects were found in **my test scripts**, not the app, and fixed: a regex that read the stock from the expiry date, and (runner) a one-element argument list being splatted into characters. The first mock attempt for the regression suites was stopped by the harness for low system memory and was re-run from the start of that set, one suite at a time.

### 5. Automated checks (Phase 4G.1)
`npx tsc --noEmit --incremental false` exit 0 · `npx vitest run`: 16 files passed, 1 skipped; **301 tests passed, 4 skipped, 8 todo** (313) · `npm run lint`: 0 errors, 36 warnings · `npm run build` exit 0 (placeholder `BACKEND_URL=https://hms-backend.invalid`, no data-source override, so the production default `api` applies).

### 6. Still pending (unchanged, deliberately not built)
Batch management and batch-level expiry (ADR-0017), FEFO allocation, receiving stock as a batch, write-off, returns / voids, GST rate and "included in package", the prescription ↔ inventory link, and migrating the cross-module consumers (billing aggregate, reports, dashboard, top bar, encounter wizard picker, patient detail dispense tab). The backend questions in "Contract required" above all still stand, with question 7 extended (error body, line identification, transactional re-check).

## 2i. Billing, T6 Expenses and T7 Bank accounts / transactions (Phase 4H)

*Scope: the Billing hub (six tabs), the two invoice forms, Master Data → Banks and → Expense Categories, the finance services and their tests, `index.ts` / `useReferenceData.ts` exports, this document. No backend, authentication, Reports, Dashboard, Financial Statistics or Item History code changed, and no cross-module consumer was migrated.*

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List says: consultation and services billing, payments, receipts and the Revenue / Daily Transactions / Patient Balances reports are **"already covered, no task needed"**; **T6 Expenses and T7 Bank are "built and in review as PR #17"** (also covering the Expenses and Accounts reports from T9 and the dashboard Cash Flow) — **not merged**, so even their existence on the dev server is unconfirmed. It publishes **no routes, request/response schemas, id formats, status values, calculation rules or pagination** for any of it; the API Reference overview names "billing" only as an area.
2. *Frontend-prepared* — yes (below).
3. *Connected to a confirmed API contract* — **none.** All 20 Billing / Expenses / Bank endpoint keys are `null`; no path was added or guessed.
4. *Live backend integration verified* — **none** (no spec, no credentials, PR #17 unmerged). Browser runs used a stubbed login only.

### What the documents say (and nothing more)
* **T6 — Expenses** (status *In review*): frontend "date, category, description, amount, mode Cash/Bank, entered by; an expense chart on the billing tab". Schema `Expense` and `ExpenseCategory` exist. Build: "**expense head CRUD; expense create, list and void; totals by period and head. Expenses must feed the day-close collections report.**" Decided: "cash expenses come out of the one cash drawer per hospital, worked out day by day from an opening amount set once (expenses plan D7)." Screens: "Billing: Expenses, master data: Expenses".
* **T7 — Bank accounts and transactions** (depends on T6, status *In review*): frontend "bank name, account title, number, branch, active flag; transactions with debit, credit, reference number and a cash movement type (deposit or withdrawal) that feeds the dashboard cash flow". Schema `BankAccount` and `BankTransaction` exist; **`referenceNo` and the cash movement type are missing and need a migration** (backend-side). Build: "**account CRUD, transaction entry, a statement with running balance, and cash deposit/withdrawal linked to the day close.**" Screens: "Billing: Bank, master data: Banks, Accounts report".
* **Existing billing:** "Already covered, no task needed: login, users, doctors, patients, encounters, wards and beds, consultation and services billing, payments, receipts, and the Revenue, Daily Transactions and Patient Balances reports." Nothing about invoice creation, payment, refund, cancellation or receipt rules, numbering, statuses or calculations.
* **Not in this phase (later tasks):** T9 Expenses and Accounts reports, T10 dashboard (Cash Flow), T11 financial statistics (expenses, receipts, payments), T12 item history.

### Existing frontend reviewed (before changing anything)
| Screen | What it did |
|---|---|
| `BillingHub` — Consultations / Services tabs | tables over `CONSULTATION_INVOICES` / `SERVICES_INVOICES`; patient and doctor names via `PATIENTS.find` / `DOCTORS.find`; "New …" buttons link to the forms |
| Payments / Receipts tabs | tables over `PAYMENTS` / `RECEIPTS`; dialogs wrote straight into the arrays (receipt numbers `PAY-2024-NNNN` / `RCT-2024-NNNN` built client-side, a hard-coded "Ali Hassan" as receiver); the patient was a `<Select>` over all `PATIENTS` |
| Expenses tab | table over `EXPENSES`; category chart and total computed in the component from `EXPENSES`; dialog pushed into `EXPENSES` with `Number()` amounts and a hard-coded "Ali Hassan" |
| Bank tab | table over `BANK_TRANSACTIONS` with the **running balance computed on the client** (`bankRunningBalance()`); "Record Transfer" pushed a row with the description rewritten as "`<text> — <bank name>`" and **never set `cashMovement`** |
| Header | four tiles (Consultations, Services, Expenses, Net Income = consultations + services − expenses) computed client-side; a Today / Yesterday / This Week / This Month / Custom pill row that **filters nothing** (it only highlights) |
| Invoice forms | patient from the legacy `PatientPicker`, encounter / doctor from `ENCOUNTERS` / `DOCTORS`; subtotal, discount (flat or %), GST, net total, balance and the **status (paid / partial / unpaid) computed in the component in floating point** and pushed into the shared array; invoice numbers built client-side |
| Master Data → Banks | table over `BANKS`; the active switch and the dialog mutated the array directly |
| Master Data → Expense Categories | a list in **local component state only** — add / rename / delete never reached any other screen (the expense dialog read the static `EXPENSE_CATEGORIES`) |
| Not present in the UI | expense **void** (T6), expense head **deactivate**, invoice or payment cancel / refund, receipt print, a bank-account filter on the statement, date filtering |

### Services, mappers, endpoint keys and hooks implemented (`src/lib/services/`)
* **Services:** `consultationInvoicesService`, `servicesInvoicesService`, `paymentsService`, `receiptsService` (each `list` + `create`); `expenseCategoriesService` (`list` / `create` / `update` / `remove`); `expensesService` (`list` / `create` / `totals`); `bankAccountsService` (`list` / `create` / `update`); `bankTransactionsService` (`statement` / `create`). Types in `types.ts` ("Billing, Expenses (T6), Bank accounts and transactions"). **Money is a decimal string (`MoneyString`) in every record and input; ids are opaque strings; dates `YYYY-MM-DD`.**
* **Endpoint keys (20), all `null` = CONTRACT REQUIRED:** `consultationInvoices.list/create`, `servicesInvoices.list/create`, `payments.list/create`, `receipts.list/create`, `expenseCategories.list/create/update/remove`, `expenses.list/create/totals`, `bankAccounts.list/create/update`, `bankTransactions.statement/create`. **Confirmed endpoint paths: none.**
* **Mappers (`http/mappers.ts`):** 34 functions (`*ListQuery`, `parse*List`, `parse*`, `*Payload` per resource, plus `expenseTotalsQuery` / `parseExpenseTotals`) — **all `pending(...)`**, with the questions for the implementer in a comment. `http/finance.ts` holds the inert adapters on the shared `callEndpoint` (no second client); it imports nothing from `src/data` or the mocks (guarded by a test).
* **Exact money:** `moneyMath.ts` — string arithmetic on integer minor units (BigInt): `addMoney`, `subMoney`, `sumMoney`, `compareMoney`, `floorAtZero`, `percentOfMoney`, `multiplyMoney`, `moneyFromInputNumber` (a typed value with a third decimal is `null` → a validation error, **never silently rounded**), `moneyFromNumber` (legacy demo numbers → string, rounds, used **only** at the mock boundary), `formatMoneyString` (display without floats; sign after "Rs." like the old `formatCurrency`). Scale 2 follows the single documented example (`"1500.00"`) — per-field scale is CONTRACT REQUIRED. Values with more than two decimals throw. `parseMoney` / `formatMoney` in `lib/api/convert.ts` are untouched.
* **Demo rules, exactly:** `financeHelpers.ts` reproduces — with exact decimals — the rules the screens always used: package ⇒ subtotal 0; flat discount or % of subtotal (never below 0); GST % on the discounted amount; net = discounted + GST; balance = max(0, net − received); status paid / partial / unpaid from the balance; line = rate × qty less line %; statement balance = Σ(credit − debit). **None is a documented backend rule**; rounding (half away from zero, 2 dp) is a new demo choice because the legacy float code did not round. Used by the form previews and the mock adapter only.
* **Contract status:** `financeContract.ts` (`financeContractStatus`): in API mode an operation is available only when its endpoint key is set; it drives every banner, panel and disabled action below. When the backend developer fills the keys, those states disappear on their own. It inspects only the endpoint table — never the network.
* **Hooks:** `useExpenseCategories()` and `useBankAccounts()` (shared cache keys `expenseCategories` / `bankAccounts`, invalidated by head / account mutations); `usePatients`, `useDoctors`, `useEncounter`, `usePatient` reused. Shared UI: `components/shared/ContractPending.tsx`.
* **Mock adapters (`mock/finance.ts`):** mutate the same shared arrays as before (`CONSULTATION_INVOICES`, `SERVICES_INVOICES`, `PAYMENTS`, `RECEIPTS`, `EXPENSES`, `EXPENSE_CATEGORIES`, `BANKS`, `BANK_TRANSACTIONS`) so billing roll-ups, reports and the dashboard stay consistent in mock mode; reject non-numeric ids (a ULID) with a 400; validate **before** storing; mint stable ids for expense heads (renaming a head also renames it on its expenses, standing in for an id reference; deleting leaves expenses untouched — as the screen did).

### Screens migrated
* **Billing hub:** all six tabs read through the services, one page (25) at a time, with loading / error (+ "Try again") / empty / contract-pending states; names via `usePatients` / `useDoctors` ("…" while loading, "—" when unavailable, never a guess). The payment / receipt dialogs use `PatientRecordPicker`, async saves, `errorSummary` on failure (backend `requestId` included when present), no fake success; the expense and transfer dialogs take their category / bank lists from the services. The expense chart / total come from `expensesService.totals` and the bank **running balance from `statement`** — the screen no longer derives either.
* **Invoice forms:** string ids end to end (`PatientRecordPicker`, `useDoctors`, `encountersService`, `?encounterId=` never `Number()`-ed); the preview total / balance use the exact helpers and show "—" with a message when a value has more than two decimals; Save is disabled until the form is valid; the service sends only what the user entered (fee, discount, GST %, mode, amount received, notes…) — **number, date, subtotal, net total, balance and status are not sent** (server-side / derived — CONTRACT REQUIRED which). The services catalogue (`SERVICE_CATALOG`) and its Quick-Add dialog are **another module and unchanged**.
* **Master Data:** Banks (list, add, edit, active switch) and Expense Categories (list, add, rename, delete) through the services; the Expense Categories tab now actually feeds the expense form.
* **Small behaviour changes** (each mock-mode / presentation only): default *amount received* follows the fee until typed over; the consultation fee resets to the chosen doctor's fee when the doctor changes (as before) via derived state instead of an effect; lists page at 25 rows; header tiles and totals show "—" / "…" instead of invented numbers when unavailable; negative amounts display as "Rs. -89,040" (as before).

### Behaviour by mode
| | Mock (dev default) | API (production default), while any endpoint key is `null` |
|---|---|---|
| Page | no banner | banner "Billing, Expenses and Bank are not connected to the backend" — contract not provided, no request sent, no demo data shown |
| Header tiles | totals of the demo lists; Net Income = consultations + services − expenses (the screen's own formula) | **"—"** for all four (never 0, never demo totals) |
| Each tab | demo data through the service | a "… are unavailable — **not an empty list**" panel naming the operation awaited; no rows, no "No …" empty state, no "Couldn't load" error |
| Create actions (New Consultation, New Services Invoice, Record Payment, New Receipt, Record Expense, Record Transfer) | work end to end | **disabled** with the hint "Awaiting the backend API contract"; a forced click opens no dialog and does not navigate |
| Expense chart card | chart and exact total | its own "Expense totals are unavailable" panel |
| Invoice forms | work end to end | the **form is not rendered**; a pending panel (also for `?encounterId=` deep links) |
| Master Data Banks / Expense Categories | work end to end | pending panel; Add / Edit / switch / delete disabled |
| Requests to the backend | none | **none** — the screens do not call the services while the list endpoint is unset, and the adapters would throw `NotConnectedError` before any network call regardless |
| Fallback to mock | not applicable | **none** (`resolveDataSource`; static guard on `http/finance.ts`) |

### Where the documents and the current UI differ (flagged, **not** changed — each needs a decision or a contract)
1. **Expense void** (T6) and **expense head deactivate** — documented for the backend; no UI. The Master Data tab offers **delete** for heads while T6 says "CRUD" without saying what delete means for a head in use.
2. **Cash vs bank (D7):** the expense dialog has a Cash / Bank mode, but nothing links a Bank expense to a bank account or transaction, and nothing ties Cash expenses to a cash drawer / day close. How these relate is unknown.
3. **Cash movement (T7):** the Record Transfer dialog's Deposit / Withdrawal **never sets `cashMovement`**, so a transfer recorded there would not feed the dashboard Cash Flow; whether a dialog Deposit / Withdrawal *is* a cash movement is unknown. The dialog also rewrites the description as "`<text> — <bank>`" (kept in the mock only).
4. **Debit / credit direction:** the dialog books a Withdrawal as a debit and a Deposit as a credit; the backend's convention is unconfirmed.
5. **Statement scope:** the screen shows one combined statement over every account, not per account; T7 says only "a statement with running balance".
6. **Statuses and modes:** paid / partial / unpaid and Cash / Card / Bank Transfer / Cheque / Insurance / On Account are UI values; the backend's are unknown (mapper CONTRACT REQUIRED). Whether "On Account" and Insurance create receivables is unknown.
7. **Calculations and rounding** (discount, GST, net, balance, status): backend or client? Which rounding? Over-payment currently floors the balance at 0 and nothing records the excess.
8. **Payments ↔ invoices:** "Against" is free text ("Advance" or an invoice number); whether a payment links to an invoice id, and whether it updates the invoice's balance / status, is unknown. Receipts' "Balance Remaining" is stored as 0 by the dialog.
9. **Refunds, cancellation, credit notes:** the receipts dialog offers Refund and Credit Note types; their rules are not documented. No invoice cancel / refund exists in the UI and none was invented.
10. **Date filters:** the Today … Custom pills filter nothing; the chart card says "This Month by Category" while the totals cover all expenses. `expenses.totals` takes an optional period in the service, but the screen does not pass one.
11. **Header tiles / Net Income:** the formula is the screen's own; Revenue (already on the backend per the Task List) is the likely source in API mode — shape unknown.

### Contract required — exact questions for the backend developer
1. **Routes and schemas** for consultation / services invoice list + create, payment list + create, receipt list + create, expense category CRUD, expense list + create + **void** + totals, bank account CRUD, bank transaction create, and the statement. Is PR #17 merged to `Development`, and are the endpoints on the dev server? (The OpenAPI file `docs/openapi.json` is the authority.)
2. **Ids:** are all ids ULIDs? How is an invoice linked to an encounter, a payment to an invoice, an expense to a head, a transaction to an account?
3. **Money:** scale per field; are discount % and GST % sent as decimal strings; is the **net total / balance / status computed by the server** (and returned), or sent by the client? Rounding rule.
4. **Numbers and attribution:** who generates `CI-` / `SI-` / `PAY-` / `RCT-` numbers and in what format; is "entered by" / "received by" taken from the token?
5. **Statuses and modes:** the full list of invoice statuses and payment modes; what "On Account" and "Insurance" do to balances.
6. **Payments and receipts:** do payments apply to invoices (and update status)? Refund / credit-note rules; may a payment exceed the balance?
7. **Expenses:** head by id or name; required fields; does a Bank expense name an account and create a bank transaction; how are Cash expenses tied to the cash drawer / day close (D7); **void** semantics and effect on totals; whether an expense can be edited.
8. **Totals:** the request / response of "totals by period and head" (period parameters, ordering, whether heads with nothing spent are returned).
9. **Bank:** debit / credit direction for deposit and withdrawal; when `cashMovement` is set and by whom; the statement's scope (per account or all), ordering, running-balance origin (opening balance), paging; whether an account can be deleted or only deactivated; may an inactive account take transactions.
10. **Heads:** what "delete" means for an expense head that has expenses; can heads be deactivated; are names unique.
11. **Lists:** filters (patient, free text, date range), paging and ordering for each list; the screens currently show demo order (oldest first) for invoices and "newest on top" for payments and receipts.
12. **Permissions** for each operation (not documented; the UI's role handling stays unset).

### Impact on other modules
**Still reading demo billing data directly** (not migrated; in mock mode they stay consistent because the mock adapter mutates the same arrays — verified for the services below by unit tests; in API mode they would show demo data and **a record made through the real backend would not appear in them**):
| Consumer | Reads |
|---|---|
| `lib/billingAggregate.ts` → `PatientInfoPanel` ("Pre Balance"), `PatientForm` ("Outstanding Balance"), `patients/[id]` (billing tab), `encounters/[id]` (bill summary), `PatientBalancesReport`, `AccountsReport` | `CONSULTATION_INVOICES`, `SERVICES_INVOICES` (+ lab / imaging / pharmacy arrays) |
| `components/reports/*` — `RevenueReport`, `DailyTransactionsReport`, `DailySummaryReport`, `ExpenseReport`, `AccountsReport`, `ListsReport`; `reports/page.tsx` | invoices, `EXPENSES`, `EXPENSE_CATEGORIES`, `PAYMENTS`, `RECEIPTS`, `bankRunningBalance()` |
| `dashboard/stats` (services, payments, receipts, expenses, cash flow from `BANK_TRANSACTIONS`) | the arrays above |
| `admin/master-data` services-catalogue tab | `SERVICES_INVOICES` (to see whether a catalogue item is in use) |
| Top-bar bell (pre-existing, Pharmacy) | `MEDICINES` — still shows a demo badge in API mode |
These belong to T8 / T9 / T10 / T11 and the Patients / Encounters balance work; they are **not** migrated here. `DailyTransactionsReport` is now the **only** consumer of the legacy numeric-id `PatientPicker`.
*(Superseded in Phase 4I: every report screen in this table — `PatientBalancesReport`, `AccountsReport`, `RevenueReport`, `DailyTransactionsReport`, `DailySummaryReport`, `ExpenseReport`, `ListsReport` and `reports/page.tsx` — now reads through the services, and `DailyTransactionsReport` uses `PatientRecordPicker`. Still on demo billing data: `billingAggregate` and its consumers `PatientInfoPanel`, `PatientForm`, `patients/[id]`, `encounters/[id]`; `dashboard/stats`; the Master Data services-catalogue tab.)*

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/finance.test.ts` (**35**): exact-decimal helpers (0.10 + 0.20 = "0.30", half-away rounding, strings only, >2 decimals and non-strings throw, strict input conversion, display without floats incl. beyond Number's range); demo-rule helpers; **contract-pending behaviour** (all 20 keys `null`; every HTTP operation sends no request and reports "awaiting the backend contract" — no fake success; even with paths configured nothing is sent while mapping is pending; a static guard that `http/finance.ts` imports nothing from `src/data` or the mocks; the contract status per key); mock consultation / services invoices (exact totals and derived status, shared legacy arrays get numeric records, validation stores nothing, ULID / "007" ids rejected); payments and receipts (newest on top, exact amounts, a third decimal rejected); expense heads (stable ids, rename propagates, delete, 404 for a ULID) and expenses (created against a head, **no status / paid / approved field invented**, validation, exact totals by head and period); bank accounts (CRUD, an edit keeps `active`) and transactions (running balance exact and equal to the legacy ledger, deposit = credit / withdrawal = debit, `cashMovement` left unset, validation stores nothing); cache invalidation for the shared head / account lists (success drops it, failure does not). `readiness.test.ts` now lists the eight new endpoint-key prefixes explicitly.
* **Browser** (real Microsoft Edge, production builds, **login request stubbed only — a test technique, not authentication**; Master Data's admin gate needed a React-state role harness, a test device only, proving nothing about authorization; ad-hoc scripts, **not CI**): **mock 34 / 34** (all six tabs from the service; header tiles incl. the exact Net Income arithmetic; payment, receipt, expense and transfer creation with exact amounts and the third-decimal rejection; expense total 123,800 → 124,145.67 exactly; running balance 32,700 → 33,200; consultation invoice 1500 − 10 % + 5 % = Rs. 1,417.50, balance 417.50, status partial; services invoice 300 × 2 − 10 % = Rs. 540, status paid; a 3-decimal fee blocks the form; Master Data banks add / edit / deactivate and expense heads add / rename / delete, with the new head appearing in the expense form; other modules still load; 0 backend requests; 0 console errors) and **API 35 / 35** (banner; all four tiles "—"; a contract-pending panel on every tab naming what is awaited; create actions disabled and a forced click opens nothing; both invoice forms absent, including with `?encounterId=`; Master Data panels with add / switch / delete disabled; no mock names or numbers anywhere; **0 `/api` requests after login**; 0 console errors).
* **Regression** (same builds): mock — Pharmacy 46/46, Laboratory 32/32, Imaging 28/28, Encounters 18/18, Patients 26/26, legacy forms 3/3; API — Pharmacy 21/21, Laboratory 14/14, Imaging 12/12, Encounters 10/10, Patients 16/16. The legacy-form check's `/billing/consultations/new` line now exercises the new picker, not the legacy one. Two defects were found in **my test scripts** (number parsing of "Rs." / a minus sign, and a text locator that also matched earlier toasts) and fixed; one real defect was found and fixed in the app (negative amounts formatted "-Rs. …" instead of "Rs. -…").
* **Automated checks:** `npx tsc --noEmit --incremental false` exit 0 · `npx vitest run`: 17 files passed, 1 skipped; **336 tests passed, 4 skipped, 8 todo** (348) · `npm run lint`: **0 errors, 30 warnings (36 before this phase)** · `npm run build` exit 0 with the placeholder `BACKEND_URL=https://hms-backend.invalid` (a local build-time placeholder, **not a real backend**; a successful build proves nothing about connectivity), production default data source `api`.

### Remaining blockers / limitations
* Everything above is **CONTRACT REQUIRED**; live verification also needs the merged PR #17, a development login and the OpenAPI file.
* No expense void, head deactivate, invoice / payment cancel or refund, cash-movement setting, per-account statement or date filtering exists in the UI; adding them needs the answers above.
* Reports, the dashboard, financial statistics, item history and the cross-module consumers listed above are later phases (T8–T12).

## 2j. Reports — T8 and T9 (Phase 4I)

*Scope: the twelve report screens, `reports/page.tsx`, the report services and their tests, `index.ts` exports, this document. Dashboard, Dashboard Cash Flow, Financial Statistics, Item History, the top bar and the Master Data services-catalogue tab were not touched; no backend, authentication or other module changed.*

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List describes the reports but publishes **no route, request parameter or response schema** for any of them (the API Reference overview names no report endpoint). Per the Task List: **T8 "Reports from existing data" — status "Next", "design round first": NOT started** (no evidence the design round has happened; the Phase 4H wording "T8 involved a design round" meant the *plan*, and the Task List's decisions list records no design decision for T8); **T9 "Reports after new modules" — depends on T2, T5, T6, T7**; its Expenses and Accounts reports ship in **PR #17 (in review, not merged)**; Laboratory and Pharmacy reports are "left in T9", not built. **Revenue, Daily Transactions and Patient Balances are "already covered, no task needed"** — existence only, no contract.
2. *Frontend-prepared* — yes (below).
3. *Connected to a confirmed API contract* — **none.** All 15 report keys are `null`.
4. *Live backend integration verified* — **none** (no spec, no credentials, PR #17 unmerged, T8 unbuilt).

### What the documents say (and nothing more)
| Report (screen) | Task List |
|---|---|
| Daily Summary | **T8:** "new patients, OPD encounters, IPD admissions, discharges, revenue by kind. Revenue already exists; the counts are new." |
| OPD Statistics | **T8:** "new vs returning patients by period and doctor." |
| Patient Demographics | **T8:** "gender split and the age bands 0–12, 13–18, 19–30, 31–45, 46–60, 60+." |
| Prescription History | **T8:** "prescriptions across encounters, filterable by patient, doctor and medicine." |
| Lists | **T8:** "patients, admitted patients, doctors, organizations, services already come from existing list endpoints. Expense heads and the lab test list come with T1 and T6." |
| Laboratory | **T9:** "orders and revenue by test." |
| Pharmacy | **T9:** "sales, stock value, expiring." |
| Expenses | **T9:** "by head and period" (T6: "totals by period and head"). |
| Accounts | **T9:** "payments, receipts, bank statement." |
| Revenue, Daily Transactions, Patient Balances | **"Already covered"** — nothing else. |
Nothing documents fields, filters, period parameters, formulas, charts, export formats or the day-close ("Expenses must feed the day-close collections report"). The screens' tabs, charts and columns are the **mock's** shapes — "the mock data defines what each screen needs; it is not an API contract".

### Existing report screens inspected (before changing anything)
| Screen | Read directly | Notes |
|---|---|---|
| Daily Summary | `ENCOUNTERS`, `CONSULTATION_INVOICES`, `LAB_ORDERS`, `DISPENSE_RECORDS`, `DOCTORS` | **placeholders, not data:** `newPatients = 5`; payment mix `68 / 18 / 14 %`; every tile says "↑ vs last period" |
| OPD Statistics | `ENCOUNTERS`, `DOCTORS` | **placeholder:** "new" = 65 % of encounters (`Math.round(n × 0.65)`) |
| Revenue | invoices, `LAB_ORDERS`, `DISPENSE_RECORDS`, `PATIENTS` | **placeholders:** the 7-day trend is a formula (`2000 + i×400 + (i%2)×500` …); "previous period" = current × 0.91 / 0.9 / 1.08 |
| Laboratory | `LAB_ORDERS`, lab catalogue | **placeholder:** turnaround average = the test's target hours and every category "On Time" (nothing is measured) |
| Pharmacy | `MEDICINES`, `DISPENSE_RECORDS` | low stock = below reorder level; expiring = 0–60 days (UI conventions) |
| Expenses | `EXPENSES`, `EXPENSE_CATEGORIES` | totals, pie, trend and table computed in the component |
| Demographics | `PATIENTS`, `PANELS` | age bands put 61+ in "60+" (the Task List says "60+" after "46–60"); panel / area / monthly cards are not in the Task List |
| Patient Balances, Accounts → Patient Account Summary | `PATIENTS`, `PANELS`, `billingAggregate` | balances derived client-side from the demo billing arrays |
| Accounts → Payments / Receipts / Bank Statement | `PAYMENTS`, `RECEIPTS`, `bankRunningBalance()` | totals and the running balance computed in the component |
| Daily Transactions | encounters, invoices, lab, imaging, pharmacy, patients, doctors, panels | legacy numeric `PatientPicker`; "Credit" = any non-Cash mode; totals computed in the component |
| Lists | `PATIENTS`, `DOCTORS`, `SERVICE_CATALOG`, `PANELS`, `EXPENSE_CATEGORIES`, `LAB_TESTS`, `ENCOUNTERS` | seven sub-lists |
| Prescription History | `ENCOUNTERS`, `PATIENTS`, `DOCTORS` | client-side search and paging |
| `reports/page.tsx` | `EXPENSES` | **Export CSV for Expenses read the demo array** (a demo-data leak in API mode); every other report exported only its title; the Today … Custom pills **filtered nothing** |

### What was built (`src/lib/services/`)
* **`ReportsService`** — one operation per report, each returning that report's **typed model** so aggregation sits behind the service (mock now, backend later) instead of in the component: `dailySummary`, `dailyTransactions(filter)`, `opdStatistics`, `revenue`, `laboratory`, `pharmacy`, `expenseTrend`, `demographics`, `patientBalances`, `organisationBalances`, `patientAccountSummary`, `accountsPayments(opts)`, `accountsReceipts(opts)`, `prescriptionHistory(opts)`. Models in `types.ts` ("Reports (T8 … T9)"): money as `MoneyString`, ids as strings, counts as numbers. **They are frontend-owned boundaries, not API contracts.**
* **Reuse, not duplication:** the Expenses report takes its totals by head and its list from the Phase 4H `expensesService` (`totals`, `list`); Accounts → Bank Statement is the Phase 4H `bankTransactionsService.statement` (running balance from the service); the Lists report reads `patientsService`, `doctorsService`, `organisationsService`, `expenseCategoriesService`, `labTestsService` and `encountersService` (admitted = IPD, open); the shared `PatientRecordPicker`, `usePatients`, `useDoctors`, `useOrganisations` and `listAll` serve the screens. One new read-only **`serviceCatalogService.list`** exists only because no service covered the services catalogue (the Master Data tab that edits it is untouched).
* **Endpoint keys (15), all `null` = CONTRACT REQUIRED:** `reports.dailySummary`, `.dailyTransactions`, `.opdStatistics`, `.revenue`, `.laboratory`, `.pharmacy`, `.expenseTrend`, `.demographics`, `.patientBalances`, `.organisationBalances`, `.patientAccountSummary`, `.accountsPayments`, `.accountsReceipts`, `.prescriptionHistory`, `serviceCatalog.list`. **Confirmed endpoint paths: none.**
* **Mappers (`http/mappers.ts`):** `reportQuery(what, params)` and 15 `parse*` functions — all `pending(...)`, with the questions for the implementer in a comment. `http/reports.ts` holds the inert adapters on the shared `callEndpoint`; it imports nothing from `src/data` or the mocks (guarded by a test). Because the query thunk runs before the request, a pending mapper blocks the request even if a path is configured.
* **`reportsContract.ts`** (`reportsContractStatus`): API mode is "pending" while any report key is `null`; it drives the page banner and the disabled date pills / Export CSV. Reports built from other services (Expenses totals and list, the bank statement, Lists) are as connected as those services — each screen simply reports `NotConnectedError` as "not connected".
* **`mock/reports.ts`** builds each model from the same shared demo arrays the screens used to read (so numbers match the billing, expenses, bank, laboratory and pharmacy mocks), with **exact money sums**. The old screens' placeholders are reproduced as named `DEMO_*` constants (see the table above) so mock mode looks as before; **they are not data and not backend rules**. Reports are read-only (a test proves running all of them changes no demo array).
* **`reportHelpers.ts`:** the documented age bands (with the screen's 61+), aged buckets, whole-day difference, "credit = any non-Cash mode". **`moneyMath.ratioPercent`**: exact one-decimal percentage for change-vs-previous and shares.
* **UI:** `components/reports/ReportState.tsx` — `useReportData(load)` and `ReportBody`: a `NotConnectedError` renders the contract-pending panel ("… is unavailable — Not connected … this is **not an empty report**", naming the report awaited), any other failure renders the backend's message with its request id and a "Try again", loaded data stays visible during a reload. Every screen renders its model with its **existing layout**; nothing is added up in a component. Daily Transactions' filters, Prescription History's search and the page's date pills / Export CSV are **disabled** while a report is not connected.
* **`reports/page.tsx`:** the demo `EXPENSES` import is gone — Export CSV (Expenses) now reads through `expensesService` (all rows, exact amounts); in API mode a banner explains the situation and the pills / Export CSV are disabled.

### Behaviour by mode
| | Mock (dev default) | API (production default), while report keys are `null` |
|---|---|---|
| Page | no banner; pills, Export CSV, Print enabled | banner "Reports are not connected to the backend"; pills and Export CSV disabled; Print stays |
| Each report | the model from the mock builders (same figures as before, incl. the old placeholders) | a "<report> is unavailable … not an empty report" panel; no chart, table, row, figure or mock name |
| Multi-section reports | each section loads on its own | each section shows its own pending panel (Expenses: totals / trend / list; Accounts and Patient Balances: per tab; Lists: all seven) |
| Filters / search | Daily Transactions' seven filters and Prescription History's search re-run the service | disabled (the patient filter shows "Unavailable until the report is connected") |
| "No results" | a real empty state ("No transactions match these filters", "No prescriptions found", "No outstanding balances") | **never shown** — a missing contract is not rendered as zero results |
| Requests to the backend | none | **none** (the adapters throw `NotConnectedError` before any network call; verified in a browser) |
| Fallback to mock | not applicable | **none** (`resolveDataSource`; static guards on `http/reports.ts` and on every report component) |

### Where the documents and the screens differ (flagged, **not** changed — each needs a decision or a contract)
1. **Placeholders presented as data** (Daily Summary new patients and payment mix, OPD new-vs-returning, Revenue trend and previous period, Laboratory turnaround, the "vs last period" arrows): in mock mode they remain, labelled only here. A real backend must define each (or the screens must drop the card).
2. **Date range:** the Today … Last Month … Custom pills filter nothing in any report (mock mode keeps them as before). The reports' period parameters are unknown.
3. **"Revenue by kind"** (Daily Summary) lists consultation, lab and pharmacy only; services, imaging and ECG/USG revenue are not in it, and the Revenue report has the same three categories. T11 mentions more categories.
4. **Unpaid / aged receivables** are limited to consultation and services invoices (not lab, imaging or pharmacy, whose payment status the demo does not model the same way); bucket edges (30 / 60 / 90 days) and "days overdue" are demo rules.
5. **Patient balance** is computed from the demo billing arrays; the backend's definition (and whether "On Account", insurance or panel billing count) is unknown. Organization-wise balances group by the patient's panel.
6. **Pharmacy:** low stock (< reorder level) and expiring (0–60 days) differ from the inventory screen's thresholds (< reorder, ≤ 30 days); "stock value" (documented for T9) has **no screen** and no definition (stock × sale rate is the inventory tile's rule, unconfirmed).
7. **Laboratory:** "orders and revenue by test" is partly covered (top tests with count and charge); category volume and turnaround are extras; turnaround is a placeholder.
8. **Expenses "by head and period"** — the screen shows all time; the service's `totals` accepts an optional period the screen never passes.
9. **Accounts** "payments, receipts, bank statement" — plus a "Patient Account Summary" tab not in the Task List; the statement is one combined ledger.
10. **Lists:** "services" and "organizations" have no endpoint key (organisations never had one: Phase 4C); "admitted" filters open IPD encounters in the screen because the encounter service has no status filter (CONTRACT REQUIRED).
11. **Export CSV:** only Expenses ever exported data; other reports export their title. No export endpoint or format is documented, and none was invented.
12. **Paging:** Payments, Receipts, Bank Statement and the Expenses list now page (25 / 10 per page) where the old screens showed every row; the totals still cover every record.

### Contract required — exact questions for the backend developer
1. **Which report endpoints exist** and where (PR #17 for Expenses / Accounts; T8 not started — is the design round done and recorded anywhere?). The OpenAPI file `docs/openapi.json` is the authority.
2. **Request parameters** per report: period (from / to, presets), filters (doctor, patient, organization, data type, cash / credit), search, paging and ordering.
3. **Response shapes:** are people referenced by id (the UI resolves names through the patient / doctor services) or returned with names; are percentages numbers or decimal strings; money scale per field.
4. **Who computes** each aggregate: totals, balances, shares, change vs previous period, aged buckets, days overdue, turnaround, new-vs-returning, "credit". Are the placeholder cards (see above) supposed to exist?
5. **Revenue categories:** the full list for Daily Summary / Revenue (consultation, services, laboratory, X-Ray, medicines — and ECG/USG, per T11?).
6. **Day close:** what is the "day-close collections report", how do expenses and cash deposits / withdrawals feed it, and is there a screen for it?
7. **Patient balances:** definition (billed − received?), treatment of On Account / Insurance / panels, and whether there is a per-patient endpoint besides the report.
8. **Pharmacy report:** definition of "sales", "stock value" and "expiring" (window, per batch?); **Laboratory report:** "revenue by test" source and whether turnaround is measured.
9. **Lists:** endpoints for services, organizations and admitted patients; a status filter on encounters.
10. **Export:** whether the backend produces CSV / PDF, or the frontend should build it from the report response.
11. **Permissions** per report (not documented; the UI's role handling stays unset).

### Cross-module dependencies (not migrated; documented for later phases)
> **Update (Phase 4K):** the `billingAggregate` consumers, the Master Data services-catalogue tab, Item History (T12) and the top-bar notifications listed below were migrated behind the service layer in Phase 4K — see **§2l**. The table is kept as the record of what was true at the end of this phase.

| Consumer | Reads | Later phase |
|---|---|---|
| `lib/billingAggregate.ts` → `PatientInfoPanel` ("Pre Balance"), `PatientForm` ("Outstanding Balance"), `patients/[id]`, `encounters/[id]` | demo invoices (+ lab, imaging, pharmacy arrays) | Patients / Encounters balance work (needs the balance contract) |
| `mock/reports.ts` (the mock adapter itself) | the same arrays + `billingAggregate` | goes away with the demo data |
| `dashboard/stats` (services, payments, receipts, expenses, cash flow) and `dashboard/page` (stock tiles) | demo arrays | T10 / T11 — **migrated in Phase 4J (§2k)** |
| Master Data → services catalogue tab | `SERVICES_INVOICES`, `SERVICE_CATALOG` | Master Data |
| Top-bar bell | `MEDICINES` | Pharmacy / top bar |
The legacy numeric-id `PatientPicker` component now has **no consumer** (it was left defined; removing it is unrelated cleanup).

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/reports.test.ts` (**29**): helpers (age bands, aged buckets, whole days, credit rule, exact percent change with half-away rounding and a null base); **contract-pending behaviour** (all 15 keys `null`; every HTTP operation sends no request and reports "awaiting the backend contract"; nothing is sent even with paths configured while mapping is pending; static guards that `http/reports.ts` imports no demo data or mocks and that **no report component or the reports page imports `src/data`, `billingAggregate` or a mock**; the contract status per key); **each mock report recomputed independently** from the raw arrays with plain number arithmetic and compared (daily summary, OPD, revenue incl. exact bucket / total agreement, laboratory, pharmacy, demographics, patient balances, account summary, organisation balances, payments and receipts totals covering every record whichever page is asked, expense trend, the transactions register incl. an independent count, filters, cash + credit = total exactly, prescription history, services catalogue); the **placeholder constants are asserted by name** so a change is deliberate; reports are read-only; money fields are exact two-decimal strings. The independent recomputation found a real bug in my first mock register (a non-numeric doctor / organisation id was coerced to `null` and matched "no doctor" / "self-pay" rows) — fixed so an unparseable id matches nothing, and the test stays.
* **Browser** (real Microsoft Edge, production builds, **login request stubbed only — a test technique, not authentication**; no role harness was needed for Reports; ad-hoc scripts, **not CI**): **mock 41 / 41** (all twelve screens; Daily Summary tiles with Total Revenue = the three parts and names resolved through the doctor service; Daily Transactions with 53 register rows, count tile = rows, Cash + Credit = Total, the type / cash / patient filters re-running the report, and the empty state; OPD total = Daily Summary OPD + IPD; Revenue breakdown total, outstanding badge and the four aged buckets agreeing; Laboratory and Pharmacy tables; **an expense recorded in Billing appears in the Expenses report total (123,800 + 100.50 = Rs. 123,900.50)** with the list paging 10 / 6; Demographics charts; every one of the seven Lists, with the Patient List count equal to the Demographics total; Accounts' four tabs incl. the Phase 4H statement ending Rs. 32,700; Patient Balances' total equal to its rows; Prescription History search and empty state; **Export CSV** header plus all 16 expenses with exact amounts; 0 backend requests; 0 console errors) and **API 41 / 41** (page banner; pills and Export CSV disabled, Print enabled; a contract-pending panel for each of the 12 reports and every tab / section / list, each naming what is awaited and saying "not an empty report"; no chart, row, figure or mock name; Daily Transactions' filters all disabled; no "No transactions match", "No outstanding balances" or "No patients currently admitted" claim; **0 `/api` requests after login**; 0 console errors).
* **Regression** (same builds): mock — Billing 34/34, Pharmacy 46/46, Laboratory 32/32, Imaging 28/28, Encounters 18/18, Patients 26/26, legacy forms 3/3; API — Billing 35/35, Pharmacy 21/21, Laboratory 14/14, Imaging 12/12, Encounters 10/10, Patients 16/16. Five script defects were found and fixed along the way (a locator matching the print-only header, an ambiguous `To` label, clicking the patient name in a table cell instead of the picker, a wrong tile helper, and a vacuous `|| true` assertion that I removed); none was an app defect — the only real defect found this phase is the mock-register bug above.
* **Automated checks:** `npx tsc --noEmit --incremental false` exit 0 · `npx vitest run`: 18 files passed, 1 skipped; **365 tests passed, 4 skipped, 8 todo** (377) · `npm run lint`: **0 errors, 27 warnings (30 before this phase)** · `npm run build` exit 0 with the placeholder `BACKEND_URL=https://hms-backend.invalid` (a local build-time placeholder, **not a real backend**; a successful build proves nothing about connectivity), production default data source `api`.

### Remaining blockers / limitations
* Everything above is **CONTRACT REQUIRED**; live verification needs the merged PR #17, the unbuilt T8 endpoints, a development login and the OpenAPI file.
* The placeholder cards (point 1 above) cannot be made real by the frontend.
* Dashboard, Financial Statistics, Item History and the cross-module consumers are later phases (T10 – T12).

## 2k. Dashboard (T10) and Financial Statistics (T11) — Phase 4J

*Scope: `dashboard/page.tsx`, `DashboardCharts.tsx`, `dashboard/stats/page.tsx`, the dashboard / statistics services and their tests, `index.ts` exports, a `noun` option on the shared `ReportBody`, this document. The top bar, the Master Data services-catalogue tab, Item History and every other module were not touched; no backend, authentication or other module changed.*

**Four things that must not be confused**
1. *Backend functionality documented* — the Task List describes T10 and T11 but publishes **no route, request parameter or response schema**. Statuses: **T10 "Dashboard" — size M, depends on T2 and T5 "for some tiles", no decision recorded (not started).** **T11 "Financial Statistics" — size S, depends on T2, T3, T5, T6, no decision recorded (not started).** The dashboard's **Cash Flow ships in PR #17 (in review, NOT merged)** with T6 / T7. The only path the documents name is **`GET /reports/revenue`**, which T11 "extends" — its current response and the extension are unknown, so it is **not configured** (and a test asserts that no endpoint key contains it).
2. *Frontend-prepared* — yes (below).
3. *Connected to a confirmed API contract* — **none.** All 8 Dashboard / Statistics keys are `null`.
4. *Live backend integration verified* — **none** (no spec, no credentials, PR #17 unmerged, T10 / T11 unbuilt).

### What the documents say (and nothing more)
* **T10:** "The tiles change by role: today's patients, admitted (IPD), revenue today, pending lab reports, pending orders, low stock, dispensed today, completed today, my patients. Building one summary endpoint avoids nine separate calls."
* **T11:** "Revenue by category for a period: consultation, services, laboratory, X-Ray, medicines, plus receipts, payments and expenses. It extends GET /reports/revenue. ECG and ultrasound are now ordered and charged through imaging orders (T3), so that tab can be filled from them."
* **Cash Flow:** T6 — "cash expenses come out of the one cash drawer per hospital, which is worked out day by day from an opening amount set once (expenses plan D7)"; T7 — "a cash movement type (deposit or withdrawal) that feeds the dashboard cash flow" and "cash deposit/withdrawal linked to the day close". **Nothing defines the lines, what counts as cash, the period or where the opening amount is set.**
* Nothing documents: the other widgets (weekly visits, revenue trajectory, "Up Next" schedule, trend notes), the Financial Statistics tabs other than the category totals, or any formula.

### Existing screens inspected (before changing anything)
| Widget / tab | Was | Notes |
|---|---|---|
| Dashboard tiles | **hard-coded numbers**: Today's Patients 24, My Patients 11, Revenue Today Rs. 42,500, Pending Lab Reports 7, Pending Orders 7, Completed Today 12, Dispensed Today 18, Admitted (IPD) 3 | only Low Stock Items was computed (from `MEDICINES`). **None of the others was data.** |
| Tile notes | "+3 from yesterday", "+12% vs yesterday", "+4 from yesterday", "2 male · 1 female" | hard-coded decoration; not documented |
| Hero sentence | "24 OPD patients and 7 pending lab reports" | hard-coded |
| Patient Flow chart + caption | a constant 7-day series and the caption "Total 141 visits" | constants |
| Revenue Trajectory chart | a constant 7-day series | constants (the subtitle says "cash flow", the chart is revenue) |
| Up Next | five hard-coded appointments | not data; the appointments module is a separate, unbuilt screen |
| Inventory alert, Recently Registered | `MEDICINES`, `PATIENTS` (computed) | the only real reads |
| Financial Statistics → Summary | category totals, cash / credit / OPD / IPD, payments / receipts / expenses / banks, computed in the component from nine demo arrays | the "Banks" row is Σ(credit − debit) |
| Financial Statistics → **Cash Flow** | computed in the component; **`CASH_DRAWER_OPENING = 5000`** hard-coded | "Total Cash Receipts" counts every receipt whatever its mode; **"Total Cash Payments" counts patient payments (money received) as cash OUT** — likely a demo logic error, flagged, not changed |
| Category tabs (Services, Checkups, Lab Tests, Medicine, X-Rays, Receipts, Payments, Expenses) | rows from the demo arrays | Medicine and X-Ray rows were all given the status **"paid"** |
| ECG/Ultrasound | an empty state saying invoicing "is planned for a later release" | stale: the Task List says it is now charged through imaging orders |
| Bank, Graphs, OPD/IPD | the running balance computed on the client; daily checkup revenue grouped in the component; the encounter list | |

### What was built (`src/lib/services/`)
* **`DashboardService`** (`summary`, `weeklyVisits`, `revenueTrend`, `upNext`, `cashFlow`) and **`StatisticsService`** (`summary`, `records(category)`, `dailyCheckupRevenue`) — one operation per widget / tab group, each returning a **typed model** so every aggregate sits behind the service (mock now, backend later). Models in `types.ts` ("Dashboard (T10) and Financial Statistics (T11)"): money as `MoneyString`, counts as numbers, ids as strings. **They are frontend-owned boundaries, not API contracts.** `summary` returns the nine documented tiles; the screen still chooses which to show by its existing role hint.
* **Reuse, not duplication:** the Bank tab is the Phase 4H `bankTransactionsService.statement` (running balance from the service); the OPD/IPD tab is the Phase 4D `encountersService.list`; Recently Registered is `patientsService` (Phase 4B); the inventory alert is the Phase 4G `useMedicines()` list; names come from `usePatients` / `useDoctors`; `ReportBody` / `useReportData` (Phase 4I) render the states.
* **Endpoint keys (8), all `null` = CONTRACT REQUIRED:** `dashboard.summary`, `.weeklyVisits`, `.revenueTrend`, `.upNext`, `.cashFlow`, `statistics.summary`, `.records`, `.dailyCheckupRevenue`. **Confirmed endpoint paths: none.**
* **Mappers (`http/mappers.ts`):** 8 `parse*` functions, all `pending(...)`, sharing `reportQuery` (also pending); the questions for the implementer are in a comment. `http/dashboard.ts` holds the inert adapters on the shared `callEndpoint`; it imports nothing from `src/data` or the mocks (guarded by a test).
* **`dashboardContract.ts`** (`dashboardContractStatus`): API mode is "pending" while any key is `null`; it drives the two page banners.
* **`mock/dashboard.ts`** builds each model from the demo arrays the screens used to read, with **exact money sums**, applying the cash / credit / OPD / IPD rules the screen always used. Every value that was never data is a named `DEMO_*` constant (tiles, notes, weekly series, revenue series, "Up Next", the 5000 opening float, the "paid" status) — **not data and not backend rules**. Two tiles are now computed because the rule is unambiguous and already used elsewhere: **Admitted (IPD)** = open IPD encounters (the Lists report's rule), with the male / female note from the same patients; **Low Stock Items** = stock below the reorder level (the Pharmacy report's rule). The services are read-only (a test proves it).
* **UI:** every tile, chart, table and tab renders its model with its **existing layout**; nothing is added up in a component. `DashboardCharts` takes its data as props (no constants left). The hero sentence carries numbers only when the summary supplied them. The ECG/Ultrasound tab now states the Task List's position (charged through imaging orders; the attribution rule is undefined — CONTRACT REQUIRED) instead of the stale "later release" text, and lists nothing in either mode.

### Behaviour by mode
| | Mock (dev default) | API (production default), while keys are `null` |
|---|---|---|
| Pages | no banner | a banner on each page ("The Dashboard is not connected…", "Financial Statistics are not connected…" — the latter records the `GET /reports/revenue` mention and PR #17) |
| Dashboard tiles | the summary service's values (with the old notes) | **"—"** (never 0) with "Not connected — awaiting the backend contract"; the hero sentence has **no numbers** |
| Charts, Up Next, Recently Registered | rendered from the services | a "… is unavailable — **not an empty chart / schedule / list**" panel naming the widget |
| Inventory alert | from the medicine list | absent (the banner and tiles say why; an absent alert is never a claim that stock is fine) |
| Financial Statistics | every tab from its service | every tab (Summary table, Cash Flow, eight category tabs, Bank, Graphs, OPD/IPD) a pending panel; **no "No records for this category"** (that would claim an empty result); ECG/Ultrasound the static explanation |
| Requests to the backend | none | **none** (verified in a browser; the adapters throw `NotConnectedError` before any network call) |
| Fallback to mock | not applicable | **none** (`resolveDataSource`; static guards on `http/dashboard.ts` and on all three dashboard files) |
Role-based tiles: the UI role is still the unset hint (`role` is `null` until the backend defines roles); the existing branches (generic / doctor / pharmacist / lab_tech / admin & billing) are unchanged. Whether the backend returns different tiles per role is CONTRACT REQUIRED.

### Where the documents and the screens differ (flagged, **not** changed)
1. **The Dashboard was never data** (see the audit table). In mock mode the constants remain, so the demo looks as before; a real backend must define each tile (or the tile must go).
2. **"Today"** — undefined (server clock? hospital timezone?). The demo's "today" tiles are constants, not derived from any date.
3. **Cash Flow:** the lines, "cash", the period and the opening amount are undefined; the 5000 float is a demo constant; **"Cash Payments" as an outflow looks wrong** for patient payments; "Cash Receipts" ignores the mode; money moved through the Record Transfer dialog never feeds it (the dialog never sets the cash movement type — Phase 4H).
4. **Financial Statistics categories:** the Task List lists consultation, services, laboratory, X-Ray, medicines, receipts, payments and expenses (and ECG / ultrasound from imaging orders); the screen's cash / credit / OPD / IPD columns, the "Banks" row and the category tabs are not documented. The attribution of imaging orders to the ECG/Ultrasound tab is undefined, so that row is zero in the mock.
5. **Statuses:** Medicine and X-Ray records were all "paid" (demo constant); the real rule (e.g. payment mode "On Account") is unknown.
6. **Period:** T11 is "for a period"; the screen has no date control (the reports page's pills filter nothing either). No period parameter was invented.
7. **Recently Registered** needs a newest-first, limited list; the patient service has no sort or limit, so the screen loads every patient and sorts — wasteful on a real backend (CONTRACT REQUIRED).
8. **"Up Next"** has no backend definition and no appointments screen to link to; its data is demo.
9. **Revenue Trajectory** subtitle says "cash flow across all departments" while the chart is revenue.

### Contract required — exact questions for the backend developer
1. **Which endpoints exist**, and is PR #17 (Cash Flow, Expenses and Accounts reports) merged to `Development`? What does **`GET /reports/revenue`** return today, and what exactly does T11 add (period parameters, categories, receipts / payments / expenses, ECG / ultrasound)? The OpenAPI file `docs/openapi.json` is the authority.
2. **Dashboard summary:** one endpoint for all nine tiles or several? Does it vary by role, and how does the frontend learn the role (`GET /auth/me` permissions are not documented)? What is "today" (timezone)? Definitions of pending orders, pending lab reports, completed today, dispensed today, my patients, low stock, admitted (IPD). Are the tile notes ("+3 from yesterday", "2 male · 1 female") wanted at all?
3. **Charts and schedule:** are the weekly visits, the revenue trajectory and "Up Next" part of T10? Shapes, periods and labels.
4. **Cash Flow:** the lines, what counts as cash (sales by payment mode? receipts? patient payments in or out?), the period, where the opening amount (D7) is set and whether the response includes it; how deposits / withdrawals set the cash movement type.
5. **Financial Statistics:** the response shape per category (value, count, cash, credit, OPD, IPD), how credit is defined, the "Banks" row, the per-category record lists and their statuses, and the daily checkup revenue graph.
6. **Money and ids:** scale per field; ULIDs; how a record references its patient; names returned or resolved by id.
7. **Permissions** per widget and tab (not documented; the UI's role handling stays unset).

### Cross-module dependencies (not migrated; documented for later phases)
> **Update (Phase 4K):** the `billingAggregate` consumers, the Master Data services-catalogue tab, Item History (T12) and the top-bar notifications listed below were migrated behind the service layer in Phase 4K — see **§2l**. The table is kept as the record of what was true at the end of this phase.

| Consumer | Reads | Later phase |
|---|---|---|
| `lib/billingAggregate.ts` → `PatientInfoPanel`, `PatientForm`, `patients/[id]`, `encounters/[id]` | demo invoices (+ lab, imaging, pharmacy arrays) | Patients / Encounters balance work |
| `mock/reports.ts`, `mock/dashboard.ts` (the mock adapters themselves) | the demo arrays + `billingAggregate` | go away with the demo data |
| Master Data → services-catalogue tab | `SERVICES_INVOICES`, `SERVICE_CATALOG` | Master Data |
| Top-bar bell | `MEDICINES` — still shows a demo badge in API mode | top bar |
| Item History (T12) | — | not started |
No Dashboard or Financial Statistics screen reads a demo array any more. The legacy numeric-id `PatientPicker` has no consumer (left defined).

### Tests (frontend-only, controlled data — not backend verification)
* `src/lib/services/dashboard.test.ts` (**20**): **contract-pending behaviour** (all 8 keys `null`; **no key contains `reports/revenue`**; every HTTP operation sends no request and reports "awaiting the backend contract"; nothing is sent even with paths configured while mapping is pending; static guards that `http/dashboard.ts` imports no demo data or mocks and that **neither dashboard page nor its charts imports `src/data`, `billingAggregate` or a mock**; the contract status per key); **every mock figure recomputed independently** from the raw arrays with plain number arithmetic: the six category rows (value, count, cash, credit), OPD + IPD = value, Total Sales = the exact sum, the ECG row zero, payments / receipts / expenses / banks — **cross-checked against the Phase 4I Accounts totals, the Phase 4H expense totals and the Phase 4H statement's final balance**; the Cash Flow lines and closing = opening + in − out, its cash sales equal to the Statistics table's, its cash expenses equal to the Phase 4H expense list's; the computed tiles (Admitted, Low Stock — also equal to the Pharmacy report's low-stock list); every named placeholder constant asserted by name; weekly total = the sum of the points; the trend ends today; records per category add up to the summary; daily checkup revenue sums to every encounter; all services read-only.
* **Browser** (real Microsoft Edge, production builds, **login request stubbed only — a test technique, not authentication**; the UI role was set by a **React-state test harness, which proves nothing about authentication or authorization**; ad-hoc scripts, **not CI**): **mock 39 / 39** (default-role tiles with notes and hero numbers; Admitted's male / female note adding up; both charts; Up Next linking to the patient; Recently Registered; the inventory alert; roles admin / doctor / pharmacist / lab_tech; **the Low Stock tile equals the Pharmacy report's table and the Admitted tile equals the Lists report's admitted list**; all 13 Financial Statistics tabs; Total Sales = the sum of the rows; Expenses Rs. 123,800 and Banks Rs. 32,700 matching the Billing / bank screens; **a payment and an expense recorded in Billing moved the Summary, the Cash Flow and the Accounts report by exactly the amounts recorded** — expenses +100.50, payments +250, closing re-balanced; 0 backend requests; 0 console errors) and **API 40 / 40** (both banners; every tile "—" with the not-connected note for every role; no number in the hero sentence; a pending panel for every chart, schedule, recent-patients list, summary, Cash Flow, all eight category tabs, Bank, Graphs and OPD/IPD; no "No records for this category" claim; no demo figure or name anywhere; **0 `/api` requests after login**; 0 console errors).
* **Regression** (same builds): mock — Reports 41/41, Billing 34/34, Pharmacy 46/46, Laboratory 32/32, Imaging 28/28, Encounters 18/18, Patients 26/26, legacy forms 3/3; API — Reports 41/41, Billing 35/35, Pharmacy 21/21, Laboratory 14/14, Imaging 12/12, Encounters 10/10, Patients 16/16. Script issues found and fixed: a chart asserted before its dynamic import finished, and one assertion fragile against CSS upper-casing (a no-op in the end); no app defect was found this phase.
* **Automated checks:** `npx tsc --noEmit --incremental false` exit 0 · `npx vitest run`: 19 files passed, 1 skipped; **385 tests passed, 4 skipped, 8 todo** (397) · `npm run lint`: **0 errors, 27 warnings (27 before this phase — unchanged)** · `npm run build` exit 0 with the placeholder `BACKEND_URL=https://hms-backend.invalid` (a local build-time placeholder, **not a real backend**; a successful build proves nothing about connectivity), production default data source `api`.

### Remaining blockers / limitations
* Everything above is **CONTRACT REQUIRED**; live verification needs the merged PR #17, the unbuilt T10 / T11 endpoints, a development login and the OpenAPI file.
* The placeholder tiles, notes, charts and schedule (point 1) cannot be made real by the frontend.
* Item History (T12), the top bar, the services-catalogue tab and the `billingAggregate` consumers remain.

## §2l — Phase 4K: Item History and Remaining Cross-Module Integration

*Scope: Item History (T12) and the Master Data services-catalogue tab; the patient / encounter / invoice-form balance panels that read `billingAggregate`; the top-bar notifications; a final audit of direct demo-data imports. **FRONTEND-ONLY** — no backend, database, authentication or permission code changed.*

**Four things that must not be confused**
1. *Backend functionality documented* — T12 is described in **one sentence** and has no decision recorded (not started). The services catalogue is mentioned only as the place lab and ECG/USG tests live ("CRUD and deactivate … on the existing services catalog", T1). **No document mentions a patient / encounter bill summary or any notification.** None of it has a route, parameter or schema.
2. *Frontend-prepared* — yes (below).
3. *Connected to a confirmed API contract* — **none.** Five new endpoint keys (six operations together with the existing `serviceCatalog.list`), all `null`; notifications have no key at all.
4. *Live backend integration verified* — **none.**

### What the documents say (and nothing more)
* **T12 — Item History** (Task List, verbatim): *"The audit log is already written on every change (ADR-0015, ADR-0032), but nothing reads it back. The task adds a read endpoint filtered by entity type and ID, restricted to admins."* Size S, no dependencies, **decision not recorded**. Task table: "Master data 'Item History' button" is the frontend screen.
* Nothing else: no path, no entity-type values, no entry fields (who / when / what / before-after), no paging, no sort, no filters other than entity type and ID.
* **Notifications:** not mentioned in the API Reference or the Task List.
* **Services catalogue:** T1 — lab tests and ECG/USG tests are CRUD + deactivate "on the existing services catalog" (`DiagnosticCatalogExtension` hangs off `ServiceCatalogItem`). T8 — "services already come from existing list endpoints". Nothing says the generic (non-diagnostic) catalogue can be created, edited or deactivated through the API.
* **Patient / encounter balances:** the only mention is that the *Patient Balances report* is "already covered" (no route, no schema).

| Requirement | Class |
|---|---|
| Audit log is written on every change | DOCUMENTED (backend) — nothing for the frontend to call |
| Read endpoint filtered by entity type and ID | DOCUMENTED, **CONTRACT REQUIRED** (path, entity-type values, entry fields, paging) |
| Restricted to admins | DOCUMENTED, **BACKEND DEPENDENCY** — enforced by the backend; the frontend infers nothing from a role name (the Master Data page's existing UI gate is unchanged) |
| An "Item History" button on Master Data | EXISTING FRONTEND BEHAVIOR (services tab only) |
| What the current dialog shows (invoice lines that used the service) | EXISTING FRONTEND BEHAVIOR — **not what T12 describes** (see below) |
| Service layer, typed model, loading / error / empty / pending states | FRONTEND PREPARATION (done) |
| Entry fields, vocabulary of actions, actor format, paging, sort | CONTRACT REQUIRED — nothing invented |
| Services-catalogue create / edit / deactivate through the API | CONTRACT REQUIRED (T1 documents it for diagnostic tests only) |
| Per-patient / per-encounter bill summary | CONTRACT REQUIRED — no document; possibly the Patient Balances report, possibly invoices |
| Notifications | not documented anywhere → no key, no mapper, "not connected" in API mode |

### Existing implementation audited (before changing anything)
| Area | File | Finding |
|---|---|---|
| Item History | `admin/master-data/page.tsx` `ServiceHistoryDialog` | **Not an audit trail.** It listed `SERVICES_INVOICES` lines whose *name equals* the service's name (Invoice No., Date, Patient, Qty, Rate, Amount), reading `SERVICES_INVOICES` and `PATIENTS` directly. It exists only on the services tab. It has no actor, no action, no before/after. |
| Services tab | same file `ServicesTab` / `ServiceModal` | read and **mutated `SERVICE_CATALOG` in place** (create, edit, and the Active switch `s.active = v`); numeric ids; `billing/services/new` also read and pushed into the same array (picker and "Register new service"). |
| Top bar | `layout/Topbar.tsx` | computed the bell's alerts from `LAB_ORDERS` ("N Lab orders completed") and `MEDICINES` ("N out of stock" = stock 0; "N running low" = stock `<=` reorder level). **The low-stock rule disagrees with the Dashboard tile and the Pharmacy report (`<`).** |
| Balance panels | `shared/PatientInfoPanel` (Pre Balance), `patients/PatientForm` (Outstanding Balance), `patients/[id]` (billing tab), `encounters/[id]` (top stats + billing tab) | all read `billingAggregate` directly, gated only by "does the id look like a legacy number" — an id-*shape* guard, not a data-*source* guard. |
| `billingAggregate` rules | `lib/billingAggregate.ts` | **demo rules, not documented anywhere**: imaging and pharmacy charges count as always received; a lab order counts as received only when "paid"; consultation falls back to the encounter's own `netTotal`; `balance = max(0, total − received)`; floats. |

### What was built (`src/lib/services/`)
* **`ItemHistoryService.list({ subject, id })`** — `subject` is a frontend name (`"serviceCatalogItem"`, the only thing with an Item History button), **not** a backend entity-type string. The translation to the backend's entity-type value belongs to the (pending) request mapper `itemHistoryQuery`. Returns `ListResult<ItemHistoryEntry>`; `ItemHistoryEntry = { id, at (ISO instant), action, actor | null, details }` — **a frontend-owned boundary, not an API contract**: the strings are rendered verbatim (no action vocabulary, actor format or detail layout is known) and the real mapper will adapt the audit log to it.
* **`BillSummaryService.forPatient / forEncounter`** → `BillSummary` (consultation, services, laboratory, imaging, medicines, total, received, balance — **exact money strings**). The backend owns every figure; in API mode the frontend adds and subtracts nothing.
* **`NotificationsService.list`** → `NotificationRecord[]`. **No endpoint key and no mapper** (same treatment as organisations / guardian relations, `http/reference.ts`): the HTTP adapter throws `NotConnectedError` without a request.
* **`ServiceCatalogService`** gained `create` / `update` (the Active switch is an `update` — the Task List's "deactivate") and a `category` list filter; `ServiceCatalogRecord` and its plain-number `rate` are unchanged (same convention as `LabTestRecord`).
* **Endpoint keys (5 new, all `null`):** `serviceCatalog.create`, `serviceCatalog.update`, `itemHistory.list`, `billSummary.patient`, `billSummary.encounter` — plus the existing `serviceCatalog.list` (Lists report), now also used by the Master Data tab and the invoice picker. **Confirmed paths: none.**
* **Pending mappers (`http/mappers.ts`):** `itemHistoryQuery`, `parseItemHistory`, `parseBillSummary`, `serviceCatalogBody`, `parseServiceCatalogRecord` (+ the existing `parseServiceCatalogList`). Every inert adapter carries a *pending* query / body thunk, so **even if someone fills a path in `endpoints.ts`, nothing is sent until the mapper is implemented** (test: "even with paths configured, sends nothing").
* **`crossModuleContract.ts`** (`crossModuleContractStatus`) — like the other contract modules: in API mode an operation is available only when its key is non-null; it disables Add / Edit / Active / Item History and drives the catalogue banner. Never inspects the network.
* **`mock/crossModule.ts`** — `mockItemHistoryService`, `mockBillSummaryService`, `mockNotificationsService`; `mockServiceCatalogService` (in `mock/reports.ts`) now mutates `SERVICE_CATALOG` for create / update. The mocks keep the old demo behaviour exactly (flagged as demo in the file).
* **UI:** `useBillSummary` (a result is only ever shown for the scope it was loaded for — switching "All visits" → one visit never flashes the previous figures), `BillSummaryNotice` (loading / error with retry / explicit "not connected, not an empty bill"), `Topbar` (service-driven), Master Data `ServicesTab` / `ServiceModal` / `ServiceHistoryDialog` (service-driven), `billing/services/new` (picker and "Register new service" through `serviceCatalogService`). `patients/[id]` now reads its demo arrays **only when `dataSource === "mock"`** (previously: whenever the id happened to look numeric).

### Behaviour by mode
| | Mock | API (no contract) |
|---|---|---|
| Bell | demo alerts + badge (same three rules as before) | aria-label "Notifications (not connected)", **no badge**, dropdown says alerts are not connected; never "All systems optimal"; no request |
| Services Catalog tab | demo catalogue; Add / Edit / Active work (shared `SERVICE_CATALOG`) | banner + contract-pending panel ("not an empty catalogue"); Add disabled; no rows, no edit / history buttons; no "No services found" |
| Item History | **CORRECTED in Phase 4K.1 (§2m).** This row originally said the mock re-shaped invoice lines into audit rows ("Billed on invoice", "By" = "—"). That presented invoice usage as audit history and was wrong. The audit tab now shows **no events** in mock mode ("No audit log in mock mode"); the invoice lines live on a separate, labelled **"Invoice usage (demo)"** tab | button disabled until the key is set; if reached, a contract-pending panel — **never** "no history"; the usage tab is not offered |
| Patient / encounter balance | the old aggregate, through the service (exact money) | "Not connected" / "Not yet connected" notice (patient page, encounter page and stats row, edit-form header, Pre Balance); never a figure, never Rs 0 |
| Services Invoice picker | the shared catalogue | the form itself is not rendered (invoice create has no contract) |

### Where the documents and the screens differ (flagged, **not** changed — each needs a decision or a contract)
1. **Item History ≠ the old dialog.** T12 is the *audit log* (entity type + ID, admins only); the old dialog was an *invoice-usage* list matched by service name. *(Phase 4K re-shaped that list into audit-like rows; Phase 4K.1 removed that — see §2m. The usage list is now a separate "Invoice usage (demo)" tab, mock mode only.)* Whether a "where this item was used" view is wanted at all is a product decision.
2. **No document defines the audit entry**, so When / Action / By / Details is a frontend proposal.
3. **Entity type for a catalogue item** — the Task List does not list values; the frontend does not guess (`ServiceCatalogItem` is a schema model name, not necessarily the audit `entityType`).
4. **Only the services tab has an Item History button.** T12 says "master data" generally; whether the other tabs (lab tests, ECG/USG, banks, expense categories, panels, wards …) should have one is undecided and nothing was added.
5. **Low-stock rule**: the bell used `<=` reorder level, the Dashboard tile and the Pharmacy report use `<`. Kept as-is in the mock; no document defines it.
6. **`billingAggregate` rules** (above) are demo rules. A real "balance" must be defined by the backend; the frontend must not reproduce it.
7. **Catalogue `rate`** is a plain number (Master Data convention, like lab tests) while Billing uses money strings; GST %, discount %, barcode, local name and remarks have no documented home.

### Contract required — exact questions for the backend developer
1. **Item History:** path / method; the entity-type value for a service-catalogue item (and for each other master-data entity); entry fields (timestamp, actor id + display name?, action, changed fields, before / after?); paging, sorting and date filters; the exact roles / permissions allowed (the Task List says "admins" — which permission?); is the response different for deleted items?
2. **Services catalogue:** can the generic catalogue be created, edited and deactivated through the API (T1 documents only diagnostic tests)? Are `gstPct`, `discountPct`, `barcode`, `nameLocal`, `remarks` part of it? Is `rate` a money string? List filters (category, search, active)?
3. **Bill summary:** is there a per-patient / per-encounter summary, or is the source the Patient Balances report plus invoices? What are "total", "received" and "balance" (does the demo's clamp-at-0 or "imaging / pharmacy are always received" rule exist)? Does it include lab / imaging / pharmacy charges "posted when earned" (ADR-0047)?
4. **Notifications:** does the backend have any? If so: list route, unread state, link targets, and the rules for "lab results ready", "out of stock" and "running low".
5. **"Low stock"** — `<` or `<=` the reorder level?

### Cross-module dependencies — final audit of direct demo-data imports
Imports of `@/data/*` outside `src/lib/services/mock/`, tests and `src/data` itself, after Phase 4K:

| File | Imports | In scope? | Status |
|---|---|---|---|
| `lib/billingAggregate.ts` | billing, encounters, imaging, lab, pharmacy | yes | **Only the mock adapters read it now** (`mock/crossModule.ts`, `mock/reports.ts`); no screen does |
| `admin/master-data/page.tsx` | diseases, guardianRelations, labTests (category list), organisations, settings, wards | partly | the **services tab is migrated**; the other tabs (Panels, Wards, Guardian Relations, Diseases, Clinic Settings) were left on the demo arrays — *this row said "mock-only", which was **inaccurate**: in API mode they displayed the demo records. Wrapped in `MockModeOnly` (API mode = contract-pending) in the Post-4K.1 audit — see "Cross-Module Integration Audit and Cleanup"* |
| `patients/[id]/page.tsx` | billing, encounters, imaging, lab, pharmacy | yes (billing tab) | balance cards migrated; **the invoice rows, visit list and the lab / imaging / pharmacy tabs still read demo arrays — now only in mock mode**; hidden otherwise |
| `shared/PatientInfoPanel.tsx` | organisations (`getPanel`) | no | organisation name. *Post-4K.1 audit: it was guarded by the id shape only; it now resolves through `useOrganisations` and no longer imports `@/data/organisations`.* |
| `components/patients/PatientForm.tsx` | patients (`nextMrNo`) | no | mock-only MR number |
| `patients/page.tsx` | encounters ("Last Visit") | no | mock-only (`dataSource !== "mock"` → "—") |
| `encounters/new/page.tsx` | encounters (`nextTokenNo`) | no | token number mock-only. *The prescription step's medicine picker used to list demo `MEDICINES` (with stock) in API mode — a demo leak found in this audit; **fixed in Phase 4K.1, see §2m**.* |
| `pharmacy/[tab]/PharmacyHub.tsx` | medicines (`MEDICINE_CATEGORIES`), pharmacy (`nextDispenseNo`) | no | constants / mock-only number |
| `lab/orders/new`, `imaging/orders/new` | labTests (categories), lab / imaging (`nextLabNo` / `nextXrNo`) | no | constants / mock-only numbers |
| `components/shared/QuickAddLabTestDialog.tsx`, `IcdLookup.tsx` | labTests (categories), diseases | no | constants / ICD list (Diseases has no contract) |
| `admin/users/page.tsx`, `login/page.tsx`, `lib/auth.tsx` | users (`ROLE_LABELS`) | no | label constants; authentication untouched |
| `lib/services/mock/*` | everything | — | the mock adapters themselves; go away with the demo data |

### Tests (frontend-only, controlled data — not backend verification)
* **Vitest (`npm test`):** 20 files passed / 1 skipped; **403 passed, 4 skipped, 8 todo** (415). 18 of those are new, in `src/lib/services/crossModule.test.ts`: all six operations inert (no `fetch`, "awaiting the backend contract"); with paths configured they still send nothing (pending query / body mappers); no notification key exists; the HTTP adapters import no demo data or mock; the contract status per key; static guards (Topbar, balance panels, patient / encounter detail, Master Data page, Services Invoice form read no `billingAggregate`, no `@/data/services`, no mock); ~~mock Item History recomputed from the raw invoices~~ *(this test asserted the behaviour Phase 4K.1 corrected and was replaced — §2m)*; mock bill summary (two-decimal strings, parts add up, **agrees with the Patient Balances report row for 12 patients**, rejects a ULID / unknown id instead of returning zero); mock notifications recomputed independently from `LAB_ORDERS` / `MEDICINES`; mock catalogue list / category filter / create / update-and-deactivate (restored afterwards); and `BillSummaryNotice` rendered on the server for pending / error / loading / data / idle (pending says "not an empty bill" and contains no `Rs.`). `readiness.test.ts` got the two new key prefixes (`itemHistory.`, `billSummary.`).
* **TypeScript:** `tsc --noEmit` exit 0. **ESLint:** `npm run lint` — **0 errors, 27 warnings** (unchanged from Phase 4J; the warnings are pre-existing `react-hooks/set-state-in-effect` / unused-variable / `window.location` notices, including the "reset the dialog's fields when it opens" effects in the Master Data and Services Invoice dialogs). **Build:** `npm run build` exit 0 with the local placeholder `BACKEND_URL=https://hms-backend.invalid` (a build placeholder, not a backend; a successful build says nothing about connectivity). `.next/` and `tsconfig.tsbuildinfo` are generated files, regenerated by the build and `tsc` (final `.next/` = the production-default, API-mode build); `next-env.d.ts` is unchanged (last modified 5 Nov). None was edited by hand.
* **Browser (real Edge, production builds; only the login is stubbed — a test technique, not authentication; the UI role comes from a React-state test harness that proves nothing about authentication or authorization; ad-hoc scripts, not part of CI):**
  * **Phase 4K, mock: 28/28** — bell count / badge / dropdown / link; services catalogue (24 rows, category filter 7 of 24, add, edit, deactivate persists across navigation); Item History ("Dressing" = its three invoice lines, columns When / Action / By / Details, "By" always "—", every invoice number exists in Billing; a never-invoiced service shows "No history recorded"); the new service appears in the Services Invoice picker; patient 5 and encounter 2 balance panels (parts add up; edit form, invoice-form Pre Balance, encounter page and the patient page scoped to that visit all agree); **patient 1 (Rs. 1,000 outstanding) — the same figure on the patient page, the edit form and the invoice-form Pre Balance, and the scoped visit equals the encounter page**; 0 backend requests; 0 console errors.
  * **Phase 4K, API (production default): 14/14** — bell "Notifications (not connected)", no badge, dropdown says not connected (not "All systems optimal"); catalogue banner + pending panel + Add disabled, no rows, no edit / history buttons, no "No services found"; patient / encounter detail cannot load (their own contracts are missing) so no balance can appear; the Services Invoice form is not rendered; **0 `/api` requests after login**; 0 console errors.
  * **Regression, mock:** Dashboard / Stats 39, Reports 41, Billing 34, Pharmacy 46, Laboratory 32, Imaging 28, Encounters 18, Patients 26, legacy forms 3/3 (the legacy picker + info panel still show PRE BALANCE on the lab, imaging and consultation forms).
  * **Regression, API:** Dashboard / Stats 40, Reports 41, Billing 35, Pharmacy 21, Laboratory 14, Imaging 12, Encounters 10, Patients 16.
  * **Not browser-tested:** the balance panels' API-mode *pending* state (unreachable — see below; covered by the server-rendered component tests), a real authenticated session, any live backend.

### Remaining blockers / limitations
* **Nothing in this phase is connected.** Item History, the catalogue writes and the bill summary are inert in API mode; notifications do not exist as a contract.
* The **balance panels cannot be reached in a browser in API mode** (the patient and encounter records they hang off have no contract either). Their non-data states are therefore covered by server-rendered component tests plus the structural guards, not by a browser run — see Tests.
* Item History entries are a frontend proposal until the audit-log shape is published.
* The invoice rows / visit list inside the patient detail page, the other Master Data tabs remain as listed above. (*The "`data/doctors.ts` consumers" that this bullet used to list no longer exist — no screen imports `@/data/doctors`; corrected in the Post-4K.1 audit.* The New Encounter medicine picker leak listed here at the end of Phase 4K was fixed in Phase 4K.1 — §2m.)
* "Frontend-prepared" is not "integrated": no live request has ever been made for any of this.

## §2m — Phase 4K.1: Corrective Fixes

*Scope: two corrections to Phase 4K, **frontend-only** — (A) the New Encounter prescription step listed demo medicines in API mode; (B) the Item History mock presented invoice usage as audit-log entries. No backend, database, authentication, login, refresh, logout, role or permission code changed, no endpoint key was added or configured, no earlier Phase 4K work was redone.*

**Four things that must not be confused**
1. *Backend functionality documented* — unchanged since §2l: T12 is one sentence (an audit-log read, filtered by entity type and ID, admins only; no path, entity-type values or entry fields). The pharmacy medicine list is part of T4 (medicine CRUD, stock view) with **no route or schema**. Invoice usage of a service is documented nowhere.
2. *Frontend-prepared* — yes (below).
3. *Connected to a confirmed API contract* — **none.** `itemHistory.list` and `medicines.list` remain `null`; invoice usage has no endpoint key at all.
4. *Live backend integration verified* — **none.**

### Correction A — the New Encounter medicine leak
* **The leak (verified in the source, not taken from the earlier report):** `encounters/new/page.tsx` imported `MEDICINES` from `@/data/medicines` and used it in exactly two places — the options of each prescription line's medicine `Select`, and the `Stock: N unit (low stock)` note under it (`MEDICINES.find(m => m.name === row.medicine)`). It was a direct demo-array read, with no mode check, so API mode showed demo medicine names and stock. The `Select` value is the medicine **name** (the encounter's `prescription[].medicine` is a free-text name), which is unchanged.
* **Corrected integration:** the page now uses the existing `useMedicines(enabled)` hook (the same `medicinesService.list` the Pharmacy screens and the Dashboard use, through the shared reference cache) gated by the existing `pharmacyContractStatus(dataSource)`:
  `const medicinesPending = !medicinesContract.can("medicines.list")`, `useMedicines(!medicinesPending)` — so while the contract is missing **the list is not even requested**. No second pending-state mechanism was built: the shared `ContractPending` notice and the existing `PHARMACY_OPERATION_LABELS["medicines.list"]` label are reused.
* **New file `components/encounters/PrescriptionRows.tsx`** — the prescription lines moved out of the page unchanged in layout, wording and behaviour (dose / route / frequency / duration / instructions, Add / Remove) so that every state can be server-rendered in a test. It imports no demo data and no mock.
* **Mock mode (unchanged for the user):** the picker lists the demo medicines (30 in the current data), selecting one shows `Stock: N unit`, with ` (low stock)` when `stock < reorderLevel`; Add / Remove medicine work; the saved encounter keeps the chosen medicines on its Prescription tab. The data now arrives through `medicinesService` (`mock/pharmacy.ts` reads the same `MEDICINES` array and converts ids at the boundary). No stock or dispensing rule was added, and **choosing a medicine still reserves or deducts no stock** (as before).
* **API mode (no contract):** the lines are replaced by the contract-pending notice "Prescription medicines are unavailable — Not connected … no request is sent and no demo data is shown … not an empty medicine list. Awaiting the contract for: list medicines (inventory, stock, tiles)" (`data-testid="encounter-medicines-pending"`). **No picker, no medicine name, no stock figure, no free-text medicine entry, no "Add Medicine" button, no "No medicines" message.** General instructions and follow-up date stay. `save` sends `prescription: []` while pending (the lines cannot hold anything then anyway).
* **When the contract exists:** a loading placeholder ("Loading medicines…"), then the real list; if the call fails, `encounter-medicines-error` with the backend message and Try again (no lines).
* **Not changed:** Pharmacy inventory and dispensing, `medicinesService`, the endpoint table, the other New Encounter steps (the token-number helper `nextTokenNo` is still mock-only, as listed in §2l).
* **A limit worth knowing:** in a real browser in API mode the prescription step **cannot be reached at all** — step 1 needs a patient and `patients.list` / `patients.get` have no contract either. The pending state is therefore verified by server-rendered component tests; the browser checks confirm what is reachable (Next stays disabled, no demo medicine, no stock, no request).

### Correction B — Item History is the audit log, not invoice usage
* **What was wrong (verified in `mock/crossModule.ts`, not the earlier report):** `mockItemHistoryService` built `ItemHistoryEntry` rows (`action: "Billed on invoice"`, `actor: null`, `details: "<invoice> · <patient> · qty × rate = amount"`) from `SERVICES_INVOICES` lines whose name equals the service's name, and the dialog showed them under audit columns When / Action / By / Details. An invoice line proves a service was billed; it is not an audit event, has no actor and no change record. Showing it as one — even with "By" as "—" — misrepresented what T12 returns. (Phase 4K flagged the mismatch but still presented it as history.)
* **The two concepts are now separate, in types, services, mocks and UI:**

| | Item Audit History (T12) | Invoice Usage (legacy, demo) |
|---|---|---|
| What it is | backend audit events about **changes to the item**; read by entity type + ID; admins only | the invoice lines that carry the service (matched by **name** — the demo lines have no catalogue id) |
| Type | `ItemHistoryEntry { id, at, action, actor\|null, details }` — frontend proposal, rendered verbatim | `ServiceUsageEntry { id, invoiceNo, at, patient, quantity, rate, amount }` (exact money strings) — **no** action / actor / details |
| Service | `itemHistoryService.list({ subject, id })` | `serviceUsageService.list({ id })` |
| Endpoint key | `itemHistory.list` = `null` (CONTRACT REQUIRED) | **none** — no document describes it |
| Pending mappers | `itemHistoryQuery`, `parseItemHistory` (pending; **blockers**) | none |
| Real-API adapter | inert: `NotConnectedError`, no request (and even with a path configured, no request until the mapper exists) | `NotConnectedError("service invoice usage (contract not confirmed)")`, no request, no key |
| Mock adapter | **no events** (see below) | the old invoice-line list (count, newest first) |
| UI | the **"Audit history"** tab — the first and default tab of the dialog | the **"Invoice usage (demo)"** tab — **mock mode only**; the tab and its panel are not rendered in API mode |

* **Mock audit behaviour:** the demo data has **no audit events for catalogue items**. *(Correction made while writing this section: one audit-shaped fixture does exist — `AUDIT_LOG` in `src/data/settings.ts`, typed `AuditLogEntry { id, user, action, module, recordId, timestamp }`. It is six hand-written entries about **other** modules — Patients, Encounters, Billing, Laboratory, Pharmacy, Users — is imported by no screen, has no documented mock purpose, and none of it concerns a service-catalogue item. Relabelling any of it onto a service would fabricate events, so it is deliberately **not** used; a test pins this.)* So the mock invents none. For a catalogue item that exists it returns an honest empty result (404 for an unknown / non-numeric id, as before). The dialog says: *"No audit log in mock mode — The demo data has no audit events for catalogue items, so none can be shown here. This does not mean the item was never changed."* (`item-history-mock-empty`). It deliberately does not say "No history recorded", which would suggest the item was never changed. The mock audit function reads no invoice, patient or other demo array (guarded by a test).
* **Invoice Usage tab:** a notice (`service-usage-notice`) states *"Demo data — invoice usage, not an audit log. These are the invoice lines that carry this service; they do not record who changed the catalogue item or what was changed."* Columns are invoice columns only (Invoice date / Invoice / Patient / Qty / Rate / Amount) — none of When / Action / By / Details. A never-invoiced service says "Not invoiced yet". Whether this view is wanted at all is a product decision; it is kept only because it was the previous behaviour and is cheap to drop (delete `ServiceUsagePanel`, `serviceUsageService` and the tab).
* **API mode:** the Item History button is still disabled while `itemHistory.list` is `null`, and in practice no catalogue row exists (the catalogue list is also contract-pending), so the dialog cannot be opened; if it were opened with the key unset the audit view shows the contract-pending notice ("Item History (audit-log read, T12) … not an empty audit history") — never "no history", never invoice usage. A real empty result, once connected, reads "No audit entries — The audit log returned no entries for this item".
* **New file `components/shared/ItemHistoryView.tsx`** — two presentational components (`ItemHistoryView`, `ServiceUsageView`) holding all the states (pending / error with retry / loading / empty / rows), so they can be server-rendered in tests. The Master Data page keeps the data fetching.
* **Admin restriction:** the Task List says the read is **restricted to admins**. The project has no confirmed role-response contract, so nothing was added: no new authorization, no `user.role === "admin"` check, and **no claim that hiding or showing the button enforces anything**. The restriction must be enforced by the backend (whatever the frontend already shows or hides for the Master Data page is unchanged and is a convenience, not security). Open question for the backend: which permission is "admin" for the audit read, and what does it return for a caller without it?

### Tests (frontend-only, controlled data — not backend verification)
* **Vitest (`npm test`):** 20 files passed / 1 skipped; **422 passed, 4 skipped, 8 todo** (434). Phase 4K ended at 403 / 4 / 8 (415): **+19**. `crossModule.test.ts` now has 37 tests (was 18):
  * *replaced (they asserted the incorrect behaviour):* the three "mock Item History (the old usage list …)" tests, which required invoice lines to come back as `ItemHistoryEntry` rows. They are now the "Item History (T12 audit log) and Invoice Usage are separate concepts" group (8 tests): an invoiced service still has **no** audit events (checked for the invoiced service and the first six catalogue items); the audit mock source contains no `SERVICES_INVOICES` / `PATIENTS` / `AUDIT_LOG` / `Billed on invoice` / `actor:` / `action:` / `details:` / `new Date`; `AUDIT_LOG` has no catalogue-related entry and is referenced by neither the Master Data page, the view nor the HTTP adapter; 404 for unknown ids; the two entry types share no fields and are not assignable to one another (`@ts-expect-error`); the usage mock lists exactly the invoice lines that carry the service, newest first, exact money, exactly the seven usage fields; never-invoiced → empty, unknown → 404; the dialog is audit-first, the usage tab is labelled "Invoice usage (demo)" and gated by `dataSource === "mock"` (tab and panel), and "Billed on invoice" appears nowhere in the page or the view.
  * *added:* "ItemHistoryView / ServiceUsageView states (server-rendered)" (7): API pending (no entries, no "No history", no mock wording, no table); mock empty ("No audit log in mock mode" + "does not mean the item was never changed"); API real-empty wording; loading and error; entries rendered verbatim with a dash for a missing actor; the usage view's "not an audit log" notice, invoice-only columns and no audit vocabulary; usage empty / pending.
  * *added:* "New Encounter prescription step" (7): `medicines.list` pending in API / connected in mock; **API pending renders only the notice — even when the 30 demo medicines and a selected demo medicine are passed in, none of the 30 names, no "Stock:", no combobox, no "Add Medicine", no "No medicines"**; mock renders the picker, Add button and the exact `Stock: N unit` / `(low stock)` text from the mock medicine service; a medicine absent from the list gets no stock line; loading and error states; static guards (the page imports no `@/data/medicines` / `MEDICINES`, uses `pharmacyContractStatus`, `useMedicines(!medicinesPending)` and `prescription: medicinesPending ? []`; `PrescriptionRows` imports no demo data or mock); the real-API medicines list throws `NotConnectedError` without calling `fetch`.
  * *also updated:* the "inert HTTP operations" test now includes `httpServiceUsageService`; the "no notification key" test also asserts no `usage` key exists. Nothing else was weakened.
* **TypeScript:** `tsc --noEmit` exit 0. **ESLint:** `npm run lint` — **0 errors, 27 warnings** (the same count as Phase 4K; the warnings are pre-existing and none comes from the new files; not itemised again). **Build:** `npm run build` exit 0 with the local placeholder `BACKEND_URL=https://hms-backend.invalid` (a build placeholder, not a backend). `.next/` and `tsconfig.tsbuildinfo` are regenerated by the build / `tsc` (the final `.next/` is the production-default, API-mode build); `next-env.d.ts` is unchanged (5 Nov). Nothing was edited by hand.
* **Browser (real Edge, production builds; ad-hoc scripts, not CI). Only the login is stubbed — a test technique, not authentication; every other `/api` request is recorded and answered 599; the UI role comes from a React-state harness that proves nothing about authentication or authorization:**
  * **Phase 4K.1, mock: 22/22** — New Encounter step 2: the picker lists exactly the 30 demo medicines (names compared with the demo data file, read independently of the app); a low-stock medicine (Amoxil 500mg) shows `Stock: 8 Capsule (low stock)`, a normal one shows `Stock: N unit`; Add / Remove medicine (3 → 4 → 3); saving keeps the chosen medicine on the encounter's Prescription tab. Item History for "Dressing" (on three invoices): audit tab titled "Item History — Dressing", **no table, "No audit log in mock mode", no invoice number, no "Billed on invoice"**; the "Invoice usage (demo)" tab shows the "not an audit log" notice and exactly three rows with invoice columns only, every invoice number exists in Billing; switching back, the audit tab is still empty; a never-invoiced service → audit empty, usage "Not invoiced yet"; 0 backend requests; 0 console errors.
  * **Phase 4K.1, API (production default): 11/11** — `/encounters/new` and a `?patientId=` deep link: Next stays disabled (no patient can load), so **the prescription step is unreachable**; no demo medicine name and no stock figure anywhere on the page; Master Data services tab contract-pending, its banner lists "Item History (audit-log read, T12)"; no Item History button, no usage tab, no dialog, no demo service, no invoice number, no "No history"; **0 `/api` requests after login**; 0 console errors.
  * **Phase 4K scripts re-run:** mock 27/27 (its Item History block was rewritten for the corrected behaviour — five old checks became four, so 28 → 27), API 14/14.
  * **Regression, mock (fresh server per suite):** Dashboard / Stats 39, Reports 41, Billing 34, Pharmacy 46, Laboratory 32, Imaging 28, Encounters 18, Patients 26, legacy forms 3/3 — identical to Phase 4K.
  * **Regression, API:** Dashboard / Stats 40, Reports 41, Billing 35, Pharmacy 21, Laboratory 14, Imaging 12, Encounters 10, Patients 16 — identical to Phase 4K.
  * **Not browser-tested:** the prescription step's API-mode pending state and the Item History dialog's API-mode pending state (both unreachable — covered by server-rendered component tests and structural guards), a real authenticated session, any live backend. No Master Data suite exists beyond the Banks / Expense Categories checks in the Billing suite and the Phase 4K scripts.

### Remaining limitations
* **Nothing here is connected.** `itemHistory.list` and `medicines.list` are `null`; invoice usage has no key; Item History entries remain a frontend proposal until the audit-log shape is published.
* The audit entity-type value for a catalogue item, the entry fields, paging, sorting and the admin permission are still contract questions (§2l, question 1) — answers needed before `itemHistoryQuery` / `parseItemHistory` can be written.
* The prescription medicine is still a **free-text name** on the encounter (`prescription[].medicine`), not a medicine id; whether the backend wants an id, a name or both is unknown and nothing was changed.
* Choosing a medicine in the wizard checks no stock and reserves nothing (as before); only the displayed stock note comes from the service now.
* The remaining direct demo reads listed in §2l (other Master Data tabs, `nextTokenNo`, order-number helpers, the patient detail page's invoice / visit / lab / imaging / pharmacy tabs in mock mode) are unchanged.
* "Frontend-prepared" is not "integrated": no live request has been made for any of this.

## Cross-Module Integration Audit and Cleanup — Post-Phase 4K.1

*Scope: an audit of every place one module reads another module's data, plus the smallest frontend-only corrections it justified. **This is not Phase 5**: nothing was connected to a backend, no endpoint key was added or configured, no request body, response schema, permission or business rule was invented, and no backend, database, authentication, login, refresh, logout, role or permission code was touched. Mock-mode behaviour is unchanged.*

**Four things that must not be confused**
1. *Backend functionality documented* — unchanged: the API Reference is a 3-page overview (170 endpoints named by tag, **no routes or schemas in the document**); the Task List describes T1–T14 in prose. Nothing below adds to either.
2. *Frontend-prepared* — yes, for every service listed in §2c–§2m.
3. *Connected to a confirmed API contract* — **none.** `ENDPOINTS` has 88 keys: **87 are `null`**, only `auth.me` is set. the request / response mappers in `http/mappers.ts` are still `pending(...)` blockers (116 `pending(` occurrences, counting the definition and comments).
4. *Live backend integration verified* — **none.**

### 1. Modules and consumers audited
Every file under `src/app`, `src/components`, `src/lib` (not only the files named in earlier reports): patient list/detail/forms/info panel/picker; New Encounter, encounter list/detail/discharge; lab and imaging orders (list/new/detail/results); Pharmacy hub (inventory, dispense, history); Billing hub, consultation and services invoice forms; all twelve reports; Dashboard and Financial Statistics; Topbar, Sidebar, AppShell; Master Data (all ten tabs); Item History; Admin users/doctors; profile, login, landing; the shared hooks (`useReferenceData`, `useBillSummary`, `useResource`) and the service index. Method: (a) every `@/data/*` import and every demo-collection identifier outside `src/data`, `lib/services/mock/` and tests; (b) every hard-coded array/figure in a screen; (c) every low-stock / `reorderLevel` rule; (d) every id-shape guard (`legacyNumericId`, `legacyPatientId`); (e) every import of `billingAggregate` and of a mock adapter.

### 2–3. Remaining direct mock-data references, and how each is classified
Classes: **L** legitimate mock-adapter use · **D** direct dependency in a screen · **S** existing shared-service use · **M** intentional demo-only · **A** API-mode leak · **U** unused · **B** unresolved backend dependency.

| File | Reads | Class | Status after this audit |
|---|---|---|---|
| `lib/services/mock/*` | every collection | **L** | the mock adapters themselves; allowed, unchanged |
| `lib/billingAggregate.ts` | billing, encounters, imaging, lab, pharmacy | **L** | read only by `mock/crossModule.ts` and `mock/reports.ts` (now pinned by a test) |
| `admin/master-data/page.tsx` — Panels, Wards, Guardian Relations, Diseases, Clinic Settings tabs | `PANELS`, `WARDS`, `GUARDIAN_RELATIONS`, `DISEASES`, `CLINIC_SETTINGS` | **A → fixed** | **were an API-mode leak** (below). Now wrapped in `MockModeOnly`: mock = unchanged, API = contract-pending, children not mounted |
| `admin/master-data/page.tsx` — `LAB_TEST_CATEGORIES` | constants | **M** | category vocabulary, not records |
| `shared/IcdLookup.tsx` | `DISEASES` | **A → fixed** | **was an API-mode leak** (below). Disabled "not connected" control in API mode |
| `shared/PatientInfoPanel.tsx` | `getPanel` (`@/data/organisations`) | **D/A risk → fixed** | guarded only by the id *shape*; now resolves the organisation through `useOrganisations` (the service the patient detail page already used) |
| `patients/[id]/page.tsx` | encounters, lab, imaging, pharmacy, billing arrays | **D, mode-gated** | read only when `dataSource === "mock"` (`legacyId = dataSource === "mock" ? … : null`); API mode shows "Not yet connected" notices. **Not a leak.** Could move to the services when `patients.get` has a contract (it cannot even be opened in API mode today) |
| `patients/page.tsx` | `ENCOUNTERS` (Last Visit) | **D, mode-gated** | `dataSource !== "mock"` → "—" |
| `encounters/new/page.tsx`, `lab/orders/new`, `imaging/orders/new`, `pharmacy/[tab]/PharmacyHub`, `patients/PatientForm` | `nextTokenNo`, `nextLabNo`, `nextXrNo`, `nextDispenseNo`, `nextMrNo` | **M, mode-gated** | number suggestions, mock only; API mode says "assigned on save" / "Assigned on registration" |
| `PharmacyHub`, `lab/orders/new`, `QuickAddLabTestDialog` | `MEDICINE_CATEGORIES`, `LAB_TEST_CATEGORIES` | **M** | vocabularies |
| `admin/users`, `login`, `lib/auth.tsx` | `ROLE_LABELS`, badge classes | **M** | label constants; authentication untouched |
| `data/billing.ts` | `DOCTORS` | **L** | inside the demo data itself |

*Statement corrected:* earlier text (§5, §2l) said "~15 modules reading `data/doctors.ts`". That is no longer true — **no screen, component or lib file imports `@/data/doctors`** (Phase 4C migrated them to `doctorsService`; only `data/billing.ts` and the tests do). Verified by grep and now by the allow-list test below.

### 4. Confirmed API-mode leaks found
All of these displayed demo data in a production (API-default) build; none sent a request.
1. **Master Data → Panels & Insurance** — listed the five demo panels (name, type, contact, phone, commission) and let the user add / edit / activate them in the shared demo array.
2. **Master Data → Wards & Beds** — listed the five demo wards with bed occupancy and let a click cycle a bed's status.
3. **Master Data → Guardian Relations** — listed the demo relations, add / edit / activate.
4. **Master Data → Diseases/Diagnosis** — listed 20 demo ICD codes, add / edit.
5. **Master Data → Clinic Settings** — showed the demo clinic's name, address, phone, e-mail, print header, currency and timezone, and **"Save Settings" displayed "Settings saved successfully" although nothing could be saved** — a false success.
6. **ICD-10 Lookup** (New Encounter step 2 and Discharge) — offered the demo diagnosis list to insert into a real record's diagnosis.
7. **`PatientInfoPanel` organisation name** — looked the organisation up in the demo array whenever the panel id merely *looked* numeric. ULIDs never do, so it was not leaking in practice; the guard was an id-shape check, not a data-source check.

Already correct (verified, not changed): Dashboard tiles and charts, Financial Statistics, all twelve reports, Billing hub, invoice forms, Pharmacy hub, Lab and Imaging screens, Encounters (list/detail/new/discharge), Patients list, Topbar notifications, bill-summary panels, Services Catalog and Item History, Lab/ECG tests, Banks, Expense Categories.

### 5. Corrections implemented (frontend-only)
* **New `components/shared/MockModeOnly.tsx`** — `source: "mock"` renders its children unchanged; any other source renders the existing shared `ContractPending` notice instead (children **not mounted**, so nothing is displayed, edited, "saved" or requested). It reuses `ContractPending`; it is not a new pending mechanism. `source` is a prop (callers pass the build's `dataSource`) so both modes can be server-rendered in a test.
* **`master-data/page.tsx`** — the five tabs above are wrapped (`masterdata-panels-pending`, `-wards-`, `-guardian-`, `-diseases-`, `-clinic-pending`). The awaiting labels name the data only ("panels / organisations (list, create, edit, activate)", …) — they assert no route.
* **`IcdLookup.tsx`** — new optional `source` prop (default: the build's `dataSource`). API mode renders a disabled button "ICD-10 Lookup (not connected)" (`icd-lookup-pending`) with an explanatory title; the diagnosis text field itself stays free text.
* **`PatientInfoPanel.tsx`** — organisation through `useOrganisations(...)`; "Organisation (not yet connected)" while the service is not connected; no `@/data` import left.
* **Not changed:** every service, mapper, endpoint key, the Pharmacy / Dashboard / Reports / Billing code, Item History and Invoice Usage (the 4K.1 separation is untouched and re-verified), authentication and roles.

### 6. Existing services reused
`organisationsService` via `useOrganisations`, the shared `ContractPending`. Nothing else was needed. **7. New services: none.** The one new file is a presentational wrapper (`MockModeOnly`), justified because five tabs and one control needed the identical "demo-only" rule and the alternative was copying the same branch six times; it holds no data and no logic beyond the mode switch.

### Cross-module review by area
* **Patient and encounter billing summaries (Requirement C):** every balance consumer already goes through `billSummaryService` (`PatientInfoPanel`, `PatientForm`, `patients/[id]`, `encounters/[id]`); the only reader of `billingAggregate` is the mock adapters. API mode shows "Not connected / Not yet connected", never a figure or Rs 0. No balance formula was written. *ALREADY CORRECT.* Backend contract still required (bill summary — see §2l).
* **Pharmacy stock consistency (Requirement D):** all stock consumers use `medicinesService` (Pharmacy hub, Dashboard banner, New Encounter picker) or the pharmacy / dashboard / notification services; none reads `MEDICINES` directly. **The low-stock threshold is NOT consistent, and no document defines it — it was pinned, not changed.** What each consumer does today (characterised by a new test at stock 0 / stock = reorder level / stock below it):

  | Consumer | Rule | stock 0 | stock = reorder | below reorder |
  |---|---|---|---|---|
  | Pharmacy hub — tile, "Low Stock" filter, status badge (`pharmacyHelpers.isLowStock`) | `0 < stock < reorder` | not low (shown as Out of Stock) | not low | low |
  | Dashboard KPI tile (`lowStockItems`) and stock banner; Pharmacy report "low stock" list; New Encounter picker note | `stock < reorder` | **low** | not low | low |
  | Top-bar notification "running low" (mock) | `0 < stock <= reorder` | not low (counted as "out of stock") | **low** | low |

  So the same medicine can be "low" in one place and not in another at exactly two boundary values. **Exact question for the backend / product owner:** is "low stock" `stock < reorderLevel` or `stock <= reorderLevel`, and does a stock of 0 count as low stock or only as out of stock? Until answered, the frontend must not choose; in API mode the backend (the summary and report endpoints) should be the only source of the figure and the frontend should render it rather than recompute it (the Dashboard banner's own filter over the medicine list is the one place that recomputes — it is a mock-era convenience and should follow the backend's answer). *Dispensing and stock deduction untouched.* *PRODUCT/BUSINESS DECISION REQUIRED.*
* **Reports and Dashboard (Requirement E):** every figure comes through `reportsService`, `dashboardService`, `statisticsService`; mock figures are produced inside `mock/*` only; API mode is contract-pending. *ALREADY CORRECT.*
* **Notifications (Requirement F):** `notificationsService` has no endpoint key; API mode shows "(not connected)", no badge, no request. *ALREADY CORRECT.* Not documented anywhere — *BACKEND CONTRACT REQUIRED* if notifications exist at all.
* **Item History and Invoice Usage (Requirement G):** unchanged and re-verified — audit history is `itemHistoryService` (pending, mock returns no events), invoice usage is a separate mock-only demo tab; nothing converts invoice lines to audit events. *ALREADY CORRECT.*
* **Master Data / services catalogue (Requirement H):** Services Catalog, Lab tests, ECG/Ultrasound, Banks, Expense Categories already service-driven with their own pending states; generic catalogue create/update remain pending (T1 documents CRUD only for diagnostic tests); the five demo-array tabs are now API-pending. Whether Panels/Wards/Guardian/Diseases/Clinic Settings have backend endpoints is **not documented** (the API Reference names "Settings" and "Catalogs" tags without routes or schemas) — *BACKEND CONTRACT REQUIRED*; wards and beds are listed in the Task List only as "already covered".

### 8. Backend contracts still missing (cumulative; new items marked ★)
Everything in §2b–§2m, plus ★ **Master Data**: panels / organisations CRUD, wards and beds (list + bed status), guardian relations, diagnoses (ICD) list and CRUD, clinic settings read and save. ★ **Diagnosis lookup source** for the encounter / discharge ICD lookup.

### 9. Business decisions still requiring confirmation
Low-stock `<` vs `<=` and zero (above) · whether `prescription[].medicine` is an id, a name or both · whether Item History is wanted on master data other than services · whether the "Invoice usage (demo)" tab should exist · ★ whether the ICD lookup should be the hospital's own Diagnoses master data or a standard ICD-10 catalogue · ★ whether bed status is editable from Master Data at all (the demo lets a click cycle it).

### 10. Test results (frontend-only, controlled data — not backend verification)
* **TypeScript:** `tsc --noEmit` exit 0.
* **Vitest:** 21 files passed / 1 skipped; **438 passed, 4 skipped, 8 todo** (450). Previous (4K.1): 422 / 4 / 8 (434) → **+16**, all in the new `src/lib/services/crossModuleAudit.test.ts` (16 tests): (a) an **allow-list of every direct `@/data/*` import** outside the mock adapters — a new direct import fails the test until it is classified; HTTP adapters / reference helpers / API client import no demo data or mock; only the mock adapters read `billingAggregate`; only `services/index.ts` imports a mock adapter; the patient detail and list read demo arrays only in mock mode; (b) `MockModeOnly` rendered on the server — mock = children unchanged, API = the notice and **no child**; the five tabs are each wrapped and the service-driven tabs are not; (c) the ICD lookup rendered in both modes — API mode contains no demo diagnosis name or code; (d) `PatientInfoPanel` imports no demo data; (e) the low-stock characterisation above (including through the real `PrescriptionRows` and the mock dashboard / report / notification services, with the mutated demo stock restored afterwards). Nothing existing was weakened; one assertion in `crossModuleAudit.test.ts` was fixed during writing (a regex whose backslash had been lost) — a mistake in the test, not in the app.
* **ESLint:** `npm run lint` — **0 errors, 27 warnings** (unchanged count; pre-existing, none from the new files; one `react/no-children-prop` error in a new test was fixed by making `MockModeOnly`'s `children` optional, so the wrapper can be rendered with createElement's child argument).
* **Build:** `npm run build` exit 0 in mock mode and in the production-default API mode, with the local placeholder `BACKEND_URL=https://hms-backend.invalid` (a build placeholder, not a backend; a successful build says nothing about connectivity). `.next/` and `tsconfig.tsbuildinfo` are generated files regenerated by the build / `tsc`; the final `.next/` is the API-default build; `next-env.d.ts` is unchanged (5 Nov). None was edited by hand.

### 11. Browser verification (real Edge, production builds; ad-hoc scripts, not CI)
*Only the login request is stubbed — a test technique, not authentication; every other `/api` request is recorded and answered 599; the UI role is set by a React-state harness that proves nothing about authentication or authorization.*
* **Audit script, mock: 18/18** — Panels (all 5 demo panels listed, Add Panel works), Wards (all 5 wards, bed overview, a bed click still cycles status), Guardian Relations, Diagnoses (J02.9 / I10 listed, search narrows to Asthma), Clinic Settings (demo clinic name present, Save Settings still confirms), the ICD lookup (normal trigger, choosing Asthma inserts it), `PatientInfoPanel` organisation (patient 3 → panel 1's name, patient 5 → panel 2's name, patient 1 → Self-Pay, never "not yet connected"), 0 backend requests, 0 console errors.
* **Audit script, API (production default): 22/22** — each of the five tabs shows the contract-pending notice, no demo record text (checked against names parsed from the data files), no table / input / switch / add-edit-save control; Services Catalog, Banks and Expense Categories keep their own pending states; **0 `/api` requests after login**; New Encounter: Next disabled; 0 console errors.
* **Re-run on the final builds:** Phase 4K.1 scripts mock 22/22, API 11/11; Phase 4K scripts mock 27/27, API 14/14.
* **Regression, mock:** Dashboard/Stats 39, Reports 41, Billing 34, Pharmacy 46, Laboratory 32, Imaging 28, Encounters 18, Patients 26, legacy forms 3/3 — identical to 4K.1. **Regression, API:** Dashboard/Stats 40, Reports 41, Billing 35, Pharmacy 21, Laboratory 14, Imaging 12, Encounters 10, Patients 16 — identical.
* **Not browser-tested (unreachable in API mode — covered by server-rendered component tests and the structural guards instead):** the ICD lookup's "not connected" state (New Encounter step 2 and Discharge need a patient/encounter, which have no contract), the New Encounter prescription pending state, the Item History dialog's pending state, the balance panels' pending state. Also not tested: a real authenticated session, any live backend.

### 12. Remaining limitations
* Nothing here is connected. 87 of 88 endpoint keys are `null`; pending mappers block requests even if a path is typed in.
* The mode-gated direct reads (patient detail's visit / lab / imaging / pharmacy / invoice tabs, "Last Visit", number suggestions) remain; they are correct in both modes but should move to the services when the patient / encounter contracts exist.
* The Dashboard stock banner still filters the medicine list itself (see low-stock above).
* `useMedicines()` on the Dashboard is not contract-gated; in API mode the call fails with `NotConnectedError` before any request, which is why the banner is simply absent.
* Mock-mode edits to Panels / Wards / Guardian / Diagnoses / Clinic Settings mutate shared demo arrays in memory and vanish on reload (as before).

### 13. Exact preparation status for Phase 5
* **Ready on the frontend:** service interfaces, mock and inert HTTP adapters, contract-status modules, loading / error / empty / contract-pending states for every migrated screen; exact-money handling; no screen in API mode shows demo data (verified in the browser where reachable, by server render and structural tests where not); 87 `null` keys + the `pending(...)` mappers listing exactly what each contract must supply.
* **Blocked on the backend / product owner (nothing can be wired without these):** paths, methods, request bodies and response schemas for every operation in §2b–§2m and the Master Data items above; the role / permission response; the low-stock rule; the ID form for prescriptions; the Item History audit shape and its admin permission.
* **First practical Phase 5 step, once credentials and the OpenAPI document exist:** confirm `auth.me`, then take one read-only list (e.g. patients or wards), fill its key and mapper, flip the mapper from `pending`, and run the module's browser suite against the development backend with development data only. Until then "frontend-prepared" must not be reported as "integrated".

## Phase 5A — Real contract: identity parser, Patients, Organisations (panels), Guardian relations

*Scope: the first modules connected to `docs/openapi.json` (supplied by the project owner; 170 operations, identical to the route list in `docs/backend-routes.md`, checked by script). Frontend only. Not Phase 5B. Stopped for review.*

**Four statuses, restated for this phase**
1. *Backend functionality documented* — **yes** for these modules: `docs/openapi.json`.
2. *Frontend-prepared* — yes (all earlier phases).
3. *Connected to a confirmed API contract* — **now true for:** the `GET /auth/me` parser, Patients (list / get / create / update / archive / restore), Organisations (`/panels` list / create) and Guardian relations (list / create). 11 of 93 endpoint keys are set; the other 82 are still `null` and unchanged.
4. *Live backend integration verified* — **none.** No credentials and no live response were used. Everything below was checked against the specification and a fake backend, not the real one.

### What was done
* `ENDPOINTS` (now 93 keys, 11 set): `auth.me`, `patients.list|get|create|update|delete|restore`, `organisations.list|create`, `guardianRelations.list|create`. New keys: `organisations.*`, `guardianRelations.*`, `patients.restore`. `patients.delete` is **`POST /patients/:id/archive`** because the spec says archive is "what the screens call Inactive or Delete".
* `http/wire.ts` (new): strict readers (`reqStr`, `optStr`, `reqUlid`, `reqDate`, `reqEnum`, `parsePage`, `pageQuery`). A response that does not match throws a `TypeError` naming the field (never the value); `perPage` above 100 is refused, not cut.
* `http/mappers.ts`: `parseCurrentUser` (permission list only), `parsePatient` / `parsePatientList`, `patientListQuery`, `patientCreatePayload`, `patientUpdatePayload`, `patientUpdateContext`, `parseOrganisation(List)`, `organisationPayload`, `parseGuardianRelation(List)`, `guardianRelationPayload`. The old `patientPayload` was removed.
* `http/patients.ts`, `http/reference.ts`: real adapters.
* UI: the patients list "Inactive" tab shows a contract-pending panel in API mode (decision 1); the patient form passes the record `version`, and its delete dialog says **Archive** (hidden, kept, restorable) in API mode; the dashboard's "Recently registered" widget now fetches **one page of 100** instead of every patient (the old `listAll` could have been up to 50 requests per dashboard load on a real database).
* Types: `PatientRecord.version?` (the API's `updatedAt`, sent back as `expectedUpdatedAt`). Mock mode ignores it.

### Decisions the spec does not make (each is a mapping choice, please confirm)
1. **"Inactive" filter.** The API has `includeArchived` (live and archived together) but no archived-only filter, so the tab is "not connected" rather than wrong.
2. **Status.** `archived` → "inactive"; otherwise `admitted` → "ipd"; otherwise "active". The UI has no deceased state, so `deceasedOn` is not shown.
3. **Active switch on the patient form** = archive / restore (the API has no active field on create / update). It is applied after the PATCH (archive) or before it (restore), so it is never silently dropped. If the PATCH fails after a restore, the record stays restored.
4. **Organisation.** The UI holds one panel; it maps to the `primary` coverage. Other coverages are read before every update and sent back, because `coverages` replaces the whole set. `coverages` is sent only when the primary changed.
5. **Guardian relation** is sent as `guardianRelationText` (the form's value is a name, not an id). It round-trips as `{id:null,name}`.
6. **Not sent:** `ssEmpNo` (no such field), `photoUrl` (no such field; file storage is not built), MR number / registration date / age (server-issued). `age` is computed from `dob`.
7. **Panels / relations cannot be created inactive** through the API; the adapters refuse rather than create an active one.
8. **Optimistic concurrency:** the loaded `updatedAt` is sent as `expectedUpdatedAt`. A stale edit is refused with `409 PATIENT_CHANGED` (documented in the spec; found in Phase 1); the UI shows the backend message with that heading and the support reference.

### Specification problems found (please raise with the backend team)
* **76 properties in 24 schemas are typed `array of string` where a nullable string is clearly meant** — e.g. `PatientDetailDto_Output.fatherName / cnic / city / email / address / area / country / guardianName / referredBy / remarks / photoUrl / medicalRecordNo / emergencyContact`, `UpdatePatientDto.email / country`, `AuthUserDto_Output.email / primaryLocationId`, and, in the `PanelResponseDto_Output` / `GuardianRelationResponseDto_Output` create responses, `contactPerson / phone / commissionPct / remarks`. The **list** DTOs type the same fields `string | null`. Phase 5A rejected arrays; **Phase 1 now accepts them** (first element used, one console warning per DTO.field) and a create whose 2xx answer cannot be read is reported as "Saved" instead of an error. What the real server sends is still **unverified**: it is the first thing to check against a live response. The full list is in `docs/SPEC_BUGS_FOR_BACKEND.md`.
* Id fields carry no ULID pattern in the spec; the mappers still require a ULID (the documented convention).
* The spec header says OpenAPI 3.0.0 but some schemas use 3.1-style `type: ["string","null"]`; harmless here.

### Not done / limits
* Doctors, wards, users, encounters, lab, imaging, pharmacy, billing and all reports keep their previous status. Several do not map 1:1 (see `docs/backend-routes.md`).
* `GET /patients/duplicates` and the 409 `POSSIBLE_DUPLICATE` flow (`acknowledgeDuplicates`) are not built: the form still warns by searching the phone number.
* Patient balance (`balance`, `/patients/{id}/account`), "Last Visit" and the visits / lab / billing tabs of the patient page are unchanged (still mode-gated).
* `/auth/me` is parsed but **not called by anything**; permission-based navigation is a separate decision (authentication and roles are out of scope here).
* The Master Data "Panels" and "Guardian Relations" tabs are still the mock-only tabs shown as "not connected" in API mode, although the services behind them now exist.
* Dev credentials: none used; the permission set a real role receives is unknown.

### Tests (frontend-only, against the specification and a fake backend — not backend verification)
* `src/lib/services/http/specValidate.ts` validates values against `docs/openapi.json`. `phase5a.test.ts` checks every fixture and every request body against the schemas, the exact requests the adapter sends, the status filter, archive / restore sequencing, and malformed-response rejection. `backendRoutes.test.ts` fails if `ENDPOINTS` holds a route that is not in the route list.
* Old tests that asserted "patients / panels / relations are not connected" were rewritten for the new truth (`patients`, `reference`, `readiness`, `services`, `backendRoutes`).
* Browser (Edge, production builds): `p5a-api.js` runs against a fake backend whose every response and request is validated against the spec (violations must be 0). Mock-mode regressions are identical to before. API-mode regressions differ only in "no request at all" and "no console error" assertions, which now see `GET /patients|/panels|/guardian-relations` and the test stub's 599.

## Phase 1 — Hardening of Patients, Panels and Guardian relations (offline)

*Scope: removes the known risks in the three connected modules before anything else is connected. Code, tests and docs only: **no request was sent to the real dev server** and no credentials were used. Stopped for review.*

**Statuses.** Connected to the confirmed contract: unchanged (the same 11 of 93 endpoint keys). Verified against the REAL backend: **none**. Verified against the specification and a fake spec-shaped backend: yes (below).

### What changed
* **Array-typed fields (Task 1).** `http/wire.ts`: `optStr` / `optDecimalString` accept string, null, undefined and `""`; an array is read as its first element (empty array = empty) and `console.warn("spec mismatch: <DTO>.<field> arrived as array")` is written **once per DTO.field per page load**. A first element that is not text/null, or any number/object, still throws. The mappers pass the real DTO names (`PatientDetailDto_Output`, `PatientPageDto_Output`, `PanelResponseDto_Output`, `PanelPageDto_Output`, `GuardianRelationResponseDto_Output`, `GuardianRelationPageDto_Output`). Requests never send an array: `UpdatePatientDto.email` / `country` are plain strings (`""` clears them, never `null`). The full list of 76 array-typed properties (73 single-value bugs + 3 ambiguous) is in `docs/SPEC_BUGS_FOR_BACKEND.md`.
* **Create safety (Task 2).** `SavedButUnreadableError` (errors.ts) and `createAndParse` (http/call.ts): a create that returns **2xx but whose body cannot be read** (non-JSON, empty, wrong shape) is reported as *saved*, never as an error that invites a retry; any non-2xx, network error or unbuilt body stays an ordinary failure. `classifyCreateError` (createOutcome.ts) turns an error into either `saved-unreadable` ("Saved. Refreshing the list.") or `failed` (heading chosen from the documented `code`, the backend's own `message`, `details`, and the `requestId`). A network error says the record "may or may not have been saved" (no "try again"). `invalidatingService` drops the cached lists after a saved-but-unreadable create. The patient form and both quick-add dialogs (organisation, relation) use it: `CreateErrorNote` shows the message with a small **"Support reference: <requestId>"** line; the unreadable case toasts "Saved. Refreshing the list.", refreshes/redirects to the list and never re-sends. `createSingleFlight` (lib/singleFlight.ts) lets only one save run at a time (a double click, or Register + Save & OPD + Save & IPD in the same tick, sends one request); the buttons are also disabled while saving. A patient registered with the Active switch off is archived right after; if that second call fails the patient already exists, so it is reported as saved ("could not be archived"), not as a failed registration.
* **Agreed decisions (Task 3)**, each checked in code: Archive label with the real backend (done in 5A, now with tests); **Restore** is now available: `PatientsService.restore` (POST /patients/{id}/restore), a "Restore Patient" button on the edit form and on the patient page for an archived patient (API mode only; the mock keeps its Active switch); the Inactive tab stays "Not connected"; one organisation = the primary coverage with secondary coverages kept on edit; SS/Emp and photo not sent; the dashboard widget now uses `loadRecentPatients` (one page of 100) in `services/recentPatients.ts`, so it is testable.
* **Headings for documented codes** (409 / 422 descriptions in the spec): `VALIDATION_FAILED`, `POSSIBLE_DUPLICATE`, `PANEL_INACTIVE`, `GUARDIAN_RELATION_INACTIVE`, `PANEL_NAME_TAKEN`, `GUARDIAN_RELATION_TAKEN`, `PATIENT_CHANGED`, `PATIENT_ARCHIVED`, `PATIENT_ADMITTED`, plus `NOT_FOUND`, `FORBIDDEN`, `AUTHENTICATION_REQUIRED`, `TOO_MANY_REQUESTS`. A test pins this list to the spec.

### Facts found in the spec while doing this (not guessed)
* `PATCH /patients/{id}` returns **422 `PATIENT_ARCHIVED`** for an archived patient, and **409 `PATIENT_CHANGED`** when `expectedUpdatedAt` is stale. So editing an archived patient requires a restore first (the update flow already restores before it PATCHes when the Active switch is on). The UI shows the backend message under the heading "This patient was changed by someone else" and the support reference; it does not yet offer a one-click reload.
* `POST /patients/{id}/archive` returns **422 `PATIENT_ADMITTED`** for an admitted patient.
* Phase 5A decision 8 ("the error code is unknown") is superseded by the line above.

### Limits / risks that remain
* Nothing here is verified against the real backend. Whether the real server sends arrays, strings or nulls for the 73 fields is unknown; the warning in the browser console will say so.
* A create whose connection drops before any answer arrives cannot be distinguished from "never reached the server" (status 0): the message tells the user to check the list before trying again. There is no idempotency key in the spec.
* `GET /patients/duplicates` and `acknowledgeDuplicates` are still not used.
* The mock path of the patient form now also goes through the single-flight guard and `CreateErrorNote` (same behaviour, verified by the mock browser suites).

### Tests
* `phase1.test.ts` (49): the scan of the whole spec for array-typed properties pins 76 in 24 schemas; every array-typed field of `PatientDetailDto_Output` as string / null / "" / array / empty array (13 fields), panel and relation fields, one warning per DTO.field, requests never contain arrays; for patient, panel and relation creates: (a) unreadable 2xx (HTML, empty, malformed JSON, wrong shape) is "saved" with exactly one POST, (b) non-2xx shows the backend message, heading, code and requestId with exactly one POST (400, 422, unknown code, 502 gateway page, network error), (c) double click sends one request; cache invalidation; the decision checks; the documented-codes table. A mutation check (four behaviours deliberately broken) made 23 of these tests fail, then they were restored.
* Browser (Edge, production builds) `p1-api.js`: the same scenarios through the real screens against the fake backend, including the deliberately unreadable answer.

## 3. Domain mapping conventions (boundary rules)

* **Wire** (documented): ULID string ids, money as decimal strings, ISO-8601 instants, `YYYY-MM-DD` dates.
* **UI legacy types** (`src/types/index.ts`) still use `number` ids and `number` money. They are **not** being rewritten
  wholesale; each module converts at its own boundary.
* **Service records** (`src/lib/services/types.ts`): `id: string` (opaque; validate with `isUlid` in the mapper),
  money as `number` for display (`DoctorRecord.fee`), instants/dates as strings. They are the only shapes the
  integrated screens see — never raw backend JSON.
* **Converters** live in `src/lib/api/convert.ts` and are used *only inside mappers*: `parseMoney("1500.00") → 1500`
  (throws on anything but a decimal string, so malformed data fails loudly instead of showing `NaN`), `formatMoney(1500) → "1500.00"`
  (two decimals follows the documented example — confirm per field), `isUlid`.
* The mock adapters translate between the legacy numeric ids (`User.id`, `Doctor.userId`) and string ids; that
  translation exists nowhere else.

**Unresolved decisions:** whether legacy modules (patients, encounters, billing…) migrate to string ids/decimal
strings or keep adapters; money precision per field; display formatting of instants (`lastLogin`); whether `fee`
stays a JS number (float risk is acceptable for display only, never for arithmetic that is posted back).

## 4. Authentication & session safety

* Login is unchanged from Phase 2 (`POST /api/v1/auth/login`, access token in memory, refresh cookie httpOnly).
* **`hms_session` is not authentication.** It is a JavaScript-set, forgeable cookie used only so the Next proxy can
  redirect visibly signed-out visitors to `/login`. It carries no identity/token and protects no data. The in-memory
  access token and the backend decide who is authenticated and what they may do.
* `role` and `permissions` on the session stay **unset (null)** until the backend contract defines them; unset grants
  nothing (`canSee`, `canSeeNav`, `RoleGate`). These are UI conveniences, not authorization.
* Known limitations (no behaviour is invented to work around them): logout clears frontend state only and the
  refresh cookie stays with the backend; a full page reload signs the user out; `/auth/me` is not called during login.
* Real-backend verification of login, `/auth/me` and every integration here is **BLOCKED** (no credentials / contract).

## 5. Mock data still in use

* Behind the service layer (mock adapters in `src/lib/services/mock/*`): `admin/users`, `admin/doctors`. Dev defaults
  to mock; **production builds default to the real API** (`NEXT_PUBLIC_HMS_DATA_SOURCE` overrides). No fallback from
  API to mock on failure.
* Patients (Phase 4B) are also behind the service layer (`mock/patients.ts`), but the modules around them still read `PATIENTS` / `getPatient()` directly (see §2b).
* Billing, Expenses and Bank (Phase 4H) are behind the service layer (`mock/finance.ts`), as are the Master Data Banks and Expense Categories tabs; the modules around them still read `src/data/billing` / `billingAggregate` directly (see §2i "Cross-module dependencies").
* The twelve report screens (Phase 4I) are behind the service layer (`mock/reports.ts` plus the existing services); see §2j.
* The Dashboard and the Financial Statistics screen (Phase 4J) are behind the service layer (`mock/dashboard.ts` plus the existing services); see §2k.
* The Master Data Services Catalog tab (with its Item History), the patient / encounter balance panels and the top-bar notifications (Phase 4K) are behind the service layer (`mock/crossModule.ts`, `mock/reports.ts` for the catalogue); see §2l. After Phase 4K the only direct readers of `billingAggregate` are the mock adapters themselves.
* **Phase 4K.1 (§2m):** the New Encounter prescription step now reads the pharmacy medicine service (contract-pending in API mode — it no longer shows demo medicines or stock), and Item History is the audit-log read only; the old invoice-usage list is a separate, mock-only "Invoice usage (demo)" tab (`serviceUsageService`).
* **Post-4K.1 audit:** the master-data tabs below are now API-pending (`MockModeOnly`), the ICD lookup is "not connected" in API mode, and `PatientInfoPanel` uses `useOrganisations`; see "Cross-Module Integration Audit and Cleanup — Post-Phase 4K.1".
* Not touched (still direct imports of `src/data/*`, as of Phase 4K): the master-data tabs other than Lab Tests, ECG/Ultrasound, Banks, Expense Categories and Services Catalog, the invoice rows and visit list inside the patient detail page (mock mode only), and ~~~15 modules reading `data/doctors.ts`~~ *(inaccurate: none do any more — the Post-4K.1 audit verified that no screen, component or lib file imports `@/data/doctors`)* (incl.
  `QuickAddDoctorDialog`, which — since Phase 4C — creates through `doctorsService` and fails with "awaiting the backend contract" in API mode
  instead of creating a local-only doctor). Enabling `api` mode only affects the migrated screens; the other modules keep showing demo
  doctors/patients until they are migrated (see §2c).

## 6. Testing

Frontend-only unit tests with controlled inputs (`npm test`): endpoint resolution and request construction through the
shared client, adapters inert while unconfirmed, mock-adapter behaviour, validation, state selection, `BACKEND_URL`
validation (`src/lib/backendUrl.test.ts`), converters. `it.todo` entries in `readiness.test.ts` list the mapper tests to
write with real sample payloads. CI builds with a non-secret placeholder `BACKEND_URL=https://hms-backend.invalid`
(`.invalid` never resolves); no CI step contacts a backend.

When the contract is available: fill `endpoints.ts` + `mappers.ts`, set `NEXT_PUBLIC_HMS_DATA_SOURCE=api`, and
exercise each screen against the **development** backend with development test data only.
