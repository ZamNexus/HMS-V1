# API-mode browser suites

Real browser runs of the app in API mode against **stateful test backends** (no real server is contacted, no credentials are used).

- `fakes/` — the test backends. Each is a small server that lives inside Playwright's `context.route("**/api/**")`. It keeps its own state (patients, visits, invoices, stock, lab orders …), computes what the real server computes (totals, balances, stock levels, `allowedActions`, report figures), answers with the documented error codes, and **validates every request and every response against `docs/openapi.json`** (or `docs/openapi.draft.json` for the proposed routes). A route the app calls that the backend does not implement is answered `599` and fails the suite.
- `suites/` — one script per phase. Each logs in through the real sign-in page, drives the screens like a user (including double clicks, dropped connections and answers that cannot be read), asserts what the user sees and what was sent, and exits non-zero if anything failed.
- `run.mjs` — starts the production build (`next start`) and runs the suites one after the other, one browser at a time.

```
npm run build
npm run test:browser                                  # every suite
npm run test:browser -- --only phase8-billing         # some suites
E2E_CHANNEL=msedge npm run test:browser               # use an installed Edge/Chrome instead of Playwright's Chromium
npm run check:build                                   # does the bundle still carry demo data? (go-live check)
```

What this proves and what it does not: the screens send the requests the handoff and `docs/openapi.json` describe, show what the (fake) server returns, and behave correctly when it refuses or does not answer. It does **not** prove the real backend behaves like the fake: that is the real-server check (plan chunk G3, which needs a dev hospital and role accounts).

When a screen changes on purpose, change the suite in the same commit. When the app starts reading a new route on a page (the dashboard, for example), teach the fake that route, or the suite reports it as unimplemented. The home page's two reads (GET /dashboard and GET /reports/cash-flow) are answered for every module's suite by `tryHandleHome` in `fakes/auth-stubs.js`; only `phase13-dashboard-reports` checks the dashboard itself.

**The answers of the accounts, bank, cash-drawer, dashboard and report routes are NOT in the handoff field by field.** `fakes/accounts-fake.js` enforces what the handoff does say (request bodies, query parameters, permissions, the error codes) and answers with a shape that is my assumption. A pass of `phase13-accounts` and `phase13-dashboard-reports` therefore means "the app sends the documented requests and shows whatever it is sent", never "the figures are right". The production build under test has the demo seam replaced by its stub, so a screen that reached for demo data in API mode would throw and fail the run.
