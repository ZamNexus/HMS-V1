"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Search, Stethoscope } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { icdService } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { CATALOG_PAGE_SIZE, cardClass, inputClass } from "./catalogStyles"

/**
 * Master Data -> Diseases / Diagnosis in API mode: the shared ICD-10 list, READ-ONLY (decision D7). The same list serves every hospital, is loaded by
 * operations and is never edited through the API, so there is no Add, Edit or switch here. Searched by diagnosis name or code prefix and paged on the
 * server. Needs catalogs.read.
 */
export function IcdCodesTab() {
  const { can } = useAccess()
  const canRead = can("catalogs.read")
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const key = useScopedKey("icd", "admin", search.term ?? null, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => icdService.list({ search: search.term, page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime,
    placeholderData: keepPreviousData,
    enabled: canRead,
  })
  if (!canRead) return <EmptyState icon={Stethoscope} title="The diagnosis list is not available to you" subtitle="You need permission to view catalogues." />
  const items = list.data?.items ?? []
  return (
    <div className="space-y-4" data-testid="icd-tab">
      <div className="rounded-[1.25rem] border border-indigo-100 bg-indigo-50/50 p-4 text-sm font-medium text-indigo-800">
        <p>This is the standard ICD-10 diagnosis list, shared by every hospital and maintained centrally. It cannot be edited here.</p>
      </div>
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search diagnoses" placeholder="Search diagnosis or code…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
        </div>
      </div>
      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">ICD-10 Code</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Diagnosis</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={3} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="p-0"><EmptyState icon={Stethoscope} title={search.term ? "No diagnosis matches that search" : "No diagnoses loaded"} subtitle={search.term ? "Try a different name or the start of a code." : "The ICD-10 list has not been loaded yet."} /></TableCell></TableRow>
                ) : (
                  items.map((d) => (
                    <TableRow key={d.id} data-testid={`icd-row-${d.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4"><span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 font-mono text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20">{d.code}</span></TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{d.name}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{d.category ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="diagnoses" /></div>
          )}
        </div>
      )}
    </div>
  )
}
