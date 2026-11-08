# HMS integration plan

*Written 2026-11-07 (Step A: analysis and plan; no feature code was written).*

## 1. Sources and how I read "use only this file"

> **Instruction of 2026-11-07 (the owner, in writing):** use `HMS Frontend Integration Handoff.md` for ALL phases, read it carefully, and make this integration plan follow it. The handoff is the agreed API contract; the backend does not exist yet and will be built from it, so the frontend is judged against the handoff, not against any assumed server. A copy now sits in the project directory (byte-identical to the one in `D:\HMS-private\`, 76,203 bytes; it is listed in `.gitignore` and must never be committed). It holds the dev credentials: they are never copied into code, docs, tests or logs, and nothing has been sent to the dev server. The audit of Phases 1 to 4 against it is `docs/HANDOFF_ALIGNMENT_AUDIT.md`.

- **Two sources, in this order:** (1) the handoff MD (`HMS Frontend Integration Handoff.md`, gitignored; see D12) is the contract for routes, methods, permissions, workflow, auth/session, caching, security, error handling, module behaviour and the go-live checklist; (2) `docs/openapi.json` gives the exact field names, types, required fields and enums of the routes it defines.
- **Conflict rules:** the handoff wins on routes, methods, permissions, behaviour and rules; openapi.json wins on field names, types and enums where it defines them. If they disagree, or the handoff is ambiguous, the exact ambiguity is written down (section 10, and `docs/HANDOFF_ALIGNMENT_AUDIT.md` section E), never guessed; the safer reading is followed and the chunk is marked NEEDS-DECISION. A frontend that differs from the handoff is a defect and is corrected.
- **Known limit and how it is handled (updated 2026-11-07):** the JSON in the repo is a stale copy (170 operations; the handoff documents 206). Every route the handoff names is in this plan (checked by script: no handoff route is missing from it). For a route the handoff names but the JSON lacks, the handoff gives the path, permission and rules but not the exact fields, so the frontend writes a PROPOSED contract the backend is built to match (`docs/openapi.draft.json` and `docs/BACKEND_CONTRACT_PROPOSED.md`, never merged into openapi.json). Written so far: expense categories (S12), bank accounts (S13) and audit entries / Item History (D8). Still to propose when their phase starts: expenses, bank balances, statements and transactions, the cash drawer (X1 to X5), the dashboard (D1) and the reports named in 8.10 and 8.11 (D3 to D6). Until the owner confirms a proposal the matching UI is not built.
- **Not used:** `HMS API Reference.pdf`, `HMS Remaining Work Task List.pdf`, any endpoint-list file. `docs/SPEC_BUGS_FOR_BACKEND.md` is only the place where JSON bugs are recorded. `docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md` is my earlier build record, not a source.
- **Credentials:** the dev login lives only in the MD (gitignored) and is never copied. Scripts read `HMS_DEV_HOSPITAL_CODE`, `HMS_DEV_USERNAME` and `HMS_DEV_PASSWORD` from the environment (none are set today, so nothing has been sent to the real dev server).

## 2. Freshness check (result: the JSON is stale; we do not wait for a newer one)

- `docs/openapi.json`: **170 operations, 169 under `/api/v1`**. The MD states **206**; its tables document 204 distinct operations by my parse.
- **36 documented operations are not in the JSON:** audit entries; expenses (list, create, get, patch, void); expense categories (list, create, get, patch, deactivate, reactivate); bank accounts (list, create, get, patch, deactivate, reactivate, statement); bank balances; bank transactions (create, get, void); cash drawer opening (get, put); `GET /dashboard`; `GET /prescriptions`; reports `cash-flow`, `daily-summary`, `demographics`, `expenses`, `financial-summary`, `lab`, `opd`, `pharmacy`, `revenue/daily`.
- **10 chunks depended on them and were BLOCKED: X1, X2, X3, X4, X5, D1, D3, D4, D5, D6. All are BUILT since 2026-11-08 (Phase 13), as real screens with real requests; where the handoff gives no field list for an answer, the screens read a small defensive set and show the rest as received (SPEC_BUGS_FOR_BACKEND.md section 9). (S12, S13 and D8 were BLOCKED too; since 2026-11-07 they are BUILT against the proposed contract in `docs/openapi.draft.json`, see their status lines.)**
- 87 chunks can be built now from openapi.json + the MD.
- **Blocked chunks and the DRAFT CONTRACT rule (updated 2026-11-07):** for a chunk whose routes the handoff names but `openapi.json` lacks, the frontend writes the PROPOSED contract into `docs/openapi.draft.json` and `docs/BACKEND_CONTRACT_PROPOSED.md` (method, path and permission from the handoff; request and response fields proposed, labelled as such), generates `src/lib/api/schema.draft.d.ts` from it, and builds the chunk against it. The backend is then built to match, so there is no gap to bridge later. The draft is never merged into `openapi.json`; if the backend chooses other names, only the chunk's mapper file changes. S12, S13 and D8 were done this way. X1 to X5, D1 and D3 to D6 still need a proposal when their phase starts.

## 3. Findings and risks

Evidence column: "audit" = read-only subagent audit of the code on 2026-11-07 (service layer, screens and mock data, authentication and tests), cross-checked by me where marked.

| # | Finding | Evidence | Risk / consequence |
|---|---|---|---|
| 1 | The JSON is stale (section 2): 36 documented operations are not in it. | operation count (170 vs 206) | 13 blocked chunks; no generated types for the missing routes. |
| 2 | **MD and JSON agree on permissions.** Compared for the 98 routes where both name one permission: 0 disagreements. Rows with several permissions per method were not compared. | script run | Low. |
| 3 | The JSON types 76 single-text fields as "array of string" in 24 schemas (73 clear bugs, 3 ambiguous). List DTOs type the same names as string or null. | docs/SPEC_BUGS_FOR_BACKEND.md | Tolerated with one console warning (standard 10); real behaviour unverified. |
| 4 | **Cookie collision.** The backend refresh cookie is "hms_session"; the frontend also writes a JS cookie "hms_session=1" (auth.tsx:49-55) and src/proxy.ts trusts it as the sign-in hint. | audit; MD section 3 | Rename in A1; confirm live. |
| 5 | **Authentication is not what the MD describes.** Reload signs the user out (no boot refresh, no POST /auth/refresh anywhere); logout is client-only (the backend session and refresh cookie survive); the login response is ignored except the token (role and permissions are always null); mustChangePassword is never read; no 401 handling or token refresh; "remember me" is unused; GET /auth/me is parsed but never called. | audit (auth.tsx:83-126), checked | High. D1 granted. |
| 6 | **The sidebar is empty and /admin/* is denied for everyone** in API mode, because role and permissions are always null and NAV_PERMISSIONS is empty. | audit (auth.tsx:112, identity.ts:25, RoleGate) | The app cannot be used in API mode until A1, A5, A6 are done. |
| 7 | **Authorization in the UI is cosmetic and role-based.** Only /admin/* uses a role gate; billing, lab results, reports, pharmacy and every mutation are reachable by URL and have no UI check. Lab results record performedBy from the typed login identifier. | audit (CC-2, CC-14, CC-15) | Must become permission-based (A6, then each module chunk). The backend enforces; the UI must not mislead. |
| 8 | The data layer is hand-written (no TanStack Query). Fetch-all: useDoctors, medicines, lab tests, wards, organisations, expense categories, bank accounts and the whole Lists report use listAll (up to 50 pages of 100); usePatients does one GET per patient id (N+1); filtering runs in the browser. The MD forbids fetch-all. | audit (CC-5, CC-6) | Chunk F3, then per module. |
| 9 | Cache invalidation is passive (a mounted screen does not refetch), and an admit or discharge does not invalidate the cached patient (stale admitted status for up to 30 s). Many services are not wrapped in invalidatingService. | audit (CC-11, CC-12, CC-13) | Fixed by F3 (query keys and mutation map). |
| 10 | 11 of 93 endpoint keys are set (auth.me, patients x6, organisations x2, guardianRelations x2). Everything else is inert. Baseline today: 519 unit tests pass (4 skipped, 8 todo), tsc clean, eslint 0 errors and 27 warnings. **Nothing has been verified on the real dev server**: no credentials are set. | run 2026-11-07 | Every chunk ends with a read-only dev check once credentials exist. |
| 11 | Mock data (about 1,000 lines of fabricated names, phones, addresses) is imported by several screens and ships in the API build; only runtime checks hide it. | audit (CC-4) | Low for correctness, but contradicts "mock never reachable in production"; handled in G4. |
| 12 | Several controls are fake or cosmetic: Profile "Save" and "Update Password" only show toasts; the billing and reports date-range buttons filter nothing; report CSV export (except expenses) writes only the label; nothing calls imagingOrders.enterReport (no imaging-report UI). | audit (CC-10) | Fixed in the chunk that owns each screen, or marked "Not connected". |
| 13 | Several screens have no backend equivalent: Forgot password, notifications, SS/Emp number, patient/doctor photos, image upload, commission payouts, the editable Diseases tab. | MD sections 8 and 10 | Stay mock-only or "Not connected" in API mode. |
| 14 | Backend features with no screen today: Appointments (page is a "Coming soon" placeholder), vitals and progress notes, stock card, refunds, credit notes, advances, apply-credit, record death, module switches, cash drawer, bank balances. | audit; MD section 8 | New UI work in the owning phase. |
| 15 | Our model differs from the backend's: doctors are users; encounters are created by check-in or admit; no consultation-invoice create; specimens exist in lab; stock is batches with a server level; delete is archive or deactivate. See section 6. | MD section 9 | Every chunk lists its mismatches; the safest reading is built. |
| 16 | Patient and encounter ids are in page URLs (/patients/{id}, ?patientId=, ?encounterId=). They are opaque ULIDs, not names or MR numbers. Search text goes only as a fetch parameter, never in the address bar (decision D10). The duplicate-phone check puts a full phone number in a GET query string, which can appear in proxy and backend access logs. | audit (CC-7, CC-8) | Accepted as MD section 7 prescribes ("send searches as the search parameter of a fetch"). Logged. |
| 17 | The CSP is only "frame-ancestors none"; the MD requires a full CSP before go-live. There is no idle lock. | audit | Chunk G2. |
| 18 | CI and tests: the e2e specs form-labels.spec.ts and responsive.spec.ts still sign in with the removed demo accounts (#email) and almost certainly fail; 14 smoke tests skip because demo accounts are gone; CI builds in API mode against an unreachable backend and never runs the mock-mode browser suite. There are no jsdom/React component tests. | audit (not yet run by me) | Chunk G3; browser suites run by me are scripted Playwright runs (see phase reports). |
| 19 | The MD itself contradicts or leaves open 38 points (section 10). The ones that change behaviour are resolved in section 7a. | MD (agent extraction) | Logged. |
| 20 | The MD file held a real dev password inside the project folder. Moved out and ignored (D12); a scan found the password in no other project file. | scan 2026-11-07 | Closed. |


## 4. How the chunks and phases work

Chunks are done in order inside a phase: re-read the MD section and the exact openapi.json entries → types and mappers → service functions and wiring → UI (loading, empty, error, success; permissions) → tests → unit, tsc, lint, mock-mode and API-mode browser suites → progress file. Real dev server: read-only first, only if credentials are set; any created record is named ZZ-TEST and listed in the report. Large chunks may be done as sub-steps; the progress file lists each sub-step.

At the end of a phase: fresh-eyes review by a subagent that has not seen the work (mandatory for phases 1, 2, 7, 8, 9 and 10), fixes, all checks again, then the phase report. Auto-continue after the report happens only if ALL of these hold: unit, type check, lint and both browser suites are green; the review has no unresolved finding; the phase wrote nothing to the dev server; no chunk of this or the next phase is NEEDS-DECISION; no hard stop is open; the next phase is not 7, 8, 9 or 10 (unless you approved it, N1). Otherwise I wait for you.

## 5. Phases and chunks (100 chunks)

| Phase | Chunks | Blocked |
|---|---|---|
| 1 — Foundations | F1, F2, F3, F4 | — |
| 2 — Authentication and permissions | A1, A2, A3, A4, A5, A6, A7 | — |
| 3 — Harden what is already connected | H1, S3, S4 | — |
| 4 — Clinic setup | S1, S2, S5, S6, S7, S8, S9, S10, S11, S12, S13 | none (S12, S13 built against the proposed contract) |
| 5 — Patients | PT1, PT2, PT3, PT4, PT5, PT6, PT7 | — |
| 6 — Appointments and doctor schedules | AP1, AP2, AP3, AP4 | — |
| 7 — Encounters | E1, PT8, E6, E2, AP5, E3, E8, E4, E5, E7, E13, E9, E10, E11, E12 | — |
| 8 — Billing | B1, B2, B9, B3, B4, B5, B6, B7, B8 | — |
| 9 — Laboratory and imaging | L1, L2, L3, L4, L5, L6, L7, I1, I2, I3, I4, I5 | — |
| 10 — Pharmacy | PH1, PH2, PH3, PH4, PH5, PH6, PH7, PH8 | — |
| 11 — Reports, dashboard, expenses and bank, Item History | X1, X2, X3, X4, X5, D1, D1b, D2, D3, D4, D5, D5b, D6, D7, D8 | none: all built (X1 to X5, D1, D3 to D6 in Phase 13; D8 in Phase 4's second pass) |
| 12 — Final verification and go-live | G1, G2, G3, G3b, G4 | — |

Order: foundations → authentication and permissions → harden what is connected → clinic setup → patients → appointments → encounters → billing → laboratory and imaging → pharmacy → reports, dashboard, expenses and bank, Item History → final verification and go-live. Data dependencies decide the order inside it (an encounter needs a patient and a doctor; billing needs a visit; lab, imaging and pharmacy need a visit and billing). Patient chunks are named PT1–PT8 so they cannot be confused with phase numbers.
Fresh-eyes review (a subagent that has not seen the work) is run at the end of every phase and is mandatory for phases 2, 7, 8, 9 and 10. Auto-continue never applies to phases 7–10 unless you approve them first.

## 6. Where one frontend action is several backend calls, or the reverse

| Frontend today | Backend | Chunks |
|---|---|---|
| `encounters.create` / New Encounter wizard (4 steps) | check-in (`POST /encounters/opd`) or admit (`POST /encounters/ipd`), then vitals, clinical record, close — by different roles | E2, E3, E4, E5, E7 |
| Patient form "Save & OPD ticket" / "Save & IPD ticket" | `POST /patients` then check-in or admit (two permissions) | PT2, E2, E7 |
| `consultationInvoices.create` | none: the consultation is charged at check-in | E2, B3 |
| `users.setActive` | deactivate or reactivate | S9 |
| Doctors create / edit | user create + doctor profile; hours = schedule; picker = `GET /doctors` | S10, AP1 |
| Patient "Delete" / "Active" switch | archive / restore | PT6 |
| Expense category / ward "delete" | deactivate | S8, S12 |
| `labOrders.transition` | collect, reject, verify, amend, cancel test, deliver | L3–L7 |
| `labOrders.enterResults` | one call per test | L4 |
| `imagingOrders.transition` | perform, sign, amend, cancel test, deliver | I2–I5 |
| `medicines.adjustStock` | receive batch, write off, adjust | PH3 |
| `dispensing.create` | one dispense; returns are separate | PH6, PH8 |
| `receipts.create` | `POST /advances`; any payment is a receipt via `GET /payments/{id}` | B4, B5 |
| `dashboard.summary/weeklyVisits/revenueTrend` (3 keys) | one `GET /dashboard` | D1 |
| `statistics.records` | one query per tab (several registers) | D5 |
| `reports.dailyTransactions` | `GET /charges` + `GET /payments` | B8 |
| Clinic Settings save | `PATCH /settings` with `expectedUpdatedAt` | S1 |

## 7. Decisions

### 7a. Decisions taken (log; each with the alternative)

| # | Decision | Taken by / why | Alternative not chosen |
|---|---|---|---|
| D1 | Authentication code may be changed (Phase 2). | You (2026-11-07). The MD requires it. | Leave auth untouched (rejected: the MD's session model cannot work without it). |
| D2 | Add dev dependency openapi-typescript (F1) and dependency @tanstack/react-query (F3). Nothing else without asking. | You (2026-11-07). | Own hooks for F3 (rejected by you). |
| D3 | The stale openapi.json is NOT waited for. Buildable chunks are built; for a missing route the frontend PROPOSES the contract (docs/openapi.draft.json + docs/BACKEND_CONTRACT_PROPOSED.md) and the backend is built to match it. UPDATED 2026-11-07 after the owner said the backend will follow the handoff: "BLOCKED" now means "the proposed contract is not yet written or not yet confirmed". | You (2026-11-07). | Wait for a refreshed spec. |
| D11 | docs/INTEGRATION_PHASES.md and docs/backend-routes.md deleted (done 2026-11-07). The route guard test src/lib/services/backendRoutes.test.ts now checks ENDPOINTS against docs/openapi.json instead of the deleted file (same 4 tests, 4 pass). README link updated. | You (2026-11-07). The test was the only code that read the deleted file. | Keep the files. |
| D12 | The handoff MD (it holds the dev password) was moved out of the project to D:\HMS-private\ (done 2026-11-07); .gitignore ignores it. LATER THE SAME DAY the owner put a copy back in the project directory and said to use it for all phases ("I trust you"): it is byte-identical, stays gitignored, and the credentials are still never copied or used for any call. A scan of the project found the password in no other file. The old clone D:\HMS-V1-clone does not track it. | You (2026-11-07). | Leave in place. |
| D10 | Search text is sent as the "search" parameter of the API fetch (what the MD itself prescribes in section 7) and is NOT put in the browser address bar. Page number and non-identifying filters (status, date range, tab) may be in the address bar. The MD example "?search=ali" in section 6 is the contradiction; the safer reading (section 7) is followed. No search chunk is BLOCKED-BY-CONTRADICTION, because every list endpoint accepts search as a fetch query parameter. | Brief + MD section 7. | Put search in the address bar (rejected). |
| D13 | "Delete" follows the backend: patients are Archived (label "Archive") and can be Restored. Catalog rows, wards, users and expense categories are deactivated, not deleted. | You (2026-11-07). | Hard delete (impossible). |
| D14 | Patient chunks are named PT1–PT8 (they were P1–P8) so they cannot be confused with phase numbers. A new chunk H1 re-verifies the six connected patient operations. Panels (S3) and guardian relations (S4) are in phase 3 "Harden what is connected" and keep their ids. | Me. | Keep old ids (confusing). |
| D4 | Patient form "Save & OPD / IPD ticket" = two calls: create the patient, then check in/admit. If the second fails: show "patient saved" and open the check-in screen; never resubmit the create. | Me (safest reading: follow the backend, never combine steps). | One combined action (impossible). |
| D5 | Appointments screens are built in phase 6 (the page is a "Coming soon" placeholder today). | You (the brief lists phase 6). | Skip. |
| D6 | Module switches: a small tab inside Clinic Settings, plus module-driven navigation (A5/S2). | Me. | No UI (backend rejects disabled-module calls anyway). |
| D7 | Diseases tab becomes read-only ICD-10 search (S11). | Me; the API list is read-only. | Editable (no write endpoint). |
| D8 | Mock mode stays until go-live (G4). API mode is the default in production. | Me. | Retire earlier. |

### 7b. Needs your decision (nothing below stops the next phase)

| # | Decision | My recommendation |
|---|---|---|
| N1 | Approve phases 7, 8, 9 and 10 (encounters, billing, lab/imaging, pharmacy) for automatic continuation. By your rule they never auto-continue until you approve them. | Approve each when you have reviewed the phase before it. |
| N2 | Credentials for live checks: set HMS_DEV_HOSPITAL_CODE, HMS_DEV_USERNAME, HMS_DEV_PASSWORD in the shell that runs me (values stay in your environment). Without them nothing is verified on the real dev server. The owner has said the backend is still to be built from the handoff, so no live check is planned yet; I will not use the credentials in the handoff file unless asked. | Decide when a backend exists. |
| N3 | One staff account per role on dev (MD section 1). Admin hides permission bugs. | Ask the backend owner for the 8 role accounts before phase 12. |
| N4 | The MD does not say how an idle lock should re-check a password (there is no verify endpoint). | Lock = cover the screen and require a full sign-in (logout + login), unless you prefer otherwise. Decided inside phase 2 if you do not reply. |

## 8. Chunk detail

### Phase 1 — Foundations

- **Goal:** A typed contract, one shared client, data layer, error handling and shared form pieces that every later chunk reuses.
- **Entry criteria:** none
- **Exit criteria:** openapi.json types generated and drift-checked (against the committed JSON only); client rules covered by tests; TanStack Query provider with a key factory and cache classes in place; fetch-all bounded; shared UI kit in place; unit, tsc, lint green.
- **Fresh-eyes review at the end of the phase:** YES (F2 and F3 touch every request)
- **Auto-continue after the report:** allowed if all conditions hold

#### F1 — Typed contract from openapi.json

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): openapi-typescript 7.13.0 (dev); src/lib/api/schema.d.ts generated from docs/openapi.json; npm run types:generate / types:check; CI step; compile-time field checks for patient, panel, relation and auth/me mappers; drift check only compares with the committed JSON (cannot see backend drift: re-pull the real spec in G4).
- **Screen / action:** No screen. Generate src/lib/api/schema.d.ts from docs/openapi.json and add a drift check to CI.
- **Endpoints:** none
- **Permission:** none
- **Mapper:** none (types only); the existing hand-written wire readers keep working until each chunk replaces them
- **Tests:** types:check fails when the committed file differs from a fresh generation; one compile-time test per connected mapper
- **Known mismatches:** The JSON is out of date (36 documented endpoints missing), so types cannot exist for them. Needs the new dependency openapi-typescript. The drift check compares the committed schema.d.ts with the SAME stale JSON, so it cannot detect backend drift; a manual re-pull of the real spec is a step in G4. POST /auth/change-password has no 2xx response in the JSON (see A4).
- **Risk:** L — build tooling only
- **Depends on:** none (works from the JSON in the repo)

#### F2 — API client rules (timeouts, retries, 429, offline, request id)

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): GET retried twice (1 s, 3 s) on network/5xx and on a body that breaks mid-answer; writes never re-sent after a network failure, timeout or 5xx; a write answered 409 TRANSACTION_CONFLICT is repeated exactly ONCE (handoff 4 and 7: the write was rolled back; corrected in the 2026-11-07 audit, it had been stricter than the handoff); 30 s timeout covers the body read; offline refuses writes before sending; 429/lockout retryAfterSeconds and nothing is sent until the 429 wait is over; PASSWORD_CHANGE_REQUIRED hook; errorSummary no longer crashes on object details; ApiError body/path not enumerable.
- **Screen / action:** No screen. Shared client behaviour from MD section 7.
- **Endpoints:** none
- **Permission:** see screen
- **Mapper:** none
- **Tests:** GET retried twice on network/5xx (1 s, 3 s); GET 4xx never; POST/PUT/PATCH/DELETE never; 409 TRANSACTION_CONFLICT once; 429 waits Retry-After or 60 s; abort at 30 s; offline blocks writes; requestId read from body or X-Request-Id 429: wait Retry-After or 60 s, then the USER may retry (no automatic re-send); a write that times out or drops is never re-sent (reload the record instead); 403 PASSWORD_CHANGE_REQUIRED is handled centrally (redirect to the change-password screen, A4); non-JSON gateway errors become a generic message without requestId.
- **Known mismatches:** Today the client has no retry, timeout or offline handling. Code audit (2026-11-07): errorSummary() calls err.body.details.map() and throws TypeError when details is an object (429/409/423 carry objects such as {matches}, {retryAfterSeconds}, {problems}); gateway errors may be non-JSON; no request timeout (a hung POST leaves the form saving forever); error boundaries log whole Error objects (an ApiError carries the response body: patient data risk). Money inputs and chart code still use float arithmetic in unconnected screens (moneyMath.ts is exact; encounterHelpers, labHelpers, pharmacyHelpers, billingAggregate and many Number(e.target.value) inputs are not): each owning chunk replaces them. Every create in an unconnected screen lacks createSingleFlight/classifyCreateError: each owning chunk adds them.
- **Risk:** M — touches every request
- **Depends on:** none

#### F3 — Data layer: TanStack Query v5, keys, cache classes

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): @tanstack/react-query 5.107.1; QueryProvider; scoped key factory [hospitalId, userId, family, …] (scope injected by A2/A3; sign-in and sign-out already clear the cache); cache classes; clear on scope change; invalidateFamily (also after a write whose outcome is unknown); search rules (300 ms, 2 chars, perPage 6); reference hooks now on React Query: lists 10 min, wards and medicines 15 s (live status), records 0. listAll (up to 50 pages) is NOT removed: each owning chunk does that.
- **Screen / action:** No screen. QueryProvider; a key factory whose keys start [hospitalId, userId, …] with the session scope INJECTED (wired in A2, cleared on sign-out and user change in A3); stale times per MD cache-class table; no optimistic updates for money, stock or clinical data; never persisted; paging with keepPreviousData; search debounce 300 ms from 2 characters with the previous request cancelled; fetch-all (listAll, at most 50 pages of 100) still exists in the hooks and report screens that use it — Phase 1 did NOT remove it; each owning chunk deletes its own listAll use and moves to server-side paging. Authenticated data is fetched client-side only (static test: no Server Components, Server Actions or route handlers for data).
- **Endpoints:** none
- **Permission:** see screen
- **Mapper:** none (service functions become queryFns unchanged)
- **Tests:** key shape; cache cleared on sign-out; invalidation map per mutation; debounce/cancel; mock-mode and API-mode suites unchanged
- **Known mismatches:** Needs the new dependency @tanstack/react-query (not in package.json). Our hand-written useResource/loadShared/useReferenceData are replaced. The MD example URL contains search=ali while MD section 7 says no names in URLs; see decisions.
- **Risk:** H — cross-cutting; every screen
- **Depends on:** F2

#### F4 — Shared UI kit (pickers, field errors, banners, error states, CSV)

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): ErrorState (429 countdown), ConflictBanner, OfflineBanner, RouteError + error.tsx for every module folder; fieldErrors mapper; useSubmitGuard/createSingleFlight with holdOnSuccess; fetchAllPages (CSV); usePickerOptions; logRouteError/loggableError (no PHI in logs); source-convention scan tests. Async picker UI is built where first used (PT2/E2).
- **Screen / action:** No screen of its own. Shared pieces every module reuses: async picker (patient, doctor, panel, service, medicine, ICD; perPage 6, active=true, from 2 characters, 300 ms, previous request aborted); VALIDATION_FAILED path-to-field mapper; '*_CHANGED' reload banner that keeps typed values; submit guard (disable from click to response, ignore Enter while pending); 404 / 500 / NETWORK_ERROR states showing requestId; per-route error boundaries plus a global one (never log a whole ApiError); offline banner (writes blocked, F2); CSV helper with formula-injection escaping and a bounded multi-page export with a visible cap; accessibility baseline (visible focus, labelled fields, 44 px targets).
- **Endpoints:** none
- **Permission:** none
- **Mapper:** none
- **Tests:** path-to-field mapping incl. nested paths; banner keeps values; double click and Enter = one request; error boundary shows requestId and logs no body; CSV escapes =,+,-,@ at cell start; picker debounce/abort
- **Known mismatches:** Today these are re-done per screen (or missing): VALIDATION_FAILED and NETWORK_ERROR handling appear only in a few forms; the MD wants them everywhere.
- **Risk:** M — shared by every form
- **Depends on:** F2, F3

### Phase 2 — Authentication and permissions

- **Goal:** Sign in, silent refresh on boot, sign out and sign out everywhere, forced and voluntary password change, /auth/me, permission-driven navigation and buttons, module switches.
- **Entry criteria:** Phase 1 done.
- **Exit criteria:** A reload keeps the session through the refresh cookie; logout calls the backend; nav comes from user.permissions only; hms_session cookie name no longer collides; password change works; all verified on the test backend, and on the real dev backend if credentials are set.
- **Fresh-eyes review at the end of the phase:** YES (mandatory)
- **Auto-continue after the report:** allowed if all conditions hold

#### A1 — Sign in with the real response and error codes

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): Sign-in reads the whole SignInResponse (user, permissions, mustChangePassword); error text per code (INVALID_CREDENTIALS, ACCOUNT_LOCKED countdown, TOO_MANY_REQUESTS, ACCOUNT_DEACTIVATED, HOSPITAL_INACTIVE); UI-hint cookie renamed hms_ui_session (no clash with the backend's hms_session); token in memory only. Not tried with a real account (no credentials).
- **Screen / action:** Login screen: hospital code, identifier, password; error messages per code; lockout countdown from details.retryAfterSeconds.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /auth/login`; body SignInDto: {hospitalCode*, identifier*, password*}; response 200 SignInResponseDto_Output: {accessToken*, tokenType*, expiresIn*, user*{id*, username*, email*, name*, role*, isPlatform*, mustChangePassword*, permissions*, hospital*, primaryLocationId*}}
- **Permission:** public
- **Mapper:** SignIn response -> session user {id, username, email, name, role, isPlatform, mustChangePassword, permissions[], hospital}
- **Tests:** every code in the MD auth table (INVALID_CREDENTIALS, ACCOUNT_LOCKED, TOO_MANY_REQUESTS, ACCOUNT_DEACTIVATED, HOSPITAL_INACTIVE); token only in memory; no storage
- **Known mismatches:** Our UI hint cookie is also named hms_session and collides with the backend's httpOnly refresh cookie (same name, different path): rename it. Our login ignores the user object and sets role null.
- **Risk:** M — account lockout after 5 failures in 15 min; test with one attempt
- **Depends on:** none

#### A2 — Session boot, refresh and expiry

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): Boot refresh -> /auth/me with a neutral splash; ONE shared refresh; proactive refresh 60 s before expiry; 401 TOKEN_EXPIRED -> refresh -> repeat once; SESSION_ROTATED retried once; session-over codes sign out; transient failures keep the session; useScopedKey. Unit-tested (session.test.ts) and in the browser against a stateful test session. Review round: an epoch drops late answers for a previous user; sign-out aborts requests in flight; the 429 wait never blocks logout/refresh; a logout the server never heard is remembered and finished on the next load; SESSION_ROTATED waits 300 ms; boot failures leave no live session behind.
- **Screen / action:** Splash on page load; boot refresh; proactive refresh ~60 s before expiry; retry a failed call once after 401 TOKEN_EXPIRED; one shared in-flight refresh. Calls setQueryScope({hospitalId, userId}) after GET /auth/me. Add a useScopedKey hook (useSyncExternalStore over the scope) so a mounted screen never keeps a key from the previous user; scopedKey() reads a module global at render time. Sign-in and sign-out already clear the query cache (F3 review).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /auth/refresh`; response 200 RefreshResponseDto_Output: {accessToken*, tokenType*, expiresIn*, mustChangePassword*}
  - `GET /auth/me`; response 200 AuthUserDto_Output: {id*, username*, email*, name*, role*, isPlatform*, mustChangePassword*, permissions*, hospital*{id*, code*, name*, defaultCity*, defaultCountry*}, primaryLocationId*}
- **Permission:** any signed-in user
- **Mapper:** Refresh response -> token + expiresIn; /auth/me -> session user (replaces the placeholder CurrentUser)
- **Tests:** two parallel 401s -> exactly one refresh; SESSION_ROTATED retried once; refresh failure -> signed out; boot with and without cookie
- **Known mismatches:** Today a reload signs the user out (no boot refresh).
- **Risk:** H — breaks every screen if wrong
- **Depends on:** A1, F2

#### A3 — Multi-tab, sign-out and shift end

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): POST /auth/logout and /auth/logout-all, local state cleared even offline, BroadcastChannel signs every tab out, 'shift session ended' / idle / session-ended notes, in-memory drafts API (restored only for the same user; wiring into forms happens per form chunk), 15-minute idle sign-out. Idle activity is shared between tabs so a quiet background tab cannot sign out a busy one; an involuntary end keeps drafts in every tab. Drafts (saveDraft/takeDraft) are NOT yet used by any form: PT2 and the other form chunks wire them.
- **Screen / action:** Sign-out button; all tabs sign out together; 'Your shift session ended' note after 12 h with unsaved form text kept in memory; optional 'sign out of all devices'. Idle lock after 15 minutes (a constant): cover the screen; because the backend has no password-verify endpoint, a lock means sign in again (N4); unsaved form text stays in memory only and is restored only for the same user id.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /auth/logout`; response 204 no body
  - `POST /auth/logout-all`; response 204 no body
