"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Pencil, Plus, Search, Stethoscope } from "lucide-react"

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
import { errorSummary, serviceCatalogService, type ServiceCatalogPatch, type ServiceCatalogRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { formatMoney } from "@/lib/session/hospital"
import { moneyFromNumber, normalizeMoneyInput } from "@/lib/services/moneyMath"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

export const SERVICE_CATEGORY_SUGGESTIONS = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]
const ALL = "all"
const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Master Data -> Services Catalog (the API's /services). Paged, searched and filtered on the server (never "load everything, filter in the
 * browser"). Write controls need catalogs.write. Nothing is deleted: the switch deactivates / reactivates, and a change reaches the screen only
 * after the server has answered.
 */
export function ServicesTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [category, setCategory] = React.useState(ALL)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<ServiceCatalogRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("services", "admin", search.term ?? null, category, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      serviceCatalogService.list({ search: search.term, category: category === ALL ? undefined : category, active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })
  // money is always the exact text from the server ("1500.00"); it is never turned into a JavaScript number
  const money = (text: string) => formatMoney(text, settings?.currencyCode ?? "PKR")

  async function toggle(s: ServiceCatalogRecord) {
    if (busyId) return
    setBusyId(s.id)
    try {
      await serviceCatalogService.setActive(s.id, !s.active)
      toast({ title: `${s.name} ${s.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${s.active ? "deactivate" : "reactivate"} ${s.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  const filtered = !!search.term || category !== ALL || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="services-tab">
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search services" placeholder="Search name or code…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
            <SelectTrigger aria-label="Category" className={cn(selectClass, "w-full md:w-52")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Categories</SelectItem>
              {SERVICE_CATEGORY_SUGGESTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Service</Button>}
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
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Service Name</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Category</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Rate</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">GST%</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Disc%</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={8} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="p-0"><EmptyState icon={Stethoscope} title={filtered ? "No service matches" : "No services yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first service." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((s) => (
                    <TableRow key={s.id} data-testid={`service-row-${s.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4"><span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#1CC0CE]/10 px-2 py-1 font-mono text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20">{s.code}</span></TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{s.name}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{s.category}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{money(s.rateText ?? moneyFromNumber(s.rate))}</TableCell>
                      <TableCell className="py-4 font-semibold text-slate-500">{s.gstPct ?? 0}%</TableCell>
                      <TableCell className="py-4 font-semibold text-slate-500">{s.discountPct ?? 0}%</TableCell>
                      <TableCell className="py-4"><Switch aria-label={`${s.active ? "Deactivate" : "Reactivate"} ${s.name}`} checked={s.active} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(s)} /></TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <ItemHistoryButton subject="serviceCatalogItem" id={s.id} label={s.name} />
                          {canWrite && <Button aria-label={`Edit ${s.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(s)}><Pencil className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="services" /></div>
          )}
        </div>
      )}

      {target !== null && (
        <ServiceDialog
          key={target === "new" ? "new" : target.id}
          target={target}
          onClose={() => setTarget(null)}
          onShowExisting={(name) => { search.onChange(name); setCategory(ALL); setActiveFilter("all"); setPage(1); setTarget(null) }}
        />
      )}
    </div>
  )
}

function ServiceDialog({ target, onClose, onShowExisting }: { target: ServiceCatalogRecord | "new"; onClose: () => void; onShowExisting: (name: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [code, setCode] = React.useState(original?.code ?? "")
  const [name, setName] = React.useState(original?.name ?? "")
  const [category, setCategory] = React.useState(original?.category ?? SERVICE_CATEGORY_SUGGESTIONS[0])
  const [rate, setRate] = React.useState(original ? (original.rateText ?? moneyFromNumber(original.rate)) : "")
  const [gst, setGst] = React.useState(String(original?.gstPct ?? 0))
  const [discount, setDiscount] = React.useState(String(original?.discountPct ?? 0))
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate(): { rateText: string; gstPct: number; discountPct: number } | null {
    const found: Record<string, string> = {}
    const upper = code.trim().toUpperCase()
    if (upper !== "" && !CODE_RE.test(upper)) found.code = "Letters, digits, . _ - only; up to 32 characters; start with a letter or digit"
    if (original && upper === "") found.code = "Code cannot be empty"
    if (name.trim().length < 2) found.name = "Service name needs at least 2 characters"
    else if (name.trim().length > 160) found.name = "Service name can be at most 160 characters"
    if (category.trim() === "") found.category = "Category is required"
    else if (category.trim().length > 80) found.category = "Category can be at most 80 characters"
    const rateText = (() => { const t = normalizeMoneyInput(rate); return t !== null && !t.startsWith("-") ? t : null })()
    if (rateText === null) found.rate = "Enter an amount such as 1500 or 1500.50"
    const pct = (value: string, field: string) => {
      const v = value.trim() === "" ? "0" : value.trim()
      if (!AMOUNT_RE.test(v) || Number(v) > 100) found[field] = "Enter a percentage from 0 to 100"
      return Number(v)
    }
    const gstPct = pct(gst, "gst")
    const discountPct = pct(discount, "discount")
    setProblems(found)
    return Object.keys(found).length === 0 && rateText !== null ? { rateText, gstPct, discountPct } : null
  }

  async function save() {
    const numbers = validate()
    if (!numbers) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await serviceCatalogService.create({ code: code.trim().toUpperCase(), name, category, rate: Number(numbers.rateText) /* demo-shaped field, ignored in API mode */, rateText: numbers.rateText, gstPct: numbers.gstPct, discountPct: numbers.discountPct, active: true })
          toast({ title: `${name.trim()} added` })
        } else {
          // PATCH carries ONLY what changed
          const patch: ServiceCatalogPatch = {}
          if (code.trim().toUpperCase() !== original.code) patch.code = code.trim().toUpperCase()
          if (name.trim() !== original.name) patch.name = name
          if (category.trim() !== original.category) patch.category = category
          if (numbers.rateText !== (original.rateText ?? moneyFromNumber(original.rate))) patch.rateText = numbers.rateText
          if (numbers.gstPct !== (original.gstPct ?? 0)) patch.gstPct = numbers.gstPct
          if (numbers.discountPct !== (original.discountPct ?? 0)) patch.discountPct = numbers.discountPct
          if (Object.keys(patch).length > 0) await serviceCatalogService.patch(original.id, patch)
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
        const map: Record<string, string> = { code: "code", name: "name", category: "category", rate: "rate", gstPct: "gst", discountPct: "discount" }
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
      <DialogContent className="rounded-[1.5rem] sm:max-w-2xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Service" : "Add Service"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-4 md:grid-cols-2">
          {field("code", original ? "Code *" : "Code", problems.code, <Input id={`${uid}-code`} className={inputClass} value={code} maxLength={32} placeholder={original ? undefined : "Leave empty to let the system choose"} onChange={(e) => setCode(e.target.value.toUpperCase())} />)}
          {field("category", "Category *", problems.category, (
            <>
              <Input id={`${uid}-category`} list={`${uid}-categories`} className={inputClass} value={category} maxLength={80} onChange={(e) => setCategory(e.target.value)} />
              <datalist id={`${uid}-categories`}>{SERVICE_CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          ))}
          {field("name", "Service Name *", problems.name, <Input id={`${uid}-name`} className={inputClass} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />, "md:col-span-2")}
          {field("rate", "Rate *", problems.rate, <Input id={`${uid}-rate`} className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />)}
          {field("gst", "GST %", problems.gst, <Input id={`${uid}-gst`} className={inputClass} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />)}
          {field("discount", "Discount %", problems.discount, <Input id={`${uid}-discount`} className={inputClass} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />)}
          <p className="text-xs text-slate-500 md:col-span-2">A new rate applies to charges raised from now on; past invoice lines keep the rate they were billed at.</p>
        </div>
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {failure.code === "SERVICE_NAME_TAKEN" && (
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onShowExisting(name.trim())}>Show the existing service</Button>
            )}
          </div>
        )}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Service"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
