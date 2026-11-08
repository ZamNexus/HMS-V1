import { OFFLINE, REQUEST_TIMEOUT, fieldErrorsOf, isApiError } from "@/lib/api/client"
import { isNotConnectedError, isSavedButUnreadableError } from "./errors"

/**
 * What a screen should tell the user after a create (POST) did not return a record.
 *  - "saved-unreadable": the server accepted it (2xx) but the answer could not be read. Say it is saved and refresh; never offer a retry.
 *  - "failed": nothing is known to have been created. Show the backend's own message, a short heading chosen from its `code`, and the
 *    `requestId` as a separate "support reference" line.
 */
export type CreateFailure =
  | { kind: "saved-unreadable"; message: string }
  | { kind: "failed"; heading: string; message: string; details: string[]; code: string | null; requestId: string | null }

export const SAVED_REFRESHING_MESSAGE = "Saved. Refreshing the list."

// Headings only for codes docs/openapi.json documents for the patient, panel and guardian-relation endpoints (409 / 422 descriptions); every other code falls back to a generic heading and the
// backend's own message, which is always shown.
const HEADINGS: Record<string, string> = {
  VALIDATION_FAILED: "Some details need correcting",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  PANEL_INACTIVE: "That organisation is inactive",
  GUARDIAN_RELATION_INACTIVE: "That relation is inactive",
  PANEL_NAME_TAKEN: "That organisation name is already used",
  GUARDIAN_RELATION_TAKEN: "That relation already exists",
  PATIENT_CHANGED: "This patient was changed by someone else",
  PATIENT_ARCHIVED: "This patient is archived",
  PATIENT_ADMITTED: "The patient is still admitted",
  PATIENT_DECEASED: "This patient is deceased",
  SLOT_TAKEN: "That time was just taken",
  PATIENT_ALREADY_BOOKED: "The patient already has an appointment that day",
  APPOINTMENT_CHANGED: "This appointment was changed by someone else",
  NOT_A_SLOT: "That is not a bookable time",
  SLOT_PASSED: "That time has already passed",
  APPOINTMENT_NOT_OPEN: "This appointment is no longer open",
  APPOINTMENT_NOT_TODAY: "This appointment is not for today",
  APPOINTMENT_MISMATCH: "This appointment belongs to another patient or doctor",
  DOCTOR_UNAVAILABLE: "The doctor is not available",
  // Encounters (handoff 8.5)
  ENCOUNTER_CHANGED: "This encounter was changed by someone else",
  ENCOUNTER_NOT_OPEN: "This encounter is no longer open",
  ENCOUNTER_RECORD_STARTED: "The doctor has already started the record",
  ENCOUNTER_ARCHIVED: "This encounter is archived",
  ENCOUNTER_NOT_ENDED: "This encounter has not ended",
  CLINICAL_RECORD_INCOMPLETE: "The clinical record is incomplete",
  NOT_AN_ADMISSION: "This is not an admission",
  NOT_AN_OPD_VISIT: "This is not an OPD visit",
  PRESCRIPTION_DISPENSED: "A dispensed medicine cannot be changed",
  BED_UNDER_MAINTENANCE: "That bed is under maintenance",
  BED_UNAVAILABLE: "That bed is not available",
  SAME_BED: "The patient is already in that bed",
  // Billing (handoff 8.6)
  CHARGE_PAID: "Money has already been received on this charge",
  INVOICE_VOIDED: "This invoice is voided",
  CHARGE_VOIDED: "This charge is already voided",
  ENCOUNTER_OPEN: "The visit is still under way",
  DISCOUNT_TOO_LARGE: "The discount is larger than the bill",
  OVERPAYMENT: "That is more than is owed",
  INSUFFICIENT_CREDIT: "There is not enough credit",
  NOTHING_TO_APPLY: "There is nothing to apply the credit to",
  CREDIT_NOTE_EXCEEDS_OWED: "The credit note is larger than what is owed",
  NOTHING_BILLED: "Nothing has been billed",
  COUNTER_SALE: "A counter sale has no billing actions",
  CHARGE_FROM_LAB_ORDER: "This charge belongs to a lab or imaging order",
  CHARGE_FROM_DISPENSE: "This charge belongs to a dispensed medicine",
  // Laboratory and imaging (handoff 8.7 and 8.8)
  SPECIMEN_NOT_COLLECTED: "The specimen has not been collected yet",
  RESULT_VERIFIED: "This result is already verified",
  VERIFIER_IS_ENTERER: "A result cannot be verified by the person who entered it",
  TEST_HAS_RESULT: "This test already has a result",
  ORDER_NOT_COMPLETE: "The order is not complete yet",
  ORDER_IS_REFERRAL: "This order is an external referral",
  // Pharmacy (handoff 8.9)
  MEDICINE_NAME_TAKEN: "A medicine with that name already exists",
  OUT_OF_STOCK: "A medicine is out of stock",
  INSUFFICIENT_STOCK: "There is not enough stock",
  BATCH_EXPIRED: "That batch has expired",
  MEDICINE_INACTIVE: "That medicine is deactivated",
  PRESCRIPTION_FULFILLED: "That prescription line is already fully dispensed",
  RETURN_EXCEEDS_DISPENSED: "More was returned than was dispensed",
  SETTINGS_CHANGED: "These settings were changed by someone else",
  CURRENCY_LOCKED: "The currency can no longer be changed",
  TIMEZONE_LOCKED: "The time zone can no longer be changed",
  SERVICE_NAME_TAKEN: "That service name is already used",
  SERVICE_CODE_TAKEN: "That service code is already used",
  PARAMETER_HAS_RESULTS: "A parameter with recorded results cannot be removed or re-keyed",
  WARD_NAME_TAKEN: "That ward name is already used",
  BED_NO_TAKEN: "That bed number is already used in this ward",
  NO_ACTIVE_LOCATION: "No active location to put the ward in",
  WARD_OCCUPIED: "Patients are still in this ward",
  BED_OCCUPIED: "A patient is in this bed",
  USERNAME_TAKEN: "That username is already used",
  EMAIL_TAKEN: "That email is already used",
  CANNOT_CHANGE_OWN_ROLE: "You cannot change your own role",
  LAST_ADMIN: "This is the last administrator",
  DOCTOR_PROFILE_REQUIRED: "A doctor profile is needed",
  NOT_A_DOCTOR: "This user is not a doctor",
  CANNOT_DEACTIVATE_SELF: "You cannot deactivate yourself",
  USE_CHANGE_PASSWORD: "Use Change password for your own account",
  MODULE_DISABLED: "That department is switched off",
  MODULE_IN_USE: "That department is still in use",
  CHARGE_CREDITED: "That charge has already been credited",
  // Expenses, bank entries and the cash drawer (handoff 8.10)
  EXPENSE_CHANGED: "This expense was changed by someone else",
  DATE_IN_FUTURE: "That date is in the future",
  CATEGORY_INACTIVE: "That category is inactive",
  BANK_ACCOUNT_INACTIVE: "That bank account is inactive",
  BEFORE_OPENING_BALANCE: "That date is before the account's opening balance",
  BEFORE_CASH_OPENING: "That date is before the cash drawer's opening",
  VOID_THROUGH_EXPENSE: "Void the expense instead",
  OPENING_BALANCE_EXISTS: "An opening balance already exists",
  // Expense categories and bank accounts: the PROPOSED contract (docs/BACKEND_CONTRACT_PROPOSED.md)
  EXPENSE_CATEGORY_NAME_TAKEN: "That category name is already used",
  BANK_ACCOUNT_NO_TAKEN: "That account number is already used",
  NOT_FOUND: "Not found",
  FORBIDDEN: "Not allowed",
  AUTHENTICATION_REQUIRED: "Please sign in again",
  TOO_MANY_REQUESTS: "Too many requests",
  OFFLINE: "You are offline",
  REQUEST_TIMEOUT: "The server is slow",
}