- **Permission:** any signed-in user
- **Mapper:** none (204)
- **Tests:** sign-out clears token, cache and drafts even if the call fails; BroadcastChannel; SESSION_EXPIRED path idle lock covers the screen and keeps form state; drafts restored for the same user only, dropped for a different one
- **Known mismatches:** Today logout only clears frontend state; the backend call is not made.
- **Risk:** M — shared terminals
- **Depends on:** A2, F3, F4

#### A4 — Forced and voluntary password change

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): Forced change-password screen (nothing else reachable), same form on Profile; rules shown first; WEAK_PASSWORD problems, INVALID_CURRENT_PASSWORD, PASSWORD_UNCHANGED shown on the form; double-submit locked; same token after the 204. The JSON has no 2xx response for this call (SPEC_BUGS).
- **Screen / action:** Change-password screen (only reachable screen while mustChangePassword is true) and the Profile page's password section; shows the rules first and each details.problems[] after.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /auth/change-password`; body ChangePasswordDto: {currentPassword*, newPassword*}; response ?
- **Permission:** any signed-in user (also while the password must change)
- **Mapper:** none (204)
- **Tests:** WEAK_PASSWORD problems listed; INVALID_CURRENT_PASSWORD; PASSWORD_UNCHANGED; token kept after 204
- **Known mismatches:** The Profile page has a password section with no real call. The 'Forgot password' page has no endpoint in the MD: it stays 'Not connected'. The JSON has NO 2xx response for POST /auth/change-password; the MD says 204 and the same access token keeps working. Recorded in SPEC_BUGS_FOR_BACKEND.md. While mustChangePassword is true every other call returns 403 PASSWORD_CHANGE_REQUIRED.
- **Risk:** M — security flow
- **Depends on:** A2

#### A5 — Hospital settings and modules loaded once

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): GET /settings and /settings/modules loaded once (session cache class), not while the password must change; helpers formatMoney (exact 2 decimals; Intl's PKR default would have rounded cents away), formatInstant (hospital time zone), hospital 'today'. Applying them to the 66 formatCurrency call sites and 34 new Date() uses happens in the module chunk that owns each screen.
- **Screen / action:** No new screen. Load after sign-in: currencyCode, timezone, today, print header; which of pharmacy, lab, imaging, ipd are on. 'Today' is read from /settings and refetched on window focus after hospital midnight; the user's own formatting uses the hospital timezone.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /settings`; response 200 SettingsResponseDto_Output: {hospitalCode*, nameEn*, nameUr*, address*, phone*, email*, tagline*, printHeader*, defaultCity*, defaultCountry*, timezone*, currencyCode*, fiscalYearStart*, today*, updatedAt*}
  - `GET /settings/modules`; response 200 ModuleListDto_Output: {data*[{module*, enabled*, enabledAt*}]}
- **Permission:** settings.read
- **Mapper:** settings -> hospital context used by money/date formatting and 'Today' filters; modules -> four booleans
- **Tests:** formatting uses hospital currency and timezone; 'Today' never reads the browser clock; reload after settings are saved
- **Known mismatches:** We show 'Rs.' and the browser clock; patient age is computed with the browser clock.
- **Risk:** M — touches formatting everywhere
- **Depends on:** A2, A4 (load only when mustChangePassword is false; run again after the change-password 204)

#### A6 — Permission-based navigation and route gating

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): Sidebar, route gate (Not allowed page) and dashboard from permissions AND module switches; RoleGate and the role table removed; /auth/me re-read after a 403 and on focus after 15 minutes. Menus per role checked against the handoff's role matrix. RoleGate.tsx / admin layout.tsx are empty leftovers awaiting your OK to delete (N6). Default deny: a page with no rule is refused except /profile; /appointments, /dashboard/stats, discharge (ipd) and billing tabs have their own rules; a test fails if a new page has no rule. Known limit: a user with accounts.read but not billing.read sees the Billing menu and lands on /billing/consultations (Not allowed) until the billing chunks pick the right default tab.
- **Screen / action:** Sidebar, buttons and routes from user.permissions AND module switches; 'Not allowed' page for a typed URL; 403 never signs the user out. /auth/me is refetched after a 403 FORBIDDEN and on window focus after 15 minutes, so an admin's permission change is seen without signing in again (MD says session class never goes stale; this is the safer reading).
- **Endpoints:** none
- **Permission:** per MD section 5 screen table
- **Mapper:** none (uses /auth/me permissions)
- **Tests:** permission-to-screen table pinned to the MD; menus per role of the MD matrix (test planning only); module off hides menus; static test: no role === comparison remains
- **Known mismatches:** Today navigation falls back to a role table (SIDEBAR_VISIBILITY, canSee, RoleGate).
- **Risk:** H — hides or exposes screens
- **Depends on:** A2, A4, A5

