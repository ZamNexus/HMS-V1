import type { ListOptions, ListResult } from "../types"

export interface AllItems<T> {
  items: T[]
  total: number
  /** False when the list could not be fetched in full (page cap reached or the backend returned fewer than `total`). */
  complete: boolean
}

/**
 * Collects every page of a list call, for small reference lists (doctors, organisations…) that
 * lookups need in full. Uses only the abstract `page` / `pageSize` / `total` of ListOptions and
 * ListResult — how the real backend pages is decided in the mapper (CONTRACT REQUIRED).
 */
export async function listAll<T>(
  list: (opts: ListOptions) => Promise<ListResult<T>>,
  { pageSize = 100, maxPages = 50, signal }: { pageSize?: number; maxPages?: number; signal?: AbortSignal } = {}
): Promise<AllItems<T>> {
  const items: T[] = []
  let total = 0
  for (let page = 1; page <= maxPages; page++) {
    const res = await list({ page, pageSize, signal })
    total = res.total
    items.push(...res.items)
    if (items.length >= total || res.items.length === 0) break
  }
  return { items, total, complete: items.length >= total }
}
