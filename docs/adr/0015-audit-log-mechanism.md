---
status: accepted
---

# Audit log: one generic table, written synchronously in the mutating transaction

`AUDIT_LOG` in the prototype is static seed data — no code path actually appends an entry on create/update/delete, despite the type and a `MasterDataPage` audit tab existing. Round 2 of the grilling session settled that accountability fields (dispensed/received/collected/performed/verified/entered-by) become real `User` FKs with genuine audit writes, but not the mechanism.

One generic `audit_log` table: `id`, `tenant_id`, `actor_user_id` (nullable, for system-initiated actions), `action` (created / updated / deleted / status_changed / voided / archived, ...), `entity_type` (a string discriminator: `patient`, `encounter`, `invoice`, ...), `entity_id`, `changes` (jsonb — old/new values for the fields that actually changed), `occurred_at`. Generic and polymorphic rather than one audit table per entity type — a single table is what makes "show everything this user touched today" or "show this patient's full history" a straightforward query instead of a union across a dozen tables.

Entries are written synchronously, inside the same database transaction as the mutating action — not via an async event bus or outbox pattern. If the write commits, the audit entry exists; there is no window where the two can disagree. This is a deliberate trade-off: synchronous writes cost a small amount of latency on every mutation, against the alternative (async processing) which scales better but introduces a real risk — for a compliance-driven feature protecting patient/financial records — of the audit trail lagging behind or silently dropping an entry if the async consumer fails. Audit logging here isn't a high-throughput analytics pipeline, so the simpler, guaranteed-consistent approach is the right one.

Rejected: per-entity audit tables (one for patients, one for invoices, ...) — more type-safety per table, but turns cross-entity audit queries into unions and multiplies migrations every time a new auditable entity is added. Also rejected: async/event-sourced audit writes — better write throughput, not worth the consistency risk for this use case.
