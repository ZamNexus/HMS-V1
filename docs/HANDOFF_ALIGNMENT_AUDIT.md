# Handoff alignment audit: Phases 1 to 4

**Date:** 2026-11-07. **Scope:** Phase 1 (foundations), Phase 2 (authentication and permissions), Phase 3 (patients, panels, guardian relations), Phase 4 (clinic setup).
**Reference:** `HMS Frontend Integration Handoff.md` (the agreed contract), with `docs/openapi.json` for field shapes. The backend does not exist yet and will be built from the same handoff, so this audit checks one thing: **does the frontend send and read exactly what the handoff says**, not whether a server accepts it. Nothing here was run against a backend.

**Method.** (1) Every connected endpoint (method and path) was cross-checked by script against the handoff tables (68 of 68 found, none differing; re-run after S12, S13 and Item History were connected). (2) Every permission name used by the UI was checked against the section 5 role matrix (all valid). (3) Every handoff error code was searched in the source. (4) The client, cache, session, permission and Phase 4 code was read against sections 2 to 8. (5) tsc, eslint (0 errors), 910 unit tests, `npm run types:check` (both generated type files match their contracts) and an API-mode production build were run after the fixes. **No browser run or backend run covers the screens added in the second pass** (see section H).

## Result

Phases 1 to 4 are **consistent** with the handoff for everything they implement, and a backend developer can implement their surfaces from the handoff, `openapi.json` and `docs/BACKEND_CONTRACT_PROPOSED.md` without meeting conflicting endpoint or data-structure definitions. After the second pass (section H) **no chunk of Phases 1 to 4 is missing**: Expense Categories (S12), Bank Accounts (S13) and Item History (D8) are built against the proposed contract. **Not everything is finished**: the open items are listed exactly in sections B2, C and E, and none of the new screens has been run against a server or in a browser. The first pass found and fixed **five** frontend deviations (section B1); the second pass closed the items in section H.

## A. Fully aligned with the handoff

| Area | What was checked | Evidence |
| --- | --- | --- |
| Endpoints | 68 connected keys: method and path | script, handoff tables 8.x and 9 |
| Sign-in | body `{ hospitalCode, identifier, password }`; `/auth/me` user fields; refresh with no body and `credentials: include`; change-password, logout, logout-all, `/public/hospital?host=` | `session.ts`, `sessionUser.ts` |
| Session | token in memory only; boot refresh with a neutral splash; proactive refresh 60 s before expiry; one shared refresh; `SESSION_ROTATED` retried once; `TOKEN_EXPIRED` refresh and repeat once; `BroadcastChannel` sign-out; sign-out clears state even offline; 12 h shift-end note; forced password change that allows only me, change-password and logout; password rules shown first | Phase 2 code and tests |
| Auth error codes | all session-over codes (`AUTHENTICATION_REQUIRED`, `INVALID_TOKEN`, `SESSION_ENDED`, `SESSION_EXPIRED`, `SESSION_REUSED`, `SESSION_INVALID`, `SESSION_MISSING`); lockout countdown from `details.retryAfterSeconds`; `FORBIDDEN` never signs out | `client.ts` |
| Client rules | relative `/api/v1`; 30 s timeout; GET retried twice (1 s, 3 s) on network or 5xx; 4xx never retried; 429 waits `Retry-After` or 60 s; offline banner and writes blocked; `X-Request-Id` kept and shown; no automatic retry of a write after a network failure, timeout or 5xx | `client.ts`, `client.rules.test.ts` |
| Caching | cache-class table values identical to section 6; scoped keys start with hospital and user; cache cleared on sign-out and user change; nothing persisted; search debounced 300 ms from 2 characters with the previous request aborted; pickers use `perPage=6` | `cacheClasses.ts`, `query/*` |
| Permissions | every permission name the UI uses is in the section 5 matrix; menu and route gates use permission AND module; unknown route is denied by default; Phase 4 gates match sections 5 and 8 (users.read/write, catalogs.read/write, settings.write, ipd.read for ward reads) | script, `permissions.ts` |
| Forms and errors | one submit at a time; `400 VALIDATION_FAILED` details shown under the field; `*_CHANGED` reload banner that keeps typed values; `*_TAKEN` shown on its field; request id shown on error screens | Phase 1, 2 and 4 code |
| Money to the API | every money value sent is a string with 2 decimals | payload unit tests against the DTO schemas |
| Time | instants shown in the hospital time zone and "today" from `GET /settings` on every Phase 4 screen | `formatInstant`, `hospital.ts` |
| Phase 4 shapes | requests and responses of settings, modules, services, lab tests, imaging tests, wards and beds, users, ICD-10 match the DTOs in `openapi.json`; ids are ULID strings everywhere | unit tests validate payloads against the schemas |

## B. Implemented but inconsistent with the handoff

### B1. Found and FIXED in this audit

| # | Deviation | Handoff | Fix |
| --- | --- | --- | --- |
| 1 | A write answered `409 TRANSACTION_CONFLICT` was never repeated (an earlier, stricter reading) | 4 and 7: "safe to retry once automatically" | The client repeats such a write exactly once after 250 ms; every other write failure is still never re-sent; tests cover once, only once, other 409 codes, GET |
| 2 | Phase 4 view-models turned money into JavaScript numbers (`rate`, `fee`, `dailyRate`, `consultationFee`) | 4 and go-live: money is a string end to end, never `parseFloat` | Phase 4 screens read, edit, compare and send the exact text ("1500.00") through `moneyText` (BigInt-based, no float). The old numeric fields remain only for the demo-shaped screens, and the text wins when both are present |
| 3 | A doctor's profile and fee were edited through `PATCH /users/{id}` | 8.1 and 9: `PATCH /users/{id}/doctor-profile` | Added `usersAdmin.doctorProfile`; changed profile fields only; the profile travels with the role change only when a user becomes a doctor; a half-saved attempt is reported |
| 4 | Master Data lists used cache time 0 | 6: reference data is 10 minutes, invalidated by Master Data writes | Panels, relations, services, lab, imaging, wards and ICD lists use the reference class; every write already invalidates its family; admissions and discharges now also refresh the admin ward list |
| 5 | The ICD lookup returned only the name and code | 8.5: a diagnosis is `{ icdCodeId?, text?, isPrimary }` | The lookup callback now also returns the ICD record id (API mode) |

### B2. Found and NOT fixed: owned by a later phase (frontend side is known and tracked)

| # | Deviation | Handoff | Owner |
| --- | --- | --- | --- |
| 1 | ~~Patient edit sends every field, not only changed ones; no estimatedAge; acknowledgeDuplicates never sent; list ignores dobEstimated, deceasedOn, balance; age uses the browser clock~~ **Fixed in Phase 5 (section I).** Still open from this row: none for Phase 5; the 'Active' tab keeps meaning 'not admitted' | 4 and 8.3 | Phase 5 (done) |
| 2 | The legacy `formatCurrency` (hard-coded "Rs.", whole rupees) is still used by 66 call sites in unmigrated screens | 4: format with the hospital's `currencyCode`, exact cents | each module chunk (A5 gave the helpers) |
| 3 | Unmigrated screens use the browser clock and `new Date()` for "today" and ages | 4 | each module chunk |
| 4 | The imaging order form picks from the lab catalogue's Radiology and Cardiology categories, but the API has a separate imaging catalogue (`/imaging-tests`) and lab tests never have those categories | 8.7, 8.8 | I2 (Phase 9); the form is contract-pending in API mode until then |
| 5 | The quick-add TEST dialogs follow the demo shape and refuse in API mode. (The quick-add DOCTOR dialog was fixed in the second pass: in API mode it points to Admin > Doctors.) | 8.1, 8.2 | L2, I2 and the billing chunks |
| 6 | `resolveDataSource` honours `NEXT_PUBLIC_HMS_DATA_SOURCE=mock` even in a production build | 2 and go-live: mock data unreachable in production builds | G4 (Phase 12) |

