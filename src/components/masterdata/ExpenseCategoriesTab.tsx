"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Pencil, Plus, Receipt, Search } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, expenseCategoriesService, type ExpenseCategoryRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Master Data -> Expense Categories (GET/POST /expense-categories, PATCH, deactivate / reactivate: handoff 8.2; fields from the proposed contract). Paged,
 * searched and filtered on the server. Write controls need catalogs.write. Nothing is deleted: the switch deactivates / reactivates, and a deactivated
 * category can no longer be picked for a new expense while past expenses keep it. Renaming never rewrites past expenses.
 */
export function ExpenseCategoriesTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const { toast } = useToast()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<ExpenseCategoryRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("expenseCategories", "admin", search.term ?? null, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => expenseCategoriesService.list({ search: search.term, active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })

  async function toggle(c: ExpenseCategoryRecord) {
    if (busyId) return
    setBusyId(c.id)
    const active = c.active !== false
    try {
      await expenseCategoriesService.setActive(c.id, !active)
      toast({ title: `${c.name} ${active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${active ? "deactivate" : "reactivate"} ${c.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  const filtered = !!search.term || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="expense-categories-tab">
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search expense categories" placeholder="Search categories…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as ActiveFilter); setPage(1) }}>
            <SelectTrigger aria-label="Status" className={cn(selectClass, "w-full md:w-40")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Category</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Category</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={3} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="p-0"><EmptyState icon={Receipt} title={filtered ? "No category matches" : "No expense categories yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first category." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow key={c.id} data-testid={`expense-category-row-${c.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{c.name}</TableCell>
                      <TableCell className="py-4"><Switch aria-label={`${c.active !== false ? "Deactivate" : "Reactivate"} ${c.name}`} checked={c.active !== false} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(c)} /></TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <ItemHistoryButton subject="expenseCategory" id={c.id} label={c.name} />
                          {canWrite && <Button aria-label={`Edit ${c.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(c)}><Pencil className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="categories" /></div>
          )}
        </div>
      )}

      {target !== null && (
        <CategoryDialog key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} onShowExisting={(name) => { search.onChange(name); setActiveFilter("all"); setPage(1); setTarget(null) }} />
      )}
    </div>
  )
}

function CategoryDialog({ target, onClose, onShowExisting }: { target: ExpenseCategoryRecord | "new"; onClose: () => void; onShowExisting: (name: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [name, setName] = React.useState(original?.name ?? "")
  const [problem, setProblem] = React.useState<string | undefined>()
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  async function save() {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 80) { setProblem("The category name needs 2 to 80 characters"); return }
    setProblem(undefined)
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await expenseCategoriesService.create({ name })
          toast({ title: `${trimmed} added` })
        } else if (trimmed !== original.name) {
          await expenseCategoriesService.update(original.id, { name })
          toast({ title: `${trimmed} renamed` })
        } else {
          toast({ title: "Nothing changed" })
        }
        onClose()
      } catch (err) {
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          toast({ title: result.message === SAVED_REFRESHING_MESSAGE ? "Saved. Refreshing the list." : result.message })
          onClose()
          return
        }
        const fromServer = fieldErrorMap(err).name
        setProblem(fromServer ?? (result.code === "EXPENSE_CATEGORY_NAME_TAKEN" ? result.message : undefined))
        setFailure(result)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Rename Category" : "Add Category"}</DialogTitle></DialogHeader>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor={`${uid}-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category Name *</Label>
          <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save() } }} />
          {problem && <p role="alert" className="text-xs text-red-600">{problem}</p>}
          {original && <p className="text-xs text-slate-500">Renaming does not change past expenses: they keep the name they were recorded with.</p>}
        </div>
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {failure.code === "EXPENSE_CATEGORY_NAME_TAKEN" && <Button type="button" variant="outline" className="rounded-xl" onClick={() => onShowExisting(name.trim())}>Show the existing category</Button>}
          </div>
        )}
        <DialogFooter className="mt-2 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
