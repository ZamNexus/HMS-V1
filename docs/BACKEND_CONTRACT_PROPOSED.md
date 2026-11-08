# Proposed backend contract: expense categories, bank accounts, Item History

**Status: PROPOSED by the frontend, 2026-11-07. The backend for these routes does not exist yet, and nothing here is verified against a server. The frontend screens were built against this proposal the same day: Master Data > Expense Categories and Banks, and the Item History button (mappers in `src/lib/services/http/{expenseCategories,bankAccounts,itemHistory}.ts`; none of them has been run in a browser).**

The handoff (`HMS Frontend Integration Handoff.md`, sections 8.2, 8.10, 8.12 and 9) names these routes, their permissions and a few rules, but `openapi.json` does not define them, so the exact fields were missing. This file fills the gap. **Build the backend to match it exactly.** If you need to differ (a field name, a limit, an error code), tell the frontend before it ships: the frontend maps these fields one for one and will not guess.

The machine-readable version is [`openapi.draft.json`](./openapi.draft.json) (OpenAPI 3, valid, generates types). Where the two ever disagree, `openapi.draft.json` wins; it is generated from the same source as this page.

## Conventions (same as `openapi.json`)

- Paths are under `/api/v1`. Ids are ULID strings (`^[0-9A-HJKMNP-TV-Z]{26}$`). Instants are ISO 8601 UTC (`2026-11-07T10:00:00.000Z`). Money is a string with two decimals.
- Lists: `page` (default 1), `perPage` (default 25, 1 to 100), `sort` (`field:asc|desc`), `search` (1 to 100 characters), `active` (`"true"` or `"false"`). The answer is `{ "data": [...], "meta": { "page", "perPage", "total", "totalPages" } }`.
- Errors use the one envelope `ErrorResponse` (`statusCode`, `code`, `message`, `requestId`, `path`, `timestamp`, `details?`). `400 VALIDATION_FAILED` lists each bad field as `details: [{ "path": "name", "message": "..." }]`. `404 NOT_FOUND` also covers records that belong to another hospital.
- Nothing is ever deleted: a catalog entry is deactivated and reactivated. Deactivate and reactivate return the full record.
- Request bodies reject unknown fields (`additionalProperties: false`). `PATCH` takes only the fields that changed.

---

## 1. Expense categories (Master Data > Expense Categories)

| Method | Path | Permission | Success |
| --- | --- | --- | --- |
| GET | `/expense-categories` | `catalogs.read` | 200 page of category |
| POST | `/expense-categories` | `catalogs.write` | 201 category |
| GET | `/expense-categories/{id}` | `catalogs.read` | 200 category |
| PATCH | `/expense-categories/{id}` | `catalogs.write` | 200 category |
| POST | `/expense-categories/{id}/deactivate` | `catalogs.write` | 200 category |
| POST | `/expense-categories/{id}/reactivate` | `catalogs.write` | 200 category |

**Category (response)**, all fields always present:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ULID | |
| `name` | string, 2 to 80 | |
| `active` | boolean | |
| `createdAt` | instant | |

**List:** `search` matches `name`. `sort` fields: `name` (default `name:asc`), `createdAt`. The expense form passes `active=true`; the admin screen lists everything.

**Create** `{ "name": string }`: `name` required, 2 to 80 characters after trimming.
**Update** `{ "name"?: string }`: same rule.

**Rules**

- The name is unique in the hospital, ignoring case, **across active and deactivated categories**.
- Renaming does not rewrite past expenses: an expense keeps the category name it was recorded with (handoff 8.2).
- Deactivating is allowed even when expenses use the category. A deactivated category cannot be picked for a new expense: `POST /expenses` answers `422 CATEGORY_INACTIVE` (already in handoff 8.10). Past expenses keep it.

**Errors:** `400 VALIDATION_FAILED`; `404 NOT_FOUND`; `409 EXPENSE_CATEGORY_NAME_TAKEN` (create and update).

---

## 2. Bank accounts (Master Data > Banks)

| Method | Path | Permission | Success |
| --- | --- | --- | --- |
| GET | `/bank-accounts` | **`accounts.read`** | 200 page of account |
| POST | `/bank-accounts` | `catalogs.write` | 201 account |
| GET | `/bank-accounts/{id}` | **`accounts.read`** | 200 account |
| PATCH | `/bank-accounts/{id}` | `catalogs.write` | 200 account |
| POST | `/bank-accounts/{id}/deactivate` | `catalogs.write` | 200 account |
| POST | `/bank-accounts/{id}/reactivate` | `catalogs.write` | 200 account |

Reading needs `accounts.read`, not `catalogs.read`: account numbers are for money handlers only (handoff 8.2). So a user with only `catalogs.read` does not see the Banks tab.

**Account (response)**, all fields always present:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ULID | |
| `bankName` | string, 2 to 80 | |
| `accountTitle` | string, 2 to 120 | |
| `accountNo` | string, 4 to 34 | returned in full to `accounts.read` holders |
| `branch` | string up to 120, or `null` | |
| `active` | boolean | |
| `createdAt` | instant | |