#### A7 — Hospital code pre-fill

- **Status:** DONE (per handoff; real-server check pending) (2026-11-07): Hospital code pre-filled from GET /public/hospital (404 tolerated) or the last code typed on this device (the only localStorage value).
- **Screen / action:** Login screen: pre-fill the hospital code; 404 is normal while hospitals share one domain, so remember the last code typed on the device.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /public/hospital`; query: host*; response 200 HospitalBrandingDto_Output: {code*, name*}
- **Permission:** public
- **Mapper:** {code, name}
- **Tests:** 404 tolerated; last code stored (not PHI)
- **Known mismatches:** none known
- **Risk:** L — optional
- **Depends on:** A1

### Phase 3 — Harden what is already connected

- **Goal:** Re-verify patients, panels and guardian relations against openapi.json and the MD; fix gaps.
- **Entry criteria:** Phases 1–2 done.
- **Exit criteria:** Each operation matches the typed contract; create-safety rules proven by tests; array-typed fields tolerated and recorded in SPEC_BUGS_FOR_BACKEND.md.
- **Fresh-eyes review at the end of the phase:** yes (light)
- **Auto-continue after the report:** allowed if all conditions hold

#### H1 — Patients and /auth/me: swap hand-written wire types for the generated contract

- **Status:** PARTIAL (2026-11-07): Patient, panel and guardian-relation request bodies are now typed by the generated contract (a wrong field is a compile error); contract tests added; types regenerated with --default-non-nullable false. Unit/tsc/lint green; browser re-run and fresh-eyes review not done.
- **Screen / action:** No new screen. Replace the hand-written field checks for patients (list, get, create, update, archive, restore) and GET /auth/me with the generated types and add contract tests (every field read exists in the generated types; every field sent exists in the request type). The behavioural defects found by the audit are fixed in the patient chunks that own them (see PT1, PT2, PT3, PT5, PT6). Panels and guardian relations are re-verified in S3 and S4.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /patients`; query: sort, search, panelId, selfPay, gender, admitted, registeredFrom, registeredTo, includeArchived, paging (page, perPage ≤ 100); response 200 PatientPageDto_Output: page of {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, primaryPanel*{id*, name*}, admitted*, lastVisitDate*, balance*, deceasedOn*, archived*} + meta
  - `GET /patients/{id}`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `POST /patients`; body CreatePatientDto: {name*, fatherName, gender*, dob, estimatedAge{value*, unit*}, cnic, phone*, emergencyContact, email, address, area, city, country, bloodGroup, guardianRelationId, guardianRelationText, guardianName, referredBy, remarks, medicalRecordNo, coverages[{panelId*, priority*, memberNo, principalMemberName, principalRelation, validFrom, validTo}], acknowledgeDuplicates}; response 201 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `PATCH /patients/{id}`; body UpdatePatientDto: {name, fatherName, gender, dob, estimatedAge{value*, unit*}, cnic, phone, emergencyContact, email, address, area, city, country, bloodGroup, guardianRelationId, guardianRelationText, guardianName, referredBy, remarks, medicalRecordNo, coverages[{panelId*, priority*, memberNo, principalMemberName, principalRelation, validFrom, validTo}], expectedUpdatedAt}; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `POST /patients/{id}/archive`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `POST /patients/{id}/restore`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `GET /auth/me`; response 200 AuthUserDto_Output: {id*, username*, email*, name*, role*, isPlatform*, mustChangePassword*, permissions*, hospital*{id*, code*, name*, defaultCity*, defaultCountry*}, primaryLocationId*}
- **Permission:** patients.read · patients.write · patients.archive (per MD section 8.3); GET /auth/me needs only a signed-in user
- **Mapper:** existing hand-written mappers (src/lib/services/http/mappers.ts); regenerate against the typed contract in F1
- **Tests:** existing phase5a / phase1 / patients tests re-run; contract tests that every field read exists in the generated types; negative controls
- **Known mismatches:** See the chunks listed above. Patients keep working in the meantime.
- **Risk:** M — real patient data paths
- **Depends on:** F1

#### S3 — Panels (organisations) tab

- **Status:** PARTIAL (2026-11-07): Panels service (get/update/deactivate/reactivate), typed bodies, mock adapter, connected Master Data tab (server paging, debounced search, create/edit diff-only PATCH, active switch, 409 PANEL_NAME_TAKEN offer, catalogs.write gating). 795 unit tests pass. Browser script phase3-api: 9 pass, 2 fail (search debounce check) and the script then errored: NOT verified in a browser.
- **Screen / action:** Master Data -> Panels & Insurance: list, create, edit, deactivate, reactivate.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /panels`; query: sort, search, type, active, paging (page, perPage ≤ 100); response 200 PanelPageDto_Output: page of {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*} + meta
  - `POST /panels`; body CreatePanelDto: {name*, type, contactPerson, phone, commissionPct, discountPct, billingMode}; response 201 PanelResponseDto_Output: {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*}
  - `GET /panels/{id}`; response 200 PanelResponseDto_Output: {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*}
  - `PATCH /panels/{id}`; body UpdatePanelDto: {name, type, contactPerson, phone, commissionPct, discountPct, billingMode}; response 200 PanelResponseDto_Output: {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*}
  - `POST /panels/{id}/deactivate`; response 200 PanelResponseDto_Output: {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*}
  - `POST /panels/{id}/reactivate`; response 200 PanelResponseDto_Output: {id*, name*, type*, contactPerson*, phone*, commissionPct*, discountPct*, billingMode*, active*, createdAt*}
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** Panel <-> OrganisationRecord (add discountPct, billingMode)
- **Tests:** 409 PANEL_NAME_TAKEN offers the existing record; create/update bodies validated; active flag via deactivate/reactivate
- **Known mismatches:** The tab is still mock-only. Our form has an 'active' switch at create; the API creates active and deactivates separately. Our model lacks discountPct and billingMode.
- **Risk:** L — catalog
- **Depends on:** F3

#### S4 — Guardian relations tab

- **Status:** PARTIAL (2026-11-07): Same for guardian relations (tab, service, mock, tests). Browser checks for S4 did not run because the script stopped earlier.
- **Screen / action:** List, create, edit, deactivate, reactivate.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /guardian-relations`; query: sort, search, active, paging (page, perPage ≤ 100); response 200 GuardianRelationPageDto_Output: page of {id*, name*, remarks*, active*, createdAt*} + meta
  - `POST /guardian-relations`; body CreateGuardianRelationDto: {name*, remarks}; response 201 GuardianRelationResponseDto_Output: {id*, name*, remarks*, active*, createdAt*}
  - `GET /guardian-relations/{id}`; response 200 GuardianRelationResponseDto_Output: {id*, name*, remarks*, active*, createdAt*}
  - `PATCH /guardian-relations/{id}`; body UpdateGuardianRelationDto: {name, remarks}; response 200 GuardianRelationResponseDto_Output: {id*, name*, remarks*, active*, createdAt*}
  - `POST /guardian-relations/{id}/deactivate`; response 200 GuardianRelationResponseDto_Output: {id*, name*, remarks*, active*, createdAt*}
  - `POST /guardian-relations/{id}/reactivate`; response 200 GuardianRelationResponseDto_Output: {id*, name*, remarks*, active*, createdAt*}
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** GuardianRelation <-> GuardianRelationRecord
- **Tests:** 409 GUARDIAN_RELATION_TAKEN; deactivate/reactivate
- **Known mismatches:** Tab is mock-only today.
- **Risk:** L — catalog
- **Depends on:** F3

### Phase 4 — Clinic setup

- **Goal:** Users, doctors, services, lab/imaging test catalogs, wards and beds, settings, module switches, ICD-10; expense categories and bank accounts are blocked.
- **Entry criteria:** Phase 3 done.
- **Exit criteria:** Every chunk that has its endpoints in openapi.json is connected, with deactivate/reactivate instead of delete; blocked chunks listed.
- **Fresh-eyes review at the end of the phase:** yes (light)
- **Auto-continue after the report:** allowed if all conditions hold

#### S1 — Clinic Settings tab

- **Status:** NOT STARTED
- **Screen / action:** Master Data -> Clinic Settings: view and save with expectedUpdatedAt; reload banner on 409 SETTINGS_CHANGED keeping typed values; CURRENCY_LOCKED / TIMEZONE_LOCKED shown.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /settings`; response 200 SettingsResponseDto_Output: {hospitalCode*, nameEn*, nameUr*, address*, phone*, email*, tagline*, printHeader*, defaultCity*, defaultCountry*, timezone*, currencyCode*, fiscalYearStart*, today*, updatedAt*}
  - `PATCH /settings`; body UpdateSettingsDto: {nameEn, nameUr, address, phone, email, tagline, printHeader, defaultCity, defaultCountry, timezone, currencyCode, fiscalYearStart, expectedUpdatedAt}; response 200 SettingsResponseDto_Output: {hospitalCode*, nameEn*, nameUr*, address*, phone*, email*, tagline*, printHeader*, defaultCity*, defaultCountry*, timezone*, currencyCode*, fiscalYearStart*, today*, updatedAt*}
- **Permission:** settings.write (the Clinic Settings tab and route are shown only with settings.write; MD section 5); GET /settings itself needs only a signed-in user
- **Mapper:** settings <-> form (send changed fields only)
- **Tests:** diff-only PATCH; conflict banner; locked errors
- **Known mismatches:** Today the tab is mock-only and says 'Settings saved' without saving (hidden in API mode already).
- **Risk:** M — concurrency
- **Depends on:** A5

#### S2 — Module switches

- **Status:** NOT STARTED
- **Screen / action:** Switch pharmacy, lab, imaging, ipd on or off; refused with MODULE_IN_USE (details.openAdmissions).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /settings/modules/{module}/enable`; response 200 ModuleStateDto_Output: {module*, enabled*, enabledAt*}
  - `POST /settings/modules/{module}/disable`; response 200 ModuleStateDto_Output: {module*, enabled*, enabledAt*}
- **Permission:** settings.write
- **Mapper:** ModuleState
- **Tests:** MODULE_IN_USE message; menus update
- **Known mismatches:** No screen exists for this today (decision D6).
- **Risk:** L — small
- **Depends on:** S1

#### S5 — Services catalog tab

- **Status:** NOT STARTED
- **Screen / action:** List, create, edit, deactivate, reactivate; fields code, name, category, rate, gstPct, discountPct.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /services`; query: sort, search, category, active, paging (page, perPage ≤ 100); response 200 ServicePageDto_Output: page of {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*} + meta
  - `POST /services`; body CreateServiceDto: {code, name*, category, rate*, gstPct, discountPct}; response 201 ServiceResponseDto_Output: {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*}
  - `GET /services/{id}`; response 200 ServiceResponseDto_Output: {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*}
  - `PATCH /services/{id}`; body UpdateServiceDto: {code, name, category, rate, gstPct, discountPct}; response 200 ServiceResponseDto_Output: {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*}
  - `POST /services/{id}/deactivate`; response 200 ServiceResponseDto_Output: {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*}
  - `POST /services/{id}/reactivate`; response 200 ServiceResponseDto_Output: {id*, code*, name*, category*, rate*, gstPct*, discountPct*, active*, createdAt*}
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** Service <-> ServiceCatalogRecord (rate and percentages as strings)
- **Tests:** money strings; category filter server-side (no fetch-all)
- **Known mismatches:** Our screen lists all items and filters in the browser; the MD forbids that.
- **Risk:** L — catalog
- **Depends on:** F3

#### S6 — Lab tests catalog tab

- **Status:** NOT STARTED
- **Screen / action:** List, create, edit, deactivate, reactivate; parameters with units and reference ranges by sex, critical limits, or narrative:true.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /lab-tests`; query: sort, search, category, specimenType, active, paging (page, perPage ≤ 100); response 200 LabTestPageDto_Output: page of {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*} + meta
  - `POST /lab-tests`; body CreateLabTestDto: {code*, name*, category*, specimenType*, rate*, gstPct, discountPct, turnaroundHours, narrative, parameters[{key*, name*, unit, decimals, ranges, critical}]}; response 201 LabTestResponseDto_Output: {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*}
  - `GET /lab-tests/{id}`; response 200 LabTestResponseDto_Output: {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*}
  - `PATCH /lab-tests/{id}`; body UpdateLabTestDto: {code, name, category, specimenType, rate, gstPct, discountPct, turnaroundHours, narrative, parameters[{key*, name*, unit, decimals, ranges, critical}]}; response 200 LabTestResponseDto_Output: {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*}
  - `POST /lab-tests/{id}/deactivate`; response 200 LabTestResponseDto_Output: {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*}
  - `POST /lab-tests/{id}/reactivate`; response 200 LabTestResponseDto_Output: {id*, code*, name*, category*, specimenType*, rate*, gstPct*, discountPct*, turnaroundHours*, narrative*, parameters*[{key*, name*, unit, decimals, ranges, critical}], active*, createdAt*}
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** LabTest <-> LabTestRecord
- **Tests:** parameter ranges by sex round trip; narrative tests
- **Known mismatches:** Our model has one reference range; the API has ranges by sex and critical limits (check at chunk time).
- **Risk:** M — clinical reference data
- **Depends on:** F3

#### S7 — Imaging tests catalog (X-Ray, Ultrasound, Doppler, Echo, ECG)

- **Status:** NOT STARTED
- **Screen / action:** The ECG and Ultrasound tabs are imaging tests with modality ECG / Ultrasound.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /imaging-tests`; query: sort, search, modality, active, paging (page, perPage ≤ 100); response 200 ImagingTestPageDto_Output: page of {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*} + meta
  - `POST /imaging-tests`; body CreateImagingTestDto: {code*, name*, modality*, rate*, gstPct, discountPct, turnaroundHours, reportRequired, reportTemplate}; response 201 ImagingTestResponseDto_Output: {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*}
  - `GET /imaging-tests/{id}`; response 200 ImagingTestResponseDto_Output: {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*}
  - `PATCH /imaging-tests/{id}`; body UpdateImagingTestDto: {code, name, modality, rate, gstPct, discountPct, turnaroundHours, reportRequired, reportTemplate}; response 200 ImagingTestResponseDto_Output: {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*}
  - `POST /imaging-tests/{id}/deactivate`; response 200 ImagingTestResponseDto_Output: {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*}
  - `POST /imaging-tests/{id}/reactivate`; response 200 ImagingTestResponseDto_Output: {id*, code*, name*, modality*, rate*, gstPct*, discountPct*, turnaroundHours*, reportRequired*, reportTemplate*, active*, createdAt*}
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** ImagingTest <-> EcgUltrasoundTestRecord (modality filter)
- **Tests:** modality filter; reportRequired; reportTemplate
- **Known mismatches:** Our key ecgTests maps to this one catalog by modality.
- **Risk:** L — catalog
- **Depends on:** F3

#### S8 — Wards and beds setup

- **Status:** NOT STARTED
- **Screen / action:** Master Data -> Wards & Beds: create a ward with its beds in one call, rename, add a bed, retire/reactivate.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /wards`; query: sort, search, type, active, paging (page, perPage ≤ 100); response 200 WardPageDto_Output: page of {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*} + meta
  - `GET /wards/{id}`; response 200 WardDetailDto_Output: {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*, beds*[{id*, bedNo*, state*, active*}]}
  - `POST /wards`; body CreateWardDto: {name*, type*, dailyRate*, beds}; response 201 WardDetailDto_Output: {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*, beds*[{id*, bedNo*, state*, active*}]}
  - `PATCH /wards/{id}`; body UpdateWardDto: {name, type, dailyRate}; response 200 WardDetailDto_Output: {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*, beds*[{id*, bedNo*, state*, active*}]}
  - `POST /wards/{id}/deactivate`; response 200 WardDetailDto_Output: {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*, beds*[{id*, bedNo*, state*, active*}]}
  - `POST /wards/{id}/reactivate`; response 200 WardDetailDto_Output: {id*, name*, type*, dailyRate*, active*, bedCount*, occupiedCount*, availableCount*, createdAt*, beds*[{id*, bedNo*, state*, active*}]}
  - `POST /wards/{id}/beds`; body CreateBedDto: {bedNo*}; response 201 BedResponseDto_Output: {id*, bedNo*, state*, active*, wardId*}
  - `PATCH /beds/{id}`; body UpdateBedDto: {bedNo*}; response 200 BedResponseDto_Output: {id*, bedNo*, state*, active*, wardId*}
  - `POST /beds/{id}/deactivate`; response 200 BedResponseDto_Output: {id*, bedNo*, state*, active*, wardId*}
  - `POST /beds/{id}/reactivate`; response 200 BedResponseDto_Output: {id*, bedNo*, state*, active*, wardId*}
