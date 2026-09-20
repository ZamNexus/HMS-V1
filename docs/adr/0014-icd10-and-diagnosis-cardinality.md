---
status: accepted
---

# Full ICD-10 catalog; diagnosis becomes many-to-many per Encounter

The prototype's `Disease` table is a small hand-seeded list (`id`, `icdCode`, `name`, `category`) used only by an `IcdLookup` typeahead that writes the disease's *name* into `Encounter.diagnosis`/`dischargeDiagnosis` — free text, one field, one diagnosis per encounter.

Two decisions here. First, the catalog itself becomes the full standard ICD-10 code set (tens of thousands of codes, loaded once as static reference data) rather than a hand-curated shortlist — Panels/insurance billing already exists in the domain, and claims/clinical reporting will eventually expect real ICD-10 codes; better to start with the standard set than migrate every historical diagnosis later.

Second — a real structural change from the prototype's shape, not just a bigger catalog: `Encounter.diagnosis` becomes an `encounter_diagnosis` join table (`encounter_id`, text label, nullable `icd_code_id` following the FK-with-fallback pattern from [ADR-0013](./0013-fk-with-fallback-normalization.md), an `is_primary` flag) instead of a single string field. Real clinical encounters routinely have a primary diagnosis and one or more secondary/comorbid diagnoses (a diabetic patient admitted for a fracture has both recorded), and collapsing that to one field would undermine the exact reporting/claims use case the full ICD-10 catalog is being adopted for. `dischargeDiagnosis` follows the same shape for IPD discharge.

Rejected: keeping a single diagnosis field per encounter (matches the prototype exactly, but throws away comorbidity data right after choosing to invest in the full ICD-10 catalog for that exact purpose). Also rejected: a fixed number of diagnosis slots (e.g. primary + two secondary columns) instead of a join table — arbitrary caps like this always turn out too small for someone's real patient.
