"use client"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { PICKER_PER_PAGE, normalizeSearch } from "./search"
import { useDebouncedSearch } from "./useDebouncedSearch"
import { useScopedKey } from "./useScopedKey"

/** Picker results are not records being worked on; a short cache keeps typing and re-opening cheap. */
export const PICKER_STALE_MS = 30_000

/**
 * Data for an async picker (patient, doctor, panel, service, medicine, ICD): the same list endpoint with perPage 6 and only active rows,
 * searched from 2 characters after a 300 ms pause, the previous request aborted when the term changes. The term lives in component state, never
 * in the address bar. `fetchPage` receives { search, perPage, signal } and must forward `signal`, `search` and `active` to the list call.
 */
export function usePickerOptions<T>(
  family: string,
  fetchPage: (args: { search: string | undefined; perPage: number; active: true; signal: AbortSignal }) => Promise<readonly T[]>,
  options: { enabled?: boolean } = {}
) {
  const { input, term, onChange } = useDebouncedSearch()
  const query = useQuery({
    queryKey: useScopedKey(family, "picker", term ?? null),
    queryFn: ({ signal }) => fetchPage({ search: term, perPage: PICKER_PER_PAGE, active: true, signal }),
    staleTime: PICKER_STALE_MS,
    // the options stay on screen while the next term loads (no flash to empty)
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
  return {
    input,
    onInputChange: onChange,
    /** Nothing is searched until the user has typed 2 characters. */
    searching: normalizeSearch(input) !== undefined,
    options: (query.data ?? []) as readonly T[],
    loading: query.isFetching,
    error: query.error as unknown,
  }
}
