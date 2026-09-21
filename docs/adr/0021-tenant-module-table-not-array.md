---
status: accepted
---

# TenantModule table for enabled_modules, not an array on ClinicSettings

ADR-0006 established that a tenant's `enabled_modules` (pharmacy/lab/imaging/ipd) gates fulfillment, but never settled how it's stored — it was missing from the data model entirely as a result. The alternative on the table was a `text[]`/jsonb array field directly on `ClinicSettings`.

We're using a separate `TenantModule` table: `tenant_id`, `module` (enum: `pharmacy | lab | imaging | ipd`), `enabled_at` timestamp. This matches the relational style the rest of the schema uses — nowhere else stores a structured, queryable set as a bare array (`DiagnosticCatalogExtension.parameters` is jsonb, but that's a variable-shape sub-record, not a small fixed enum set) — and it makes "which tenants have pharmacy enabled" a plain indexed query instead of a jsonb containment query. It also gives a natural home for enable/disable history (`enabled_at`, and a future `disabled_at`) without a schema migration later.

Rejected: a `text[]` column on `ClinicSettings` — simpler and defensible given the array never exceeds 4 known values, but breaks from every other structured-set decision in this schema and would need a migration to add history tracking later.
