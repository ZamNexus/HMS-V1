# HMS Frontend (Citi Clinic Hospital Management System)

Next.js 16 / React 19 frontend for the HMS. **It is not yet connected to the backend.** This README says what is done, what is not, and where the detail lives.

## Status in one paragraph

The screens originally read demo data straight from files. They now read it through a **service layer**, so a screen can be switched to the real API without being rewritten. Every service has a mock adapter (demo data, used in mock mode) and an HTTP adapter that stays inert until the backend contract for that operation is confirmed. **87 of 88 endpoint keys in `src/lib/services/endpoints.ts` are still `null`; only `auth.me` is configured. No screen has been verified against a live backend.** "Frontend-prepared" does not mean "integrated".

## What was built

| Area | Done (frontend only) |
|---|---|
| Service layer | Mock + inert HTTP adapters, contract-status modules, shared loading / error / empty / contract-pending states, exact money handling (decimal strings) |
| Patients, doctors, organisations, wards | Shared reference-data hooks and ID handling (legacy numeric ids vs ULIDs converted at the boundary) |
| Encounters, Laboratory (T1/T2), Imaging (T3) | Moved onto services |
| Pharmacy (T4/T5) | Inventory and dispensing on services; dispensing is refused when stock is short |
| Billing, Expenses (T6), Bank (T7) | Moved onto services |
| Reports (T8/T9), Dashboard (T10), Financial Statistics (T11) | All 12 reports and the dashboard tiles on services |
| Item History (T12), bill summary, notifications, services catalogue | On services. Item History (audit log) is kept separate from invoice usage, which is a mock-only demo tab |
| Audit fixes | Master Data (Panels, Wards, Guardian Relations, Diagnoses, Clinic Settings) and the ICD-10 lookup no longer show demo data in API mode; New Encounter medicines go through the pharmacy service |

## How the two modes behave

- **Mock mode** (`NEXT_PUBLIC_HMS_DATA_SOURCE=mock`, the development default): demo data, all demo workflows work.
- **API mode** (production default): a screen whose backend route is not confirmed shows a **"Not connected / contract pending"** notice. It never falls back to demo data, never shows a made-up balance or Rs 0, and sends no guessed request.

## What is not done

- No endpoint is connected; the backend routes and response shapes are not published to the frontend.
- No live-backend verification of anything.
- Open business decisions, for example the low-stock rule (`<` vs `<=` the reorder level, and whether 0 counts) which currently differs between screens.
- Item History needs the audit-log read contract and its admin permission.

The exact questions for the backend developer are listed per module in the handoff.

## Documentation

- [`docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md`](docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md): per-phase record of what the documents say, what was built, what is still blocked, and the test results. Start with the last sections ("Cross-Module Integration Audit and Cleanup").
- `HMS API Reference` and `HMS Remaining Work Task List` (PDFs, kept outside the repository).

## Tests

```bash
npm test          # Vitest, frontend-only with controlled data (438 passed, 4 skipped, 8 todo at the time of writing)
npx tsc --noEmit  # type check
npm run lint      # ESLint (0 errors, 27 warnings at the time of writing)
npm run build     # needs BACKEND_URL; CI uses the placeholder https://hms-backend.invalid
```

Browser checks (real Edge, both modes) were run with ad-hoc scripts and are **not part of CI**. Login was stubbed in those runs, which is a test technique, not authentication.

## Getting started

```bash
cp .env.example .env.local   # set BACKEND_URL (server-side only)
npm install
npm run dev                  # http://localhost:3000, mock mode by default
```

Note: this is Next.js 16, whose APIs differ from earlier versions; see `AGENTS.md` before changing framework-level code.
