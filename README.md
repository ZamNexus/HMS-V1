# HMS Frontend (Citi Clinic Hospital Management System)

Next.js 16 / React 19 frontend for the HMS. This repository contains the frontend preparation work for backend integration: every module reads its data through a service layer that switches between demo data and the real API.

## What was done

- **Service layer.** Screens no longer read demo data files directly. Each module has a service with a mock adapter (demo data) and an HTTP adapter (real API), selected by `NEXT_PUBLIC_HMS_DATA_SOURCE`. Connecting an operation to the backend is a matter of filling in its endpoint and mapper, with no screen rewrite.
- **Safe API mode.** In API mode a screen never shows demo data. Where a backend route is not yet confirmed, the screen shows a clear "Not connected" notice, and no request is sent.
- **Exact money and IDs.** Money is handled as exact decimal strings (no floating-point errors); legacy numeric ids and ULIDs are converted at the service boundary.
- **Shared loading, error and empty states**, with backend error codes and request IDs preserved.
- **Modules moved onto services:**
  - Patients, doctors, organisations, wards, guardian relations
  - Encounters
  - Laboratory (T1, T2) and Imaging (T3)
  - Pharmacy inventory and dispensing (T4, T5), including refusal of dispensing when stock is short
  - Billing, Expenses and Bank (T6, T7)
  - All 12 reports (T8, T9), Dashboard (T10) and Financial Statistics (T11)
  - Item History (T12) kept separate from invoice usage, bill summary, notifications, services catalogue
- **Corrections and audit.** The New Encounter medicine picker uses the pharmacy service. Master Data (Panels, Wards, Guardian Relations, Diagnoses, Clinic Settings) and the ICD-10 lookup no longer show demo data in API mode. A test fails if a new direct demo-data import is added without review.
- **Verification.** 438 automated tests pass; type check and lint are clean of errors; production builds succeed in both modes; browser checks were run in real Edge in both modes.

## Data modes

- **Mock mode** (`NEXT_PUBLIC_HMS_DATA_SOURCE=mock`, the development default): demo data, with all demo workflows working.
- **API mode** (production default): real backend only, with no fallback to demo data.

## Documentation

[`docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md`](docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md) is the per-phase record of what was built and tested, with the contract questions for each module.

## Tests

```bash
npm test          # Vitest
npx tsc --noEmit  # type check
npm run lint      # ESLint
npm run build     # needs BACKEND_URL; CI uses the placeholder https://hms-backend.invalid
```

## Getting started

```bash
cp .env.example .env.local   # set BACKEND_URL (server-side only)
npm install
npm run dev                  # http://localhost:3000, mock mode by default
```

This is Next.js 16, whose APIs differ from earlier versions; see `AGENTS.md` before changing framework-level code.