## C. Partially implemented

| Item | State |
| --- | --- |
| Keeping unsaved form text when a session ends and restoring it after sign-in (3.7, 7) | Wired in the second pass for the long free-text fields of Phase 4 (imaging report template, new-ward bed list, user and doctor notes): memory only, same user only, kept only when the session ended under the user's hands, released when a form closes any other way. The other Phase 4 forms are short; the long clinical forms are Phases 5 to 10 and must use `useDraftState` |
| Doctor picker `GET /doctors` (S10) | Mapped and unit-tested (a `schedule` object in the answer is ignored, tested); no connected screen mounts it yet, because the screens that need a doctor are Phases 7 to 10 |
| Patients (Phase 3) | list, get, create, update, archive, restore are connected; duplicates, death, encounters, account are not (Phase 5 and later) |
| `422 MODULE_DISABLED` (5) | Shared handling done in the second pass: the heading names the department from `details.module`, the backend's own message is shown, and a write refused this way makes the session re-read the settings so menus and screens follow. The per-screen use (for example the encounter form) arrives with Phases 7 to 10 |
| "Hide what the user can never do; disable what they can't do now, with the reason as a tooltip" (5) | applied on the Phase 4 screens; the older screens are not yet consistent |

## D. Missing implementation (inside Phases 1 to 4): none left

| Item | State |
| --- | --- |
| S12 Expense categories tab | BUILT in the second pass (list, search, active filter, add, rename, deactivate and reactivate, `EXPENSE_CATEGORY_NAME_TAKEN`), against the proposed contract section 1 |
| S13 Bank accounts tab | BUILT in the second pass; visible only with `accounts.read`, changes need `catalogs.write`; proposed contract section 2 |
| D8 Item History | BUILT in the second pass: `GET /audit-entries`, a button gated by `audit.read` on every Phase 4 list, the Users and Doctors screens and Clinic Settings (13 entity types); the entry fields are the proposed contract section 3 |

## E. Ambiguous or missing information in the handoff (documented, not guessed)

1. **Filters in the URL.** Section 6 says filters live in the URL and gives `?search=ali`; section 7 says names, phones and CNICs never go in the address bar. The frontend follows section 7 (search only as a fetch parameter; page and non-identifying filters may be in the URL, not yet done). Please confirm.
2. **Idle lock.** Section 7 asks to "cover the screen and ask for the password again", but section 3 has no endpoint that verifies a password without a new sign-in. The frontend signs out after 15 minutes and keeps unsaved text in memory. Please say if a verify endpoint will exist.
3. **`GET /doctors` and `schedule`.** Section 8.11 says each doctor carries `schedule` for the Available Days column; `openapi.json` lists only `id, name, specialization, qualifications, consultationFee` for `GET /doctors`. **Resolved in Phase 6 for the schedule itself:** `openapi.json` gives the days as `mon` to `sun` and the answer of `GET /doctors/{id}/schedule`, which the schedule editor and the booking grid use. The frontend still ignores a `schedule` object inside the `GET /doctors` answer; the Doctors report column (Phase 11) needs the backend to say whether it is sent.
4. **Which permission opens a Master Data tab.** Section 5 says all tabs need `catalogs.read`; 8.2 says bank accounts are read with `accounts.read`; 8.5 says wards are read with `ipd.read`. The frontend gates each tab by its endpoint's permission and explains when it is missing.
5. **The permission list.** `openapi.json`'s permission enum has no `accounts.*` or `audit.read`, although sections 5 and 8 use them. The frontend follows the handoff and keeps permissions exactly as sent.
6. **ECG and Ultrasound tabs.** Section 8.2 calls them tabs; section 9 maps them to one imaging catalogue filtered by `modality`. The frontend shows one "Imaging Tests" tab with a modality filter. Say if two separate tabs are wanted.
7. **Expense categories, bank accounts, Item History.** The shapes are not in `openapi.json`; proposed in `BACKEND_CONTRACT_PROPOSED.md`, and the second pass built the screens against that proposal. If the backend chooses other field names, only the mappers in `src/lib/services/http/{expenseCategories,bankAccounts,itemHistory}.ts` change.
8. **Module switched off.** Section 5 says lab screens need the `lab` module; it does not say whether the Master Data Lab, Imaging and Wards tabs hide when their module is off. They stay visible.
9. **Schema typing defects** in `openapi.json` (single text fields typed as arrays, `turnaroundHours`, `reportTemplate`, `UpdateUserDto.email`): the frontend tolerates them (`SPEC_BUGS_FOR_BACKEND.md`); the backend should fix them.
10. **`PATCH /users/{id}`** is described as "name, contact, role" but its schema also accepts `username`, `email` and `doctorProfile`. The frontend sends the profile only through the dedicated endpoint, except when a user becomes a doctor.

## F. Cross-module contracts verified

| Shared entity | Used consistently |
| --- | --- |
| Patient id (ULID) | patients, panels coverages, later modules |
| Doctor id = the user's id | `usersAdmin` (S9), `GET /doctors` picker (S10), encounters and appointments (`doctorId`) |
| Panel id | Master Data panels, patient coverages (`panelId`) |
| Service, lab test, imaging test ids (ULID) | catalogs (S5 to S7) and the order and invoice bodies (`serviceId`, `testId`); **exception B2-4** |
| ICD code id | `GET /icd-codes` (S11) and encounter diagnoses (`icdCodeId`), now passed through |
| Ward and bed ids | wards admin (S8) and admission (`bedId`); the bed board uses `GET /wards/occupancy` (E7/E8) |
| Hospital settings (`today`, `timezone`, `currencyCode`) | read once, used by every Phase 4 screen |
| Permissions and modules | one rule table for menu, route and button |

## G. Every key the handoff's section 9 names (88), and its state in the frontend (24 connected)

The frontend has 132 keys in total: more than the handoff's table, because the handoff advises one key per action (deactivate, reactivate, bed and module actions, and so on). Those extra routes are all in the handoff's section 8 tables, and the script check found each one.

