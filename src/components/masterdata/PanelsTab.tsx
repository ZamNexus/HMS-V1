"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Building2, Pencil, Plus, Search, Wallet } from "lucide-react"

import { PanelAccountDialog } from "@/components/billing/AccountPanels"
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
import { dataSource, errorSummary, organisationsService, type OrganisationPatch, type OrganisationRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import type { PanelBillingMode, PanelType } from "@/types"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

const PANEL_TYPES: PanelType[] = ["Insurance", "Corporate", "Government", "Other"]
const BILLING_LABEL: Record<PanelBillingMode, string> = { patient_pays: "Patient pays", panel_billed: "Panel is billed" }

/**
 * Master Data -> Panels & Insurance (the API's /panels). Lists ALL panels (active and not), paged and searched on the server. Write controls need
 * catalogs.write. Nothing is deleted: the switch deactivates / reactivates (a deactivated panel cannot be given to new coverage; patients already
 * covered keep it). A change goes to the server first; the list shows only what the server answered.
 */
export function PanelsTab() {
  const { can } = useAccess()
  const canWrite = can("catalogs.write")
  const canAccount = dataSource === "api" && can("billing.read") // the account button needs billing.read (and real panel ids)
  const showActions = canWrite || can("audit.read") || canAccount // the Item History button needs audit.read, the edit button catalogs.write, the account button billing.read
  const [accountOf, setAccountOf] = React.useState<{ id: string; name: string } | null>(null)
  const { toast } = useToast()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [target, setTarget] = React.useState<OrganisationRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("organisations", "admin", search.term ?? null, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => organisationsService.list({ search: search.term, page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
  })

  async function toggle(p: OrganisationRecord) {
    if (busyId) return
    setBusyId(p.id)
    try {
      await organisationsService.setActive(p.id, !p.active)
      toast({ title: `${p.name} ${p.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${p.active ? "deactivate" : "reactivate"} ${p.name}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  const items = list.data?.items ?? []
  return (
    <div className="space-y-4" data-testid="panels-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search panels" placeholder="Search panels…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Panel</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Panel Name</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Type</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Contact</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Phone</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Commission %</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Discount %</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Billing</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={9} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="p-0"><EmptyState icon={Building2} title={search.term ? "No panel matches that search" : "No panels yet"} subtitle={canWrite && !search.term ? "Add the first panel." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((p) => (
                    <TableRow key={p.id} data-testid={`panel-row-${p.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{p.name}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{p.type}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-700">{p.contactPerson || "—"}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-500">{p.phone || "—"}</TableCell>
                      <TableCell className="py-4 font-bold text-emerald-600">{p.commissionPct}%</TableCell>
                      <TableCell className="py-4 font-bold text-slate-700">{p.discountPct}%</TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{BILLING_LABEL[p.billingMode]}</TableCell>
                      <TableCell className="py-4">
                        <Switch aria-label={`${p.active ? "Deactivate" : "Reactivate"} ${p.name}`} checked={p.active} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(p)} />
                      </TableCell>
                      {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {canAccount && <Button aria-label={`Account of ${p.name}`} variant="ghost" size="sm" className="h-9 rounded-lg px-2 text-xs font-bold text-slate-500 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setAccountOf({ id: p.id, name: p.name })}><Wallet className="mr-1 h-4 w-4" /> Account</Button>}
                            <ItemHistoryButton subject="panel" id={p.id} label={p.name} />
                            {canWrite && <Button aria-label={`Edit ${p.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(p)}><Pencil className="h-4 w-4" /></Button>}
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
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="panels" /></div>
          )}
        </div>
      )}

      <PanelAccountDialog panel={accountOf} open={accountOf !== null} onOpenChange={(o) => { if (!o) setAccountOf(null) }} />
      {target !== null && (
        <PanelDialog
          key={target === "new" ? "new" : target.id}
          target={target}
          onClose={() => setTarget(null)}
          onShowExisting={(name) => { search.onChange(name); setPage(1); setTarget(null) }}
        />
      )}
    </div>
  )
}

function PanelDialog({ target, onClose, onShowExisting }: { target: OrganisationRecord | "new"; onClose: () => void; onShowExisting: (name: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [name, setName] = React.useState(original?.name ?? "")
  const [type, setType] = React.useState<PanelType>(original?.type ?? "Insurance")
  const [contactPerson, setContactPerson] = React.useState(original?.contactPerson ?? "")
  const [phone, setPhone] = React.useState(original?.phone ?? "")
  const [commission, setCommission] = React.useState(String(original?.commissionPct ?? 0))
  const [discount, setDiscount] = React.useState(String(original?.discountPct ?? 0))
  const [billingMode, setBillingMode] = React.useState<PanelBillingMode>(original?.billingMode ?? "patient_pays")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate(): { commissionPct: number; discountPct: number } | null {
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = "Panel name needs at least 2 characters"
    else if (name.trim().length > 120) found.name = "Panel name can be at most 120 characters"
    if (contactPerson.trim().length > 120) found.contactPerson = "At most 120 characters"
    if (phone.trim().length > 30) found.phone = "At most 30 characters"
    const commissionPct = Number(commission.trim() === "" ? "0" : commission)
    const discountPct = Number(discount.trim() === "" ? "0" : discount)
    if (!Number.isFinite(commissionPct) || commissionPct < 0) found.commission = "Enter zero or more"
    if (!Number.isFinite(discountPct) || discountPct < 0) found.discount = "Enter zero or more"
    setProblems(found)
    return Object.keys(found).length === 0 ? { commissionPct, discountPct } : null
  }

  async function save() {
    const numbers = validate()
    if (!numbers) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await organisationsService.create({ name, type, contactPerson, phone, commissionPct: numbers.commissionPct, discountPct: numbers.discountPct, billingMode, active: true })
          toast({ title: `${name.trim()} added` })
        } else {
          // PATCH carries ONLY what changed
          const patch: OrganisationPatch = {}
          if (name.trim() !== original.name) patch.name = name
          if (type !== original.type) patch.type = type
          if (contactPerson.trim() !== original.contactPerson) patch.contactPerson = contactPerson
          if (phone.trim() !== original.phone) patch.phone = phone
          if (numbers.commissionPct !== original.commissionPct) patch.commissionPct = numbers.commissionPct
          if (numbers.discountPct !== original.discountPct) patch.discountPct = numbers.discountPct
          if (billingMode !== original.billingMode) patch.billingMode = billingMode
          if (Object.keys(patch).length > 0) await organisationsService.update(original.id, patch)
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
        setProblems((prev) => ({ ...prev, ...pickFieldProblems(err) }))
        setFailure(result)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Panel" : "Add Panel"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2">
          <Field id={`${uid}-name`} label="Panel Name *" error={problems.name} className="sm:col-span-2"><Input id={`${uid}-name`} className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id={`${uid}-type`} label="Type">
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger id={`${uid}-type`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id={`${uid}-billing`} label="Billing">
            <Select value={billingMode} onValueChange={(v) => setBillingMode(v as PanelBillingMode)}>
              <SelectTrigger id={`${uid}-billing`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(BILLING_LABEL) as PanelBillingMode[]).map((m) => <SelectItem key={m} value={m}>{BILLING_LABEL[m]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id={`${uid}-commission`} label="Commission %" error={problems.commission}><Input id={`${uid}-commission`} className={inputClass} inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
          <Field id={`${uid}-discount`} label="Discount %" error={problems.discount}><Input id={`${uid}-discount`} className={inputClass} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field id={`${uid}-contact`} label="Contact Person" error={problems.contactPerson}><Input id={`${uid}-contact`} className={inputClass} value={contactPerson} maxLength={120} onChange={(e) => setContactPerson(e.target.value)} /></Field>
          <Field id={`${uid}-phone`} label="Phone" error={problems.phone}><Input id={`${uid}-phone`} className={inputClass} value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">Discount and billing changes apply to charges billed from now on; past invoice lines keep what applied when they were billed.</p>
        </div>
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {failure.code === "PANEL_NAME_TAKEN" && (
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onShowExisting(name.trim())}>Show the existing panel</Button>
            )}
          </div>
        )}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Panel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Per-field messages from a 400 VALIDATION_FAILED, keyed by the form's problem names. */
function pickFieldProblems(err: unknown): Record<string, string> {
  const raw = fieldErrorMap(err)
  const out: Record<string, string> = {}
  const map: Record<string, string> = { name: "name", contactPerson: "contactPerson", phone: "phone", commissionPct: "commission", discountPct: "discount" }
  for (const [path, message] of Object.entries(raw)) if (map[path]) out[map[path]] = message
  return out
}

function Field({ id, label, error, className = "", children }: { id: string; label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
      {children}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
