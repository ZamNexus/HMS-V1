"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { BedDouble, Pencil, Plus, Search } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, wardAdminService, type WardAdminRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { checkBedNo } from "@/lib/services/http/wardsAdmin"
import { API_WARD_TYPES, type ApiWardType, type WardPatch } from "@/lib/services/types"
import { formatMoney } from "@/lib/session/hospital"
import { normalizeMoneyInput } from "@/lib/services/moneyMath"
import { RestoredNote } from "@/components/shared/RestoredNote"
import { useDraftState } from "@/lib/session/useDraftState"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CATALOG_PAGE_SIZE, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

const ALL = "all"
const TYPE_LABEL: Record<ApiWardType, string> = { general: "General", private: "Private", icu: "ICU", children: "Children" }
type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/** One bed number per line, or separated by commas; blanks dropped. */
export function parseBedNumbers(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Master Data -> Wards & Beds (the API's /wards and /beds). Reads need ipd.read, changes need catalogs.write. A ward is created together with its
 * beds in one call; nothing is deleted: wards and beds are retired / reactivated, and the server refuses to retire one that patients are in
 * (WARD_OCCUPIED / BED_OCCUPIED). A bed's "occupied" state comes from admissions and "maintenance" from the bed-maintenance action (a later
 * chunk): clicking a bed here never changes its state.
 */
export function WardsTab() {
  const { can } = useAccess()
  const canRead = can("ipd.read")
  const canWrite = can("catalogs.write")
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [type, setType] = React.useState(ALL)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<WardAdminRecord | "new" | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("wardsAdmin", "list", search.term ?? null, type, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => wardAdminService.list({ search: search.term, type: type === ALL ? undefined : (type as ApiWardType), active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
    enabled: canRead,
  })
  // money is always the exact text from the server ("1500.00"); it is never turned into a JavaScript number
  const money = (text: string) => formatMoney(text, settings?.currencyCode ?? "PKR")

  async function toggle(w: WardAdminRecord) {
    if (busyId) return
    setBusyId(w.id)
    try {
      await wardAdminService.setActive(w.id, !w.active)
      toast({ title: `${w.name} ${w.active ? "retired" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${w.active ? "retire" : "reactivate"} ${w.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  if (!canRead) return <EmptyState icon={BedDouble} title="Wards and beds are not available to you" subtitle="You need permission to view inpatient wards." />
  const items = list.data?.items ?? []
  const filtered = !!search.term || type !== ALL || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="wards-tab">
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search wards" placeholder="Search wards…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1) }}>
            <SelectTrigger aria-label="Ward type" className={cn(selectClass, "w-full md:w-44")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Types</SelectItem>
              {API_WARD_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as ActiveFilter); setPage(1) }}>
            <SelectTrigger aria-label="Status" className={cn(selectClass, "w-full md:w-40")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Ward</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-40 w-full rounded-[1.5rem]" />
      ) : items.length === 0 ? (
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
          <EmptyState icon={BedDouble} title={filtered ? "No ward matches" : "No wards yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first ward with its beds." : undefined} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => {
            const pct = w.bedCount > 0 ? (w.occupiedCount / w.bedCount) * 100 : 0
            return (
              <div key={w.id} data-testid={`ward-card-${w.id}`} className={cn("rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5", !w.active && "opacity-70")}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="text-lg font-black text-[#0D1B2E]">{w.name}</h3>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{TYPE_LABEL[w.type]}</span>
                </div>
                <p className="mb-3 text-xs font-semibold text-slate-500">{money(w.dailyRate)} per day{!w.active && " · Retired"}</p>
                <p className="mb-2 text-sm font-bold text-slate-500" data-testid={`ward-count-${w.id}`}>{w.occupiedCount} of {w.bedCount} beds occupied · {w.availableCount} available</p>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60">
                  <div className={cn("h-full rounded-full transition-all duration-500", pct < 60 ? "bg-emerald-500" : pct < 90 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button variant="ghost" className="flex-1 rounded-xl border-0 bg-slate-50 font-bold text-slate-700 transition-colors hover:bg-slate-100" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
                    {expanded === w.id ? "Hide beds" : "View beds"}
                  </Button>
                  <ItemHistoryButton subject="ward" id={w.id} label={w.name} className="h-10 w-10" />
                  {canWrite && (
                    <>
                      <Button aria-label={`Edit ${w.name}`} variant="ghost" size="icon" className="h-10 w-10 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(w)}><Pencil className="h-4 w-4" /></Button>
                      <Switch aria-label={`${w.active ? "Retire" : "Reactivate"} ${w.name}`} checked={w.active} disabled={busyId !== null} onCheckedChange={() => void toggle(w)} />
                    </>
                  )}
                </div>
                {expanded === w.id && <WardBeds wardId={w.id} canWrite={canWrite} />}
              </div>
            )
          })}
        </div>
      )}
      {list.data && list.data.total > CATALOG_PAGE_SIZE && (
        <Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="wards" />
      )}

      {target !== null && <WardDialog key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

function WardBeds({ wardId, canWrite }: { wardId: string; canWrite: boolean }) {
  const { can } = useAccess()
  const showBedActions = canWrite || can("audit.read")
  const { toast } = useToast()
  const key = useScopedKey("wardsAdmin", "detail", wardId)
  const detail = useQuery({ queryKey: key, queryFn: ({ signal }) => wardAdminService.get(wardId, signal), staleTime: 0 })
  const [newBed, setNewBed] = React.useState("")
  const [editing, setEditing] = React.useState<{ id: string; bedNo: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<{ text: string; requestId: string | null } | null>(null)

  async function act(action: () => Promise<unknown>, done: string, after?: () => void) {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      await action()
      toast({ title: done })
      after?.()
    } catch (err) {
      const result = classifyCreateError(err)
      setProblem({ text: result.kind === "failed" ? result.message : SAVED_REFRESHING_MESSAGE, requestId: result.kind === "failed" ? result.requestId : null })
    } finally {
      setBusy(false)
    }
  }

  if (detail.isError && !detail.data) return <div className="mt-4"><ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></div>
  if (!detail.data) return <Skeleton className="mt-4 h-24 w-full" />
  const beds = detail.data.beds ?? []
  return (
    <div className="mt-4 space-y-3" data-testid={`ward-beds-${wardId}`}>
      <div className="overflow-hidden rounded-xl border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="h-auto py-3 text-xs font-bold text-slate-500">Bed</TableHead>
              <TableHead className="h-auto py-3 text-xs font-bold text-slate-500">State</TableHead>
              {showBedActions && <TableHead className="h-auto py-3 text-right text-xs font-bold text-slate-500">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {beds.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-4 text-center text-xs text-slate-500">This ward has no beds yet.</TableCell></TableRow>
            ) : beds.map((b) => (
              <TableRow key={b.id} data-testid={`bed-row-${b.id}`} className={cn("border-b border-slate-50 last:border-0", !b.active && "opacity-60")}>
                <TableCell className="font-mono text-[11px] font-bold text-slate-600">
                  {editing?.id === b.id ? (
                    <Input aria-label={`Bed number for ${b.bedNo}`} className={`${inputClass} h-8`} value={editing.bedNo} maxLength={20} onChange={(e) => setEditing({ id: b.id, bedNo: e.target.value })} />
                  ) : b.bedNo}
                </TableCell>
                <TableCell><StatusBadge status={b.active ? b.state : "Retired"} /></TableCell>
                {showBedActions && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <ItemHistoryButton subject="bed" id={b.id} label={`bed ${b.bedNo}`} className="h-8 w-8" />
                      {!canWrite ? null : editing?.id === b.id ? (
                        <>
                          <Button size="sm" className="h-8 rounded-lg" disabled={busy} onClick={() => void act(() => wardAdminService.renameBed(b.id, checkBedNo(editing.bedNo)), `Bed renamed to ${editing.bedNo.trim()}`, () => setEditing(null))}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-8 rounded-lg" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button aria-label={`Rename bed ${b.bedNo}`} variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400" onClick={() => setEditing({ id: b.id, bedNo: b.bedNo })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Switch aria-label={`${b.active ? "Retire" : "Reactivate"} bed ${b.bedNo}`} checked={b.active} disabled={busy} onCheckedChange={() => void act(() => wardAdminService.setBedActive(b.id, !b.active), `Bed ${b.bedNo} ${b.active ? "retired" : "reactivated"}`)} />
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canWrite && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => wardAdminService.addBed(wardId, newBed), `Bed ${newBed.trim()} added`, () => setNewBed("")) }}>
          <Input aria-label="New bed number" placeholder="New bed number" className={`${inputClass} h-10`} value={newBed} maxLength={20} onChange={(e) => setNewBed(e.target.value)} />
          <Button type="submit" className="h-10 rounded-xl" disabled={busy || newBed.trim() === ""}>Add bed</Button>
        </form>
      )}
      {problem && (
        <div role="alert" data-testid="bed-error" className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <p>{problem.text}</p>
          {problem.requestId && <p data-testid="support-reference" className="mt-1 text-[11px] text-red-600/80">Support reference: <span className="font-mono">{problem.requestId}</span></p>}
        </div>
      )}
    </div>
  )
}

function WardDialog({ target, onClose }: { target: WardAdminRecord | "new"; onClose: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [name, setName] = React.useState(original?.name ?? "")
  const [type, setType] = React.useState<string>(original?.type ?? "")
  const [rate, setRate] = React.useState(original ? original.dailyRate : "")
  const [bedsText, setBedsText, bedsRestored] = useDraftState("ward-beds:new", "")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)
  const beds = parseBedNumbers(bedsText)

  function validate() {
    const found: Record<string, string> = {}
    if (name.trim().length < 2 || name.trim().length > 80) found.name = "Ward name needs 2 to 80 characters"
    if (!type) found.type = "Choose a ward type"
    const rateText = (() => { const t = normalizeMoneyInput(rate); return t !== null && !t.startsWith("-") ? t : null })()
    if (rateText === null) found.rate = "Enter an amount such as 3500 or 3500.00"
    if (!original) {
      const seen = new Set<string>()
      for (const b of beds) {
        if (b.length > 20) { found.beds = `The bed number "${b.slice(0, 24)}…" is longer than 20 characters`; break }
        if (seen.has(b.toLowerCase())) { found.beds = `The bed number "${b}" is used twice`; break }
        seen.add(b.toLowerCase())
      }
      if (!found.beds && beds.length > 200) found.beds = "At most 200 beds can be created at once"
    }
    setProblems(found)
    return Object.keys(found).length > 0 || rateText === null ? null : { rate: rateText }
  }

  async function save() {
    const v = validate()
    if (!v) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await wardAdminService.create({ name, type: type as ApiWardType, dailyRate: v.rate, beds })
          toast({ title: `${name.trim()} added with ${beds.length} bed${beds.length === 1 ? "" : "s"}` })
        } else {
          const patch: WardPatch = {}
          if (name.trim() !== original.name) patch.name = name
          if (type !== original.type) patch.type = type as ApiWardType
          if (v.rate !== original.dailyRate) patch.dailyRate = v.rate // both exact two-decimal text
          if (Object.keys(patch).length > 0) await wardAdminService.update(original.id, patch)
          toast({ title: Object.keys(patch).length > 0 ? `${name.trim()} updated` : "Nothing changed" })
        }
        onClose()
      } catch (err) {
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          toast({ title: result.message === SAVED_REFRESHING_MESSAGE ? "Saved. Refreshing the list." : result.message })
          onClose()
          return
        }
        const fromServer: Record<string, string> = {}
        const map: Record<string, string> = { name: "name", type: "type", dailyRate: "rate", beds: "beds" }
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (map[path.split(".")[0]]) fromServer[map[path.split(".")[0]]] = message
        if (result.code === "WARD_NAME_TAKEN") fromServer.name = result.message
        if (result.code === "BED_NO_TAKEN") fromServer.beds = result.message
        setProblems((prev) => ({ ...prev, ...fromServer }))
        setFailure(result)
      }
    })
  }

  const field = (id: string, label: string, error: string | undefined, children: React.ReactNode, className = "") => (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={`${uid}-${id}`} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
      {children}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] sm:max-w-xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Ward" : "Add Ward"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2">
          {field("name", "Ward Name *", problems.name, <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />, "sm:col-span-2")}
          {field("type", "Type *", problems.type, (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id={`${uid}-type`} className={selectClass}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{API_WARD_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {field("rate", "Daily Rate *", problems.rate, <Input id={`${uid}-rate`} className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />)}
          {!original && field("beds", `Beds (${beds.length})`, problems.beds, <Textarea id={`${uid}-beds`} rows={4} className={cn(inputClass, "h-auto resize-y font-mono")} placeholder={"One bed number per line, or separated by commas\nA-01\nA-02"} value={bedsText} onChange={(e) => setBedsText(e.target.value)} />, "sm:col-span-2")}
          {!original && <RestoredNote show={bedsRestored} className="sm:col-span-2" />}
          <p className="text-xs text-slate-500 sm:col-span-2">{original ? "Beds are added, renamed and retired from the ward's bed list." : "The ward and all its beds are created together."} A new daily rate applies to stays billed from now on.</p>
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Ward"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
