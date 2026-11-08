"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Pencil, Plus, ScanLine, Search } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { ecgUltrasoundTestsService, errorSummary, type EcgUltrasoundTestRecord, type ImagingTestPatch } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { API_MODALITIES } from "@/lib/services/types"
import { formatMoney } from "@/lib/session/hospital"
import { moneyFromNumber, normalizeMoneyInput } from "@/lib/services/moneyMath"
import { RestoredNote } from "@/components/shared/RestoredNote"
import { useDraftState } from "@/lib/session/useDraftState"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

const ALL = "all"
const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Master Data -> Imaging Tests (the API's /imaging-tests): X-ray, ultrasound, Doppler, echocardiography, ECG, CT, MRI and other, in one catalogue.
 * Paged, searched and filtered on the server. Write controls need catalogs.write. Nothing is deleted: the switch deactivates / reactivates.
 * A test says whether it needs a written report and may carry a report template.
 */
export function ImagingTestsTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const showActions = canWrite || can("audit.read") // the Item History button needs audit.read, the edit button catalogs.write
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [modality, setModality] = React.useState(ALL)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<EcgUltrasoundTestRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("ecgUltrasound", "admin", search.term ?? null, modality, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      ecgUltrasoundTestsService.list({ search: search.term, modality: modality === ALL ? undefined : modality, active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })
  // money is always the exact text from the server ("1500.00"); it is never turned into a JavaScript number
  const money = (text: string) => formatMoney(text, settings?.currencyCode ?? "PKR")

  async function toggle(t: EcgUltrasoundTestRecord) {
    if (busyId) return
    setBusyId(t.id)
    try {
      await ecgUltrasoundTestsService.setActive(t.id, !t.active)
      toast({ title: `${t.name} ${t.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${t.active ? "deactivate" : "reactivate"} ${t.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  const filtered = !!search.term || modality !== ALL || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="imaging-tests-tab">
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search imaging tests" placeholder="Search name or code…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={modality} onValueChange={(v) => { setModality(v); setPage(1) }}>
            <SelectTrigger aria-label="Modality" className={cn(selectClass, "w-full md:w-52")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Modalities</SelectItem>
              {API_MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Modality</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Fee</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Turnaround</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Report</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={8} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="p-0"><EmptyState icon={ScanLine} title={filtered ? "No imaging test matches" : "No imaging tests yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first test." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((t) => (
                    <TableRow key={t.id} data-testid={`imaging-row-${t.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4"><span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#1CC0CE]/10 px-2 py-1 font-mono text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20">{t.code}</span></TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{t.name}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{t.modality}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{money(t.feeText ?? moneyFromNumber(t.fee))}</TableCell>
                      <TableCell className="py-4 font-bold text-slate-500">{t.turnaroundHours ? `${t.turnaroundHours}h` : "—"}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{t.reportRequired ? "Report required" : "No report"}</TableCell>
                      <TableCell className="py-4"><Switch aria-label={`${t.active ? "Deactivate" : "Reactivate"} ${t.name}`} checked={t.active} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(t)} /></TableCell>
                      {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <ItemHistoryButton subject="imagingTest" id={t.id} label={t.name} />
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
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="imaging tests" /></div>
          )}
        </div>
      )}

      {target !== null && <ImagingTestDialog key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

function ImagingTestDialog({ target, onClose }: { target: EcgUltrasoundTestRecord | "new"; onClose: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [code, setCode] = React.useState(original?.code ?? "")
  const [name, setName] = React.useState(original?.name ?? "")
  const [modality, setModality] = React.useState<string>(original?.modality ?? "")
  const [fee, setFee] = React.useState(original ? (original.feeText ?? moneyFromNumber(original.fee)) : "")
  const [gst, setGst] = React.useState(String(original?.gstPct ?? 0))
  const [discount, setDiscount] = React.useState(String(original?.discountPct ?? 0))
  const [hours, setHours] = React.useState(original ? String(original.turnaroundHours || "") : "24")
  const [reportRequired, setReportRequired] = React.useState(original?.reportRequired ?? true)
  const [template, setTemplate, templateRestored] = useDraftState(`imaging-test-template:${original?.id ?? "new"}`, original?.reportTemplate ?? "")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate() {
    const found: Record<string, string> = {}
    const upper = code.trim().toUpperCase()
    if (!CODE_RE.test(upper)) found.code = "Letters, digits, . _ - only; up to 32 characters; start with a letter or digit"
    if (name.trim().length < 2) found.name = "Test name needs at least 2 characters"
    else if (name.trim().length > 160) found.name = "Test name can be at most 160 characters"
    if (!modality) found.modality = "Choose a modality"
    const feeText = (() => { const t = normalizeMoneyInput(fee); return t !== null && !t.startsWith("-") ? t : null })()
    if (feeText === null) found.fee = "Enter an amount such as 1500 or 1500.50"
    const pct = (v: string, field: string) => {
      const s = v.trim() === "" ? "0" : v.trim()
      if (!AMOUNT_RE.test(s) || Number(s) > 100) found[field] = "Enter a percentage from 0 to 100"
      return Number(s)
    }
    const gstPct = pct(gst, "gst"), discountPct = pct(discount, "discount")
    const h = Number(hours.trim())
    if (!/^\d+$/.test(hours.trim()) || h < 1 || h > 720) found.hours = "A whole number of hours from 1 to 720"
    if (template.length > 5000) found.template = "The template can be at most 5000 characters"
    setProblems(found)
    return Object.keys(found).length > 0 ? null : { code: upper, feeText: feeText ?? "0.00", gstPct, discountPct, hours: h }
  }

  async function save() {
    const v = validate()
    if (!v) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await ecgUltrasoundTestsService.create({ code: v.code, name, fee: Number(v.feeText) /* demo-shaped field, ignored in API mode */, feeText: v.feeText, active: true, modality, gstPct: v.gstPct, discountPct: v.discountPct, turnaroundHours: v.hours, reportRequired, reportTemplate: template })
          toast({ title: `${name.trim()} added` })
        } else {
          // PATCH carries ONLY what changed
          const patch: ImagingTestPatch = {}
          if (v.code !== original.code) patch.code = v.code
          if (name.trim() !== original.name) patch.name = name
          if (modality !== original.modality) patch.modality = modality
          if (v.feeText !== (original.feeText ?? moneyFromNumber(original.fee))) patch.feeText = v.feeText
          if (v.gstPct !== (original.gstPct ?? 0)) patch.gstPct = v.gstPct
          if (v.discountPct !== (original.discountPct ?? 0)) patch.discountPct = v.discountPct
          if (v.hours !== original.turnaroundHours) patch.turnaroundHours = v.hours
          if (reportRequired !== (original.reportRequired ?? true)) patch.reportRequired = reportRequired
          if (template.trim() !== (original.reportTemplate ?? "").trim()) patch.reportTemplate = template
          if (Object.keys(patch).length > 0) await ecgUltrasoundTestsService.patch(original.id, patch)
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
        const map: Record<string, string> = { code: "code", name: "name", modality: "modality", rate: "fee", gstPct: "gst", discountPct: "discount", turnaroundHours: "hours", reportTemplate: "template" }
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
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] sm:max-w-3xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Imaging Test" : "Add Imaging Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-4 md:grid-cols-3">
          {field("code", "Code *", problems.code, <Input id={`${uid}-code`} className={inputClass} value={code} maxLength={32} onChange={(e) => setCode(e.target.value.toUpperCase())} />)}
          {field("name", "Test Name *", problems.name, <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />, "md:col-span-2")}
          {field("modality", "Modality *", problems.modality, (
            <Select value={modality} onValueChange={setModality}>
              <SelectTrigger id={`${uid}-modality`} className={selectClass}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{API_MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {field("fee", "Fee *", problems.fee, <Input id={`${uid}-fee`} className={inputClass} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />)}
          {field("hours", "Turnaround (hours) *", problems.hours, <Input id={`${uid}-hours`} className={inputClass} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />)}
          {field("gst", "GST %", problems.gst, <Input id={`${uid}-gst`} className={inputClass} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />)}
          {field("discount", "Discount %", problems.discount, <Input id={`${uid}-discount`} className={inputClass} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />)}
          <div className="flex items-center gap-3 pt-6">
            <Checkbox id={`${uid}-report`} checked={reportRequired} onCheckedChange={(c) => setReportRequired(c === true)} className="h-5 w-5 rounded-md" />
            <Label htmlFor={`${uid}-report`} className="cursor-pointer font-bold text-slate-700">A written report is required</Label>
          </div>
          {field("template", "Report template", problems.template, <><Textarea id={`${uid}-template`} rows={5} className={cn(inputClass, "h-auto resize-y")} value={template} onChange={(e) => setTemplate(e.target.value)} /><RestoredNote show={templateRestored} /></>, "md:col-span-3")}
          <p className="text-xs text-slate-500 md:col-span-3">Changes apply to orders placed from now on; an order already placed keeps the price it was ordered with.</p>
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