/**
 * True when a write got no usable answer, so the server MAY have saved it: the answer never arrived (network failure, timeout) or a gateway
 * answered instead of the server (502, 503, 504). Not true for OFFLINE (refused before sending) or for the server's own refusals.
 */
export function writeOutcomeUnknown(err: unknown): boolean {
  if (!isApiError(err) || err.code === OFFLINE) return false
  return err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504
}

const MODULE_TITLE: Readonly<Record<string, string>> = { pharmacy: "Pharmacy", lab: "Laboratory", imaging: "Imaging", ipd: "Inpatient (IPD)" }

/** True for `422 MODULE_DISABLED`: a department an administrator switched off refused the call (handoff 8.1). Past records stay readable. */
export function isModuleDisabled(err: unknown): boolean {
  return isApiError(err) && err.status === 422 && err.code === "MODULE_DISABLED"
}

/** The department name from `details.module` of a MODULE_DISABLED answer, or null when the server did not say. */
export function disabledModuleOf(err: unknown): string | null {
  const details: unknown = isApiError(err) ? err.body?.details : undefined
  const m = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>).module : undefined
  return typeof m === "string" ? (MODULE_TITLE[m] ?? null) : null
}

export function classifyCreateError(err: unknown): CreateFailure {
  if (isSavedButUnreadableError(err)) return { kind: "saved-unreadable", message: err.userMessage ?? SAVED_REFRESHING_MESSAGE }
  if (isApiError(err)) {
    const details = fieldErrorsOf(err).map((d) => `${d.path}: ${d.message}`)
    // OFFLINE: the request was refused before it was sent, so nothing was saved. Network failure, timeout or a gateway error: the answer never
    // (fully) arrived, the server may or may not have saved it, so do not say "try again".
    const message =
      err.code === OFFLINE
        ? "You are offline. Nothing was sent. Reconnect and try again."
        : err.code === REQUEST_TIMEOUT
          ? "The server took too long to answer. The record may or may not have been saved: check the list before trying again."
          : writeOutcomeUnknown(err)
            ? "Could not get an answer from the server. The record may or may not have been saved: check the list before trying again."
            : err.message
    const named = isModuleDisabled(err) ? disabledModuleOf(err) : null
    const heading = named ? `The ${named} department is switched off` : (HEADINGS[err.code] ?? "Could not save")
    return { kind: "failed", heading, message, details, code: err.code, requestId: err.requestId }
  }
  if (isNotConnectedError(err)) return { kind: "failed", heading: "Not connected", message: err.message, details: [], code: null, requestId: null }
  // A body that could not be built, a programming error, etc.: nothing was sent.
  return { kind: "failed", heading: "Could not save", message: err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.", details: [], code: null, requestId: null }
}
