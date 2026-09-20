---
status: accepted
---

# UUID/ULID primary keys, per-tenant business-key sequences

Following [ADR-0001](./0001-multi-tenant-shared-schema.md)'s plan to eventually split high-volume tenants onto separate databases, we need primary keys that survive that migration without renumbering.

All primary keys are ULIDs (lexicographically sortable, unlike random UUIDv4 — friendlier for indexes and debugging while still globally unique). A tenant's rows can move to a dedicated database at any point with zero collision risk and no ID remapping.

This is deliberately separate from **business keys** — the human-facing numbers staff see on printed documents (MR numbers, invoice numbers, lab/imaging order numbers). Those are scoped and sequential *per tenant*, starting from 1 per clinic, because that's what clinic staff expect on paperwork. A business-key sequence is generated per-tenant (e.g. a `tenant_sequences` counter table), not derived from the ULID primary key.

Rejected: auto-increment integer PKs (would require remapping every FK on a tenant database split); globally-sequential business keys (staff at a small clinic would see `MR-2024-48213`, confusing and reveals platform-wide volume to a single customer).
