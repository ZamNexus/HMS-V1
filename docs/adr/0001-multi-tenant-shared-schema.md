---
status: accepted
---

# Multi-tenant shared schema, with room to shard later

The prototype models a single clinic with no tenancy concept at all. The real product is SaaS serving many clinics, and the client expects to eventually split high-volume tenants onto separate databases as the customer base grows, rather than staying on one shared database indefinitely.

We're building the schema as **shared-schema multi-tenancy**: every tenant-scoped table carries a `tenant_id` (clinic identifier) and all queries filter by it; no cross-tenant foreign keys anywhere. This is the cheapest model to operate and onboard new clinics into. We are deliberately avoiding anything that would make a later per-tenant database split harder — in particular, no assumption that IDs or business-key sequences (patient MR numbers, invoice numbers, etc.) are globally unique or globally sequential across tenants; each is scoped per-tenant so a tenant's rows can be extracted into their own database later without renumbering.

Considered and rejected: database-per-tenant from day one (operationally heavier than needed until scale demands it); schema-per-tenant in one Postgres instance (harder to manage migrations at scale than row-level tenancy).
