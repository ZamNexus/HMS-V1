---
status: accepted
---

# Locations as a sub-tenant scoping unit

The prototype assumes one clinic equals one physical site. The client wants to support clinic customers with multiple branches under one account, and — consistent with [ADR-0001](./0001-multi-tenant-shared-schema.md)'s tenant-sharding plan — wants the option to split a single high-volume location onto its own database later, not just a whole tenant.

Each tenant has one or more `locations`. Physical/operational resources are scoped by `location_id` in addition to `tenant_id`: wards, beds, medicine stock/batches. Patient identity, user/staff accounts, and the unified invoice ledger ([ADR-0007](./0007-commission-rate-snapshot-not-full-payout-ledger.md) et al.) stay **tenant-scoped, not location-scoped** — the same patient record and one consolidated bill follow them across branches of the same clinic, which is the actual value of "multi-location" for a clinic chain. Staff can be assigned to more than one location (real clinic chains commonly have doctors covering multiple sites on different days): a `staff_locations` join table, plus a `primary_location_id` on the user for default UI scoping.

Because primary keys are already ULIDs and tenant isolation already avoids cross-tenant foreign keys ([ADR-0004](./0004-uuid-pks-per-tenant-business-keys.md)), no extra ID work is needed to make a location independently shardable later — the same per-tenant database-split mechanism extends one level down to a per-location split without redesign.