| Frontend key | Handoff (section 9) | State |
| --- | --- | --- |
| `auth.me` | `GET /auth/me` | CONNECTED: GET /auth/me |
| `users.list` | `GET /users` · `POST /users` · `PATCH /users/:id` | not connected (null): replaced: Admin > Users uses `usersAdmin.*` (S9, connected) |
| `users.create` | `GET /users` · `POST /users` · `PATCH /users/:id` | not connected (null): replaced: Admin > Users uses `usersAdmin.*` (S9, connected) |
| `users.update` | `GET /users` · `POST /users` · `PATCH /users/:id` | not connected (null): replaced: Admin > Users uses `usersAdmin.*` (S9, connected) |
| `users.setActive` | `POST /users/:id/deactivate` · `/reactivate` | not connected (null): replaced: Admin > Users uses `usersAdmin.*` (S9, connected) |
| `doctors.list` | `GET /users?role=doctor` (Admin → Doctors); `GET /doctors` (pickers) | CONNECTED: GET /doctors |
| `doctors.create` | `POST /users` with `role: "doctor"` + `doctorProfile` | not connected (null): list connected (picker, S10); create/update replaced by `usersAdmin.create` / `usersAdmin.doctorProfile` (S9/S10) |
| `doctors.update` | `PATCH /users/:id/doctor-profile`; hours via `PUT /doctors/:id/schedule` | not connected (null): list connected (picker, S10); create/update replaced by `usersAdmin.create` / `usersAdmin.doctorProfile` (S9/S10) |
| `patients.list` | `GET /patients` · `GET /patients/:id` | CONNECTED: GET /patients |
| `patients.get` | `GET /patients` · `GET /patients/:id` | CONNECTED: GET /patients/:id |
| `patients.create` | `POST /patients` · `PATCH /patients/:id` | CONNECTED: POST /patients |
| `patients.update` | `POST /patients` · `PATCH /patients/:id` | CONNECTED: PATCH /patients/:id |
| `patients.delete` | `POST /patients/:id/archive` | CONNECTED: POST /patients/:id/archive |
| `encounters.list` | `GET /encounters` · `GET /encounters/:id` | not connected (null): Phase 7 (E1-E12) |
| `encounters.get` | `GET /encounters` · `GET /encounters/:id` | not connected (null): Phase 7 (E1-E12) |
| `encounters.create` | `POST /encounters/opd` or `POST /encounters/ipd` | not connected (null): Phase 7 (E1-E12) |
| `encounters.discharge` | `POST /encounters/:id/discharge` | not connected (null): Phase 7 (E1-E12) |
| `wards.list` | `GET /wards`; bed board `GET /wards/occupancy` | not connected (null): list: Phase 7 (E7/E8 need beds per ward, `GET /wards/occupancy`); admin view connected as `wardsAdmin.*` (S8) |
| `labTests.list` | `GET` · `POST /lab-tests` · `PATCH /lab-tests/:id` | CONNECTED: GET /lab-tests |
| `labTests.create` | `GET` · `POST /lab-tests` · `PATCH /lab-tests/:id` | CONNECTED: POST /lab-tests |
| `labTests.update` | `GET` · `POST /lab-tests` · `PATCH /lab-tests/:id` | CONNECTED: PATCH /lab-tests/:id |
| `ecgTests.list` | `GET /imaging-tests?modality=ECG` (or `Ultrasound`) · `POST /imaging-tests` · `PATCH /imaging-tests/:id` | CONNECTED: GET /imaging-tests |
| `ecgTests.create` | `GET /imaging-tests?modality=ECG` (or `Ultrasound`) · `POST /imaging-tests` · `PATCH /imaging-tests/:id` | CONNECTED: POST /imaging-tests |
| `ecgTests.update` | `GET /imaging-tests?modality=ECG` (or `Ultrasound`) · `POST /imaging-tests` · `PATCH /imaging-tests/:id` | CONNECTED: PATCH /imaging-tests/:id |
| `labOrders.list` | `GET` · `GET /lab-orders/:id` · `POST /lab-orders` | not connected (null): Phase 9 (L1-L7) |
| `labOrders.get` | `GET` · `GET /lab-orders/:id` · `POST /lab-orders` | not connected (null): Phase 9 (L1-L7) |
| `labOrders.create` | `GET` · `GET /lab-orders/:id` · `POST /lab-orders` | not connected (null): Phase 9 (L1-L7) |
| `labOrders.transition` | `…/specimens/:specimenId/collect` · `/reject`, `…/tests/:testId/verify` · `/amend` · `/cancel`, `/deliver` | not connected (null): Phase 9 (L1-L7) |
| `labOrders.enterResults` | `PUT /lab-orders/:id/tests/:testId/result` | not connected (null): Phase 9 (L1-L7) |
| `imagingOrders.list` | `GET` · `GET /imaging-orders/:id` · `POST /imaging-orders` | not connected (null): Phase 9 (I1-I5) |
| `imagingOrders.get` | `GET` · `GET /imaging-orders/:id` · `POST /imaging-orders` | not connected (null): Phase 9 (I1-I5) |
| `imagingOrders.create` | `GET` · `GET /imaging-orders/:id` · `POST /imaging-orders` | not connected (null): Phase 9 (I1-I5) |
| `imagingOrders.transition` | `…/tests/:testId/perform` · `/sign` · `/amend` · `/cancel`, `/deliver` | not connected (null): Phase 9 (I1-I5) |
| `imagingOrders.enterReport` | `PUT /imaging-orders/:id/tests/:testId/report` | not connected (null): Phase 9 (I1-I5) |
| `medicines.list` | `GET` · `POST /medicines` · `PATCH /medicines/:id` | not connected (null): Phase 10 (PH1-PH3) |
| `medicines.create` | `GET` · `POST /medicines` · `PATCH /medicines/:id` | not connected (null): Phase 10 (PH1-PH3) |
| `medicines.update` | `GET` · `POST /medicines` · `PATCH /medicines/:id` | not connected (null): Phase 10 (PH1-PH3) |
| `medicines.adjustStock` | `POST /medicines/:id/batches` (receive), `POST /medicine-batches/:id/write-off`, `POST /medicine-batches/:id/adjust` | not connected (null): Phase 10 (PH1-PH3) |
| `dispensing.list` | `GET /dispenses` · `POST /dispenses` | not connected (null): Phase 10 (PH5-PH8) |
| `dispensing.create` | `GET /dispenses` · `POST /dispenses` | not connected (null): Phase 10 (PH5-PH8) |
| `consultationInvoices.list` | `GET /invoices?sourceType=consultation` | not connected (null): Phase 8 (replaced by check-in, E2) |
| `consultationInvoices.create` | None: the consultation is charged by `POST /encounters/opd` | not connected (null): Phase 8 (replaced by check-in, E2) |
| `servicesInvoices.list` | `GET /invoices?sourceType=service` · `POST /invoices` | not connected (null): Phase 8 (B2/B3) |
| `servicesInvoices.create` | `GET /invoices?sourceType=service` · `POST /invoices` | not connected (null): Phase 8 (B2/B3) |
| `payments.list` | `GET /payments?type=payment` · `POST /payments` | not connected (null): Phase 8 (B4) |
| `payments.create` | `GET /payments?type=payment` · `POST /payments` | not connected (null): Phase 8 (B4) |
| `receipts.list` | `GET /payments?type=advance` · `POST /advances` | not connected (null): Phase 8 (B5) |
| `receipts.create` | `GET /payments?type=advance` · `POST /advances` | not connected (null): Phase 8 (B5) |
| `expenseCategories.list` | `GET` · `POST /expense-categories` · `PATCH /expense-categories/:id` | CONNECTED: GET /expense-categories (fields: proposed contract section 1) |
| `expenseCategories.create` | `GET` · `POST /expense-categories` · `PATCH /expense-categories/:id` | CONNECTED: POST /expense-categories (proposed) |
| `expenseCategories.update` | `GET` · `POST /expense-categories` · `PATCH /expense-categories/:id` | CONNECTED: PATCH /expense-categories/{id} (proposed) |
| `expenseCategories.remove` | `POST /expense-categories/:id/deactivate` | CONNECTED: POST /expense-categories/{id}/deactivate (proposed); reactivate is its own key |
| `expenses.list` | `GET /expenses` · `POST /expenses` | not connected (null): Phase 11 (X1/X2), blocked: not in openapi.json |
| `expenses.create` | `GET /expenses` · `POST /expenses` | not connected (null): Phase 11 (X1/X2), blocked: not in openapi.json |
| `expenses.totals` | `GET /reports/expenses` (or `totalAmount` on `GET /expenses`) | not connected (null): Phase 11 (X1/X2), blocked: not in openapi.json |
| `bankAccounts.list` | `GET` · `POST /bank-accounts` · `PATCH /bank-accounts/:id` | CONNECTED: GET /bank-accounts (fields: proposed contract section 2) |
| `bankAccounts.create` | `GET` · `POST /bank-accounts` · `PATCH /bank-accounts/:id` | CONNECTED: POST /bank-accounts (proposed) |
| `bankAccounts.update` | `GET` · `POST /bank-accounts` · `PATCH /bank-accounts/:id` | CONNECTED: PATCH /bank-accounts/{id} (proposed) |
| `bankTransactions.statement` | `GET /bank-accounts/:id/statement` · `POST /bank-transactions` | not connected (null): Phase 11 (X3/X4), blocked: not in openapi.json |
| `bankTransactions.create` | `GET /bank-accounts/:id/statement` · `POST /bank-transactions` | not connected (null): Phase 11 (X3/X4), blocked: not in openapi.json |
| `reports.dailySummary` | `GET /reports/daily-summary` | not connected (null): Phase 11 (D2-D7) |
| `reports.dailyTransactions` | `GET /charges` + `GET /payments` | not connected (null): Phase 11 (D2-D7) |
| `reports.opdStatistics` | `GET /reports/opd` · `GET /reports/revenue` | not connected (null): Phase 11 (D2-D7) |
| `reports.revenue` | `GET /reports/opd` · `GET /reports/revenue` | not connected (null): Phase 11 (D2-D7) |
| `reports.laboratory` | `GET /reports/lab` · `GET /reports/pharmacy` | not connected (null): Phase 11 (D2-D7) |
| `reports.pharmacy` | `GET /reports/lab` · `GET /reports/pharmacy` | not connected (null): Phase 11 (D2-D7) |
| `reports.expenseTrend` | `GET /reports/expenses`, one call per period shown | not connected (null): Phase 11 (D2-D7) |
| `reports.demographics` | `GET /reports/demographics` | not connected (null): Phase 11 (D2-D7) |
| `reports.patientBalances` | `GET /reports/outstanding/patients` | not connected (null): Phase 11 (D2-D7) |
| `reports.organisationBalances` | `GET /reports/outstanding` (by Panel) · `GET /panels/:id/account` | not connected (null): Phase 11 (D2-D7) |
| `reports.patientAccountSummary` | `GET /patients/:id/account` | not connected (null): Phase 11 (D2-D7) |
| `reports.accountsPayments` | `GET /payments?type=payment` · `GET /payments?type=advance` | not connected (null): Phase 11 (D2-D7) |
| `reports.accountsReceipts` | `GET /payments?type=payment` · `GET /payments?type=advance` | not connected (null): Phase 11 (D2-D7) |
| `reports.prescriptionHistory` | `GET /prescriptions` | not connected (null): Phase 11 (D2-D7) |
| `serviceCatalog.list` | `GET` · `POST /services` · `PATCH /services/:id` | CONNECTED: GET /services |
| `serviceCatalog.create` | `GET` · `POST /services` · `PATCH /services/:id` | CONNECTED: POST /services |
| `serviceCatalog.update` | `GET` · `POST /services` · `PATCH /services/:id` | CONNECTED: PATCH /services/:id |
| `itemHistory.list` | `GET /audit-entries?entityType=service_catalog_item&entityId=` | CONNECTED: GET /audit-entries (path, permission and entity types from the handoff; entry fields: proposed contract section 3) |
| `billSummary.patient` | `GET /patients/:id/account` · `GET /encounters/:id/invoice` | not connected (null): Phase 8 (B1) |
| `billSummary.encounter` | `GET /patients/:id/account` · `GET /encounters/:id/invoice` | not connected (null): Phase 8 (B1) |
| `dashboard.summary` | `GET /dashboard` (one call: `patientFlow`, `revenue.last7Days`) | not connected (null): Phase 11 (D1) |
| `dashboard.weeklyVisits` | `GET /dashboard` (one call: `patientFlow`, `revenue.last7Days`) | not connected (null): Phase 11 (D1) |
| `dashboard.revenueTrend` | `GET /dashboard` (one call: `patientFlow`, `revenue.last7Days`) | not connected (null): Phase 11 (D1) |
| `dashboard.upNext` | `GET /appointments?date=<today>` | not connected (null): Phase 11 (D1) |
| `dashboard.cashFlow` | `GET /reports/cash-flow?date=<today>` | not connected (null): Phase 11 (D1) |
| `statistics.summary` | `GET /reports/financial-summary` | not connected (null): Phase 11 (D5) |
| `statistics.records` | Per tab (8.11): `GET /charges`, `/payments`, `/expenses`, `/invoices`, statements | not connected (null): Phase 11 (D5) |
| `statistics.dailyCheckupRevenue` | `GET /reports/revenue/daily?sourceType=consultation` | not connected (null): Phase 11 (D5) |

