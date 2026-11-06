import type { Patient } from "@/types"
import { legacyNumericId } from "./reference/refId"
import type { PatientRecord } from "./types"

// Bridges between the service-level PatientRecord (string ids) and shared screens that still use the
// legacy numeric-id model (encounters, billing, lab, imaging, pharmacy, reports). The bridge never
// guesses: an id that is not a canonical integer (a real ULID, "007", "1e3") is reported as "no legacy
// equivalent", so mock encounters/invoices are never shown against, or linked to, a real backend patient.

/** Patient picker: minimum characters before searching, and how many matches to show. */
export const PICKER_MIN_CHARS = 2
export const PICKER_RESULT_LIMIT = 6

/** The search term to send, or null when the query is too short to search. */
export function pickerSearchTerm(query: string): string | null {
  const q = query.trim()
  return q.length >= PICKER_MIN_CHARS ? q : null
}

/** Numeric id used by legacy mock data, or null if this record's id has no faithful numeric form. */
export function legacyPatientId(record: Pick<PatientRecord, "id">): number | null {
  return legacyNumericId(record.id)
}

/** Legacy `Patient` for screens that haven't been migrated. Throws if the patient or its organisation id has no numeric form. */
export function toLegacyPatient(record: PatientRecord): Patient {
  const id = legacyNumericId(record.id)
  const panelId = record.panelId === null ? null : legacyNumericId(record.panelId)
  if (id === null || (record.panelId !== null && panelId === null)) {
    throw new Error("This screen still uses legacy patient ids and cannot use this patient until it is connected to the backend.")
  }
  return { ...record, id, panelId }
}

/** Another patient (not `excludeId`) registered with the same phone number, if any. */
export function findDuplicatePhone(candidates: PatientRecord[], phone: string, excludeId?: string): PatientRecord | undefined {
  return candidates.find((p) => p.phone === phone && p.id !== excludeId)
}
