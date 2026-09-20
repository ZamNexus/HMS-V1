---
status: accepted
---

# Fixed role enum, not a configurable permissions table

The prototype hardcodes 7 roles as a TypeScript union with sidebar-visibility as the only real access control. For the real backend, the alternative on the table was a `roles`/`permissions` table letting each clinic define custom roles and capabilities — the kind of flexibility a multi-tenant SaaS product often reaches for.

We're keeping a fixed, small role enum (extended with `super_admin`, with more roles added over time as features land) enforced server-side per route+action, rather than a configurable per-tenant permissions system. A custom-permissions model is real complexity most clinics won't use, and it's easy to underestimate how much it complicates every authorization check. Add it later, scoped to the specific customer who needs it, rather than building it speculatively now.