**List:** `search` matches bank name, account title or account number (partial, ignoring case). `sort` fields: `bankName` (default `bankName:asc`), `createdAt`. Forms that pick an account pass `active=true`.

**Create** `{ "bankName", "accountTitle", "accountNo", "branch"? }`: the first three required. `accountNo` matches `^[A-Za-z0-9][A-Za-z0-9 -]*$` (letters, digits, spaces, hyphens: an IBAN or a local number), 4 to 34 characters. `branch` up to 120.
**Update** the same four fields, all optional. `branch: null` or `""` clears the branch. Changing an account's details never changes past entries.

**Rules**

- `accountNo` is unique in the hospital, ignoring case and spaces, **across active and deactivated accounts**.
- Deactivating is allowed whatever the balance. A deactivated account cannot take new expenses or bank entries: those routes answer `422 BANK_ACCOUNT_INACTIVE` (already in handoff 8.10). Past entries, balances and statements stay.

**Errors:** `400 VALIDATION_FAILED`; `404 NOT_FOUND`; `409 BANK_ACCOUNT_NO_TAKEN` (create and update).

---

## 3. Item History (`GET /audit-entries`)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/audit-entries?entityType=&entityId=&page=&perPage=` | `audit.read` |

`entityType` (required) is one of: `service_catalog_item`, `lab_test`, `imaging_test`, `medicine`, `panel`, `guardian_relation`, `expense_category`, `bank_account`, `ward`, `bed`, `user`, `doctor`, `clinic_settings`.
`entityId` (required) is the record's id. For `doctor` it is the doctor's **user id**; for `clinic_settings` it is the **hospital's id** (from `GET /auth/me`).

**Order:** newest first (`occurredAt` descending, ties by `id` descending). Read-only, paged like every list.

**Entry (response)**, all fields always present:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ULID | |
| `occurredAt` | instant | |
| `action` | `"created"`, `"updated"`, `"deactivated"` or `"reactivated"` | |
| `actor` | `{ "id": ULID, "name": string }` or `null` | `null` = a change the system made; shown as "System" |
| `changes` | object or `null` | see below |

**`changes`:** for `updated`, one entry per changed field, keyed by the API's own field name (`rate`, `name`, `phone`, ...): `{ "rate": { "from": "1500.00", "to": "1800.00" } }`. For `created`, `deactivated` and `reactivated` it is `null`. Each `from` / `to` is a string, a number, a boolean or `null`; money is a decimal string. **A value that is a list or an object** (a lab test's `parameters`, a user's `doctorProfile`) is sent as a short text summary such as `"3 parameters"`: the frontend renders every value as plain text. **Secrets never appear** (passwords, temporary passwords, tokens, hashes).

**Errors:** `400 VALIDATION_FAILED` (unknown `entityType`, `entityId` not a ULID, missing parameter); `403`; `404 NOT_FOUND` (the record does not exist in this hospital).

---

## 4. Assumptions the frontend already makes about EXISTING routes: please confirm or fix

The frontend sends these today. If the backend behaves differently, tell the frontend.

1. **`PATCH /users/{id}`**: `phone`, `cnic`, `address`, `city`, `joiningDate` set to `null` clear the field (the schema says nullable). `email: null` is also sent to clear the email, but `openapi.json` types `UpdateUserDto.email` as an **array of strings**: please correct the schema and confirm `null` clears it.
2. **`PATCH /users/{id}/doctor-profile`**: an emptied text box (`specialization`, `qualifications`, `pmcRegNo`, `notes`) is sent as `""` and should clear it. `commissionPct` has no null in the schema, so the frontend asks the admin to enter `0` instead of emptying it. If you want a real "no commission" (`null`), say so.
3. **Schema typing defects in `openapi.json`** that the frontend tolerates today and that should be fixed (see `SPEC_BUGS_FOR_BACKEND.md`): many single text fields are typed as arrays of strings; `turnaroundHours` on a single lab or imaging test is typed `array of number` while the list says `number or null`; `reportTemplate` on a single imaging test is typed `array of string`. Real servers presumably send the plain value.
4. **`POST /users` and `POST /users/{id}/reset-password`** return the temporary password once; it is shown once in a dialog and never stored by the frontend.
5. **`GET /doctors`** returns active doctors only, and its `id` is the user id.
6. **Lab and imaging tests share names and codes with the Services Catalog** (`SERVICE_NAME_TAKEN` / `SERVICE_CODE_TAKEN`, as `openapi.json` states).

## 5. What the frontend will do once this is built

- Master Data > Expense Categories and > Banks switch from "not connected" to working tabs (list, add, rename or edit, deactivate, reactivate; a taken name or account number is shown on its field).
- Every Master Data tab, the Users and Doctors screens and Clinic Settings get an **Item History** button (only for `audit.read`), showing newest first, "Field: from -> to", and "System" for a null actor.
- The frontend has not written any of this yet: it waits for the owner to confirm this contract.