- **Permission:** ipd.read (reads) / catalogs.write (changes)
- **Mapper:** Ward, Bed
- **Tests:** ward with beds in one call; bed retire/reactivate
- **Known mismatches:** Our bed overview cycles a bed's status by clicking. In the API a bed is available, occupied or maintenance: occupied is derived, and maintenance is a separate call (ipd.write, chunk E8).
- **Risk:** M — screen behaviour changes
- **Depends on:** F3

#### S9 — Staff users

- **Status:** NOT STARTED
- **Screen / action:** Admin -> Users: list (search, role, active), create, edit, deactivate, reactivate, reset password, sign out everywhere.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /users`; query: sort, search, role, active, paging (page, perPage ≤ 100); response 200 UserPageDto_Output: page of {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}} + meta
  - `POST /users`; body CreateUserDto: {username*, email, role*, name*, phone, cnic, address, city, joiningDate, doctorProfile{specialization, qualifications, pmcRegNo, consultationFee*, commissionPct, notes}}; response 201 UserWithTemporaryPasswordDto_Output: {user*{id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*}, temporaryPassword*}
  - `GET /users/{id}`; response 200 UserResponseDto_Output: {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}}
  - `PATCH /users/{id}`; body UpdateUserDto: {username, email, role, name, phone, cnic, address, city, joiningDate, doctorProfile{specialization, qualifications, pmcRegNo, consultationFee*, commissionPct, notes}}; response 200 UserResponseDto_Output: {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}}
  - `POST /users/{id}/deactivate`; response 200 UserResponseDto_Output: {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}}
  - `POST /users/{id}/reactivate`; response 200 UserResponseDto_Output: {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}}
  - `POST /users/{id}/reset-password`; response 200 TemporaryPasswordDto_Output: {temporaryPassword*}
  - `POST /users/{id}/sign-out-everywhere`; response 204 no body
- **Permission:** users.read / users.write
- **Mapper:** User <-> UserRecord; temporaryPassword shown once in a dialog with a copy button, never stored or logged
- **Tests:** roles offered from the fixed list; temp password not persisted (render test); deactivate ends sessions message
- **Known mismatches:** Our create form asks for a password; the API generates a temporary password. Our send-password-reset is replaced by reset-password. users.setActive becomes two calls.
- **Risk:** M — one-time secrets
- **Depends on:** A6, F3

#### S10 — Doctors

- **Status:** NOT STARTED
- **Screen / action:** Admin -> Doctors list/create/edit; doctor pickers everywhere.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /users`; query: sort, search, role, active, paging (page, perPage ≤ 100); response 200 UserPageDto_Output: page of {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}} + meta
  - `POST /users`; body CreateUserDto: {username*, email, role*, name*, phone, cnic, address, city, joiningDate, doctorProfile{specialization, qualifications, pmcRegNo, consultationFee*, commissionPct, notes}}; response 201 UserWithTemporaryPasswordDto_Output: {user*{id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*}, temporaryPassword*}
  - `PATCH /users/{id}/doctor-profile`; body UpdateDoctorProfileDto: {specialization, qualifications, pmcRegNo, consultationFee, commissionPct, notes}; response 200 UserResponseDto_Output: {id*, username*, email*, name*, phone*, cnic*, address*, city*, joiningDate*, role*, active*, mustChangePassword*, locked*, lastLoginAt*, createdAt*, doctorProfile*{specialization*, qualifications*, pmcRegNo*, consultationFee*, commissionPct*, photoUrl*, notes*}}
  - `GET /doctors`; query: sort, search, paging (page, perPage ≤ 100); response 200 DoctorPageDto_Output: page of {id*, name*, specialization*, qualifications*, consultationFee*} + meta
