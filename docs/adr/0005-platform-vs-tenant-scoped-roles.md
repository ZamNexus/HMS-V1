---
status: accepted
---

# Two separate role tiers: platform roles and tenant-scoped roles

The prototype's "admin" conflates two different concerns the client wants split apart: the SaaS vendor's own staff who need to operate across *all* clinics (support, billing the clinics themselves, platform configuration), versus the top permission tier *within* a single clinic.

We're modeling these as two distinct, non-overlapping role sets:

- **Platform roles** (e.g. `super_admin`): not tenant-scoped, not stored with a `tenant_id`, can query/act across tenants. This is the SaaS operator's own team.
- **Clinic-scoped roles** (`admin`, `doctor`, `receptionist`, `billing`, `lab_tech`, `pharmacist`, `nurse`, ...): every user in this tier belongs to exactly one tenant (per [ADR-0001](./0001-multi-tenant-shared-schema.md)) and can never see another tenant's data, regardless of role. `admin` here is the clinic owner/top permission tier *within that one clinic* — a different concept from the platform's `super_admin`, despite the naming similarity to the prototype's original single "admin" role.

A user account is either a platform user or a tenant user, never both — a platform support engineer who needs to act inside a specific clinic for support purposes does so via an explicit, audited impersonation/access-grant mechanism, not by holding a dual role.
