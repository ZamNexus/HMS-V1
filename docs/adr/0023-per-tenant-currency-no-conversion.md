---
status: accepted
---

# Currency is a per-tenant setting; no conversion, no multi-currency invoices

The prototype hardcodes "Rs." everywhere (`src/lib/utils.ts` `formatCurrency`, `en-PK` locale), and `ClinicSettings.currencySymbol` already exists but nothing reads it — it's dead data. Whether this SaaS needs real multi-currency (per-transaction conversion, FX rates) was undecided.

Currency is a per-tenant setting: `ClinicSettings` gains `currency_code` (ISO 4217, e.g. `PKR`, replacing the display-only `currency_symbol`), and every amount within that tenant is in that currency — no conversion, no cross-currency invoices, no FX rate table. A tenant in a different country picks their own currency at setup; nothing here prevents that. What's explicitly out of scope is a single invoice or report mixing currencies, or converting between them.

Rejected: building real multi-currency conversion now — no line in the prototype has ever needed it, and this is speculative complexity nobody has asked for, consistent with every other deferred item in this project (the payout ledger in ADR-0007, slot-conflict checking in ADR-0012, MFA in ADR-0020).