- **Permission:** users.read / users.write; GET /doctors needs doctors.read
- **Mapper:** User with role doctor + doctorProfile {specialization, qualifications, pmcRegNo, consultationFee, commissionPct, notes} <-> DoctorRecord; GET /doctors -> picker
- **Tests:** create sends doctorProfile; fee as string; picker returns active doctors only
- **Known mismatches:** Doctors are users: there is no separate doctor record (a doctor's id is the user id). Availability days/hours are the schedule (chunk AP1), not a profile field. Photo is hidden (file storage not built).
- **Risk:** M — model change
- **Depends on:** S9

#### S11 — ICD-10 lookup

- **Status:** NOT STARTED
- **Screen / action:** Diagnosis lookup in the encounter and discharge screens.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /icd-codes`; query: sort, search, paging (page, perPage ≤ 100); response 200 IcdCodePageDto_Output: page of {id*, code*, name*, category*} + meta
- **Permission:** catalogs.read
- **Mapper:** IcdCode -> lookup row
- **Tests:** debounced search; code-prefix search
- **Known mismatches:** The Diseases/Diagnosis Master Data tab is an editable list; the API's ICD-10 list is read-only and shared (decision D7).
- **Risk:** L — read-only
- **Depends on:** F3

#### S12 — Expense categories tab

- **Status:** DONE (proposed contract; real-server check pending) 2026-11-07, built against the PROPOSED contract (docs/openapi.draft.json, docs/BACKEND_CONTRACT_PROPOSED.md section 1); unit-tested, browser suite p4-s12s13d8-api.js 39/39 against a test backend that checks every request and response against openapi.draft.json, NOT verified on a real server. Routes and permissions are the handoff's (8.2, 8.10, 9): GET /expense-categories; POST /expense-categories; GET /expense-categories/{id}; PATCH /expense-categories/{id}; POST /expense-categories/{id}/deactivate; POST /expense-categories/{id}/reactivate. Files: src/lib/services/http/expenseCategories.ts, src/components/masterdata/ExpenseCategoriesTab.tsx.
- **Screen / action:** Master Data -> Expense Categories: list, create, rename, deactivate, reactivate.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /expense-categories` — **NOT IN openapi.json** (shape unknown)
  - `POST /expense-categories` — **NOT IN openapi.json** (shape unknown)
  - `GET /expense-categories/{id}` — **NOT IN openapi.json** (shape unknown)
  - `PATCH /expense-categories/{id}` — **NOT IN openapi.json** (shape unknown)
  - `POST /expense-categories/{id}/deactivate` — **NOT IN openapi.json** (shape unknown)
  - `POST /expense-categories/{id}/reactivate` — **NOT IN openapi.json** (shape unknown)
- **Permission:** catalogs.read / catalogs.write
- **Mapper:** not writable: no shape
- **Tests:** after the JSON is refreshed
- **Known mismatches:** Delete becomes deactivate. BLOCKED chunk. docs/openapi.draft.json may document it, but there is NO UI wiring until the real spec exists.
- **Risk:** L — catalog
- **Depends on:** refreshed openapi.json

#### S13 — Bank accounts tab

- **Status:** DONE (proposed contract; real-server check pending) 2026-11-07, built against the PROPOSED contract (docs/openapi.draft.json, docs/BACKEND_CONTRACT_PROPOSED.md section 2); unit-tested, browser suite p4-s12s13d8-api.js 39/39 against a test backend that checks every request and response against openapi.draft.json, NOT verified on a real server. GET needs accounts.read (the tab is hidden without it), POST/PATCH/deactivate/reactivate need catalogs.write. Files: src/lib/services/http/bankAccounts.ts, src/components/masterdata/BankAccountsTab.tsx.
- **Screen / action:** Master Data -> Banks: list, create, edit, deactivate, reactivate; account numbers only for money handlers.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /bank-accounts` — **NOT IN openapi.json** (shape unknown)
  - `GET /bank-accounts/{id}` — **NOT IN openapi.json** (shape unknown)
  - `POST /bank-accounts` — **NOT IN openapi.json** (shape unknown)
  - `PATCH /bank-accounts/{id}` — **NOT IN openapi.json** (shape unknown)
  - `POST /bank-accounts/{id}/deactivate` — **NOT IN openapi.json** (shape unknown)
  - `POST /bank-accounts/{id}/reactivate` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read (reads) / catalogs.write (changes)
- **Mapper:** not writable: no shape (MD prose: {bankName, accountTitle, accountNo, branch?})
- **Tests:** after the JSON is refreshed
- **Known mismatches:** none known BLOCKED chunk. docs/openapi.draft.json may document it, but there is NO UI wiring until the real spec exists.
- **Risk:** L — catalog
- **Depends on:** refreshed openapi.json

### Phase 5 — Patients

- **Goal:** Register, list/search (server side), edit with changed fields only and expectedUpdatedAt, archive/restore, record/revoke death, duplicate check, profile. (The patient Visits tab, PT8, is built in phase 7 after E1.)
- **Entry criteria:** Phases 3 done and phase 4 done or BLOCKED.
- **Exit criteria:** All patient actions work against the contract; no fetch-all; search never in the address bar.
- **Fresh-eyes review at the end of the phase:** yes
- **Auto-continue after the report:** allowed if all conditions hold

#### PT1 — Patient list and search

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Patients list: server-side search, filters, paging, sort; Active / IPD tabs; Inactive tab.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /patients`; query: sort, search, panelId, selfPay, gender, admitted, registeredFrom, registeredTo, includeArchived, paging (page, perPage ≤ 100); response 200 PatientPageDto_Output: page of {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, primaryPanel*{id*, name*}, admitted*, lastVisitDate*, balance*, deceasedOn*, archived*} + meta
- **Permission:** patients.read
- **Mapper:** PatientList item -> PatientRecord (already written)
- **Tests:** page/perPage <= 100; sort only from the allowlist; balance null without billing.read; search not placed in the URL
- **Known mismatches:** Inactive tab: the API only has includeArchived (live and archived together), so it stays Not connected until the backend answers. Filters are not in the URL yet. Audit defects owned here: list rows show bloodGroup 'Unknown' and guardianRelation '' because the list DTO has neither (show nothing instead); an archived-only filter is missing ('Inactive' tab pending); search is not clamped to the contract's max 100; the list does not read dobEstimated or deceasedOn; sort only from the values the JSON states (the JSON has no sort allowlist: log in SPEC_BUGS).
- **Risk:** L — already connected
- **Depends on:** F3

#### PT2 — Register a patient

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Patients -> New: date of birth OR estimated age (exactly one), coverages (at most one primary, one secondary), guardian, MR number issued on save (never predicted).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /patients`; body CreatePatientDto: {name*, fatherName, gender*, dob, estimatedAge{value*, unit*}, cnic, phone*, emergencyContact, email, address, area, city, country, bloodGroup, guardianRelationId, guardianRelationText, guardianName, referredBy, remarks, medicalRecordNo, coverages[{panelId*, priority*, memberNo, principalMemberName, principalRelation, validFrom, validTo}], acknowledgeDuplicates}; response 201 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.write
- **Mapper:** PatientInput -> CreatePatientDto (already written); add estimatedAge
- **Tests:** exactly one of dob / estimatedAge; creates sent once; saved-but-unreadable handled (done)
- **Known mismatches:** Form has SS/Emp number and a photo with no API fields (not sent). The form's 'Save & OPD/IPD ticket' buttons are create + check-in/admit: two calls with different permissions (decision D4). Audit defects owned here: guardianRelationText is always sent although the form holds a catalogue id (send guardianRelationId for a catalogued relation); client validation differs from the contract (CNIC pattern, max lengths fatherName 120, address 300, area 120, city 80, referredBy 120, guardianName 120, medicalRecordNo 60; the Pakistan-mobile-only phone regex vs the contract's 4–30 characters; panel name 2–120, relation name 2–60); photo and SS/Emp number are collected but dropped (hide or 'Not connected' in API mode); Save is re-enabled right after router.push (double-submit window). The 'Save & OPD/IPD ticket' buttons stay DISABLED until E2/E7 exist. Review follow-ups owned here: the form re-enables Save in a finally right after router.push (use createSingleFlight/useSubmitGuard with holdOnSuccess); the picker search timing is duplicated (PatientPicker 200 ms, list pages 250 ms, patientHelpers.pickerSearchTerm) and must use src/lib/query/search.ts (300 ms, 2 characters).
- **Risk:** M — creates a record
- **Depends on:** PT1

#### PT3 — Duplicate check

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Warning on phone/CNIC blur; on 409 POSSIBLE_DUPLICATE show details.matches; staff choose open, restore (archived match) or register anyway (resend once with acknowledgeDuplicates:true).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /patients/duplicates`; query: phone, cnic; response 200 DuplicateCheckDto_Output: {matches*[{id*, mrNo*, name*, fatherName*, gender*, dob*, phone*, cnic*, deceasedOn*, archived*, matchedOn*}]}
  - `POST /patients`; body CreatePatientDto: {name*, fatherName, gender*, dob, estimatedAge{value*, unit*}, cnic, phone*, emergencyContact, email, address, area, city, country, bloodGroup, guardianRelationId, guardianRelationText, guardianName, referredBy, remarks, medicalRecordNo, coverages[{panelId*, priority*, memberNo, principalMemberName, principalRelation, validFrom, validTo}], acknowledgeDuplicates}; response 201 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.read / patients.write
- **Mapper:** DuplicateCheck -> matches list
- **Tests:** acknowledge resends exactly one extra POST; archived match offers Restore
- **Known mismatches:** We warn today by searching the phone number through the list. Audit defect owned here: 409 POSSIBLE_DUPLICATE is a dead end today (acknowledgeDuplicates never sent; details.matches dropped because details is an object; the duplicate check compares phone only). Restore on an archived match is shown only if the user holds patients.archive.
- **Risk:** M — decides whether a duplicate is created
- **Depends on:** PT2

#### PT4 — Patient profile

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Patient page header and summary; phone formatted from E.164, CNIC with dashes, age from the hospital calendar.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /patients/{id}`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.read
- **Mapper:** PatientDetail -> PatientRecord (already written); estimated-age display '~45 yrs'
- **Tests:** formats; null-safe for every nullable field
- **Known mismatches:** Age uses the browser clock today; phone/CNIC shown as stored.
- **Risk:** L — read
- **Depends on:** A5

#### PT5 — Edit a patient

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Edit form: only changed fields are sent, with expectedUpdatedAt; 409 PATIENT_CHANGED shows a reload banner that keeps typed values.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `PATCH /patients/{id}`; body UpdatePatientDto: {name, fatherName, gender, dob, estimatedAge{value*, unit*}, cnic, phone, emergencyContact, email, address, area, city, country, bloodGroup, guardianRelationId, guardianRelationText, guardianName, referredBy, remarks, medicalRecordNo, coverages[{panelId*, priority*, memberNo, principalMemberName, principalRelation, validFrom, validTo}], expectedUpdatedAt}; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.write
- **Mapper:** diff(form, loaded record) -> UpdatePatientDto
- **Tests:** unchanged form sends nothing; one changed field sends only it; stale version -> banner
- **Known mismatches:** Our update sends the whole form with nulls. Audit defects owned here: update is get → [restore] → PATCH → [archive], not atomic, and the PATCH reuses the loaded expectedUpdatedAt although a restore may bump updatedAt (own save fails with 409 PATIENT_CHANGED): re-read the version between steps; a primary-panel change rewrites coverages from {panelId, priority} only, so memberNo, principalMemberName, principalRelation, validFrom, validTo are lost: send the full coverage objects back; client validation vs contract as in PT2; PATCH sends changed fields only.
- **Risk:** M — data loss on concurrent edit
- **Depends on:** PT4

#### PT6 — Archive and restore

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** 'Archive Patient' (never Delete) and 'Restore Patient'; the Active switch maps to the same calls.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /patients/{id}/archive`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `POST /patients/{id}/restore`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.archive (Archive / Restore)
- **Mapper:** PatientDetail
- **Tests:** PATIENT_ADMITTED refusal message; restore before editing an archived patient (PATIENT_ARCHIVED)
- **Known mismatches:** Done in Phases 0.5/1; review only.
- **Risk:** L — reversible
- **Depends on:** PT5

#### PT7 — Record and revoke death

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p5-api.js 68/68 and demo-mode smoke p5-mock.js 14/14 against a contract-shaped test backend; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Patient page action for a death outside an admission, and its reversal.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /patients/{id}/record-death`; body RecordDeathDto: {deceasedOn*}; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
  - `POST /patients/{id}/revoke-death`; response 200 PatientDetailDto_Output: {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, admitted*, lastVisitDate*, deceasedOn*, archived*, medicalRecordNo*, emergencyContact*, email*, address*, area*, country*, bloodGroup*, guardianRelation*{id*, name*}, guardianName*, referredBy*, remarks*, photoUrl*, coverages*[{panel*, priority*, memberNo*, principalMemberName*, principalRelation*, validFrom*, validTo*, benefitsApply*}], archivedAt*, createdAt*, updatedAt*}
- **Permission:** patients.record_death
- **Mapper:** RecordDeath body; PatientDetail
- **Tests:** body validated; deceasedOn shown double click = one request
- **Known mismatches:** The UI has no deceased state today.
- **Risk:** M — sensitive
- **Depends on:** PT4

### Phase 6 — Appointments and doctor schedules

- **Goal:** Doctor weekly schedule, slot grid, booking, confirm/reschedule/cancel/no-show, check-in from an appointment.
- **Entry criteria:** Phase 5 done.
- **Exit criteria:** Appointment schedule, slot grid, list and actions exist and match the contract (the page is a placeholder today). Check-in from an appointment (AP5) is built in phase 7 after E2.
- **Fresh-eyes review at the end of the phase:** yes
- **Auto-continue after the report:** allowed if all conditions hold

#### AP1 — Doctor weekly schedule

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p6-api.js 67/67 against a contract-shaped test backend that checks every request and response against openapi.json; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Schedule editor for a doctor (days, from, to, slotMinutes); days:[] takes the doctor off appointments.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /doctors/{id}/schedule`; response 200 ScheduleResponseDto_Output: {doctorId*, days*, from*, to*, slotMinutes*}
  - `PUT /doctors/{id}/schedule`; body SetScheduleDto: {days*, from*, to*, slotMinutes*}; response 200 ScheduleResponseDto_Output: {doctorId*, days*, from*, to*, slotMinutes*}
- **Permission:** doctors.read / users.write
- **Mapper:** Schedule <-> DoctorRecord availability
- **Tests:** empty days; slot minutes
- **Known mismatches:** Replaces the doctor form's availableDays/hoursFrom/hoursTo.
- **Risk:** M — replaces a whole schedule
- **Depends on:** S10

#### AP2 — Book from the slot grid

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p6-api.js 67/67 against a contract-shaped test backend that checks every request and response against openapi.json; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Pick doctor and date, choose a free slot, book; 409 SLOT_TAKEN reloads the slots.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /doctors/{id}/slots`; query: date*; response 200 SlotsResponseDto_Output: {doctorId*, date*, slotMinutes*, slots*[{time*, startsAt*, state*}]}
  - `POST /appointments`; body BookAppointmentDto: {patientId*, doctorId*, date*, time*, notes, confirmed}; response 201 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
- **Permission:** appointments.read / appointments.write
- **Mapper:** Slots (free, booked, passed); BookAppointment
- **Tests:** time must be a free slot start; SLOT_TAKEN, PATIENT_ALREADY_BOOKED, NOT_A_SLOT, SLOT_PASSED; single submit
- **Known mismatches:** No appointments screen exists (decision D5).
- **Risk:** M — new screen
- **Depends on:** AP1, PT1

#### AP3 — Appointments list and detail

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p6-api.js 67/67 against a contract-shaped test backend that checks every request and response against openapi.json; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** List with date, doctor, patient, status, search; detail view.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /appointments`; query: sort, date, dateFrom, dateTo, doctorId, patientId, status, search, paging (page, perPage ≤ 100); response 200 AppointmentPageDto_Output: page of {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*} + meta
  - `GET /appointments/{id}`; response 200 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
- **Permission:** appointments.read
- **Mapper:** Appointment
- **Tests:** filters; allowedActions present
- **Known mismatches:** New screen.
- **Risk:** L — read
- **Depends on:** AP2

#### AP4 — Confirm, reschedule, cancel, no-show

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 (unit-tested, API build compiles; browser suite p6-api.js 67/67 against a contract-shaped test backend that checks every request and response against openapi.json; NOT verified on a real server). Details and files: docs/INTEGRATION_PROGRESS.md.
- **Screen / action:** Exactly the buttons in allowedActions (confirm, reschedule, cancel, no_show, check_in).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /appointments/{id}/confirm`; response 200 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
  - `PATCH /appointments/{id}`; body RescheduleAppointmentDto: {doctorId, date, time, notes}; response 200 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
  - `POST /appointments/{id}/cancel`; body CancelAppointmentDto: {reason*}; response 200 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
  - `POST /appointments/{id}/no-show`; response 200 AppointmentResponseDto_Output: {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*}
- **Permission:** appointments.write
- **Mapper:** Appointment; Reschedule, Cancel bodies
- **Tests:** property: no button the API would refuse; APPOINTMENT_CHANGED, APPOINTMENT_NOT_OPEN, APPOINTMENT_NOT_TODAY
- **Known mismatches:** none known
- **Risk:** M — state machine
- **Depends on:** AP3

### Phase 7 — Encounters

- **Goal:** OPD/IPD check-in and admit, vitals, notes, clinical record, close, transfer, discharge, cancel, reopen, archive/restore, bed board.
- **Entry criteria:** Phases 5–6 done.
- **Exit criteria:** Every encounter action is its own backend call by the role that owns it; allowedActions drive the buttons.
- **Fresh-eyes review at the end of the phase:** YES (mandatory)
- **Auto-continue after the report:** NO (needs your explicit approval)

#### E1 — Encounter list and OPD queue

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Encounters list, a doctor's queue (status=open, sort=tokenNo:asc), pending records (pending=true).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters`; query: sort, search, type, status, doctorId, dateFrom, dateTo, admitted, pending, includeArchived, patientId, paging (page, perPage ≤ 100); response 200 EncounterPageDto_Output: page of {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*} + meta
- **Permission:** encounters.read or encounters.check_in
- **Mapper:** EncounterList item -> EncounterRecord
- **Tests:** queue and pending filters; polling 30 s; front desk response
- **Known mismatches:** Our status values (open/discharged/cancelled) must be mapped from the API's.
- **Risk:** M — status mapping
- **Depends on:** F3

#### PT8 — Patient visits tab

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Visits and History tabs on the patient page.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /patients/{id}/encounters`; query: sort, type, status, includeArchived, paging (page, perPage ≤ 100); response 200 EncounterPageDto_Output: page of {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*} + meta
- **Permission:** encounters.read or encounters.check_in
- **Mapper:** EncounterList item -> visit row
- **Tests:** paged; permission-gated tab
- **Known mismatches:** The tab reads demo data in mock mode only.
- **Risk:** L — read
- **Depends on:** PT4, E1 (built in phase 7 right after E1)

#### E6 — Encounter detail

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Encounter page: front desk sees clinical:null; clinicians see the record.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters/{id}`; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** encounters.read or encounters.check_in
- **Mapper:** EncounterDetail
- **Tests:** clinical:null renders
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** E1

#### E2 — OPD check-in

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Front desk checks a patient in: issues the encounter number and token, and charges the consultation.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/opd`; body CheckInDto: {patientId*, doctorId*, priority, advisedBy, referredBy, reason, startedAt, appointmentId}; response 201 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** encounters.check_in
- **Mapper:** CheckIn -> EncounterDetail
- **Tests:** never a predicted number; one request; ENCOUNTER codes; MODULE_DISABLED Error codes are the ones in the JSON for POST /encounters/opd: PATIENT_ARCHIVED, PATIENT_DECEASED, PATIENT_ADMITTED, DOCTOR_UNAVAILABLE, APPOINTMENT_* (no module code).
- **Known mismatches:** Our New Encounter wizard step 1 + billing step; encounters.create has no single backend equivalent.
- **Risk:** H — creates a charge
- **Depends on:** PT1, S10

#### AP5 — Check in from an appointment

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** 'Check in' on an appointment opens the visit and completes the appointment.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/opd`; body CheckInDto: {patientId*, doctorId*, priority, advisedBy, referredBy, reason, startedAt, appointmentId}; response 201 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** encounters.check_in
- **Mapper:** CheckIn with appointmentId
- **Tests:** APPOINTMENT_MISMATCH; one request
- **Known mismatches:** Shares the call with chunk E2.
- **Risk:** M — charges the consultation
- **Depends on:** AP4, E2 (built in phase 7 right after E2)

#### E3 — Vitals

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Nurse records a vitals reading; history newest first; bmi derived by the server.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters/{id}/vitals`; query: sort, paging (page, perPage ≤ 100); response 200 VitalsPageDto_Output: page of {id*, recordedAt*, recordedBy*{id*, name*}, bpSystolic*, bpDiastolic*, pulse*, temperatureF*, weightKg*, heightCm*, spo2*, rbs*, bmi*} + meta
  - `POST /encounters/{id}/vitals`; body VitalsReadingDto: {recordedAt, bpSystolic, bpDiastolic, pulse, temperatureF, weightKg, heightCm, spo2, rbs}; response 201 VitalsResponseDto_Output: {id*, recordedAt*, recordedBy*{id*, name*}, bpSystolic*, bpDiastolic*, pulse*, temperatureF*, weightKg*, heightCm*, spo2*, rbs*, bmi*}
- **Permission:** encounters.read / encounters.record_vitals
- **Mapper:** VitalsReading, VitalsPage
- **Tests:** one reading per POST; time rules (not future, at most 7 days back)
- **Known mismatches:** Our wizard collects vitals in a step.
- **Risk:** L — append only
- **Depends on:** E2

#### E8 — Bed board (read-only)

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Bed board (available / occupied / maintenance) read-only; refresh 30 s. It is built BEFORE the admission screen because admission picks a bed from it.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /wards/occupancy`; response 200 OccupancyDto_Output: {wards*[{id*, name*, type*, dailyRate*, beds*}]}
- **Permission:** ipd.read / ipd.write AND the ipd module
- **Mapper:** Occupancy; BedMaintenance
- **Tests:** refresh 30 s; BED_OCCUPIED path is exercised in E7
- **Known mismatches:** See S8.
- **Risk:** L — small
- **Depends on:** S8

#### E4 — Doctor's clinical record

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Complaint, history, exam, diagnoses (ICD code or text, exactly one primary) and prescription lines; saved whole with expectedUpdatedAt.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `PUT /encounters/{id}/clinical-record`; body ClinicalRecordDto: {chiefComplaint, historyOfIllness, examinationFindings, clinicalNotes, generalInstructions, followUpDate, diagnoses[{icdCodeId, text, isPrimary}], prescription[{id, medicineId, medicineText, dose, route, frequency, duration, quantity, instructions}], expectedUpdatedAt}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** encounters.write
- **Mapper:** ClinicalRecord <-> form; prescription lines keep their id
- **Tests:** line-id round trip (edit one, remove one, add one); PRESCRIPTION_DISPENSED; ENCOUNTER_CHANGED banner
- **Known mismatches:** Our prescription rows carry no ids and medicine ids are demo numbers. The medicine picker needs GET /medicines (PH1, phase 10). Until PH1 exists the prescription line sends medicineText only (the JSON allows it) and the picker is not shown; PH1's list-only part then switches the picker on.
- **Risk:** H — clinical data
- **Depends on:** E3, S11

#### E5 — Close the visit

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Close button once chief complaint and primary diagnosis exist.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/{id}/close`; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** encounters.write
- **Mapper:** EncounterDetail
- **Tests:** CLINICAL_RECORD_INCOMPLETE shows details.missing NOT_AN_OPD_VISIT
- **Known mismatches:** none known
- **Risk:** M — makes the record final
- **Depends on:** E4

#### E7 — IPD admission

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Admit to a bed chosen from the live bed board.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/ipd`; body AdmitDto: {patientId*, doctorId*, priority, advisedBy, referredBy, reason, startedAt, bedId*, admissionType*}; response 201 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
  - `GET /wards/occupancy`; response 200 OccupancyDto_Output: {wards*[{id*, name*, type*, dailyRate*, beds*}]}
- **Permission:** ipd.admit / ipd.read AND the ipd module
- **Mapper:** AdmitDto; Occupancy
- **Tests:** BED_OCCUPIED refreshes the board; PATIENT_ADMITTED; DOCTOR_UNAVAILABLE; MODULE_DISABLED double click = one request
- **Known mismatches:** Same 'encounters.create' split as E2.
- **Risk:** H — occupies a bed
- **Depends on:** E2, S8

#### E13 — Bed maintenance

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Take a bed out of use or return it to use.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /beds/{id}/maintenance`; body BedMaintenanceDto: {underMaintenance*}; response 200 BedResponseDto_Output: {id*, bedNo*, state*, active*, wardId*}
- **Permission:** ipd.write AND the ipd module AND the ipd module
- **Mapper:** none
- **Tests:** BED_UNDER_MAINTENANCE; double click = one request
- **Known mismatches:** See S8.
- **Risk:** L
- **Depends on:** E7, E8

#### E9 — Transfer

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Move an admitted patient to another bed.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/{id}/transfer`; body TransferDto: {bedId*}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** ipd.write AND the ipd module
- **Mapper:** Transfer {bedId}
- **Tests:** BED_OCCUPIED double click = one request
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** E7

#### E10 — Progress notes

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Ward-round notes, append-only.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters/{id}/progress-notes`; query: sort, paging (page, perPage ≤ 100); response 200 ProgressNotePageDto_Output: page of {id*, note*, writtenAt*, author*{id*, name*}} + meta
  - `POST /encounters/{id}/progress-notes`; body ProgressNoteDto: {note*}; response 201 ProgressNoteResponseDto_Output: {id*, note*, writtenAt*, author*{id*, name*}}
- **Permission:** encounters.read / encounters.write AND the ipd module
- **Mapper:** ProgressNote
- **Tests:** append only; one request
- **Known mismatches:** No such screen today (new).
- **Risk:** L
- **Depends on:** E7

#### E11 — Discharge

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Discharge diagnoses, summary, condition; 'expired' records a death.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/{id}/discharge`; body DischargeDto: {dischargedAt, diagnoses*[{icdCodeId, text, isPrimary}], dischargeSummary, conditionOnDischarge*, followUpDate, followUpInstructions}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** ipd.discharge AND the ipd module
- **Mapper:** DischargeDto -> result
- **Tests:** ENCOUNTER_CHANGED; PATIENT_DECEASED double click = one request
- **Known mismatches:** Our discharge screen computes the bill; the server owns balances.
- **Risk:** H — ends an admission
- **Depends on:** E7

#### E12 — Cancel, reopen, archive, restore, correct check-in

- **Status:** DONE (per handoff; real-server check pending) 2026-11-07 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Admin and front-desk corrections.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /encounters/{id}/cancel`; body ReasonDto: {reason*}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
  - `POST /encounters/{id}/reopen`; body ReasonDto: {reason*}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
  - `POST /encounters/{id}/archive`; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
  - `POST /encounters/{id}/restore`; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
  - `PATCH /encounters/{id}/check-in`; body UpdateCheckInDto: {doctorId, priority, advisedBy, referredBy, reason, startedAt, admissionType, expectedUpdatedAt}; response 200 EncounterDetailDto_Output: {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*, admissionType*, advisedBy*, referredBy*, reason*, closedAt*, dischargedAt*, cancelledAt*, cancelReason*, archivedAt*, bedHistory*[{bedId*, bedNo*, wardId*, wardName*, assignedAt*, releasedAt*}], clinical*{chiefComplaint*, historyOfIllness*, examinationFindings*, clinicalNotes*, generalInstructions*, followUpDate*, diagnoses*, pres …(more fields: read the JSON)
- **Permission:** cancel: encounters.check_in, ipd.admit or encounters.write; reopen: encounters.correct; archive/restore: encounters.archive; correct: encounters.check_in, ipd.admit or encounters.correct
- **Mapper:** Reason body; UpdateCheckIn
- **Tests:** reason required; ENCOUNTER_NOT_OPEN; ENCOUNTER_RECORD_STARTED double click = one request
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** E2

### Phase 8 — Billing

- **Goal:** Invoices, charges, payments, advances, discounts, voids, refunds, credit notes, patient and panel accounts.
- **Entry criteria:** Phase 7 done.
- **Exit criteria:** Money handled as strings only; no auto-retry on any payment or create; receipts and print payloads work.
- **Fresh-eyes review at the end of the phase:** YES (mandatory)
- **Auto-continue after the report:** NO (needs your explicit approval)

#### B1 — Encounter bill and patient balance panels

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** The encounter's Billing tab and the patient's Outstanding panel.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters/{id}/invoice`; response 200 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
  - `GET /patients/{id}/account`; response 200 AccountDto_Output: {outstanding*, credit*}
- **Permission:** billing.read
- **Mapper:** InvoiceDetail; Account {outstanding, credit} as money strings
- **Tests:** no balance arithmetic in the client; money strings kept NOTHING_BILLED (moved here from B7)
- **Known mismatches:** Our bill summary is demo-derived and the wizard's billing step totals items in the browser.
- **Risk:** M — money display
- **Depends on:** E2

#### B2 — Billing hub lists and invoice detail

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Consultation and Services tabs (sourceType=consultation / service), search, dates, encounterType. Counter sales have patient null and a counterCustomer: show that name wherever a patient name goes and offer no billing actions (COUNTER_SALE).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /invoices`; query: sort, search, patientId, encounterId, status, sourceType, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 InvoicePageDto_Output: page of {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*}, total*, discount*, received*, balance*, sourceTypes*} + meta
  - `GET /invoices/{id}`; response 200 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
- **Permission:** billing.read
- **Mapper:** InvoicePage item -> invoice row; InvoiceDetail
- **Tests:** server paging; no fetch-all
- **Known mismatches:** BillingHub loads both lists in full today. The handoff (8.6) names an `encounterType` filter on GET /invoices that the JSON lacks; it is sent as the handoff says (DONE 2026-11-08).
- **Risk:** M
- **Depends on:** B1

#### B9 — Panel account

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** What a panel owes, from the panel/organisation balance screen.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /panels/{id}/account`; response 200 AccountDto_Output: {outstanding*, credit*}
- **Permission:** billing.read
- **Mapper:** Account
- **Tests:** money strings
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** B1

#### B3 — Charge services

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** New Services Invoice and 'add services' on an invoice.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /invoices`; body CreateInvoiceDto: {patientId*, encounterId, charges*[{serviceId*, qty, rate, discount}]}; response 201 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
  - `POST /invoices/{id}/charges`; body AddChargesDto: {charges*[{serviceId*, qty, rate, discount}]}; response 201 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
- **Permission:** billing.charge (own rate or discount: billing.write)
- **Mapper:** CreateInvoice {patientId, encounterId?, charges:[{serviceId, qty?}]}
- **Tests:** single submit; walk-in invoice without encounterId the own-rate and discount controls are hidden without billing.write; double click = one request
- **Known mismatches:** The New Consultation Invoice screen has no backend equivalent: the consultation is charged at check-in (E2).
- **Risk:** H — creates charges
- **Depends on:** B2

#### B4 — Take a payment and print the receipt

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Payment form: patient or panel, invoice, amount, mode, reference, allocations, 'keep the excess as an advance'; the response is the receipt.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /payments`; body RecordPaymentDto: {patientId, panelId, invoiceId, amount*, mode*, reference, notes, allocations[{chargeId*, amount*}], excessAsAdvance}; response 201 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
  - `GET /payments/{id}`; response 200 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
- **Permission:** billing.collect_payment (receipt reprint: billing.read or billing.collect_payment)
- **Mapper:** RecordPayment; Receipt (money as strings)
- **Tests:** double click sends ONE request; a timeout is never resent (reload the register); OVERPAYMENT shows details.owed; modes cash, card, bank_transfer, cheque, insurance, on_account
- **Known mismatches:** Our payment form has its own modes and totals.
- **Risk:** H — real money, no idempotency
- **Depends on:** B2, B9

#### B5 — Advances and applying credit

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Take an advance; apply a patient's credit to what they owe (no receipt: no money moves).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /advances`; body RecordAdvanceDto: {patientId*, amount*, mode*, reference, notes}; response 201 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
  - `POST /patients/{id}/apply-credit`; body ApplyCreditDto: {invoiceId, amount}; response 200 AppliedCreditDto_Output: {applied*, account*{outstanding*, credit*}}
- **Permission:** billing.collect_payment
- **Mapper:** RecordAdvance; ApplyCredit -> AppliedCredit
- **Tests:** INSUFFICIENT_CREDIT; NOTHING_TO_APPLY double click = one request
- **Known mismatches:** Our 'receipts' are advances (receipts.create).
- **Risk:** H — money
- **Depends on:** B4

#### B6 — Discount and void

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Discount a bill (amount or percent, reason; 'included in package' = 100%); void an invoice or a charge.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /invoices/{id}/discount`; body InvoiceDiscountDto: {discount*, reason*}; response 200 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
  - `POST /invoices/{id}/void`; body VoidDto: {reason*}; response 200 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
  - `POST /charges/{id}/void`; body VoidDto: {reason*}; response 200 InvoiceDetailDto_Output: {id*, invoiceNo*, issuedAt*, status*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*, type*, status*}, totals*{gross*, discount*, net*, gst*, total*, received*, balance*, patientBalance*, panelBalance*}, charges*[{id*, sourceType*, description*, rate*, qty*, gross*, discountAmount*, discountPct*, netAmount*, gstPct*, gstAmount*, totalAmount*, received*, outstanding*, payer*, panel*, chargedAt*, serviceDate*, voided*, voidedAt*, voidedReason*}], voidedAt*, voidedReason*}
- **Permission:** billing.write
- **Mapper:** InvoiceDiscount; Void {reason}
- **Tests:** DISCOUNT_TOO_LARGE; CHARGE_PAID; INVOICE_VOIDED; ENCOUNTER_OPEN; void hidden for lab/imaging/medicine charges (CHARGE_FROM_LAB_ORDER, CHARGE_FROM_DISPENSE) COUNTER_SALE hides discount, void and credit actions double click = one request
- **Known mismatches:** none known
- **Risk:** H — money
- **Depends on:** B3

#### B7 — Refunds and credit notes

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Refund unused credit; issue a credit note (concession or write-off).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /refunds`; body RecordRefundDto: {patientId, panelId, amount*, mode*, reference, reason*}; response 201 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
  - `POST /credit-notes`; body RecordCreditNoteDto: {patientId, panelId, invoiceId, amount*, allocations[{chargeId*, amount*}], reason*}; response 201 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
- **Permission:** billing.write
- **Mapper:** RecordRefund; RecordCreditNote
- **Tests:** INSUFFICIENT_CREDIT; CREDIT_NOTE_EXCEEDS_OWED;  double click = one request
- **Known mismatches:** No such screen today (new).
- **Risk:** H — money
- **Depends on:** B5

#### B8 — Charges register and payments register

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Daily Transactions (charges) and Payments/Receipts registers with filters.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /charges`; query: sort, sourceType, patientId, doctorId, panelId, payer, includeVoided, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 ChargeRegisterPageDto_Output: page of {id*, chargedAt*, serviceDate*, sourceType*, description*, patient*{id*, mrNo*, name*}, counterCustomer*, invoice*{id*, invoiceNo*}, doctor*{id*, name*}, panel*{id*, name*}, payer*, totalAmount*, received*, outstanding*, voided*} + meta
  - `GET /payments`; query: sort, type, mode, patientId, panelId, invoiceId, receivedBy, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 PaymentPageDto_Output: page of {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*} + meta
- **Permission:** billing.read
- **Mapper:** ChargeRegisterPage; PaymentPage
- **Tests:** filters dateFrom/dateTo/doctorId/panelId/payer/diagnosticType/modality; type=payment|advance; paged
- **Known mismatches:** reports.dailyTransactions is these two registers, not one report. The JSON's GET /charges has no diagnosticType or modality filter (sourceType allows consultation, service, diagnostic, pharmacy, room): per-modality tabs are BLOCKED until the JSON has them. Counter-sale rows show counterCustomer.
- **Risk:** M
- **Depends on:** B2

### Phase 9 — Laboratory and imaging

- **Goal:** Orders, specimens, results, verify/amend, deliver and print; imaging performed/report/sign/amend/deliver.
- **Entry criteria:** Phases 7–8 done.
- **Exit criteria:** Buttons come from allowedActions; one call per test where the backend works that way.
- **Fresh-eyes review at the end of the phase:** YES (mandatory)
- **Auto-continue after the report:** NO (needs your explicit approval)

#### L1 — Lab orders list and worklists

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** All orders, collection worklist (toCollect=true&sort=priority:desc), bench, verification, hand-over, patient/encounter history. Show the fulfillment badge (in-house vs external referral) and filter by it.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /lab-orders`; query: sort, search, status, priority, fulfillment, patientId, encounterId, doctorId, dateFrom, dateTo, includeArchived, toCollect, paging (page, perPage ≤ 100); response 200 LabOrderPageDto_Output: page of {id*, orderNo*, status*, priority*, fulfillment*, orderedAt*, patient*{id*, mrNo*, name*}, encounter*{id*, encId*}, referringDoctor*, tests*[{name*, status*}], toCollect*, hasCritical*, archived*} + meta
- **Permission:** diagnostics.read AND the lab module
- **Mapper:** LabOrderPage item
- **Tests:** each worklist query; critical rows first; polling 30 s
- **Known mismatches:** Our status list differs slightly (pending, collected, in_progress, completed, delivered, cancelled).
- **Risk:** M
- **Depends on:** E1

#### L2 — Place a lab order

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** New lab order: patient, encounter, priority, tests, doctor or outside doctor. When the hospital runs no lab, the order is an external referral: ask for referredTo, no charge (the JSON for POST /lab-orders states this).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /lab-orders`; body CreateLabOrderDto: {patientId*, encounterId, doctorId, referringDoctorText, priority, clinicalNotes, referredTo, tests*[{testId*, discount}]}; response 201 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.order AND the lab module
- **Mapper:** CreateLabOrder
- **Tests:** one request; charged when ordered referral mode sends referredTo; the per-test discount field is hidden without billing.write; double click = one request
- **Known mismatches:** Our lab number and charges are computed locally.
- **Risk:** H — charges each test
- **Depends on:** L1, S6

#### L3 — Lab order detail and specimen collection

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Order detail with specimens, tests, charges and allowedActions; collect or reject a specimen (a rejection returns the replacement tube number). Specimen tube label prints specimenNo (and the replacement tube's number after a reject); layout owned by G1.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /lab-orders/{id}`; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/specimens/{specimenId}/collect`; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/specimens/{specimenId}/reject`; body RejectSpecimenDto: {reason*}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.read / diagnostics.collect AND the lab module
- **Mapper:** LabOrderResponse; RejectSpecimen
- **Tests:** allowedActions drive buttons; specimenNo printed for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** Our model has no specimens.
- **Risk:** M — new model
- **Depends on:** L2

#### L4 — Enter results

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Result entry per test (parameters or narrative); flags come from the server.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `PUT /lab-orders/{id}/tests/{testId}/result`; body EnterResultDto: {parameters[{key*, value*}], narrative}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.enter_results AND the lab module
- **Mapper:** EnterResult {parameters:[{key,value}]} or {narrative}
- **Tests:** TEST_HAS_RESULT; SPECIMEN_NOT_COLLECTED; no client flag logic for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** Our results screen computes High/Low locally.
- **Risk:** H — clinical values
- **Depends on:** L3

#### L5 — Verify, amend and remarks

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** A doctor verifies (never the enterer), amends with a reason, writes pathologist's remarks.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /lab-orders/{id}/tests/{testId}/verify`; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/tests/{testId}/amend`; body AmendResultDto: {parameters[{key*, value*}], narrative, reason*}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `PUT /lab-orders/{id}/remarks`; body LabRemarksDto: {pathologistRemarks}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.verify AND the lab module
- **Mapper:** AmendResult; LabRemarks
- **Tests:** VERIFIER_IS_ENTERER; RESULT_VERIFIED; a result is final only with verifiedAt for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** Our flow has a 'second doctor' note only.
- **Risk:** H — clinical sign-off
- **Depends on:** L4

#### L6 — Deliver and print payload

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Hand the report over; print the report (verified results only).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /lab-orders/{id}/deliver`; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `GET /lab-orders/{id}/report`; response 200 LabReportDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, orderNo*, priority*, orderedAt*, deliveredAt*, patient*{mrNo*, name*, gender*, dateOfBirth*, dateOfBirthEstimated*}, encounterNo*, referringDoctor*, clinicalNotes*, pathologistRemarks*, specimens*[{specimenNo*, specimenType*, collectedAt*}], tests*[{name*, amended*, amendments*, parameters*, narrative*, enteredBy*, verifiedBy*, verifiedAt*}], pending*, complete*}
- **Permission:** diagnostics.enter_results (deliver) / diagnostics.read (report) AND the lab module
- **Mapper:** LabReport (pending, amended, complete)
- **Tests:** ORDER_NOT_COMPLETE; report fetched fresh at print time for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** L5

#### L7 — Add or cancel tests, archive and restore

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Add tests to an order; cancel one test before a result (voids or credits its charge); archive an order placed in error.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /lab-orders/{id}/tests`; body AddLabTestsDto: {tests*[{testId*, discount}]}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/tests/{testId}/cancel`; body CancelLabTestDto: {reason*}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/archive`; body ArchiveLabOrderDto: {reason*}; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /lab-orders/{id}/restore`; response 200 LabOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, pathologistRemarks*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, specimens*[{id*, specimenNo*, specimenType*, status*, collectedAt*, collectedBy*, rejectedAt*, rejectedReason*, replacesSpecimenId*, allowedActions*}], tests*[{id*, testId*, name*, rate*, specimenId*, status*, result*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.order (add/cancel) / diagnostics.archive AND the lab module
- **Mapper:** AddLabTests; CancelLabTest; ArchiveLabOrder
- **Tests:** reason required for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message double click = one request
- **Known mismatches:** none known
- **Risk:** M — money effect
- **Depends on:** L2

#### I1 — Imaging orders list and worklists

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Lists with toPerform, toReport, modality. Show the fulfillment badge (in-house vs external referral) and filter by it.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /imaging-orders`; query: sort, search, status, priority, fulfillment, patientId, encounterId, doctorId, dateFrom, dateTo, includeArchived, modality, toPerform, toReport, paging (page, perPage ≤ 100); response 200 ImagingOrderPageDto_Output: page of {id*, orderNo*, status*, priority*, fulfillment*, orderedAt*, patient*{id*, mrNo*, name*}, encounter*{id*, encId*}, referringDoctor*, tests*[{name*, modality*, status*}], toPerform*, toReport*, archived*} + meta
  - `GET /imaging-orders/{id}`; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.read AND the imaging module
- **Mapper:** ImagingOrderPage; ImagingOrderResponse
- **Tests:** worklist queries; allowedActions
- **Known mismatches:** Our imaging status has an extra 'Collected' step the API does not (pending, in_progress, completed, delivered).
- **Risk:** M
- **Depends on:** E1

#### I2 — Place an imaging order

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** New imaging order (same body as a lab order). When the hospital runs no imaging, the order is an external referral: ask for referredTo, no charge (the JSON for POST /imaging-orders states this).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /imaging-orders`; body CreateImagingOrderDto: {patientId*, encounterId, doctorId, referringDoctorText, priority, clinicalNotes, referredTo, tests*[{testId*, discount}]}; response 201 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /imaging-orders/{id}/tests`; body AddImagingTestsDto: {tests*[{testId*, discount}]}; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /imaging-orders/{id}/tests/{testId}/cancel`; body CancelImagingTestDto: {reason*}; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.order AND the imaging module
- **Mapper:** CreateImagingOrder; AddImagingTests; CancelImagingTest
- **Tests:** one request; reason on cancel referral mode sends referredTo; the per-test discount field is hidden without billing.write; double click = one request
- **Known mismatches:** ECG/USG are billed through imaging orders.
- **Risk:** H — charges
- **Depends on:** I1, S7

#### I3 — Mark a test performed

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Radiographer or nurse marks the film taken or scan done.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /imaging-orders/{id}/tests/{testId}/perform`; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.perform AND the imaging module
- **Mapper:** ImagingOrderResponse
- **Tests:** a test with reportRequired:false is done once performed for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** I2

#### I4 — Write, sign and amend a report

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** One doctor writes the narrative (template as starting text) and signs; amend with a reason.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `PUT /imaging-orders/{id}/tests/{testId}/report`; body WriteImagingReportDto: {narrative*}; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /imaging-orders/{id}/tests/{testId}/sign`; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /imaging-orders/{id}/tests/{testId}/amend`; body AmendImagingReportDto: {narrative*, reason*}; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.perform or diagnostics.verify (write) / diagnostics.verify (sign, amend) AND the imaging module
- **Mapper:** WriteImagingReport; AmendImagingReport
- **Tests:** final only when signedAt for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** Our UI has no report-entry screen, reporting doctor or signature.
- **Risk:** H — clinical sign-off
- **Depends on:** I3

#### I5 — Deliver, print and archive

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Hand over films and reports; print payload (signed reports only); archive/restore. The Upload Image button stays disabled.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /imaging-orders/{id}/deliver`; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `GET /imaging-orders/{id}/report`; response 200 ImagingReportDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, orderNo*, priority*, orderedAt*, deliveredAt*, patient*{mrNo*, name*, gender*, dateOfBirth*, dateOfBirthEstimated*}, encounterNo*, referringDoctor*, clinicalNotes*, reports*[{name*, modality*, narrative*, amended*, amendments*, performedBy*, performedAt*, signedBy*, signedAt*}], unreported*[{name*, modality*, performedBy*, performedAt*}], pending*, complete*}
  - `POST /imaging-orders/{id}/archive`; body ArchiveImagingOrderDto: {reason*}; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
  - `POST /imaging-orders/{id}/restore`; response 200 ImagingOrderResponseDto_Output: {id*, orderNo*, status*, priority*, fulfillment*, referredTo*, patient*{id*, mrNo*, name*, gender*}, encounter*{id*, encId*}, doctor*{id*, name*}, referringDoctorText*, clinicalNotes*, orderedAt*, deliveredAt*, deliveredBy*{id*, name*}, archived*, tests*[{id*, testId*, name*, modality*, rate*, status*, reportRequired*, performedBy*, performedAt*, report*, reportTemplate*, amendments*, charge*, cancelledAt*, cancelledReason*, allowedActions*}], allowedActions*}
- **Permission:** diagnostics.perform (deliver) / diagnostics.read (report) / diagnostics.archive AND the imaging module
- **Mapper:** ImagingReport; ArchiveImagingOrder
- **Tests:** report fresh at print time for a referral order every action is hidden and the server's ORDER_IS_REFERRAL is shown as a message
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** I4

### Phase 10 — Pharmacy

- **Goal:** Medicines, batches, receive/write-off/adjust, stock card, dispense, history, returns.
- **Entry criteria:** Phase 8 done.
- **Exit criteria:** Stock is batches with server-computed levels; dispense and return are separate calls.
- **Fresh-eyes review at the end of the phase:** YES (mandatory)
- **Auto-continue after the report:** NO (needs your explicit approval)

#### PH1 — Medicines list and detail

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Inventory and every medicine picker, with server-computed badges.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /medicines`; query: sort, search, category, level, expiry, expiringWithinDays, active, paging (page, perPage ≤ 100); response 200 MedicinePageDto_Output: page of {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*} + meta
  - `GET /medicines/{id}`; response 200 MedicineDetailDto_Output: {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*, batches*[{id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*}]}
- **Permission:** pharmacy.read AND the pharmacy module
- **Mapper:** MedicinePage item; MedicineDetail (batches)
- **Tests:** badges from stock.level, expiry, nearestExpiry; no batch summing in the client
- **Known mismatches:** We compute low stock four different ways locally; the server defines it (in_stock, low, out_of_stock). Our model has one batch per medicine.
- **Risk:** M — replaces local rules
- **Depends on:** F3

#### PH2 — Add, edit, deactivate a medicine

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Pharmacy -> Add/Edit medicine.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /medicines`; body CreateMedicineDto: {name*, generic, category, unit, saleRate*, gstPct, discountPct, reorderLevel}; response 201 MedicineDetailDto_Output: {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*, batches*[{id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*}]}
  - `PATCH /medicines/{id}`; body UpdateMedicineDto: {name, generic, category, unit, saleRate, gstPct, discountPct, reorderLevel}; response 200 MedicineDetailDto_Output: {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*, batches*[{id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*}]}
  - `POST /medicines/{id}/deactivate`; response 200 MedicineDetailDto_Output: {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*, batches*[{id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*}]}
  - `POST /medicines/{id}/reactivate`; response 200 MedicineDetailDto_Output: {id*, name*, generic*, category*, unit*, saleRate*, gstPct*, discountPct*, reorderLevel*, active*, stock*{onHand*, expired*, nearestExpiry*, level*, expiry*, saleValue*}, createdAt*, batches*[{id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*}]}
- **Permission:** pharmacy.stock AND the pharmacy module
- **Mapper:** CreateMedicine; UpdateMedicine
- **Tests:** MEDICINE_NAME_TAKEN; money strings
- **Known mismatches:** GST and packages stay hidden (awaiting a hospital decision).
- **Risk:** M
- **Depends on:** PH1

#### PH3 — Receive, write off and adjust stock

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Receive a batch (batch no, expiry, quantity, purchase rate); write off; stock-take correction.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /medicines/{id}/batches`; body ReceiveStockDto: {batchNo*, expiryDate*, quantity*, purchaseRate*, supplier, receivedDate}; response 201 BatchResponseDto_Output: {id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*, medicine*{id*, name*}}
  - `POST /medicine-batches/{id}/write-off`; body WriteOffStockDto: {quantity*, reason*}; response 200 BatchResponseDto_Output: {id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*, medicine*{id*, name*}}
  - `POST /medicine-batches/{id}/adjust`; body AdjustStockDto: {quantity*, reason*}; response 200 BatchResponseDto_Output: {id*, batchNo*, expiryDate*, receivedDate*, quantityReceived*, quantityRemaining*, purchaseRate*, supplier*, expired*, medicine*{id*, name*}}
- **Permission:** pharmacy.stock AND the pharmacy module
- **Mapper:** ReceiveStock; WriteOffStock; AdjustStock -> Batch
- **Tests:** reason required; expiry date format double click = one request
- **Known mismatches:** Our single 'adjust stock' dialog becomes three actions.
- **Risk:** H — stock
- **Depends on:** PH1

#### PH4 — Stock card

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Stock movements by medicine, batch, type and dates.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /stock-movements`; query: sort, medicineId, batchId, type, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 StockMovementPageDto_Output: page of {id*, type*, quantity*, reason*, occurredAt*, medicine*{id*, name*}, batch*{id*, batchNo*, expiryDate*}, by*{id*, name*}, dispense*{id*, dispenseNo*}} + meta
- **Permission:** pharmacy.read AND the pharmacy module
- **Mapper:** StockMovementPage
- **Tests:** filters; paged
- **Known mismatches:** No such screen today (new).
- **Risk:** L — read
- **Depends on:** PH3

#### PH5 — Load a prescription

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** 'Load Rx' in the dispense form: prescribed, dispensed so far, remaining.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters/{id}/prescription`; response 200 PrescriptionDispensingDto_Output: {encounter*{id*, encId*}, patient*{id*, mrNo*, name*}, doctor*{id*, name*}, lines*[{id*, medicineText*, medicine*, dose*, route*, frequency*, duration*, instructions*, prescribed*, dispensed*, remaining*}]}
- **Permission:** pharmacy.read AND the pharmacy module
- **Mapper:** PrescriptionDispensing
- **Tests:** remaining quantities from the server
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** E4, PH1

#### PH6 — Dispense

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Dispense to a patient (lines with prescriptionLineId) or a counter sale (counterCustomer + payment mode); short stock takes what is available, compare dispensed with requested.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /dispenses`; body CreateDispenseDto: {patientId, counterCustomer, encounterId, doctorId, remarks, lines*[{medicineId*, quantity*, prescriptionLineId, instructions, discountPct}], payment{mode*, reference}}; response 201 DispenseResponseDto_Output: {id*, dispenseNo*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*}, doctor*{id*, name*}, remarks*, dispensedAt*, dispensedBy*{id*, name*}, invoice*{id*, invoiceNo*}, lines*[{id*, medicineId*, name*, prescriptionLineId*, requested*, dispensed*, returned*, unitRate*, gstPct*, standingDiscountPct*, discountPct*, instructions*, batches*, returns*, charge*, allowedActions*}]}
- **Permission:** pharmacy.dispense AND the pharmacy module
- **Mapper:** CreateDispense -> DispenseResponse
- **Tests:** OUT_OF_STOCK refuses the whole dispense (details.lines); BATCH_EXPIRED; one request; counter sale pays inside the call
- **Known mismatches:** Our rule 'refuse when stock is short' differs: the API supplies what exists and refuses only when a line has nothing. The MD is silent on who may set lines[].discountPct on a dispense; ask before showing the field (shown only with billing.write until answered). Counter sale: patient null plus counterCustomer, paid inside the dispense call.
- **Risk:** H — stock and money
- **Depends on:** PH5

#### PH7 — Dispense history, detail and slip

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** History; detail with batches, returns, charges; the slip to print. Show counterCustomer for counter sales; no billing actions.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /dispenses`; query: sort, search, patientId, encounterId, counter, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 DispensePageDto_Output: page of {id*, dispenseNo*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*}, dispensedAt*, dispensedBy*{id*, name*}, lines*[{name*, quantity*}], total*, received*} + meta
  - `GET /dispenses/{id}`; response 200 DispenseResponseDto_Output: {id*, dispenseNo*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*}, doctor*{id*, name*}, remarks*, dispensedAt*, dispensedBy*{id*, name*}, invoice*{id*, invoiceNo*}, lines*[{id*, medicineId*, name*, prescriptionLineId*, requested*, dispensed*, returned*, unitRate*, gstPct*, standingDiscountPct*, discountPct*, instructions*, batches*, returns*, charge*, allowedActions*}]}
  - `GET /dispenses/{id}/slip`; response 200 DispenseSlipDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, dispenseNo*, dispensedAt*, customer*, mrNo*, encounterNo*, doctor*, dispensedBy*, lines*[{name*, quantity*, instructions*, batches*, total*}], total*, received*, remarks*}