## Verification statement

Static contract inspection, TypeScript, lint, a production build, 874 unit tests (none use a test backend) and the earlier test-backend browser runs (Phase 3 and 4, which are NOT new in this audit and say nothing about a real server). **Nothing was verified against a real backend.**

## H. Second pass (2026-11-07): "fix them completely"

| # | What was missing or wrong | What was done | How it was checked |
| --- | --- | --- | --- |
| 1 | S12 Expense Categories tab not built | `ExpenseCategoriesTab`: server paging, debounced search, active filter, add, rename, deactivate/reactivate, name-taken note with "show the existing one"; writes need `catalogs.write` | tsc, eslint, unit tests of the mapper and payloads against `openapi.draft.json`, build |
| 2 | S13 Bank Accounts tab not built | `BankAccountsTab`: the same pattern; the tab is hidden without `accounts.read`; account number rules (4 to 34, letters, digits, spaces, hyphens); an emptied branch is sent as `null` | same |
| 3 | D8 Item History not built; the services button was disabled for everyone | `GET /audit-entries`; one `ItemHistoryButton` (only against the API and only with `audit.read`) on services, lab, imaging, panels, relations, wards, beds, expense categories, bank accounts, users, doctors and Clinic Settings; each change reads "Field: from → to"; no actor reads "System"; values are text only | same, plus a test that every Phase 4 list has the button |
| 4 | `MODULE_DISABLED` had no handling | heading from `details.module`; every wrapped write refused this way re-reads the settings | unit tests |
| 5 | The quick-add doctor dialog could only fail in API mode | points to Admin > Doctors (needs `users.write`) | source test |
| 6 | Unsaved form text was never kept | `useDraftState` on the Phase 4 long free-text fields | unit tests of the draft rules |
| 7 | The spec validator rejected `null` for `allOf` + `nullable` | fixed (a test tool only, never shipped) | unit tests |

**Browser verification (added the same day):** items 1 to 6 were later run in a browser against the test backend: S12, S13 and Item History 39/39 (new script), S10 23/23 (updated to the doctor-profile endpoint). Still **not verified against a real server** (none exists).

## I. Phase 5 (2026-11-07): patients, PT1 to PT7

The owner asked for Phase 5 to start; it is **done against the test backend, not closed**. It is unit-tested, the API-mode build compiles, the new browser suite `p5-api.js` passes 68/68 (every request and response checked against `openapi.json`) and the demo-mode smoke `p5-mock.js` passes 14/14. **Not verified against a real server.**

