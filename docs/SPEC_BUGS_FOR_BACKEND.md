# Spec problems and requests for the backend team

Source: `docs/openapi.json` (170 operations, 134 schemas). Facts only; each item can be checked in the file. Prepared by the frontend team while connecting Patients, Panels and Guardian relations.

## 1. Spec bugs

### 1.1 Single-text fields typed as `array of string`

73 properties in 23 schemas are typed `{"type":"array","items":{"type":"string"}}`. By name and by comparison they are single nullable text values. "Twin" below is another schema in the same spec that types a field of the same name as `["string","null"]` (the list DTOs do this). The real server's behaviour is not confirmed; the frontend accepts a string, null, "" or an array (first element used, one console warning per DTO.field) and always sends plain strings.

| DTO | field | spec says | expected | evidence (spec path) |
|---|---|---|---|---|
| AuthUserDto_Output | email (required) | array of string | string or null | `components.schemas.AuthUserDto_Output.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| AuthUserDto_Output | primaryLocationId (required) | array of string | string or null | `components.schemas.AuthUserDto_Output.properties.primaryLocationId`; twin: `SignInResponseDto_Output.user.primaryLocationId` is `string \| null` |
| UserResponseDto_Output | email (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| UserResponseDto_Output | phone (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.phone`; twin: `UserPageDto_Output.data.phone` is `string \| null` |
| UserResponseDto_Output | cnic (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.cnic`; twin: `UserPageDto_Output.data.cnic` is `string \| null` |
| UserResponseDto_Output | address (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.address`; twin: `UserPageDto_Output.data.address` is `string \| null` |
| UserResponseDto_Output | city (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.city`; twin: `UserPageDto_Output.data.city` is `string \| null` |
| UserResponseDto_Output | joiningDate (required) | array of string | string or null | `components.schemas.UserResponseDto_Output.properties.joiningDate`; twin: `UserPageDto_Output.data.joiningDate` is `string \| null` |
| UpdateUserDto | email | array of string | string or null | `components.schemas.UpdateUserDto.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| SettingsResponseDto_Output | nameUr (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.nameUr`; twin: `ReceiptDto_Output.hospital.nameUr` is `string \| null` |
| SettingsResponseDto_Output | address (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.address`; twin: `UserPageDto_Output.data.address` is `string \| null` |
| SettingsResponseDto_Output | phone (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.phone`; twin: `UserPageDto_Output.data.phone` is `string \| null` |
| SettingsResponseDto_Output | email (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| SettingsResponseDto_Output | tagline (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.tagline` |
| SettingsResponseDto_Output | printHeader (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.printHeader`; twin: `ReceiptDto_Output.hospital.printHeader` is `string \| null` |
| SettingsResponseDto_Output | defaultCity (required) | array of string | string or null | `components.schemas.SettingsResponseDto_Output.properties.defaultCity`; twin: `SignInResponseDto_Output.user.hospital.defaultCity` is `string \| null` |
| PanelResponseDto_Output | contactPerson (required) | array of string | string or null | `components.schemas.PanelResponseDto_Output.properties.contactPerson`; twin: `PanelPageDto_Output.data.contactPerson` is `string \| null` |
| PanelResponseDto_Output | phone (required) | array of string | string or null | `components.schemas.PanelResponseDto_Output.properties.phone`; twin: `UserPageDto_Output.data.phone` is `string \| null` |
| PanelResponseDto_Output | commissionPct (required) | array of string | string or null | `components.schemas.PanelResponseDto_Output.properties.commissionPct`; twin: `UserPageDto_Output.data.doctorProfile.commissionPct` is `string \| null` |
| GuardianRelationResponseDto_Output | remarks (required) | array of string | string or null | `components.schemas.GuardianRelationResponseDto_Output.properties.remarks`; twin: `GuardianRelationPageDto_Output.data.remarks` is `string \| null` |
| ServiceResponseDto_Output | code (required) | array of string | string or null | `components.schemas.ServiceResponseDto_Output.properties.code`; twin: `ServicePageDto_Output.data.code` is `string \| null` |
| ServiceResponseDto_Output | category (required) | array of string | string or null | `components.schemas.ServiceResponseDto_Output.properties.category`; twin: `ServicePageDto_Output.data.category` is `string \| null` |
| ImagingTestResponseDto_Output | reportTemplate (required) | array of string | string or null | `components.schemas.ImagingTestResponseDto_Output.properties.reportTemplate`; twin: `ImagingTestPageDto_Output.data.reportTemplate` is `string \| null` |
| PatientDetailDto_Output | fatherName (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.fatherName`; twin: `PatientPageDto_Output.data.fatherName` is `string \| null` |
| PatientDetailDto_Output | cnic (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.cnic`; twin: `UserPageDto_Output.data.cnic` is `string \| null` |
| PatientDetailDto_Output | city (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.city`; twin: `UserPageDto_Output.data.city` is `string \| null` |
| PatientDetailDto_Output | medicalRecordNo (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.medicalRecordNo` |
| PatientDetailDto_Output | emergencyContact (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.emergencyContact` |
| PatientDetailDto_Output | email (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| PatientDetailDto_Output | address (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.address`; twin: `UserPageDto_Output.data.address` is `string \| null` |
| PatientDetailDto_Output | area (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.area` |
| PatientDetailDto_Output | country (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.country` |
| PatientDetailDto_Output | guardianName (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.guardianName` |
| PatientDetailDto_Output | referredBy (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.referredBy` |
| PatientDetailDto_Output | remarks (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.remarks`; twin: `GuardianRelationPageDto_Output.data.remarks` is `string \| null` |
| PatientDetailDto_Output | photoUrl (required) | array of string | string or null | `components.schemas.PatientDetailDto_Output.properties.photoUrl`; twin: `UserPageDto_Output.data.doctorProfile.photoUrl` is `string \| null` |
| UpdatePatientDto | email | array of string | string or null | `components.schemas.UpdatePatientDto.properties.email`; twin: `SignInResponseDto_Output.user.email` is `string \| null` |
| UpdatePatientDto | country | array of string | string or null | `components.schemas.UpdatePatientDto.properties.country` |
| InvoiceDetailDto_Output | counterCustomer (required) | array of string | string or null | `components.schemas.InvoiceDetailDto_Output.properties.counterCustomer`; twin: `InvoicePageDto_Output.data.counterCustomer` is `string \| null` |
| InvoiceDetailDto_Output | voidedReason (required) | array of string | string or null | `components.schemas.InvoiceDetailDto_Output.properties.voidedReason` |
| ReceiptDto_Output | reference (required) | array of string | string or null | `components.schemas.ReceiptDto_Output.properties.reference`; twin: `PaymentPageDto_Output.data.reference` is `string \| null` |
| ReceiptDto_Output | notes (required) | array of string | string or null | `components.schemas.ReceiptDto_Output.properties.notes`; twin: `UserPageDto_Output.data.doctorProfile.notes` is `string \| null` |
| EncounterDetailDto_Output | primaryDiagnosis (required) | array of string | string or null | `components.schemas.EncounterDetailDto_Output.properties.primaryDiagnosis`; twin: `EncounterPageDto_Output.data.primaryDiagnosis` is `string \| null` |
| EncounterDetailDto_Output | advisedBy (required) | array of string | string or null | `components.schemas.EncounterDetailDto_Output.properties.advisedBy` |
| EncounterDetailDto_Output | referredBy (required) | array of string | string or null | `components.schemas.EncounterDetailDto_Output.properties.referredBy` |
| EncounterDetailDto_Output | reason (required) | array of string | string or null | `components.schemas.EncounterDetailDto_Output.properties.reason`; twin: `StockMovementPageDto_Output.data.reason` is `string \| null` |
| EncounterDetailDto_Output | cancelReason (required) | array of string | string or null | `components.schemas.EncounterDetailDto_Output.properties.cancelReason`; twin: `AppointmentPageDto_Output.data.cancelReason` is `string \| null` |
| AppointmentResponseDto_Output | notes (required) | array of string | string or null | `components.schemas.AppointmentResponseDto_Output.properties.notes`; twin: `UserPageDto_Output.data.doctorProfile.notes` is `string \| null` |
| AppointmentResponseDto_Output | cancelReason (required) | array of string | string or null | `components.schemas.AppointmentResponseDto_Output.properties.cancelReason`; twin: `AppointmentPageDto_Output.data.cancelReason` is `string \| null` |
| ScheduleResponseDto_Output | from (required) | array of string | string or null | `components.schemas.ScheduleResponseDto_Output.properties.from` |
| ScheduleResponseDto_Output | to (required) | array of string | string or null | `components.schemas.ScheduleResponseDto_Output.properties.to` |
| LabOrderResponseDto_Output | referredTo (required) | array of string | string or null | `components.schemas.LabOrderResponseDto_Output.properties.referredTo` |
| LabOrderResponseDto_Output | referringDoctorText (required) | array of string | string or null | `components.schemas.LabOrderResponseDto_Output.properties.referringDoctorText` |
| LabOrderResponseDto_Output | clinicalNotes (required) | array of string | string or null | `components.schemas.LabOrderResponseDto_Output.properties.clinicalNotes`; twin: `EncounterDetailDto_Output.clinical.clinicalNotes` is `string \| null` |
| LabOrderResponseDto_Output | pathologistRemarks (required) | array of string | string or null | `components.schemas.LabOrderResponseDto_Output.properties.pathologistRemarks` |
| LabReportDto_Output | encounterNo (required) | array of string | string or null | `components.schemas.LabReportDto_Output.properties.encounterNo` |
| LabReportDto_Output | clinicalNotes (required) | array of string | string or null | `components.schemas.LabReportDto_Output.properties.clinicalNotes`; twin: `EncounterDetailDto_Output.clinical.clinicalNotes` is `string \| null` |
| LabReportDto_Output | pathologistRemarks (required) | array of string | string or null | `components.schemas.LabReportDto_Output.properties.pathologistRemarks` |
| ImagingOrderResponseDto_Output | referredTo (required) | array of string | string or null | `components.schemas.ImagingOrderResponseDto_Output.properties.referredTo` |
| ImagingOrderResponseDto_Output | referringDoctorText (required) | array of string | string or null | `components.schemas.ImagingOrderResponseDto_Output.properties.referringDoctorText` |
| ImagingOrderResponseDto_Output | clinicalNotes (required) | array of string | string or null | `components.schemas.ImagingOrderResponseDto_Output.properties.clinicalNotes`; twin: `EncounterDetailDto_Output.clinical.clinicalNotes` is `string \| null` |
| ImagingReportDto_Output | encounterNo (required) | array of string | string or null | `components.schemas.ImagingReportDto_Output.properties.encounterNo` |
| ImagingReportDto_Output | clinicalNotes (required) | array of string | string or null | `components.schemas.ImagingReportDto_Output.properties.clinicalNotes`; twin: `EncounterDetailDto_Output.clinical.clinicalNotes` is `string \| null` |
| MedicineDetailDto_Output | generic (required) | array of string | string or null | `components.schemas.MedicineDetailDto_Output.properties.generic`; twin: `MedicinePageDto_Output.data.generic` is `string \| null` |
| MedicineDetailDto_Output | category (required) | array of string | string or null | `components.schemas.MedicineDetailDto_Output.properties.category`; twin: `ServicePageDto_Output.data.category` is `string \| null` |
| MedicineDetailDto_Output | unit (required) | array of string | string or null | `components.schemas.MedicineDetailDto_Output.properties.unit`; twin: `LabOrderResponseDto_Output.tests.result.parameters.unit` is `string \| null` |
| BatchResponseDto_Output | supplier (required) | array of string | string or null | `components.schemas.BatchResponseDto_Output.properties.supplier`; twin: `MedicineDetailDto_Output.batches.supplier` is `string \| null` |
| DispenseResponseDto_Output | counterCustomer (required) | array of string | string or null | `components.schemas.DispenseResponseDto_Output.properties.counterCustomer`; twin: `InvoicePageDto_Output.data.counterCustomer` is `string \| null` |
| DispenseResponseDto_Output | remarks (required) | array of string | string or null | `components.schemas.DispenseResponseDto_Output.properties.remarks`; twin: `GuardianRelationPageDto_Output.data.remarks` is `string \| null` |
| DispenseSlipDto_Output | mrNo (required) | array of string | string or null | `components.schemas.DispenseSlipDto_Output.properties.mrNo` |
| DispenseSlipDto_Output | encounterNo (required) | array of string | string or null | `components.schemas.DispenseSlipDto_Output.properties.encounterNo` |
| DispenseSlipDto_Output | doctor (required) | array of string | string or null | `components.schemas.DispenseSlipDto_Output.properties.doctor` |
| DispenseSlipDto_Output | remarks (required) | array of string | string or null | `components.schemas.DispenseSlipDto_Output.properties.remarks`; twin: `GuardianRelationPageDto_Output.data.remarks` is `string \| null` |

### 1.2 Typed as array, possibly intended (please confirm)

| DTO | field | spec says | question | evidence (spec path) |
|---|---|---|---|---|
| CreateWardDto | beds | array of string | Is `beds` a list of bed codes (items 1 to 20 characters)? If so this is correct. | `components.schemas.CreateWardDto.properties.beds` |
| LabReportDto_Output | pending | array of string | Is `pending` a list (for example the tests still pending)? If so this is correct; if it is a single value it belongs in 1.1. | `components.schemas.LabReportDto_Output.properties.pending` |
| ImagingReportDto_Output | pending | array of string | Is `pending` a list (for example the tests still pending)? If so this is correct; if it is a single value it belongs in 1.1. | `components.schemas.ImagingReportDto_Output.properties.pending` |

### 1.3 Other spec observations

| Item | Spec says | Evidence |
|---|---|---|
| Id fields have no format | `id`, `panelId` and similar response ids are plain `string`; request ids carry the ULID pattern `^[0-9A-HJKMNP-TV-Z]{26}$` | `components.schemas.PatientDetailDto_Output.properties.id` vs `paths./api/v1/patients/{id}.get.parameters[0]` |
| OpenAPI version vs syntax | `openapi: 3.0.0`, but many schemas use `type: ["string", "null"]` (3.1 syntax) next to `nullable: true` (3.0 syntax) | `components.schemas.PatientPageDto_Output` and `PatientDetailDto_Output.properties.bloodGroup` |
| `ErrorResponse.details` is untyped | described in prose only: `[{ path, message }]` for validation failures, `{ retryAfterSeconds }` or `{ problems }` otherwise | `components.schemas.ErrorResponse.properties.details` |
| `sort` parameter format | `sort` is a plain string; defaults are `registrationDate:desc` (patients) and `name:asc` (panels); allowed fields and the syntax are not listed | `paths./api/v1/patients.get.parameters` |
| Money and percentages | `commissionPct` and `discountPct` are strings in responses but `string \| number` in create / update requests | `components.schemas.PanelResponseDto_Output` vs `CreatePanelDto` |
| `POST /auth/change-password` has no success response | The handoff says `204 No Content` and that the same access token keeps working; the JSON lists no 2xx response for this operation | `paths./api/v1/auth/change-password.post.responses` |
| No `sort` allowlist anywhere | Only defaults are stated (`registrationDate:desc`, `name:asc`, `tokenNo:asc`, `priority:desc`); the allowed fields per endpoint are not in the JSON, though the handoff says to map headers to allowed fields only | list operations' `sort` parameter |
| `GET /charges` cannot filter by modality | `sourceType` allows consultation, service, diagnostic, pharmacy, room; there is no `diagnosticType` or modality filter, so Lab / X-Ray / ECG / Ultrasound tabs of Financial Statistics cannot be built from it | `paths./api/v1/charges.get.parameters` |
| `GET /invoices` has no `encounterType` filter | the handoff lists `encounterType` among the filters; the JSON has none | `paths./api/v1/invoices.get.parameters` |
| `GET /doctors` rows carry no `schedule` | the handoff says the doctor list carries each doctor's schedule | `components.schemas` doctor list item |
| Permission enum is out of date | `AuthUserDto_Output.permissions` allows 38 names; the handoff also names `accounts.read`, `accounts.write` and `audit.read` (and the role matrix gives them to admin/billing). The frontend keeps permission names as plain strings so these work; the generated type does not list them | `components.schemas.AuthUserDto_Output.properties.permissions.items.enum` |
| `SettingsResponseDto_Output.fiscalYearStart` | an enum of month names or null ("january" … "december"); the handoff does not describe it | `components.schemas.SettingsResponseDto_Output.properties.fiscalYearStart` |
| No `search` parameter | `GET /charges`, `/payments`, `/stock-movements`, `/vitals` and `/progress-notes` take no `search` | the operations' parameters |

## 2. Missing capabilities requested

| Needed by | Request | Why |
|---|---|---|
| Patients list, "Inactive" tab | A filter on `GET /patients` that returns archived patients only (for example `archived=true`) | Today `includeArchived=true` returns live and archived patients together, so the tab cannot be answered. The frontend shows "Not connected" for that tab. |
| Patient form, "SS/Emp No" | A field on `CreatePatientDto`, `UpdatePatientDto` and `PatientDetailDto_Output` | The screen has this field; the API has none. It is not sent. |
| Patient form, photo | A way to set the photo: a `photoUrl` (or upload) field on create / update. `photoUrl` exists only in the response | The screen has a photo upload; nothing can be saved. It is not sent. |
| Patient form, "Active" switch | Nothing required: the frontend maps it to archive / restore. Please confirm that is the intended use | Create / update have no active flag. |
| Doctors screen (create / edit doctor) | Confirm the intended calls: `POST /users` then `PATCH /users/{id}/doctor-profile`; there is no write route under `/doctors` | `GET /doctors` returns active doctors only, so the screen cannot list inactive ones. |
| **The JSON itself is stale (corrected 2026-11-07)** | The handoff document describes 206 operations; `docs/openapi.json` has 170. These 36 documented operations are missing from the JSON: `GET /audit-entries`; expenses (list, create, get, patch, void); expense categories (list, create, get, patch, deactivate, reactivate); bank accounts (list, create, get, patch, deactivate, reactivate, statement); `GET /bank-balances`; bank transactions (create, get, void); cash drawer opening (get, put); `GET /dashboard`; `GET /prescriptions`; reports `cash-flow`, `daily-summary`, `demographics`, `expenses`, `financial-summary`, `lab`, `opd`, `pharmacy`, `revenue/daily`. | An earlier version of this file said these endpoints "do not exist". That was wrong: they are documented in the handoff but absent from the JSON. Please export a current `openapi.json`. The frontend chunks that need them are BLOCKED until then. |

## 3. Questions for the backend

1. Do the detail and create responses really send arrays for the fields in 1.1, or `null` / a string? (The frontend tolerates both; it logs `spec mismatch: <DTO>.<field> arrived as array` once per field per page load if arrays arrive.)
2. `PATCH /patients/{id}` refuses an archived patient (`PATIENT_ARCHIVED`). The frontend calls `restore` first when the Active switch is turned on, then PATCHes. Is that the intended order?
3. When a create succeeds the response is the full record. If a gateway or timeout hides that response, is there a safe way to find the record (for example an idempotency key header, or a unique lookup such as the phone number)? The frontend never re-sends a create, and refreshes the list instead.
4. `POST /patients/{id}/archive` returns `PATIENT_ADMITTED` for an admitted patient. Is that the only blocking condition?
5. `coverages` replaces the whole set on update. The frontend reads the current set first and sends back secondary coverages unchanged. Is there a way to change only the primary coverage?
6. What does a `GUARDIAN_RELATION_TAKEN` / `PANEL_NAME_TAKEN` response contain in `details` (the existing record's id)? The frontend shows only the message.
7. Is `GET /patients/duplicates` meant to be called while typing a phone number or CNIC (rate limits)? The frontend does not call it yet.

## 4. Encounters (found while connecting Phase 7)

### 4.1 Spec bugs

| Schema | field | spec says | expected | note |
|---|---|---|---|---|
| EncounterDetailDto_Output | primaryDiagnosis, advisedBy, referredBy, reason, cancelReason | array of string | string or null | the same defect as 1.1; the frontend accepts a string, null or an array |
| VitalsResponseDto_Output | temperatureF, weightKg, heightCm, bmi | array of number | number or null | the frontend accepts a number, null or an array |
| (all encounter responses) | `allowedActions` | absent | — | appointments, lab orders and imaging orders carry it; encounters do not. The frontend derives the buttons from type, status, archived flag and permissions. If the backend adds `allowedActions` to encounters, the frontend can switch to it |

### 4.2 Questions for the backend

8. `details.missing` of `CLINICAL_RECORD_INCOMPLETE`: are the values field names such as `chiefComplaint` and `primaryDiagnosis`? The frontend turns any string into words and lists it.
9. `POST /encounters/{id}/cancel` is allowed "only before the doctor begins". What counts as begun: a saved clinical record, a vitals reading, or either? The frontend offers Cancel on every open visit and shows `ENCOUNTER_RECORD_STARTED` when the server refuses.
10. Does `GET /patients/{id}/encounters` return the same shape as `GET /encounters` for the front desk (`encounters.check_in` only)?
11. `POST /encounters/{id}/discharge` with `conditionOnDischarge: expired` records a death: does the patient response then show `deceasedOn` immediately? The frontend re-reads the patient after a discharge.

## 5. Billing (found while connecting Phase 8, read side)

### 5.1 Spec bug

| Schema | field | spec says | expected | note |
|---|---|---|---|---|
| InvoiceDetailDto_Output | counterCustomer, voidedReason | array of string | string or null | the same defect as 1.1; the frontend accepts a string, null or a one-element array |
| ReceiptDto_Output | reference, notes | array of string | string or null | the same defect; `PaymentPageDto_Output` types the same two fields as `string \| null` |

### 5.2 Questions for the backend

12. The handoff (8.6) lists `encounterType` (opd or ipd) among the filters of `GET /invoices`, and the frontend sends it for the hub's OPD/IPD filter, but `docs/openapi.json` does not list the parameter. Please add it to the JSON so the generated types match.
13. `GET /encounters/{id}/invoice` for a visit that has no invoice yet: is it `422 NOTHING_BILLED` or `404`? The frontend treats both as "nothing billed yet".
14. Which fields does `sort` accept on `GET /invoices`? The frontend sends none (the server default).
15. A credit note has `mode: null` and moves no money. Does it appear in `GET /payments` with `type=credit_note` as the frontend assumes (the register offers that type)?
16. `POST /payments` with `panelId` and no `invoiceId`: how does the server allocate the panel's payment across the panel's outstanding charges? The frontend sends no `allocations` and shows the receipt's `settled` list as returned.
17. Is `GET /payments/{id}` allowed for a user with only `billing.collect_payment` (as the handoff table says), so a cashier can reprint a receipt they just issued? The register itself needs `billing.read`.

## 6. Laboratory and imaging (found while connecting Phase 9)

### 6.1 Spec bugs

| Schema | field | spec says | expected | note |
|---|---|---|---|---|
| LabOrderResponseDto_Output, ImagingOrderResponseDto_Output | referredTo, referringDoctorText, clinicalNotes, pathologistRemarks (lab only) | array of string | string or null | the same defect as 1.1; the frontend accepts a string, null or a one-element array |
| LabReportDto_Output, ImagingReportDto_Output | encounterNo, clinicalNotes, pathologistRemarks (lab only) | array of string | string or null | the same defect |
| LabTestResponseDto_Output | turnaroundHours | array of number | number or null | the same defect (already tolerated for the catalogue screens) |

### 6.2 Questions for the backend

18. In `/lab-orders/{id}/tests/{testId}/cancel`, `/result`, `/verify`, `/amend` and the imaging equivalents, is `{testId}` the order line's own `id` (`tests[].id`) or the catalogue `testId` (`tests[].testId`)? The frontend sends `tests[].id`. If it is the catalogue id, every test action would need a one-line change.
19. (Followed as written, no change needed.) With the lab or imaging department off, the frontend hides the menu entry (section 5), still opens the order form and places the order as an external referral (8.7), keeps past records readable, and refuses nothing itself: working a switched-off department is refused by the server with `422 MODULE_DISABLED`. Tell us if the intended behavior differs.
20. Is there a way to have the server sort `hasCritical` orders first (for example `sort=hasCritical:desc`)? The frontend can only put them first within a page.
21. Can `GET /lab-orders` and `GET /imaging-orders` filter by `doctorId` for a doctor's own orders? The parameter exists; the frontend has no 'my orders' view yet.

## 7. Pharmacy (found while connecting Phase 10)

### 7.1 Spec bugs

| Schema | field | spec says | expected | note |
|---|---|---|---|---|
| BatchResponseDto_Output | supplier | array of string | string or null | the same defect as 1.1; the frontend accepts a string, null or a one-element array |
| DispenseResponseDto_Output | counterCustomer, remarks | array of string | string or null | the same defect |
| DispenseSlipDto_Output | mrNo, encounterNo, doctor, remarks | array of string | string or null | the same defect |

### 7.2 Questions for the backend

22. What does `details.lines` look like in `422 OUT_OF_STOCK`? The frontend lists a line that is a string, or an object with a `name`, and skips anything else. A `medicineId` plus `name` per line would let it name every medicine.
23. When `prescriptionLineId` is sent for a medicine that is NOT the one the doctor picked, does the server reject it, treat it as a substitute, or count it against the line? The frontend follows the handoff (a substitute is an unlinked line) and links a line only when the chosen medicine is the doctor's own pick or the prescription line is free text.
24. `discountPct` on a dispense line: who may give it (the handoff does not say)? The frontend does not offer it.
25. Does `GET /medicines` without `active` return both active and deactivated medicines? The frontend always sends `active` explicitly (true by default).

## 8. Reports, statistics, lists and the dashboard (found while connecting Phase 11)

### 8.1 Handoff names this, docs/openapi.json lacks it

| What | where in the handoff | note |
|---|---|---|
| `GET /charges` filters `diagnosticType=lab` and `modality=X-Ray\|ECG\|Ultrasound` | 8.11 Financial Statistics | the frontend sends them as the handoff says; the spec's `GET /charges` does not list them |
| `GET /doctors` rows carry `schedule` ({ days, from, to, slotMinutes }) | 8.11 Lists | the frontend reads it when present; the spec's DoctorResponse does not list it |
| `GET /dashboard`, `/reports/daily-summary`, `/opd`, `/demographics`, `/lab`, `/pharmacy`, `/financial-summary`, `/revenue/daily`, `/cash-flow`, `/expenses`, `GET /prescriptions`, the expense, bank and cash-drawer routes | 8.10, 8.11 | not in the spec. Built in Phase 13 from the handoff's text (see section 9); the fields of their answers are the open questions below |

### 8.2 Questions for the backend

26. For the reports above that are not in the spec, please publish the response shapes (or confirm the frontend may propose them in docs/openapi.draft.json). The dashboard's field names are in the handoff (`visits.today/yesterday/mine`, ...) but not their types (is `revenue.last7Days` an array of money strings? `patientFlow.last7Days` an array of { date, count }?).
27. `GET /reports/outstanding/patients`: is the order always largest balance first (the frontend shows the server's order and never re-sorts)? Does `oldestUnpaid` count only patient-payable charges?
28. `GET /reports/revenue` `byPanel[].commission`: is it ever non-zero (the frontend shows it as sent)?
29. Is a report's `dateTo` allowed to be after the hospital's today (the frontend allows it for a custom period)?

## 9. Phase 13 (2026-11-08): accounts, bank, cash drawer, dashboard, other reports, prescriptions

The handoff fixes the REQUESTS (bodies, query parameters, permissions, error codes) of these routes, and the field NAMES of the dashboard. It does not list the fields of any other answer. The screens are built anyway, to read as little as possible and show the rest as received. This is exactly what they depend on; any difference between it and the real answers is a defect to settle with the backend, not a hidden assumption.

### 9.1 What an answer must carry (otherwise the screen refuses it with an error, it never guesses)

| Route | the frontend reads | everything else |
|---|---|---|
| `GET /expenses` (and the row of POST / PATCH / void) | `data[]`, `meta.total`; per row an `id` (ULID), a day in `date` (or `expenseDate`), `amount` as a decimal STRING; optionally `description`, `mode` (or `paymentMode`), `category` as `{ id, name }` or `categoryId` + `categoryName`, `bankAccount` as `{ id, name }` or `bankAccountId` + `bankAccountName`, `referenceNo` (or `reference`), a void mark (`voided: true`, `voidedAt`, or `status: "voided"`), `voidReason`, `updatedAt`; the list's `totalAmount` (also `meta.totalAmount` or `totals.amount`) | kept in the row and shown in the details view as received |
| `GET /bank-balances` | nothing | shown as received |
| `GET /bank-accounts/{id}/statement` | `opening` / `closing` (or `openingBalance` / `closingBalance`; text, or an object with `balance` or `amount`), and the entries list under `entries`, `transactions` or `lines` | the whole answer is shown if the entries are not a list of objects; entries show as a table (columns in the order sent, `date, kind, description, reference, amount, running balance` first) |
| statement entry / `POST /bank-transactions` row | `id`; for the Void button also `kind` (or `type`) and a void mark | shown as received |
| `GET /cash-drawer/opening` | `amount` (or `openingAmount`, `opening.amount`) as a decimal string, `date` (or `openingDate`, `opening.date`); an UNSET opening is read as a 404, or an answer without an amount | |
| `GET /dashboard` | exactly the handoff's names: `visits.{today,yesterday,mine}`, `admitted.{total,male,female,other}`, `lab.{pending,doneToday}`, `imaging.{pending,doneToday}`, `pharmacy.{dispensedToday,dispensedYesterday,lowStock}`, `revenue.{today,yesterday,last7Days}`, `patientFlow.{last7Days,total}`; counts are whole numbers, money is a decimal string, a section the user may not see is null | an unrecognised series is not drawn |
| `last7Days` (both) | a list of numbers or number-text, or of objects with exactly ONE day (YYYY-MM-DD) and exactly ONE number or number-text beside it | otherwise not drawn (no guess) |
| `GET /prescriptions` | `data[]` of objects, `meta.total` | rows shown as received (columns in the order sent) |
| the other reports (`daily-summary`, `opd`, `demographics`, `lab`, `pharmacy`, `financial-summary`, `revenue/daily`, `cash-flow`, `expenses`) | nothing | shown as received: plain values as tiles, a list of objects as a table, a nested object as a section; money is recognised by FORM (a decimal string with exactly two decimals, a key that is not a percentage or rate) and shown exactly as sent |

### 9.2 Questions for the backend (the answers change what the screens can show, not whether they work)

30. What are the fields of the expense, the bank entry, the statement and the balances answers? Are `bank-balances` and the statement's `entries` shaped as the table in 9.1 assumes (or should the screens show named columns and a total)?
31. `GET /expenses`: is `totalAmount` at the top level of the list answer, and does it exclude voided rows when `includeVoided=true`? (The screen shows it as sent beside "Total of the N expenses in this view".)
32. `PATCH /expenses/{id}`: is `expectedUpdatedAt` accepted? (The handoff says "where the resource takes it"; the frontend sends it only when the record carries `updatedAt`.) Is a PATCH that changes nothing refused by the server as well?
33. `GET /cash-drawer/opening` before it is set: 404, or 200 with a null amount? (Both are handled.)
34. Are `GET /expenses/{id}` and `GET /bank-transactions/{id}` needed by any workflow? (They are implemented in the service and tested; no screen calls them, because the list and the statement already carry each row.)
35. The five single-record GETs of the catalogues (`/users/{id}`, `/services/{id}`, `/imaging-tests/{id}`, `/expense-categories/{id}`, `/bank-accounts/{id}`) are not called: each edit form is filled from the list row and the PATCH carries that row's `updatedAt`. Tell us if a field exists only on the single-record answer.
36. `revenue/daily` and `dashboard.revenue.last7Days`: what is the item shape? (The frontend accepts `{ date, <one number> }`; an item with two numbers, for example revenue and a count, is shown in the table but not drawn as a bar.)
37. Which sections of `GET /dashboard` are null for which permission? (The frontend only hides what is null; it does not decide from the role.)
38. `GET /reports/financial-summary` without `accounts.read`: the handoff says `expenses`, `bank` and `cashFlow` are null. Confirmed? (They are shown as "—".)
