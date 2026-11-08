"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { FlaskConical, Pencil, Plus, Search } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { errorSummary, labTestsService, type LabTestPatch, type LabTestRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { specsPayload } from "@/lib/services/http/labTests"
import { rowFromSpec, specFromRow, validateRows, type ParamRow } from "@/lib/services/labParamForm"
import { API_LAB_CATEGORIES, API_SPECIMEN_TYPES } from "@/lib/services/types"
import { formatMoney } from "@/lib/session/hospital"
import { moneyFromNumber, normalizeMoneyInput } from "@/lib/services/moneyMath"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import type { LabTestCategory } from "@/types"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"
import { LabParameterEditor } from "./LabParameterEditor"

const ALL = "all"
const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Master Data -> Lab & Imaging Tests (the API's /lab-tests; imaging tests have their own catalogue). Paged, searched and filtered on the server.
 * Write controls need catalogs.write. Nothing is deleted: the switch deactivates / reactivates. A test lists its measured parameters (unit,
 * normal range for everyone or by sex, critical limits) or is a narrative test (a culture) with none. Changes apply to orders placed from now on.
 */
export function LabTestsTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const showActions = canWrite || can("audit.read") // the Item History button needs audit.read, the edit button catalogs.write
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [category, setCategory] = React.useState(ALL)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<LabTestRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("labTests", "admin", search.term ?? null, category, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      labTestsService.list({ search: search.term, category: category === ALL ? undefined : (category as LabTestCategory), active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })
  // money is always the exact text from the server ("1500.00"); it is never turned into a JavaScript number
  const money = (text: string) => formatMoney(text, settings?.currencyCode ?? "PKR")

  async function toggle(t: LabTestRecord) {
    if (busyId) return
    setBusyId(t.id)
    try {
      const active = t.active !== false
      await labTestsService.setActive(t.id, !active)
      toast({ title: `${t.name} ${active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not change ${t.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  const filtered = !!search.term || category !== ALL || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="labtests-tab">
      <div className="rounded-[1.25rem] border border-indigo-100 bg-indigo-50/50 p-4 text-sm font-medium text-indigo-800">
        <p>Laboratory tests only. X-ray, ultrasound, Doppler, echo and ECG tests are managed in the imaging catalogue.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search lab tests" placeholder="Search name or code…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
            <SelectTrigger aria-label="Category" className={cn(selectClass, "w-full md:w-52")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Categories</SelectItem>
              {API_LAB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as ActiveFilter); setPage(1) }}>
            <SelectTrigger aria-label="Status" className={cn(selectClass, "w-full md:w-40")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Test</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Code</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Test Name</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Category</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Specimen</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Fee</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Turnaround</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Parameters</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={9} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="p-0"><EmptyState icon={FlaskConical} title={filtered ? "No lab test matches" : "No lab tests yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first test." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((t) => (
                    <TableRow key={t.id} data-testid={`labtest-row-${t.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4"><span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#1CC0CE]/10 px-2 py-1 font-mono text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20">{t.code}</span></TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{t.name}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{t.category}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{t.specimenType}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{money(t.rateText ?? moneyFromNumber(t.rate))}</TableCell>
                      <TableCell className="py-4 font-bold text-slate-500">{t.turnaroundHours ? `${t.turnaroundHours}h` : "—"}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{t.narrative ? "Narrative" : `${t.specs?.length ?? 0} parameter${(t.specs?.length ?? 0) === 1 ? "" : "s"}`}</TableCell>
                      <TableCell className="py-4"><Switch aria-label={`${t.active !== false ? "Deactivate" : "Reactivate"} ${t.name}`} checked={t.active !== false} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(t)} /></TableCell>
                      {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <ItemHistoryButton subject="labTest" id={t.id} label={t.name} />
                            {canWrite && <Button aria-label={`Edit ${t.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(t)}><Pencil className="h-4 w-4" /></Button>}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="lab tests" /></div>
          )}
        </div>
      )}

      {target !== null && <LabTestDialog key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

function LabTestDialog({ target, onClose }: { target: LabTestRecord | "new"; onClose: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [code, setCode] = React.useState(original?.code ?? "")
  const [name, setName] = React.useState(original?.name ?? "")
  const [category, setCategory] = React.useState<string>(original?.category ?? API_LAB_CATEGORIES[0])
  const [specimen, setSpecimen] = React.useState<string>(original?.specimenType ?? "")
  const [rate, setRate] = React.useState(original ? (original.rateText ?? moneyFromNumber(original.rate)) : "")
  const [gst, setGst] = React.useState(String(original?.gstPct ?? 0))
  const [discount, setDiscount] = React.useState(String(original?.discountPct ?? 0))
  const [hours, setHours] = React.useState(original ? String(original.turnaroundHours || "") : "24")
  const [narrative, setNarrative] = React.useState(original?.narrative ?? false)
  const [rows, setRows] = React.useState<ParamRow[]>(() => (original?.specs ?? []).map(rowFromSpec))
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [rowErrors, setRowErrors] = React.useState<Record<number, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate() {
    const found: Record<string, string> = {}
    const upper = code.trim().toUpperCase()
    if (!CODE_RE.test(upper)) found.code = "Letters, digits, . _ - only; up to 32 characters; start with a letter or digit"
    if (name.trim().length < 2) found.name = "Test name needs at least 2 characters"
    else if (name.trim().length > 160) found.name = "Test name can be at most 160 characters"
    if (!specimen) found.specimen = "Choose a specimen type"
    const rateText = (() => { const t = normalizeMoneyInput(rate); return t !== null && !t.startsWith("-") ? t : null })()
    if (rateText === null) found.rate = "Enter an amount such as 800 or 800.50"
    const pct = (v: string, field: string) => {
      const s = v.trim() === "" ? "0" : v.trim()
      if (!AMOUNT_RE.test(s) || Number(s) > 100) found[field] = "Enter a percentage from 0 to 100"
      return Number(s)
    }
    const gstPct = pct(gst, "gst"), discountPct = pct(discount, "discount")
    const h = Number(hours.trim())
    if (!/^\d+$/.test(hours.trim()) || h < 1 || h > 720) found.hours = "A whole number of hours from 1 to 720"
    const errs = narrative ? {} : validateRows(rows)
    setProblems(found)
    setRowErrors(errs)
    if (Object.keys(found).length > 0 || Object.keys(errs).length > 0) return null
    return { code: upper, rateText: rateText ?? "0.00", gstPct, discountPct, hours: h, specs: narrative ? [] : rows.map(specFromRow) }
  }

  async function save() {
    const v = validate()
    if (!v) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await labTestsService.create({ code: v.code, name, category: category as LabTestCategory, rate: Number(v.rateText) /* demo-shaped field, ignored in API mode */, rateText: v.rateText, turnaroundHours: v.hours, specimenType: specimen, gstPct: v.gstPct, discountPct: v.discountPct, narrative, specs: v.specs })
          toast({ title: `${name.trim()} added` })
        } else {
          // PATCH carries ONLY what changed; the parameter list is sent whole, and only when it differs
          const patch: LabTestPatch = {}
          if (v.code !== original.code) patch.code = v.code
          if (name.trim() !== original.name) patch.name = name
          if (category !== original.category) patch.category = category as LabTestCategory
          if (specimen !== original.specimenType) patch.specimenType = specimen
          if (v.rateText !== (original.rateText ?? moneyFromNumber(original.rate))) patch.rateText = v.rateText
          if (v.gstPct !== (original.gstPct ?? 0)) patch.gstPct = v.gstPct
          if (v.discountPct !== (original.discountPct ?? 0)) patch.discountPct = v.discountPct
          if (v.hours !== original.turnaroundHours) patch.turnaroundHours = v.hours
          if (narrative !== (original.narrative ?? false)) patch.narrative = narrative
          if (JSON.stringify(specsPayload(v.specs)) !== JSON.stringify(specsPayload(original.specs ?? []))) patch.specs = v.specs
          if (Object.keys(patch).length > 0) await labTestsService.patch(original.id, patch)
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
        const map: Record<string, string> = { code: "code", name: "name", specimenType: "specimen", rate: "rate", gstPct: "gst", discountPct: "discount", turnaroundHours: "hours" }
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (map[path]) fromServer[map[path]] = message
        if (result.code === "SERVICE_CODE_TAKEN") fromServer.code = result.message
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
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] sm:max-w-4xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Lab Test" : "Add Lab Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-4 md:grid-cols-3">
          {field("code", "Code *", problems.code, <Input id={`${uid}-code`} className={inputClass} value={code} maxLength={32} onChange={(e) => setCode(e.target.value.toUpperCase())} />)}
          {field("name", "Test Name *", problems.name, <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />, "md:col-span-2")}
          {field("category", "Category *", undefined, (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{API_LAB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {field("specimen", "Specimen *", problems.specimen, (
            <Select value={specimen} onValueChange={setSpecimen}>
              <SelectTrigger id={`${uid}-specimen`} className={selectClass}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{API_SPECIMEN_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {field("hours", "Turnaround (hours) *", problems.hours, <Input id={`${uid}-hours`} className={inputClass} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />)}
          {field("rate", "Fee *", problems.rate, <Input id={`${uid}-rate`} className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />)}
          {field("gst", "GST %", problems.gst, <Input id={`${uid}-gst`} className={inputClass} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />)}
          {field("discount", "Discount %", problems.discount, <Input id={`${uid}-discount`} className={inputClass} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />)}
          <div className="flex items-center gap-3 md:col-span-3">
            <Checkbox id={`${uid}-narrative`} checked={narrative} onCheckedChange={(c) => setNarrative(c === true)} className="h-5 w-5 rounded-md" />
            <Label htmlFor={`${uid}-narrative`} className="cursor-pointer font-bold text-slate-700">Narrative test (a written result such as a culture; no measured parameters)</Label>
          </div>
          {!narrative && (
            <div className="space-y-2 md:col-span-3">
              <h4 className="text-sm font-black text-[#0D1B2E]">Parameters</h4>
              <p className="text-xs text-slate-500">Saving replaces the whole list. A parameter that already has results keeps its key; change its name instead.</p>
              <LabParameterEditor rows={rows} onChange={(next) => { setRows(next); setRowErrors({}) }} errors={rowErrors} disabled={pending} />
            </div>
          )}
          <p className="text-xs text-slate-500 md:col-span-3">Changes apply to orders placed from now on; an order already placed keeps the price and definition it was ordered with.</p>
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Test"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
