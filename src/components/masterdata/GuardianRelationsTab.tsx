"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Users, Pencil, Plus, Search } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, guardianRelationsService, type GuardianRelationPatch, type GuardianRelationRecord } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass } from "./catalogStyles"

/**
 * Master Data -> Guardian Relations (the API's /guardian-relations). All relations, active or not, paged and searched on the server. Write
 * controls need catalogs.write. Nothing is deleted: the switch deactivates / reactivates.
 */
export function GuardianRelationsTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const showActions = canWrite || can("audit.read") // the Item History button needs audit.read, the edit button catalogs.write
  const { toast } = useToast()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [target, setTarget] = React.useState<GuardianRelationRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("guardianRelations", "admin", search.term ?? null, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => guardianRelationsService.list({ search: search.term, page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })

  async function toggle(r: GuardianRelationRecord) {
    if (busyId) return
    setBusyId(r.id)
    try {
      await guardianRelationsService.setActive(r.id, !r.active)
      toast({ title: `${r.name} ${r.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${r.active ? "deactivate" : "reactivate"} ${r.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  return (
    <div className="max-w-3xl space-y-4" data-testid="guardian-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search relations" placeholder="Search relations…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Relation</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Relation Name</TableHead>
                <TableHead className="h-auto py-4 font-bold text-slate-500">Remarks</TableHead>
                <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow><TableCell colSpan={4} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="p-0"><EmptyState icon={Users} title={search.term ? "No relation matches that search" : "No relations yet"} subtitle={canWrite && !search.term ? "Add the first relation." : undefined} /></TableCell></TableRow>
              ) : (
                items.map((r) => (
                  <TableRow key={r.id} data-testid={`relation-row-${r.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                    <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{r.name}</TableCell>
                    <TableCell className="py-4 font-medium text-slate-500">{r.remarks || "—"}</TableCell>
                    <TableCell className="py-4">
                      <Switch aria-label={`${r.active ? "Deactivate" : "Reactivate"} ${r.name}`} checked={r.active} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(r)} />
                    </TableCell>
                    {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <ItemHistoryButton subject="guardianRelation" id={r.id} label={r.name} />
                            {canWrite && <Button aria-label={`Edit ${r.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(r)}><Pencil className="h-4 w-4" /></Button>}
                          </div>
                        </TableCell>
                      )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="relations" /></div>
          )}
        </div>
      )}

      {target !== null && (
        <RelationDialog
          key={target === "new" ? "new" : target.id}
          target={target}
          onClose={() => setTarget(null)}
          onShowExisting={(name) => { search.onChange(name); setPage(1); setTarget(null) }}
        />
      )}
    </div>
  )
}

function RelationDialog({ target, onClose, onShowExisting }: { target: GuardianRelationRecord | "new"; onClose: () => void; onShowExisting: (name: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [name, setName] = React.useState(original?.name ?? "")
  const [remarks, setRemarks] = React.useState(original?.remarks ?? "")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate(): boolean {
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = "Relation name needs at least 2 characters"
    else if (name.trim().length > 60) found.name = "Relation name can be at most 60 characters"
    if (remarks.trim().length > 300) found.remarks = "Remarks can be at most 300 characters"
    setProblems(found)
    return Object.keys(found).length === 0
  }

  async function save() {
    if (!validate()) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await guardianRelationsService.create({ name, remarks: remarks.trim() || undefined, active: true })
          toast({ title: `${name.trim()} added` })
        } else {
          const patch: GuardianRelationPatch = {}
          if (name.trim() !== original.name) patch.name = name
          if (remarks.trim() !== (original.remarks ?? "")) patch.remarks = remarks
          if (Object.keys(patch).length > 0) await guardianRelationsService.update(original.id, patch)
          toast({ title: Object.keys(patch).length > 0 ? `${name.trim()} updated` : "Nothing changed" })
        }
        onClose()
      } catch (err) {
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          toast({ title: result.message })
          onClose()
          return
        }
        const raw = fieldErrorMap(err)
        setProblems((prev) => ({ ...prev, ...(raw.name ? { name: raw.name } : {}), ...(raw.remarks ? { remarks: raw.remarks } : {}) }))
        setFailure(result)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Guardian Relation" : "Add Guardian Relation"}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Relation Name *</Label>
            <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            {problems.name && <p role="alert" className="text-xs text-red-600">{problems.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-remarks`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label>
            <Input id={`${uid}-remarks`} className={inputClass} value={remarks} maxLength={300} onChange={(e) => setRemarks(e.target.value)} />
            {problems.remarks && <p role="alert" className="text-xs text-red-600">{problems.remarks}</p>}
          </div>
        </div>
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {failure.code === "GUARDIAN_RELATION_TAKEN" && (
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onShowExisting(name.trim())}>Show the existing relation</Button>
            )}
          </div>
        )}
        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