- **Permission:** pharmacy.read AND the pharmacy module
- **Mapper:** DispensePage; DispenseResponse; DispenseSlip
- **Tests:** slip fetched fresh; batch no and expiry per line
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** PH6

#### PH8 — Returns

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Take medicine back: quantity, reason, restock.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /dispenses/{id}/lines/{lineId}/return`; body ReturnDispenseLineDto: {quantity*, reason*, restock*, refundMode}; response 200 DispenseResponseDto_Output: {id*, dispenseNo*, patient*{id*, mrNo*, name*}, counterCustomer*, encounter*{id*, encId*}, doctor*{id*, name*}, remarks*, dispensedAt*, dispensedBy*{id*, name*}, invoice*{id*, invoiceNo*}, lines*[{id*, medicineId*, name*, prescriptionLineId*, requested*, dispensed*, returned*, unitRate*, gstPct*, standingDiscountPct*, discountPct*, instructions*, batches*, returns*, charge*, allowedActions*}]}
- **Permission:** pharmacy.dispense AND the pharmacy module
- **Mapper:** ReturnDispenseLine
- **Tests:** RETURN_EXCEEDS_DISPENSED; credit effect shown double click = one request
- **Known mismatches:** No such screen today (new).
- **Risk:** H — stock and money
- **Depends on:** PH7

### Phase 11 — Reports, dashboard, expenses and bank, Item History

- **Goal:** Reports, the single dashboard call, expenses, bank accounts and transactions, cash drawer, Item History. Most endpoints are missing from openapi.json.
- **Entry criteria:** Phases 8–10 done (D1b needs AP3 and PT1; D2, D5b need billing; D7 needs S3/S5/S6/S10 and E1; D1, D3–D6, D8, X1–X5 are BLOCKED on the missing endpoints).
- **Exit criteria:** Buildable chunks connected; each blocked chunk stays BLOCKED, with an UNVERIFIED DRAFT contract in docs/openapi.draft.json as documentation only (no UI wiring, no invented fields).
- **Fresh-eyes review at the end of the phase:** yes
- **Auto-continue after the report:** allowed if all conditions hold

#### X1 — Expenses list and record

- **Status:** BLOCKED — not in openapi.json: GET /expenses; POST /expenses; GET /expenses/{id}
- **Screen / action:** List with filters and total; record an expense (cash or bank-paid).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /expenses` — **NOT IN openapi.json** (shape unknown)
  - `POST /expenses` — **NOT IN openapi.json** (shape unknown)
  - `GET /expenses/{id}` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read / accounts.write
