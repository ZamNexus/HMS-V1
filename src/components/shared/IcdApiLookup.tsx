"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { describeFailure } from "@/lib/errorState"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { icdService, type IcdCodeRecord } from "@/lib/services"

export const ICD_PICKER_PAGE_SIZE = 8

/** One page of ICD-10 codes for a debounced search term (server-side; a name or a code prefix). */
export function useIcdSearch(term: string | undefined, page = 1, pageSize = ICD_PICKER_PAGE_SIZE, enabled = true) {
  const key = useScopedKey("icd", term ?? null, page, pageSize)
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => icdService.list({ search: term, page, pageSize, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // the list is shared and changes only when operations reload it
    placeholderData: keepPreviousData,
    enabled,
  })
}

/**
 * The body of the ICD-10 lookup popover in API mode: a search box (name or code), the first matches from the server, and a pick. Mounted only while the
 * popover is open, so nothing is requested until the user opens it.
 */
export function IcdApiLookupBody({ onPick }: { onPick: (code: IcdCodeRecord) => void }) {
  const search = useDebouncedSearch()
  const list = useIcdSearch(search.term)
  const items = list.data?.items ?? []
  return (
    <div data-testid="icd-lookup-api">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus aria-label="Search diagnosis or ICD code" className="h-8 pl-8 text-xs" placeholder="Search diagnosis or ICD code (2+ letters)…" value={search.input} onChange={(e) => search.onChange(e.target.value)} />
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {list.isError && !list.data ? (
          <p role="alert" className="p-2 text-xs text-red-600">{describeFailure(list.error).message}</p>
        ) : list.isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : items.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No matches found.</p>
        ) : (
          items.map((d) => (
            <button key={d.id} type="button" onClick={() => onPick(d)} className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted">
              <span className="truncate">{d.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-secondary">{d.code}</span>
            </button>
          ))
        )}
        {list.data && list.data.total > items.length && <p className="p-2 text-[11px] text-muted-foreground">Showing the first {items.length} of {list.data.total}. Type more to narrow the list.</p>}
      </div>
    </div>
  )
}