| Handoff rule (8.3, 4, 6, 7) | Frontend |
| --- | --- |
| One `search` matches name, MR no., phone, CNIC; filters `gender, panelId, selfPay, admitted, registeredFrom, registeredTo, includeArchived` | all sent as documented; search 300 ms from 2 characters, previous request aborted, never in the address bar |
| Filters live in the URL, but no names, phones or CNICs in the address bar | `page, view, gender, panel, from, to` only (an allowlist); search stays in the page |
| Never show a predicted MR number | 'Assigned on registration' |
| Date of birth or estimated age, exactly one; `dobEstimated` shows '~45 yrs' | radio choice, validated before sending; shown with '~' |
| `coverages[]`: at most one primary and one secondary; sending replaces the set; `[]` = self-pay | two slots with member details; the full set is sent back when it changed |
| Duplicates: inline warning on blur; `409 POSSIBLE_DUPLICATE` with `details.matches`; resend with `acknowledgeDuplicates`; archived matches offer Restore | all three; one extra POST only after the user confirms |
| PATCH: changed fields + `expectedUpdatedAt`; `409 PATIENT_CHANGED` | changed fields only; banner keeps the typed values; Load latest |
| Archive / restore (`patients.archive`), record / revoke death (`patients.record_death`) | separate actions by permission; `PATIENT_ADMITTED` and `PATIENT_ARCHIVED` explained |
| `balance` only for `billing.read` | column shown only then; null prints '—' |
| Age on the hospital calendar, not the browser's | `formatPatientAge(…, GET /settings today)`; '—' until the settings load |
| Prefetch on intent | hovering a row prefetches the record |

**Decisions the handoff leaves open** (documented, not guessed): (1) the API has no archived-only filter, so the old 'Inactive' tab is replaced by a **With archived** view (live and archived together, archived rows marked); (2) `sort` is listed without values, so none is sent (the server default is newest first); (3) the 'Active' tab means **not admitted** (it matches the status badge); (4) the stored phone format is unknown, so it is displayed from E.164 when it looks like a Pakistani mobile and otherwise as stored, and the user's typed text is sent as typed.

**Found by the browser run:** nothing wrong in the app. The one gap noticed while writing the conflict check was fixed first (after "Load latest" the untouched fields now show the fresh record, not the old one).

**Still open in or around Phase 5:** the 'Save & OPD/IPD ticket' buttons wait for visits (Phase 7); the Visits, Lab and Billing tabs of the profile are Phases 7 to 10; the legacy numeric `age` field still exists for unmigrated screens (browser clock); the other Phase 4 lists do not keep page and filters in the address bar yet; the photo and the SS/Emp number are not collected against the API (no fields).

## J. Phase 6 (2026-11-07): appointments and doctor schedules, AP1 to AP4

Done against the test backend, not closed: unit-tested (30 tests, including an exhaustive check that no button is ever shown for an action the API did not allow), the API-mode build compiles, and the browser suite `p6-api.js` passes 67/67 with every request and response checked against `openapi.json`. **Not verified against a real server.**

| Handoff rule (8.4) | Frontend |
| --- | --- |
| `GET` / `PUT /doctors/{id}/schedule`: `{ days, from, to, slotMinutes }`; `days: []` takes the doctor off appointments | the schedule editor on Admin > Doctors replaces the whole schedule in one PUT; looking needs `doctors.read`, changing `users.write` |
| `GET /doctors/{id}/slots?date=`: `free`, `booked`, `passed` | the slot grid; only a free slot can be chosen; refreshed every 30 s while open |
| Book from the slot grid; `time` must be a free slot start; `409 SLOT_TAKEN` means reload the slots | the dialog sends the slot start; SLOT_TAKEN reloads the grid, clears the choice and keeps the typed notes |
| `PATIENT_ALREADY_BOOKED`, `NOT_A_SLOT`, `SLOT_PASSED`, `APPOINTMENT_*` errors | each has its own heading and the backend's message |
| Show exactly the buttons in `allowedActions` | `visibleActions`: allowed AND permitted, fixed order; never a button the API did not list |
| Nothing is charged at booking | said in the dialog; no billing call |
| Booked appointments are never moved when the hours change; `outsideSchedule: true` | flagged 'Outside hours' in the list and explained in the detail |
| Today's appointments are a worklist (15 to 30 s) | 15 s, polled every 30 s, refetch on focus |
| Check-in: `POST /encounters/opd` with `appointmentId` | **not built here** (Phase 7, AP5): 'Check in' is shown but off, with the reason |

**Decisions the handoff leaves open:** (1) the list defaults to today (the hospital's date) with Today / Tomorrow / Upcoming / All dates; (2) no `sort` is sent (the server default is `startsAt:asc`); (3) no-show is offered whenever the API lists it (the "only once its time has started" rule is the server's); (4) the demo keeps its placeholder, because the demo has no appointments.

**Still open:** check-in (Phase 7); the dashboard's "up next" (`GET /appointments?date=today`, Phase 11); the appointment list does not yet filter by patient from the patient profile (the API supports `patientId`).

## K. Phase 7 (2026-11-07): encounters, E1 to E13, PT8 and AP5

Done against the test backend, not closed: unit-tested (phase7.test.ts and phase7ui.test.ts, including an exhaustive check of which button each type, status, archived flag, module state and permission set shows), the API-mode build compiles, and the browser suite `p7-api.js` passed 119/119 (re-run 2026-11-08, after the action-bar change) with every request and response checked against `openapi.json`. **Not verified against a real server.**

| Handoff rule (5, 6, 7, 8.5) | Frontend |
| --- | --- |
| `GET /encounters` for the front desk (`encounters.check_in`) and clinicians (`encounters.read`); queue = `doctorId, status=open, dateFrom, dateTo, sort=tokenNo:asc`; `pending=true` is the to-finish list | the Encounters tabs send exactly those parameters; the screen opens with either permission |
| `GET /encounters/{id}`: the front desk gets `clinical: null` | the record tab says it is not shown to that role and invents nothing |
| `POST /encounters/opd` issues the number and a token and charges the consultation | the form sends only the chosen fields (no token, number or fee) and says the consultation is charged |
| `POST /encounters/ipd`, `GET /wards/occupancy` is the bed board and the bed picker; `409 BED_OCCUPIED` means refresh the board | the picker only offers available beds; on BED_OCCUPIED the board is read again and the choice cleared |
| `PATCH /check-in` takes `expectedUpdatedAt`, sends only changes | only the changed fields are sent, with the loaded version |
| `PUT /clinical-record` saved whole with `expectedUpdatedAt`; lines keep their `id`; exactly one primary diagnosis; `PRESCRIPTION_DISPENSED` | the whole record is sent, line ids are sent back, one primary is maintained by the editor; the conflict banner keeps typed text |
| Times default to now, at most 7 days back, never in the future | the optional 'earlier time' is typed on the hospital's clock and refused on the form outside that range |
| Close needs a chief complaint and a primary diagnosis (`details.missing`) | the missing items are listed in words |
| Transfer `ipd.write`; discharge `ipd.discharge` (`expired` records a death); cancel `encounters.check_in` / `ipd.admit` / `encounters.write`; reopen `encounters.correct`; archive and restore `encounters.archive`; bed maintenance `ipd.write` | each button needs exactly that permission (handoff 8.5 and the role matrix) |
| Hide what the user can never do; disable what they cannot do right now, with the reason (5) | no permission, or an action that never applies to that kind of visit: not shown; permitted but the state forbids it: shown OFF with the reason as a tooltip (fixed 2026-11-08 after this audit found it hidden) |
| Never submit twice; never re-send a write; `*_CHANGED` keeps typed values (7) | one request per click (double-click tested for every write); writes are never re-sent; conflict banners keep what was typed |
| Nothing patient-identifying in URLs; keep unsaved clinical text across a session end (7) | search text is never in the address bar; the record's five long texts and the progress note are in-memory drafts |
| Worklists 15 to 30 s with a 30 s poll; a record being worked on is always re-read (6) | the queue, bed board and slot lists poll every 30 s; the visit is re-read on open and after every change |

