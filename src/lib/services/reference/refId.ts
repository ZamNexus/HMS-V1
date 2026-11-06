// Identifier handling shared by every reference-data lookup.
//
// Records have string ids (ULIDs from the backend; numeric-looking strings in mock mode) while legacy
// screens still store numeric foreign keys (`doctorId: number`, `patientId: number`). The one rule that
// makes both work: ids are compared as STRINGS, and a string is only ever turned back into a number when
// it is a canonical integer. A number -> string conversion is lossless; a string -> number one is not, so
// it is never guessed (no `Number("01ARZ...")` NaN, no "007" -> 7, no "1e3" -> 1000).

export type RefId = string | number

/** Map key for an id, or null if there is none. Numbers and their string form share a key. */
export function refKey(id: RefId | null | undefined): string | null {
  return id === null || id === undefined ? null : String(id)
}

/**
 * The numeric id a legacy screen can use, or null if this id has no faithful numeric form.
 * Accepts safe integers and canonical non-negative integer strings only.
 */
export function legacyNumericId(id: RefId | null | undefined): number | null {
  if (typeof id === "number") return Number.isSafeInteger(id) && id >= 0 ? id : null
  if (typeof id !== "string" || !/^(0|[1-9]\d*)$/.test(id)) return null
  const n = Number(id)
  return Number.isSafeInteger(n) ? n : null
}
