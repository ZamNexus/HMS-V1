# Citi Clinic HMS

A multi-tenant SaaS Hospital Management System (HMS) for clinics, converted from a single-clinic desktop application prototype.

## Language

**Tenant** (a.k.a. **Clinic**):
A subscribing clinic organization on the SaaS platform. Every unit of clinical/operational data (patients, staff, encounters, billing, inventory) belongs to exactly one tenant; no data is shared across tenants except platform-level configuration.
_Avoid_: Organization, Account, Client — these overload with other concepts (Patient's guardian/panel "account," the login "account").

**Appointment**:
A scheduled request for a patient to see a doctor at a future date/time, created before any clinical activity occurs. Moves through `requested → confirmed → arrived → completed` (or `cancelled`/`no_show`); `completed` means specifically "converted into an Encounter," not that the visit itself has finished — Encounter owns the rest of the visit's lifecycle. Distinct from an Encounter, which is the record of a visit actually happening (patient checked in, vitals taken, consultation underway). An Appointment may convert into an Encounter when the patient arrives; not every Encounter originates from an Appointment (walk-ins). See [[0012-appointment-status-lifecycle]].
_Avoid_: Booking, Visit — "Visit" especially invites confusion with Encounter.

**Invoice**:
The unified billing record for charges a patient incurs: one `invoices`/`invoice_lines` ledger per tenant, with each line typed by `source_type` (consultation / service / diagnostic / pharmacy) rather than five separate invoice-like entities. An Encounter never carries its own fee/payment fields — its consultation charge is always an Invoice line, not an inline alternative to one. Whether checkout/print presents one combined Invoice or splits it per department is a per-clinic display setting over the same lines, not a different storage shape. See [[0009-unified-invoice-ledger]].
_Avoid_: Bill, ConsultationInvoice/ServicesInvoice as distinct top-level entities (superseded by the unified model).

**Encounter**:
The record of a single OPD or IPD clinical visit — the hub entity that consultation notes, prescriptions, and (via Invoice lines) billing all attach to. Not the same as an Appointment (the pre-visit request) or a Patient (the person, who has many Encounters over time).
_Avoid_: Visit, Case.

**Platform role**:
A role (e.g. `super_admin`) held by the SaaS vendor's own staff, not scoped to any single tenant — can operate across all clinics (support, platform configuration, billing the clinics themselves). See [[0005-platform-vs-tenant-scoped-roles]].
_Avoid_: Admin (ambiguous — see Clinic role below), Super User.

**Clinic role**:
A role (`admin`, `doctor`, `receptionist`, `billing`, `lab_tech`, `pharmacist`, `nurse`, ...) held by staff belonging to exactly one tenant; can never see another tenant's data regardless of role. The clinic role `admin` is that clinic's top permission tier — a distinct concept from the platform role `super_admin` despite the naming similarity in the original single-clinic prototype.
_Avoid_: Super Admin as a clinic-level concept — that name is reserved for the platform role.

**Module**:
An optional operational department (`pharmacy`, `lab`, `imaging`, `ipd`) a tenant can enable or disable in its clinic settings. A disabled module means the clinic has no in-house fulfillment for that department, but doctors can still create records against it (see External Referral). See [[0006-module-toggles-and-external-referrals]].
_Avoid_: Department, Feature flag (feature flag is the general programming mechanism; Module is this project's specific unit of toggling).

**External Referral**:
The state of a `LabOrder`, `ImagingOrder`, or prescription line when the tenant has no in-house Module to fulfill it — the record still exists (for medical history and reporting) but generates no internal billing or fulfillment workflow. Opposite of **Internal** fulfillment.
_Avoid_: Refer-out, Outsourced.

**Location**:
A physical branch/site belonging to a Tenant. A clinic (Tenant) has one or more Locations. Wards, beds, and pharmacy stock belong to a Location; Patient identity, staff accounts, and billing stay Tenant-wide so they follow a patient/user across branches of the same clinic. See [[0008-locations-under-tenant]].
_Avoid_: Branch, Site — pick Location as the canonical term.

**Doctor**:
A role-specific data extension of a User whose `role` is `doctor` — not a second identity or access system. Login, session, and interface routing all come from `User.role`; `Doctor` exists only to hold clinical-professional fields that don't apply to other roles (qualifications, PMC registration number, consultation fee, commission rate). Availability (which days/hours, at which branch) is **not** a Doctor field — it lives on StaffLocation, since a doctor's schedule varies per branch. `Doctor.user_id` is a 1:1 FK to `User`, created/updated through one transactional path. Because `User` is tenant-scoped (see Tenant), the same real person practicing at two different clinics has two fully separate `User`+`Doctor` records with no shared identity between tenants. A role change (e.g. a nurse qualifying as a doctor) attaches a new `Doctor` row to the existing `User`, not a new account. See [[0010-doctor-separate-table-not-role-columns]].
_Avoid_: treating Doctor as a second identity/login system; role-conditional columns bolted directly onto User; putting availability fields on Doctor instead of StaffLocation.

**StaffLocation**:
The join between a User and a Location they're assigned to — a clinic-chain staffer (most often a Doctor) can cover more than one branch. Carries `available_days`/`hours_from`/`hours_to`: a doctor's schedule is per (doctor, location) pair, not a single global schedule, since the same doctor can work different days at different branches. See [[0025-doctor-schedule-per-location]], [[0008-locations-under-tenant]].
_Avoid_: a flat schedule on Doctor or User — can't represent one person covering two branches on different days.

**Deactivation**:
The state of a `User`/`Doctor` record when staff leave or stop practicing (`User.active = false`), and — the same mechanism, generalized — the state of any **catalog** row (ServiceCatalogItem, Medicine, Panel, BankAccount, GuardianRelationItem, ExpenseCategory) no longer offered for new selection (`active = false`). Distinct from the Archived/Voided conventions used for clinical and financial records respectively (see [[0016-archived-vs-voided]]): deactivation never hides the record from historical references — past Encounters, Invoices, Diagnostic Orders, and PrescriptionLines keep resolving the deactivated row exactly the same as before. There's no separate "archived but restorable" state for staff or catalogs the way there is for clinical records; `active` is a simple boolean, not a lifecycle, and it's never cascading — deactivating a Medicine with stock remaining doesn't block dispensing down existing batches. See [[0024-uniform-catalog-deactivation]].
_Avoid_: applying the Archived/Voided pattern to staff or catalog records; conflating "deactivated" with "deleted"; giving Medicine an `archived_at` field — it uses `active` like every other catalog, not the clinical Archived mechanism.

**Diagnostic Order**:
The unified record for a Lab or Imaging test request (including ECG/Ultrasound, which routes through this as an imaging-type order) — one table with a `type: lab | imaging` discriminator, replacing the prototype's separate, asymmetric `LabOrder`/`ImagingOrder` shapes. The discriminator is based on how the result is produced (specimen → numeric parameters is `lab`; procedure-on-patient → narrative/trace report is `imaging`), not on where the test is performed. Each ordered test is a Diagnostic Order Line, not an inline array — the actual billable/orderable unit, referencing a catalog item and snapshotting its own price and result (numeric or narrative) at order time. See [[0011-diagnostic-order-unification]].
_Avoid_: Lab Order / Imaging Order as separate top-level entities (superseded by the unified model, same as Invoice superseded ConsultationInvoice/ServicesInvoice).

**Catalog Reference** (FK-with-fallback):
The pattern used for fields that shadow a master-data catalog (guardian relation, prescribed medicine, invoice line items, bank name): an always-populated text label plus a nullable FK to the matching catalog row. A null FK with a populated label means the value was entered outside the catalog and is a candidate for reconciliation — no separate workflow table needed, it falls out of the shape itself. See [[0013-fk-with-fallback-normalization]].
_Avoid_: forcing strict FK-only entry; treating the text label as a "legacy" field to be dropped later — it's the permanent source of truth for display.

**Diagnosis**:
A condition recorded against an Encounter, one row per condition in `encounter_diagnosis` — not a single field. An Encounter can have one primary diagnosis and any number of secondary/comorbid diagnoses, each following the Catalog Reference pattern against the full ICD-10 code set. See [[0014-icd10-and-diagnosis-cardinality]].
_Avoid_: a single free-text diagnosis field per Encounter (the prototype's shape; superseded because it can't represent comorbidities).

**Audit Log Entry**:
A record of one mutating action (create/update/delete/status-change) against any auditable entity, written synchronously in the same transaction as the action itself — never asynchronous, never optional. One generic table across all entity types, not one per entity. See [[0015-audit-log-mechanism]].
_Avoid_: treating audit logging as a best-effort/background concern; per-entity audit tables.

**Archived**:
The retired state of a Patient, Encounter, Diagnostic Order, or Dispense Record (`archived_at` timestamp) — hidden from default views, fully restorable. Not the same as Voided. See [[0016-archived-vs-voided]].
_Avoid_: Soft-deleted — too generic; see Voided for the financial-document variant of "never hard-delete."

**Voided**:
The permanent, one-way retired state of an Invoice (`voided_at` + required `voided_reason`) — stays visible in financial reports and reconciliation forever, never restored. A wrong charge is corrected with a new Invoice or Credit Note, not by un-voiding. See [[0016-archived-vs-voided]].
_Avoid_: Deleted; Archived (Archived implies restorable, Voided never is).

**Revenue** (Gross / Net):
Gross Revenue is the sum of `invoice_line` amounts for a period, excluding Voided lines. Net Revenue subtracts refunds and credit notes from Gross. Neither includes GST collected, which is reported as its own figure — GST is a liability owed to the tax authority, not clinic income. See [[0018-invoice-query-service]].
_Avoid_: a single "Revenue" figure that silently mixes tax-inclusive and tax-exclusive amounts, or nets Voided/refunded lines into the same total as active ones.

**Medicine Batch**:
One lot of a Medicine received into stock at a Location, with its own expiry date, quantity, and purchase rate — not a single flat `stock` count per Medicine (the prototype's shape). Dispensing draws down batches first-expire-first-out (FEFO); a single dispensed line can span more than one batch, tracked via a per-line batch allocation for recall traceability. See [[0017-medicine-batches-fefo-traceability]].
_Avoid_: treating `Medicine.stock` as the single source of truth for on-hand quantity — it becomes a derived sum across its batches.

**BedAssignment**:
One segment of an IPD stay at a specific Bed — created on admission or ward transfer, closed (`released_at` set) on the next transfer or discharge. Bed occupancy and "which patient is in this bed right now" are derived from the open (`released_at IS NULL`) BedAssignment, not stored on Bed or Encounter — the same derivation principle as [[0003-bed-occupancy-derived-not-stored]], extended to survive mid-stay ward transfers. Each segment bills its own Ward's daily rate as a snapshot, so a multi-ward stay (e.g. ICU then General) is billed correctly per segment rather than at one blended or wrong rate. See [[0026-ipd-room-charges-bed-assignment-history]].
_Avoid_: a single `bed_id` on Encounter — can't represent a patient moving between wards mid-stay.

**Panel**:
An insurance/corporate/government payer a Patient can be covered by. A Patient can have more than one (primary + secondary), tracked via a PatientPanel join with a `priority`, each carrying its own `policy_no`. Billing and commission (see [[0022-dual-commission-snapshot-on-invoice-line]]) run against the primary panel only, for now — secondary coverage is recorded and queryable but doesn't split an invoice line's amount between two payers. See [[0027-patient-panel-primary-secondary]].
_Avoid_: assuming every Patient has at most one Panel; splitting invoice lines between panels — not built yet, real coordination-of-benefits billing is deferred.