**Decisions the handoff leaves open:** (1) the spec gives encounters no `allowedActions`, so the buttons are derived from type, status, archived flag and permissions (the plan's "allowedActions drive the buttons" cannot apply); (2) medicine names are typed as text until the pharmacy catalogue exists (`medicineText`, Phase 10); (3) the visit's Billing tab is a 'not connected' notice until Phase 8 (`GET /encounters/{id}/invoice`); (4) the bed board is a tab on the Encounters page (no new route); (5) the old `encounters.*` endpoint keys stay unset and the legacy demo screens stay as `Mock*` pages.

**Still open:** real-server verification; the fresh-eyes review of Phases 5, 6 and 7; the consultation invoice on the visit (Phase 8); the medicine picker (Phase 10).

## L. Phase 8 (2026-11-08): billing, B1 to B9

Built, unit-tested (phase8.test.ts, phase8b.test.ts, phase8c.test.ts), the API-mode build compiles, and the browser suite `p8-api.js` passes 90/90 against a stateful billing test backend that does the arithmetic and checks every request and response against `openapi.json`. **Not verified against a real server.** These screens take real money and the backend has no idempotency keys.

| Handoff rule (8.6, 6) | Frontend |
| --- | --- |
| One visit has one invoice; `GET /encounters/{id}/invoice` (`billing.read`) is the visit's Billing tab | `VisitBillTab`; "nothing billed yet" for NOTHING_BILLED or a 404 |
| Paid, partial, unpaid and every balance are derived on the server: never compute a balance in the browser | every amount is the server's string; the reader refuses a number or a non-decimal string; a test scans the billing code for arithmetic and number conversion |
| `GET /invoices` with `sourceType=consultation` / `service` gives the two tabs; also `status, search, dateFrom, dateTo` | the Consultations and Services tabs send exactly those; server paging (10) |
| `GET /patients/{id}/account` is the profile's "Outstanding"; `GET /panels/{id}/account` is what a panel owes | `PatientAccountPanel` (outstanding and credit held), `PanelAccountDialog` from the Panels list |
| Counter sales have `patient: null` and a `counterCustomer`: show that name, offer no billing actions | the name is shown wherever a patient name goes; no billing action exists yet |
| Charges come from events, not from the bill screen | the Billing tab only reads |
| Cache: a record being worked on is 0 and re-read on open; registers fetched on demand | the bill, the invoice and the accounts are the record class; the hub list is the register class |

| Never submit twice; never auto-retry a write; do not resend on a timeout (7) | every money action is ONE request per click (the button is off from the click), a refusal is shown with the backend's message, an accepted-but-unreadable answer is announced as done and never re-sent, a dropped connection is never re-sent |
| `POST /payments` `{ patientId \| panelId, invoiceId?, amount, mode, reference?, allocations?, excessAsAdvance? }`; the response is the receipt; `OVERPAYMENT` has `details.owed` | `PaymentDialog`; the receipt is shown and printed; OVERPAYMENT shows the server's own `owed` figure |
| Payment modes `cash, card, bank_transfer, cheque, insurance, on_account`; part card, part cash is two payments | the six modes; one mode per payment |
| `POST /advances`, `POST /patients/{id}/apply-credit` (no receipt: no money moves), `POST /refunds` (unused credit only), `POST /credit-notes` | one dialog each; apply-credit shows what was applied and issues no receipt |
| `POST /invoices/{id}/discount` `{ discount: { type, value }, reason }`, "included in package" = 100%; voids `{ reason }`; not while the visit is under way | `DiscountDialog` (with the 100% shortcut), `VoidDialog`; Void is shown OFF with the reason while the visit is under way |
| Lab, imaging and medicine charges are changed at their source (`CHARGE_FROM_LAB_ORDER` / `CHARGE_FROM_DISPENSE`) | their Void button is shown OFF with that reason |
| `POST /invoices` and `POST /invoices/{id}/charges`: an own `rate` or `discount` needs `billing.write` | own rate and discount fields exist only for billing.write |
| Registers: `GET /charges` (Daily Transactions), `GET /payments` | `ChargesRegisterTab`, `PaymentsRegisterTab`, server-paged |
| Prints are never cached | a reprint reads `GET /payments/{id}` fresh |

**Open:** the handoff's `encounterType` filter on `GET /invoices` is sent (OPD/IPD filter on the hub) but `docs/openapi.json` does not list it yet (SPEC_BUGS_FOR_BACKEND.md 5.2); per-charge payment allocations, a visit choice on a new services invoice, and panel refunds and credit notes are supported by the service layer but have no screen; the demo's old /billing/consultations/new and /billing/services/new routes were not re-checked in API mode; the billing hub's Expenses and Bank tabs have no current browser suite; real-server verification; fresh-eyes review.

## M. Phase 9 (2026-11-08): laboratory and imaging, L1 to L7 and I1 to I5

Built, unit-tested (phase9.test.ts, phase9ui.test.ts), the API-mode build compiles, and the browser suite `p9-api.js` passes 94/94 against a stateful lab and imaging test backend that computes specimens, flags, order statuses and `allowedActions` itself and checks every request and response against `openapi.json`. **Not verified against a real server.**

| Handoff rule (8.7, 8.8, 5, 6, 7) | Frontend |
| --- | --- |
| `GET /lab-orders` serves every list and worklist: `?toCollect=true&sort=priority:desc`, `?status=collected`, `?status=in_progress`, `?status=completed`, `?encounterId=`, `?patientId=` | five tabs send exactly those; the id filters are supported by the service and have no screen yet |
| `?toPerform=true`, `?toReport=true`, `?modality=` for imaging | the three imaging tabs and the modality filter |
| **Show exactly `allowedActions`** on the order, each specimen and each test | every button is rendered through `inOrder(allowedActions, ORDER)`; an action the code does not know is dropped; an exhaustive subset test and a source pin check it |
| Print `specimenNo` on each tube label; a rejection returns the replacement tube's number | the numbers are shown (and the replacement's after a rejection); there is no label layout yet |
| Flags `normal, low, high, critical`; sort `hasCritical` rows first and make them loud | the server's flags are shown; critical is red with a badge; critical rows come first within the page the server sent |
| A result is final only when `verifiedAt` is set; show amendments beside the corrected values | 'Not final: awaiting verification' until verified; amendments show version, reason, who and the values they replaced |
| A report is final only when `signedAt` is set (imaging) | 'Not final: awaiting the doctor's signature' until signed |
| `GET .../report` is the print payload: verified or signed results only, plus `pending`, `amended`, `complete` | the Report dialog reads it fresh each time and prints it alone; an unsigned imaging report is listed as 'not yet signed' |
| Offer the test's `reportTemplate` as the starting text; a test with `reportRequired: false` is done once performed | the report starts from the template; an ECG tracing offers no report button |
| A doctor, never the one who entered it, verifies (`VERIFIER_IS_ENTERER`) | the refusal is explained, one request, nothing changes |
| Errors `SPECIMEN_NOT_COLLECTED, RESULT_VERIFIED, VERIFIER_IS_ENTERER, TEST_HAS_RESULT, ORDER_NOT_COMPLETE, ORDER_IS_REFERRAL, MODULE_DISABLED` | each has its own heading and the backend's message |
| Never submit twice; never re-send a write (7) | every write is ONE request through the single-request dialog; double click, refusal and dropped connection tested |
| Navigation = permission AND module; lab screens need `lab`, imaging screens `imaging`; past records stay readable; with the department off an order is an external referral (5, 8.7) | the menu entries need the department on; with it off the order form still opens and places the referral, past orders and the lists open read-only with a notice, and working a lab order (the results route) needs the department |

