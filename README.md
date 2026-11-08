# HMS Frontend (Citi Clinic Hospital Management System)

Next.js 16 / React 19 frontend for the HMS. This repository holds the frontend preparation for backend integration: every module reads its data through a service layer that switches between demo data and the real API.

## What is done

### Architecture
- **Service layer.** Screens no longer read demo data files directly. Each module has a service with a mock adapter (demo data) and an HTTP adapter (real API), chosen by `NEXT_PUBLIC_HMS_DATA_SOURCE`. Connecting an operation means filling in its endpoint and mapper; no screen needs rewriting.
- **Safe API mode.** In API mode a screen never shows demo data and never falls back to it. Where a backend route is not yet confirmed, the screen shows a clear "Not connected" notice and sends no request.
- **Exact money and IDs.** Money is handled as exact decimal strings (no floating-point errors). Legacy numeric ids and ULIDs are converted at the service boundary.
- **Shared states.** One set of loading, error, empty and "not connected" states, keeping backend error codes and request IDs.
- **Backend plumbing.** Login, the `/api/*` proxy to `BACKEND_URL`, in-memory access token with the refresh cookie handled by the browser, and the documented error envelope.

### Modules moved onto services
| Module | Covers |
|---|---|
| Patients, doctors, organisations, wards, guardian relations | shared reference-data hooks and lookups. **Patients, organisations (panels) and guardian relations are also connected to the API specification** (`docs/openapi.json`), checked against the spec and a fake backend; not yet verified against a live backend |
| Encounters | list, detail, new (4-step wizard), discharge |
| Laboratory (T1, T2) | tests catalogue, orders, results |
| Imaging (T3) | orders, reports |
| Pharmacy (T4, T5) | inventory, dispensing, history; dispensing is refused when stock is short |
| Billing, Expenses, Bank (T6, T7) | consultation and service invoices, expenses, bank accounts and transactions |
| Reports (T8, T9) | all 12 reports |
| Dashboard (T10), Financial Statistics (T11) | tiles, charts, statistics by category |
| Item History (T12) | audit history kept separate from invoice usage |
| Bill summary, notifications, services catalogue | patient and encounter balances, top-bar alerts, Master Data catalogue |

### Corrections and audit
- New Encounter medicines come from the pharmacy service instead of demo data.
- Item History no longer presents invoice lines as audit entries.
- Master Data (Panels, Wards, Guardian Relations, Diagnoses, Clinic Settings) and the ICD-10 lookup no longer show demo data in API mode.
- A test fails if a new direct demo-data import is added without being reviewed.

### Verification
- 438 automated tests pass; the type check is clean; lint has 0 errors.
- Production builds succeed in mock and API modes.
- Browser checks were run in real Edge in both modes.

## What is needed to connect to the backend
- Verification against the live backend (the spec is in `docs/openapi.json`; Patients, organisations and guardian relations are connected to it, the other modules are not yet).
- Development login credentials, and the permissions returned by `GET /auth/me`.
- A few business decisions, such as the low-stock rule; the questions are listed per module in the handoff.

## Data modes
- **Mock mode** (`NEXT_PUBLIC_HMS_DATA_SOURCE=mock`, the development default): demo data, all demo workflows work.
- **API mode** (production default): real backend only.

## Documentation
[`docs/INTEGRATION_PLAN.md`](docs/INTEGRATION_PLAN.md) is the phased plan for connecting every module to the backend (phases, chunks, blocked items, decisions) and [`docs/INTEGRATION_PROGRESS.md`](docs/INTEGRATION_PROGRESS.md) is the live status per chunk. [`docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md`](docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md) is the per-phase record of what was built and tested, with the contract questions for each module.

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
