import { getQueryClient } from "./client"
import { FAMILY_INDEX } from "./scope"

/**
 * Marks every query of a family stale and refetches the ones on screen. Families are the names in scopedKey(family, ...), e.g. "patient",
 * "organisations". Called by invalidatingService after a successful mutation, and also after a create whose answer could not be read
 * (the server did save it).
 */
export function invalidateFamily(family: string): Promise<void> {
  return getQueryClient().invalidateQueries({ predicate: (q) => q.queryKey[FAMILY_INDEX] === family })
}