**Decisions the handoff leaves open:** (1) the `{testId}` in `/lab-orders/{id}/tests/{testId}/...` is taken to be the order line's own `id` (the response gives each line both an `id` and the catalogue `testId`; a cancelled test can be re-added, which the catalogue id could not tell apart); (2) a result form is built from the test's definition (`GET /lab-tests/{id}`, catalogs.read, held by every role); (3) the worklists are not sorted by critical on the server, so critical rows lead only within a page.

**Section 5 and 8.7 together (followed as written):** 8.7 says that with the lab department off "an order is an external referral (`referredTo`), recorded but not charged or worked"; section 5 says navigation needs permission AND module, a call into a switched-off department returns `422 MODULE_DISABLED`, and past records stay readable. Both hold: the menu entry is hidden, placing an order is still possible (a referral), reading past orders is possible, working one is not.

**Open:** real-server verification; entry points that place an order from a visit or a patient (and show a patient's or a visit's orders); tube label printing; the cancel-test dialogs have no browser run; the fresh-eyes review.

## N. Phase 10 (2026-11-08): pharmacy, PH1 to PH8

Built, unit-tested (phase10.test.ts, phase10ui.test.ts), the API-mode build compiles, and the browser suite `p10-api.js` passes 86/86 against a stateful pharmacy test backend that computes every stock figure, first-expire-first-out and the level and expiry badges itself and checks every request and response against `openapi.json`. **Not verified against a real server.**

| Handoff rule (8.9, 5, 6, 7) | Frontend |
| --- | --- |
| A medicine holds no stock of its own: stock is batches (one per delivery, with an expiry), every change a movement | the detail lists batches (expired marked); the stock card lists movements |
| `stock` on every medicine (`onHand, expired, nearestExpiry, level, expiry, saleValue`): use these for the badges, never sum batches in the browser | the badges and figures are the server's; a test scans every pharmacy file for summing |
| `GET /medicines` filters `search, category, level=low\|out_of_stock, expiry=expiring\|expired, expiringWithinDays, active` | the inventory sends level, expiry and active (and search); category and days are supported by the service |
| `POST /medicines`, `PATCH` (send only changes), `deactivate`, `reactivate` (`pharmacy.stock`); `409 MEDICINE_NAME_TAKEN` | one dialog; PATCH carries only what changed; the 409 is explained |
| Receive `{ batchNo, expiryDate, quantity, purchaseRate, supplier?, receivedDate? }`; write-off `{ quantity, reason }`; adjust `{ quantity: ±n, reason }` | one dialog each, one request each |
| `GET /stock-movements` is the stock card (`medicineId, batchId, type, dateFrom, dateTo`) | the detail's Stock card tab (medicine and type) |
| `GET /encounters/{id}/prescription` is "Load Rx": prescribed, dispensed so far, remaining | the Load Rx panel shows exactly those three figures |
| `POST /dispenses`: to a patient (`patientId`, `encounterId?`, `lines[]`) or a counter sale (`counterCustomer` + `payment: { mode }`) | both modes; a counter sale is paid in the same step |
| Short stock: a line takes what is available (compare `dispensed` with `requested`); nothing at all refuses the whole dispense (`422 OUT_OF_STOCK`, `details.lines`) | the result shows requested against dispensed with a warning; the refusal names the medicines |
| First-expire-first-out is the server's job; print each line's batches on the slip | the result and the slip show each line's batch no. and expiry |
| Link visit lines with `prescriptionLineId`; a substitute is an unlinked line | a different medicine than the doctor's catalogue pick is sent unlinked and labelled; a free-text line is linked |
| Patient payment goes through billing (`POST /payments`); a counter sale is paid inside the dispense | the bill (a real invoice) opens from the result with the billing payment action; the counter sale carries `payment` |
| Returns re-charge what is kept; money already paid becomes credit; a counter customer is refunded at once | the return dialog asks for the refund mode only for a counter sale; the detail shows the return |
| Errors `OUT_OF_STOCK, INSUFFICIENT_STOCK, BATCH_EXPIRED, MEDICINE_INACTIVE, PRESCRIPTION_FULFILLED, RETURN_EXCEEDS_DISPENSED, MODULE_DISABLED` | each has its own heading and the backend's message |
| Never submit twice; never re-send a write (7) | one request per click through the single-request dialog or the submit guard; double click, refusal, dropped connection and unreadable answer tested |
| Navigation = permission AND module (5); dispense and returns `pharmacy.dispense`, stock `pharmacy.stock` | the menu and the routes need the department on; the Dispense tab is hidden without pharmacy.dispense; stock actions need pharmacy.stock |

**Decisions the handoff leaves open:** (1) the shape of `details.lines` in an OUT_OF_STOCK refusal is not published, so strings or objects with a `name` are listed and anything else is skipped; (2) the inventory sends `active=true` unless 'Deactivated' or 'All' is chosen; (3) a per-line dispense discount (`discountPct`) exists in the DTO but the handoff says nothing about who may give it, so it is not offered; (4) the header tiles of the demo (totals summed in the browser) are not in API mode.

**Open:** real-server verification; the doctor's clinical record still takes the medicine as free text (a catalogue picker there, sending `medicineId`, is not built); a per-line dispense discount; browser runs of the MEDICINE_INACTIVE and INSUFFICIENT_STOCK dispense refusals (the picker offers active medicines only and a line takes what is available) and of the server's RETURN_EXCEEDS_DISPENSED (prevented on the form); the fresh-eyes review.

## O. Phase 11 (2026-11-08): reports, Financial Statistics, Lists and the dashboard's two list widgets

> **Superseded in part by section R (2026-11-08).** Everything below that says a chunk is BLOCKED, "Not connected" or "route only" described the tree at the time; those chunks (X1 to X5, D1, D3 to D6) are built since Phase 13.

Built for the chunks whose shapes are published: D1b, D2, D5b, D7 (D8 was done earlier). Unit-tested (phase11.test.ts, phase11ui.test.ts), the API-mode build compiles, and the browser suite `p11-api.js` passes 99/99 against a stateful reports test backend that computes every report figure from its own dated ledger for the asked period and checks every request and response against `openapi.json`. **Not verified against a real server.**

| Handoff rule (8.11, 5, 6, 7) | Frontend |
| --- | --- |
| Every report takes `dateFrom` and `dateTo` as hospital days, inclusive, at most 366 days apart | the period is checked before a request (real days, in order, at most 366 days) and an invalid one sends nothing |
| Map Today / This Week / This Month / Custom to those dates using `GET /settings` -> `today` | the presets come from the hospital's date, never the browser's clock; they are off while it loads. Yesterday and Last Month are added because the prototype had them |
| `GET /reports/revenue`, `/collections`, `/outstanding`, `/outstanding/patients` (`reports.read`) | Revenue, Daily Transactions (day close), Patient Balances; every figure is the server's text |
| Revenue is the same number everywhere: net of discount, excluding GST, voided left out, on the day earned | the Revenue report shows the server's gross, credit notes, net, GST and voided apart; nothing is added in the browser |
| Financial Statistics tabs read existing registers: `GET /charges?sourceType=service\|consultation\|pharmacy`, `diagnosticType=lab`, `modality=X-Ray\|ECG\|Ultrasound`; `GET /payments?type=advance\|payment`; `GET /invoices?encounterType=opd\|ipd` | one tab each, for the chosen period (drop the 'planned for later' placeholder: done) |
| Summary, Expenses, Bank, Graphs tabs | listed, tagged 'Not connected', naming the route they await; they send nothing |
| Lists are the ordinary list endpoints; Admitted Patients is `GET /encounters?type=ipd&status=open`; each doctor carries `schedule` | seven server-paged lists with their own read permissions; the schedule is read when the server sends it |
| Today's appointments from `GET /appointments?date=<today>`, recent patients from `GET /patients?perPage=5` | the two widgets; each hidden without appointments.read or patients.read |
| Poll the dashboard every 60 s | not applicable until GET /dashboard has a shape; the two widgets poll as worklists (15 s fresh, every 30 s) |
| Build CSV exports on the client from the JSON | not built (see Open) |
| Navigation = permission AND module (5) | Reports needs reports.read or accounts.read; Financial Statistics needs reports.read; each report, tab and list shows only to a user who can read what it reads |

