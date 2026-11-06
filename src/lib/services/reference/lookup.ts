import { refKey, type RefId } from "./refId"

export interface Lookup<T> {
  /** Find by id; a number and its string form find the same record. Unknown / missing ids return undefined. */
  get(id: RefId | null | undefined): T | undefined
  readonly items: readonly T[]
}

/** Id-indexed view over a list. The first record wins if an id repeats. */
export function buildLookup<T>(items: readonly T[], idOf: (item: T) => RefId): Lookup<T> {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = refKey(idOf(item))
    if (key !== null && !byKey.has(key)) byKey.set(key, item)
  }
  return {
    items,
    get: (id) => {
      const key = refKey(id)
      return key === null ? undefined : byKey.get(key)
    },
  }
}