- **Mapper:** not writable: no shape (MD prose: {date, categoryId, description, amount, mode, bankAccountId?, referenceNo?})
- **Tests:** after the JSON is refreshed; DATE_IN_FUTURE; CATEGORY_INACTIVE
- **Known mismatches:** none known
- **Risk:** M — money
- **Depends on:** refreshed openapi.json, S12

#### X2 — Correct or void an expense

- **Status:** BLOCKED — not in openapi.json: PATCH /expenses/{id}; POST /expenses/{id}/void
- **Screen / action:** Edit date/category/description/amount/reference; void with a reason.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `PATCH /expenses/{id}` — **NOT IN openapi.json** (shape unknown)
  - `POST /expenses/{id}/void` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.write
- **Mapper:** no shape
- **Tests:** after the JSON is refreshed; EXPENSE_CHANGED; VOID_THROUGH_EXPENSE
- **Known mismatches:** Our screen has no void.
- **Risk:** M — money
- **Depends on:** X1

#### X3 — Bank balances and statement

- **Status:** BLOCKED — not in openapi.json: GET /bank-balances; GET /bank-accounts/{id}/statement
- **Screen / action:** Balances for every account and the total; a statement with opening, running balance, closing.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /bank-balances` — **NOT IN openapi.json** (shape unknown)
  - `GET /bank-accounts/{id}/statement` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read
- **Mapper:** no shape
- **Tests:** after the JSON is refreshed
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** S13

#### X4 — Bank transactions

- **Status:** BLOCKED — not in openapi.json: POST /bank-transactions; GET /bank-transactions/{id}; POST /bank-transactions/{id}/void
- **Screen / action:** Record a deposit, withdrawal or other entry; void and re-enter (never edit).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `POST /bank-transactions` — **NOT IN openapi.json** (shape unknown)
  - `GET /bank-transactions/{id}` — **NOT IN openapi.json** (shape unknown)
  - `POST /bank-transactions/{id}/void` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read / accounts.write
- **Mapper:** no shape (MD prose: {bankAccountId, date, kind, amount, description, referenceNo?}; kinds opening_balance, deposit, withdrawal, other_credit, other_debit)
- **Tests:** after the JSON is refreshed; BEFORE_OPENING_BALANCE
- **Known mismatches:** Our transfer dialog never sets cashMovement; the 'expense' kind is automatic.
- **Risk:** H — money
- **Depends on:** X3

#### X5 — Cash drawer opening

- **Status:** BLOCKED — not in openapi.json: GET /cash-drawer/opening; PUT /cash-drawer/opening
- **Screen / action:** Admin sets the opening cash once at go-live; today's cash is derived.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /cash-drawer/opening` — **NOT IN openapi.json** (shape unknown)
  - `PUT /cash-drawer/opening` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read / settings.write
- **Mapper:** no shape (MD prose: {amount, date})
- **Tests:** after the JSON is refreshed; OPENING_BALANCE_EXISTS
- **Known mismatches:** Our dashboard hard-codes an opening drawer value.
- **Risk:** M — once-only action
- **Depends on:** refreshed openapi.json

#### D1 — Dashboard: GET /dashboard

- **Status:** BLOCKED — not in openapi.json: GET /dashboard
- **Screen / action:** Home tiles and charts from one call; each section may be null; polls every 60 s; today's appointments and recent patients come from their own lists.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /dashboard` — **NOT IN openapi.json** (shape unknown)
- **Permission:** any of encounters.read, encounters.check_in, ipd.read, diagnostics.read, pharmacy.read, reports.read (each section by its own permission)
- **Mapper:** no shape (MD prose: visits, admitted, lab, imaging, pharmacy, revenue, patientFlow)
- **Tests:** after the JSON is refreshed; null sections render
- **Known mismatches:** Our five dashboard keys become one query; the demo constants disappear in API mode.
- **Risk:** M
- **Depends on:** A6 (GET /dashboard is BLOCKED; the other parts are in D1b)

#### D1b — Dashboard: today's appointments and recent patients

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** The two dashboard widgets that come from their own lists: Up Next (GET /appointments?date=today, needs appointments.read) and recent patients (GET /patients with a small perPage, needs patients.read). A widget is hidden when its permission is missing.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /appointments`; query: sort, date, dateFrom, dateTo, doctorId, patientId, status, search, paging (page, perPage ≤ 100); response 200 AppointmentPageDto_Output: page of {id*, appointmentNo*, status*, date*, time*, startsAt*, endsAt*, durationMinutes*, patient*{id*, mrNo*, name*, phone*}, doctor*{id*, name*}, notes*, outsideSchedule*, encounter*{id*, encId*}, bookedAt*, bookedBy*{id*, name*}, confirmedAt*, confirmedBy*{id*, name*}, cancelledAt*, cancelledBy*{id*, name*}, cancelReason*, noShowAt*, noShowBy*{id*, name*}, allowedActions*} + meta
  - `GET /patients`; query: sort, search, panelId, selfPay, gender, admitted, registeredFrom, registeredTo, includeArchived, paging (page, perPage ≤ 100); response 200 PatientPageDto_Output: page of {id*, mrNo*, name*, fatherName*, gender*, dob*, dobEstimated*, phone*, cnic*, city*, registrationDate*, primaryPanel*{id*, name*}, admitted*, lastVisitDate*, balance*, deceasedOn*, archived*} + meta
- **Permission:** appointments.read · patients.read (each widget by its own permission)
- **Mapper:** reuse PT1 and AP3 mappers
- **Tests:** widget hidden without permission; one page of at most 6 rows; no fetch-all
- **Known mismatches:** Our recent-patients widget fetches one page of 100 and sorts client-side.
- **Risk:** L
- **Depends on:** A6, PT1, AP3

#### D2 — Revenue, collections and outstanding reports

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Revenue, Daily Transactions totals, Patient Balances, aging.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /reports/revenue`; query: dateFrom*, dateTo*; response 200 RevenueReportDto_Output: {period*{dateFrom*, dateTo*}, grossRevenue*, creditNotes*, netRevenue*, gstCollected*, discountsGiven*, voided*, bySource*[{sourceType*, charges*, revenue*, gst*}], byDoctor*[{doctor*, charges*, revenue*, commission*}], byPanel*[{panel*, charges*, revenue*, commission*}]}
  - `GET /reports/collections`; query: dateFrom*, dateTo*; response 200 CollectionsReportDto_Output: {period*{dateFrom*, dateTo*}, received*, refunded*, net*, byMode*[{mode*, received*, refunded*}], byCollector*[{user*, receipts*, received*, refunded*}]}
  - `GET /reports/outstanding`; response 200 OutstandingReportDto_Output: {asOf*, patients*{total*, aging*}, panels*{total*, aging*}, byPanel*[{panel*, outstanding*}]}
  - `GET /reports/outstanding/patients`; paging (page, perPage ≤ 100); response 200 PatientBalancePageDto_Output: page of {patient*{id*, mrNo*, name*, phone*}, outstanding*, oldestUnpaid*} + meta
- **Permission:** reports.read
- **Mapper:** RevenueReport; CollectionsReport; OutstandingReport; PatientBalancePage
- **Tests:** dateFrom/dateTo at most 366 days; revenue equals across screens CSV export is built client-side with the F4 helper: formula-injection escaping, bounded multi-page export with a visible cap
- **Known mismatches:** Our reports compute from demo arrays.
- **Risk:** M — money display
- **Depends on:** A5

#### D3 — Daily summary, OPD, demographics, lab and pharmacy reports

- **Status:** BLOCKED — not in openapi.json: GET /reports/daily-summary; GET /reports/opd; GET /reports/demographics; GET /reports/lab; GET /reports/pharmacy
- **Screen / action:** Five report screens.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /reports/daily-summary` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/opd` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/demographics` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/lab` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/pharmacy` — **NOT IN openapi.json** (shape unknown)
- **Permission:** reports.read
- **Mapper:** no shape
- **Tests:** after the JSON is refreshed
- **Known mismatches:** none known
- **Risk:** M
- **Depends on:** refreshed openapi.json

#### D4 — Prescription history

- **Status:** BLOCKED — not in openapi.json: GET /prescriptions
- **Screen / action:** Reports -> Prescription History, paged and filtered.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /prescriptions` — **NOT IN openapi.json** (shape unknown)
- **Permission:** encounters.read
- **Mapper:** no shape
- **Tests:** after the JSON is refreshed
- **Known mismatches:** none known
- **Risk:** L — read
- **Depends on:** refreshed openapi.json

#### D5 — Financial statistics: summary (BLOCKED part)

- **Status:** BLOCKED — not in openapi.json: GET /reports/financial-summary; GET /reports/revenue/daily
- **Screen / action:** Summary tab and the per-category tabs, which read existing registers (charges, payments, expenses, statements, invoices).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /reports/financial-summary` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/revenue/daily` — **NOT IN openapi.json** (shape unknown)
- **Permission:** reports.read (expenses, bank and cashFlow sections need accounts.read)
- **Mapper:** no shape for financial-summary and revenue/daily
- **Tests:** after the JSON is refreshed
- **Known mismatches:** Our statistics.records becomes one query per tab.
- **Risk:** M
- **Depends on:** D2, X1, X3 (Expenses and Bank tabs), refreshed openapi.json

#### D5b — Financial statistics: registers tabs

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** The tabs that read existing registers: Services, Checkups and Medicine (GET /charges?sourceType=service|consultation|pharmacy) and Receipts and Payments (GET /payments?type=advance|payment). Lab Tests (diagnosticType=lab), X-Rays / ECG / Ultrasound (modality=) and the OPD/IPD split (GET /invoices?encounterType=) are built too: the HANDOFF (8.11) names those filters, docs/openapi.json lacks the first two (note to the backend only).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /charges`; query: sort, sourceType, patientId, doctorId, panelId, payer, includeVoided, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 ChargeRegisterPageDto_Output: page of {id*, chargedAt*, serviceDate*, sourceType*, description*, patient*{id*, mrNo*, name*}, counterCustomer*, invoice*{id*, invoiceNo*}, doctor*{id*, name*}, panel*{id*, name*}, payer*, totalAmount*, received*, outstanding*, voided*} + meta
  - `GET /payments`; query: sort, type, mode, patientId, panelId, invoiceId, receivedBy, dateFrom, dateTo, paging (page, perPage ≤ 100); response 200 PaymentPageDto_Output: page of {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*} + meta
- **Permission:** billing.read (each tab by its endpoint's permission)
- **Mapper:** reuse B8 mappers
- **Tests:** tab hidden without billing.read; paged; money strings only
- **Known mismatches:** Our statistics.records becomes one query per tab.
- **Risk:** L
- **Depends on:** B8

#### D6 — Cash flow and expenses reports

- **Status:** BLOCKED — not in openapi.json: GET /reports/cash-flow; GET /reports/expenses
- **Screen / action:** Dashboard cash flow and the Expenses report.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /reports/cash-flow` — **NOT IN openapi.json** (shape unknown)
  - `GET /reports/expenses` — **NOT IN openapi.json** (shape unknown)