**Reconciliations (both statements hold):** (1) 8.4 says availability is the schedule at `GET /doctors/{id}/schedule` and 8.11 says each doctor row carries `schedule`: the list reads `schedule` when the row has one and shows a dash when not. (2) The handoff names filters `diagnosticType`, `modality` that `docs/openapi.json` lacks: they are sent as the handoff says (note to the backend only).

**Decisions the handoff leaves open:** (1) a report page whose route has no published shape is shown in the menu as 'Not connected' (not hidden) so nobody mistakes a missing report for an empty one; (2) a category total on a Financial Statistics tab is not shown, because a page of rows cannot be summed in the browser and the totals live in the unpublished summary; (3) the weekly period starts on Monday.

**Open:** real-server verification; CSV export; X1 to X5 (expenses, bank, cash drawer), D1 (GET /dashboard), D3 (daily summary, OPD, demographics, lab, pharmacy reports), D4 (prescription history), D5 (summary, Graphs), D6 (cash flow, expenses report): the handoff gives the routes (and for the expense body its fields) but not the response shapes, so none is built or invented; the fresh-eyes review.

**Routes added (owner request, 2026-11-08):** the 23 routes of 8.10 and 8.11 for the blocked chunks are in the route table as route-only keys (accountsApi.*, reportsApi.dailySummary/opd/demographics/lab/pharmacy/financialSummary/revenueDaily/cashFlow/expenses/prescriptions/dashboard). Nothing calls them; each becomes usable when a response shape is published. See HANDOFF_ONLY_ROUTE_KEYS in endpoints.ts.

## P. Fresh-eyes review of Phases 5 to 11 (2026-11-08)

Three separate reviewers read the code against this handoff and docs/openapi.json. What came out of it, by handoff rule:

| Handoff rule | Finding | Now |
| --- | --- | --- |
| 7: "don't resend a write; reload the record" | A write with no answer (network, timeout, 502/503/504) left its button live; a 2xx that could not be read was shown as a form mistake | The form is held after an unknown outcome; every write reads its answer through createAndParse |
| 8.9: patient payment for medicines "goes through billing, which pharmacists hold" | The pharmacist role has billing.collect_payment but not billing.read, so 'Open the bill' was a 403 and payment was unreachable | PayBill: POST /payments straight from the dispense result and history, with the receipt |
| 5: hide what the user can never do | Add relation / Add organisation without catalogs.write; the Dispense tab (earlier) | Hidden without catalogs.write |
| 5: navigation = permission AND module | Appointments had no menu entry | Added, appointments.read |
| 8.7: "Bench: ?status=collected, then ?status=in_progress" | Only 'collected' was shown | Two views |
| 8.3: a guardian relation may be a catalogue entry or free text | A free-text relation (id null) made the patient unreadable | Read as the name with no id |
| 4: dates | Date-only values read through new Date(string); the hospital's 'today' frozen at sign-in | Day strings stay strings; settings re-read when the hospital's day rolls over |
| 7: keyboard-first flows | Clickable rows with no keyboard path | A real button in each row's first cell |

Open after the review: the items listed under 'NOT fixed, on purpose' in the progress log; real-server verification.

## Q. Phase 12 (2026-11-08): printing, security, CI, go-live

See docs/GO_LIVE_CHECKLIST.md for the handoff's 13-item checklist with the evidence for each. What changed against the handoff's text:

| Handoff text | Frontend |
| --- | --- |
| Section 5 (Headers): add a real Content-Security-Policy `default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https://<storage-host>; frame-ancestors 'none'` with nonces for Next's inline scripts | Built with a per-request nonce (src/lib/csp.ts, src/proxy.ts). `style-src` keeps `'unsafe-inline'`: the server-rendered HTML carries inline style attributes (Radix, Tailwind) that a nonce cannot cover. The storage host is the `CSP_IMG_SRC` setting (https origins only). `upgrade-insecure-requests` only with `CSP_UPGRADE_INSECURE_REQUESTS=true` (plain http://localhost would break) |
| Section 10: print layouts for the lab report, imaging report, dispense slip and receipt, tested on the hospitals' printers | Layouts and paper sizes done and PDF-checked; the printers are NOT tested |
| Section 10: `NEXT_PUBLIC_HMS_DATA_SOURCE=api` on every non-local build; mock data unreachable in production builds | Production builds default to the API; the demo data is still inside the client bundle (npm run check:build reports it); retiring mock mode (D8) fixes it |
| Section 10: Playwright e2e per role against the dev hospital | Not done: needs the server and accounts |
| Section 2: forward the client IP, agree TRUST_PROXY_HOPS | Not verifiable here; depends on the chosen host |

## R. Phase 13 (2026-11-08): the "complete all 12 phases" brief

**What was re-checked.** The coverage of handoff section 8 by script (170 routes): 165 connected (159 keys in the route table, 4 whose second path the table prints as a partial, 2 session reads done by useHospital), 5 deliberately not called (the catalogues' single-record GETs, see SPEC_BUGS 9.2 item 35). The 23 keys that had been "route only" are now each called by their adapter (a unit test checks both that no screen reads them directly and that the adapter does).

**Built, from the handoff's text.** X1 to X5, D1, D3, D4, D5, D6 (see INTEGRATION_PROGRESS.md). Rules kept from the earlier review: every write is ONE request through `createAndParse`, a write with no answer holds the form, money stays text (compared by a string normaliser, never added or rounded in the browser), search text is sent as `search` and not put in the address bar, permissions come from /auth/me and never from role names (`accounts.read` / `accounts.write`, the drawer's `settings.write`, `reports.read`, `encounters.read` for prescriptions), the route guard refuses /billing/expenses and /billing/bank without accounts.read.

**Things the handoff leaves open and what was done (all in SPEC_BUGS 9.1 / 9.2).** The answers' fields (read defensively, shown as received); the type of the two `last7Days` series (recognised by shape, otherwise not drawn); the unset cash drawer (404 or no amount); `expectedUpdatedAt` on PATCH /expenses (sent only when the record has `updatedAt`).

**Demo data.** Mock/demo code is reachable only through "@hms/demo"; an API build replaces it with a stub (G5). `dataSource` itself is unchanged and API mode never falls back to demo data (there is no runtime fallback; the stub would throw).

**Found and fixed while doing it.** (1) IcdLookup computed its demo list before its API branch (would have thrown under the stub; found by the browser suites). (2) The older suites each needed the home page's two new reads allowed (a shared stub answers them). (3) The Expenses date range, when inverted, was silently ignored: it is now explained and nothing is sent.

**Not verified, not claimed.** Anything on a real server; printers; Lighthouse; role e2e. The test backends' answer shapes for the Phase 13 routes are my assumption.
