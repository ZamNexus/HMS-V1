---
status: accepted
---

# Doctor is a separate table extending User, not role-conditional columns on User

`doctor` is one of the fixed clinic roles ([ADR-0002](./0002-fixed-role-enum-not-configurable-permissions.md)). The alternative to a separate `Doctor` table was adding doctor-only fields (qualifications, PMC registration number, consultation fee, commission rate, available days/hours) directly onto `User` as nullable columns, populated only when `role = 'doctor'`.

We're keeping `Doctor` as its own table: `user_id` is a 1:1 FK to `User`, created and updated through one transactional path (a single "create/promote doctor" operation), replacing the prototype's two independent admin screens (`UserManagementPage`, `DoctorsPage`) that write to `USERS`/`DOCTORS` separately with nothing keeping `Doctor.userId` in sync — the exact drift bug this closes. `Doctor` holds only clinical-professional profile data; identity, login, session, and role/permission fields all stay on `User` and nowhere else. Nothing about which routes a user can reach depends on whether a `Doctor` row exists — that's entirely `User.role`. A role change (a nurse who qualifies as a doctor) attaches a new `Doctor` row to their existing `user_id`; it is never a new account.

**Consequence — cross-tenant duplication.** Because `User` is tenant-scoped ([ADR-0001](./0001-multi-tenant-shared-schema.md), [ADR-0005](./0005-platform-vs-tenant-scoped-roles.md)), a doctor who practices at two different clinics on the platform gets two fully separate `User`+`Doctor` records, one per tenant, with no shared identity or single source of truth for their credentials — each clinic independently owns and re-enters that doctor's profile. This is accepted as a consequence of strict tenant isolation, not solved by this decision; a cross-tenant "person" identity would be a materially bigger change and isn't needed for the current scope.

**Staff deactivation vs. soft-delete.** Doctors (and other staff) are deactivated via `User.active = false`, not the soft-delete/restore convention being defined separately for clinical and financial records. Historical Encounters, Invoices, and Diagnostic Orders keep resolving `doctor_id` regardless of active status — deactivation only affects whether the account can log in and appear in "currently available" pickers, not referential integrity of past records.

Rejected: role-conditional nullable columns directly on `User` — this bloats the `User` table with fields relevant to roughly one of seven-plus roles, and a role change would mean silently populating previously-null columns on an existing row rather than a clean, auditable "attach a profile" operation. Also rejected: keeping the two-table split but relying on application-level convention (as the prototype does today) rather than an enforced single transactional creation path — that's precisely the drift bug being fixed.