- **Permission:** accounts.read
- **Mapper:** no shape
- **Tests:** after the JSON is refreshed
- **Known mismatches:** Our 'Cash Payments counted as outflow' demo logic disappears.
- **Risk:** M
- **Depends on:** X1, X3, X4, X5, refreshed openapi.json

#### D7 — Lists report

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Reports → Lists: ordinary list endpoints, paged (patients, doctors, services, panels, expense heads, lab tests, admitted patients); Admitted = encounters of type ipd with status open. The Doctors list shows the optional `schedule` the handoff says each doctor row carries (a dash when the server sends none; docs/openapi.json lacks it). The expense-heads list is built on the proposed contract (S12).
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /encounters`; query: sort, search, type, status, doctorId, dateFrom, dateTo, admitted, pending, includeArchived, patientId, paging (page, perPage ≤ 100); response 200 EncounterPageDto_Output: page of {id*, encId*, type*, status*, startedAt*, date*, tokenNo*, priority*, patient*{id*, mrNo*, name*, gender*, dob*, dobEstimated*, deceasedOn*}, doctor*{id*, name*}, appointment*{id*, appointmentNo*}, bed*{id*, bedNo*, wardName*}, primaryDiagnosis*, pending*, archived*} + meta
- **Permission:** patients.read (patients), doctors.read (doctors), catalogs.read (panels, services, lab tests), accounts.read (expense heads), encounters.read or encounters.check_in plus the ipd module (Admitted)
- **Mapper:** existing list mappers
- **Tests:** no fetch-all; paged
- **Known mismatches:** Our Lists screen loads every row of seven lists.
- **Risk:** M
- **Depends on:** S3, S5, S6, S10, S12, E1, PT1

#### D8 — Item History

- **Status:** DONE (proposed contract; real-server check pending) 2026-11-07 (handoff 8.12 gives the path, permission, entity types and the entry shape; the action values and the `changes` format are the PROPOSED contract, docs/BACKEND_CONTRACT_PROPOSED.md section 3); unit-tested, browser suite p4-s12s13d8-api.js 39/39 against a test backend that checks every request and response against openapi.draft.json, NOT verified on a real server. Files: src/lib/services/http/itemHistory.ts, src/components/shared/ItemHistoryButton.tsx; the button is on every Phase 4 list, Users, Doctors and Clinic Settings (not yet medicines: Phase 6).
- **Screen / action:** Master Data 'Item History' button: newest first, 'Field: from -> to', actor null shown as 'System'.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /audit-entries` — **NOT IN openapi.json** (shape unknown)
- **Permission:** audit.read
- **Mapper:** no shape (MD prose: {id, occurredAt, action, actor{id,name}|null, changes{field:{from,to}}|null}; entityType per tab)
- **Tests:** after the JSON is refreshed; works once PR #21 is deployed
- **Known mismatches:** Keep the invoice-usage demo view out of API mode (already so).
- **Risk:** L — read
- **Depends on:** refreshed openapi.json, PR #21

### Phase 12 — Final verification and go-live

- **Goal:** Printing, security and resilience, end-to-end tests and CI, the MD's go-live checklist.
- **Entry criteria:** Phases 1–11 done or BLOCKED.
- **Exit criteria:** Go-live checklist walked item by item with evidence; Final Report written.
- **Fresh-eyes review at the end of the phase:** YES
- **Auto-continue after the report:** allowed if all conditions hold

#### G1 — Printing

- **Status:** DONE (per handoff; real-server check pending; printers not tested) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Print layouts for the lab report, imaging report, dispense slip and receipt (A4 and thermal width) using @media print, no PDF library; header from settings. Print layouts for the lab report, imaging report, dispense slip, receipt (A4 and thermal width) and the specimen tube label, using @media print, no PDF library; header from settings. B4, L6, I5 and PH7 only fetch the payload.
- **Endpoints, with fields from the JSON** (`*` = required):
  - `GET /lab-orders/{id}/report`; response 200 LabReportDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, orderNo*, priority*, orderedAt*, deliveredAt*, patient*{mrNo*, name*, gender*, dateOfBirth*, dateOfBirthEstimated*}, encounterNo*, referringDoctor*, clinicalNotes*, pathologistRemarks*, specimens*[{specimenNo*, specimenType*, collectedAt*}], tests*[{name*, amended*, amendments*, parameters*, narrative*, enteredBy*, verifiedBy*, verifiedAt*}], pending*, complete*}
  - `GET /imaging-orders/{id}/report`; response 200 ImagingReportDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, orderNo*, priority*, orderedAt*, deliveredAt*, patient*{mrNo*, name*, gender*, dateOfBirth*, dateOfBirthEstimated*}, encounterNo*, referringDoctor*, clinicalNotes*, reports*[{name*, modality*, narrative*, amended*, amendments*, performedBy*, performedAt*, signedBy*, signedAt*}], unreported*[{name*, modality*, performedBy*, performedAt*}], pending*, complete*}
  - `GET /dispenses/{id}/slip`; response 200 DispenseSlipDto_Output: {hospital*{name*, address*, phone*, email*, printHeader*}, dispenseNo*, dispensedAt*, customer*, mrNo*, encounterNo*, doctor*, dispensedBy*, lines*[{name*, quantity*, instructions*, batches*, total*}], total*, received*, remarks*}
  - `GET /payments/{id}`; response 200 ReceiptDto_Output: {id*, receiptNo*, type*, mode*, amount*, receivedAt*, payer*, invoice*{id*, invoiceNo*}, receivedBy*{id*, name*}, reference*, notes*, hospital*{name*, nameUr*, address*, phone*, printHeader*, currencyCode*}, settled*[{chargeId*, invoiceNo*, description*, amount*}], keptAsCredit*, account*{outstanding*, credit*}}
- **Permission:** as in L6, I5, PH7, B4
- **Mapper:** the report/slip/receipt mappers above
- **Tests:** print payloads render; fetched fresh, never cached; no PHI in the page title
- **Known mismatches:** none known
- **Risk:** M — printer differences
- **Depends on:** L6, I5, PH7, B4

#### G2 — Security and resilience

- **Status:** DONE (per handoff; real-server check pending) 2026-11-08 — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** Content-Security-Policy (default-src self; connect-src self; img-src self data: blob: storage host; frame-ancestors none; nonces for inline scripts); no PHI in logs, URLs, storage or error reports; server text rendered as text; lazy loading of charts, print layouts and the ICD picker; X-Forwarded-For verified on the chosen host.
- **Endpoints:** none
- **Permission:** none
- **Mapper:** none
- **Tests:** CSP on a production build; idle lock keeps form state; scrubbing test; static test: no dangerouslySetInnerHTML
- **Known mismatches:** next.config.ts has only frame-ancestors today. Idle lock moved to A3; offline banner and error boundaries moved to F4. Left here: CSP with nonces, PHI scrubbing, X-Forwarded-For / TRUST_PROXY_HOPS agreement (N5), accessibility checks.
- **Risk:** M
- **Depends on:** A3, F2

#### G3 — End-to-end tests per role

- **Status:** NOT DONE — needs the dev hospital, role accounts (N2, N3) and the dev API; see docs/GO_LIVE_CHECKLIST.md item 12
- **Screen / action:** Playwright against the dev hospital signed in as each role. The eight role accounts are created through S9 (named ZZ-TEST, passwords only from environment variables), not by the backend owner. The six critical flows (register → check-in → consult → prescribe → dispense → pay).
- **Endpoints:** none
- **Permission:** one account per role
- **Mapper:** none
- **Tests:** the suite itself
- **Known mismatches:** Credentials come only from environment variables; role accounts are created with S9. The existing form-labels and responsive e2e specs still use the removed demo accounts and are rewritten here.
- **Risk:** M
- **Depends on:** all module phases

#### G3b — CI gates

- **Status:** DONE for what runs offline 2026-11-08; Lighthouse and real-sample mapper tests not done — see docs/INTEGRATION_PROGRESS.md
- **Screen / action:** CI: types drift (against the committed JSON), mapper tests with real samples, npm audit, Lighthouse (LCP under 2.5 s, INP under 200 ms), a mock-mode browser run and an API-mode browser run.
- **Endpoints:** none
- **Permission:** none
- **Mapper:** none
- **Tests:** the gates themselves
- **Known mismatches:** Today CI builds only API mode against an unreachable backend and never runs the mock-mode browser suite.
- **Risk:** L
- **Depends on:** G3

#### G4 — Go-live

- **Status:** PARTIAL 2026-11-08 — docs/GO_LIVE_CHECKLIST.md
- **Screen / action:** Production BACKEND_URL and domain; NEXT_PUBLIC_HMS_DATA_SOURCE=api on every non-local build; mock data unreachable in production builds; every endpoint key set or removed; documents rewritten; the MD's 13-item checklist ticked with evidence.
- **Endpoints:** none
- **Permission:** none
- **Mapper:** none
- **Tests:** build-output check for mock data; checklist evidence
- **Known mismatches:** The MD says the legacy numeric-id bridge goes away once mock mode is retired (decision D8).
- **Risk:** M
- **Depends on:** G1–G3


## 9. BLOCKED list (endpoints missing from docs/openapi.json)

**Updated 2026-11-07 (second pass): S12, S13 and D8 left this list; they are BUILT against the proposed contract in docs/openapi.draft.json.** Every route below IS named in the handoff (8.2, 8.10, 8.11, 8.12) with its permission and rules; what is missing is the exact request and response fields. The backend is to be built from the handoff, so these chunks are unblocked by a PROPOSED contract, not by waiting. Proposed so far: S12, S13 and D8 (`docs/openapi.draft.json`, `docs/BACKEND_CONTRACT_PROPOSED.md`), status DRAFT-CONTRACT; they are built once the owner confirms the fields. X1 to X5, D1 and D3 to D6 still need a proposal, written when their phase starts (the handoff already gives the request fields for expenses and bank transactions, the expense mode and bank kind values, and the dashboard field names).

| Chunk | Status | Exact endpoints missing | What unblocks it |
|---|---|---|---|
| X1 — Expenses list and record | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /expenses; POST /expenses; GET /expenses/{id} | A refreshed docs/openapi.json that contains these operations |
| X2 — Correct or void an expense | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | PATCH /expenses/{id}; POST /expenses/{id}/void | A refreshed docs/openapi.json that contains these operations |
| X3 — Bank balances and statement | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /bank-balances; GET /bank-accounts/{id}/statement | A refreshed docs/openapi.json that contains these operations |
| X4 — Bank transactions | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | POST /bank-transactions; GET /bank-transactions/{id}; POST /bank-transactions/{id}/void | A refreshed docs/openapi.json that contains these operations |
| X5 — Cash drawer opening | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /cash-drawer/opening; PUT /cash-drawer/opening | A refreshed docs/openapi.json that contains these operations |
| D1 — Dashboard: GET /dashboard | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /dashboard | A refreshed docs/openapi.json that contains these operations |
| D3 — Daily summary, OPD, demographics, lab and pharmacy reports | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /reports/daily-summary; GET /reports/opd; GET /reports/demographics; GET /reports/lab; GET /reports/pharmacy | A refreshed docs/openapi.json that contains these operations |
| D4 — Prescription history | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /prescriptions | A refreshed docs/openapi.json that contains these operations |
| D5 — Financial statistics: summary (BLOCKED part) | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /reports/financial-summary; GET /reports/revenue/daily | A refreshed docs/openapi.json that contains these operations |
| D6 — Cash flow and expenses reports | BLOCKED (becomes DRAFT-CONTRACT once docs/openapi.draft.json covers it) | GET /reports/cash-flow; GET /reports/expenses | A refreshed docs/openapi.json that contains these operations |

All distinct missing operations (23; S12, S13 and D8 are built against the proposed contract and no longer count):

- GET /expenses
- POST /expenses
- GET /expenses/{id}
- PATCH /expenses/{id}
- POST /expenses/{id}/void
- GET /bank-balances
- GET /bank-accounts/{id}/statement
- POST /bank-transactions
- GET /bank-transactions/{id}
- POST /bank-transactions/{id}/void
- GET /cash-drawer/opening
- PUT /cash-drawer/opening
- GET /dashboard
- GET /reports/daily-summary
- GET /reports/opd
- GET /reports/demographics
- GET /reports/lab
- GET /reports/pharmacy
- GET /prescriptions
- GET /reports/financial-summary
- GET /reports/revenue/daily
- GET /reports/cash-flow
- GET /reports/expenses

## 10. Where the MD contradicts itself or leaves a point open (from the full read of the MD)

Section numbers are the MD's. These do not stop work; the safer reading is followed and each is logged where it matters.

- **Search in URLs:** section 6 says filters live in the URL (example search=ali); section 7 says names, phones and CNICs never go in the address bar. Followed: section 7 (D10).
- **CSP:** section 2 says it is in next.config.ts; section 7 says it must still be added. Reality: frame-ancestors only. Chunk G2.
- **State-forbidden actions:** section 5 says disable with a tooltip; sections 8.4, 8.7, 8.8 say show exactly the allowedActions. Followed: hide actions not in allowedActions; show a disabled button with a reason only where the permission is held but the state forbids it and the MD gives a reason.
- **"Today":** section 6 caches /settings forever but "today" is read from it; it goes stale at hospital midnight. Followed: refetch /settings on window focus when the date may have changed (decided in A5).
- **Permissions cached forever:** /auth/me is session-class (never stale), so an admin's permission change is only seen after sign-in. Followed: also refetch /auth/me when a call returns 403 FORBIDDEN or on window focus after 15 minutes (decided in A6); log.
- **Module flags source:** section 5 says GET /settings; flags come from GET /settings/modules. Followed: the JSON (GET /settings/modules).
- **Master Data tabs permissions:** catalogs.read does not give access to bank accounts (accounts.read) or wards (ipd.read). Followed: each tab is gated by its own endpoint permission and shows "Not allowed" for that tab only.
- **Lab/imaging off = referral orders (section 8.7) vs 422 MODULE_DISABLED (section 5):** the JSON for POST /lab-orders and /imaging-orders specifies the referral (referredTo, no charge, fulfillment on lists, ORDER_IS_REFERRAL on later actions). Followed: the JSON (chunks L1–L7, I1–I5).
- **Whole-body writes vs "send only changed fields":** clinical-record PUT, coverages replace the set, prescription lines are resent. Followed per endpoint as documented.
- **Retries:** writes are never auto-retried (section 7); the one-time repeat after TOKEN_EXPIRED (section 3, the call was rejected before it ran) and the one-time repeat after 409 TRANSACTION_CONFLICT (sections 4 and 7: the write was rolled back) are the only exceptions. Both are implemented.
- **Forms drafts and sign-out:** section 7 clears drafts on sign-out; section 3 keeps unsaved text across session end. Followed: keep in memory only, restore only for the same user id, clear on a different user or explicit sign-out.
- **Idle lock:** no endpoint verifies a password without a new login. Implemented: after 15 minutes without input the session is signed out and unsaved text stays in memory (the screen is not covered while still signed in). Open question for the owner, recorded in docs/HANDOFF_ALIGNMENT_AUDIT.md E2: will a password-verify endpoint exist?
- **Mid-session deactivation:** section 3 lists ACCOUNT_DEACTIVATED as 403 but also says deactivated users get 401. Followed: both end the session when the code is on the session-over list.
- **SESSION_ROTATED vs SESSION_REUSED:** retry once for ROTATED; REUSED/ENDED/EXPIRED/INVALID/MISSING end the session.
- **Rate limits:** whether refresh counts toward the 60/min sign-in limit is unspecified; the shared Next server IP can lock everyone out on dev (needs X-Forwarded-For forwarding; verify live).
- **Cache classes missing:** medicines (inventory), slots, stock movements, patient and panel accounts, audit entries have no class. Followed: workflow class (15-30 s) for medicines and slots, 0 for accounts and audit.
- **Large catalogs:** reference data is "cached whole for 10 minutes" but fetch-all is forbidden; catalogs over 100 entries are not addressed. Followed: paged server-side search for pickers; the full list only where the endpoint's total is at most 100, otherwise paged.
- **Print source:** section 6 says prints are never cached; section 8.6 says POST /payments returns the receipt. Followed: print from GET /payments/{id} fetched fresh at print time.
- **CSV exports vs perPage 100:** a full register export loops pages. Followed: bounded export with a visible page cap and a progress note; no silent truncation.
- **Item History:** section 10 says the audit endpoint is not on dev yet; section 8.12 says wire it now. Followed (corrected 2026-11-07): the handoff gives the contract, so D8 is DRAFT-CONTRACT (the exact action values and the format of changes are proposed in docs/BACKEND_CONTRACT_PROPOSED.md section 3) and is built once the owner confirms it.
- **Expense edits and bank entries:** whether amending a bank-paid expense changes its bank entry is unspecified. Followed: no bank-entry edit; void and re-enter.
- **Lab discount permission:** POST /lab-orders discount needs diagnostics.order only; section 8.6 says discounts need billing.write. Followed: show the discount field only to users holding billing.write (L2, I2, B3); for dispense lines the MD is silent (PH6: ask).
- **Restore on archived duplicates:** receptionists lack patients.archive. Followed: show Restore only if patients.archive is held.
- **Inconsistent "Inactive" mechanisms:** includeArchived (patients, encounters), active (catalogs, medicines), includeVoided (expenses). Followed per endpoint.
- **Non-JSON proxy errors:** gateway failures may not be JSON. Followed: parse errors with a guarded .json().catch and show a generic message with no requestId.
- **Open items without a spec:** error code for a report range over 366 days, error for the 7-day backdating rule, whether bankAccountId is required per expense mode. Followed: surface the backend's message and code unchanged; never invent codes.

