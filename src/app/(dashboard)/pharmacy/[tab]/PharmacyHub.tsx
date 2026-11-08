"use client"
import * as React from "react"
import Link from "next/link"
import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import type { PharmacyTab } from "./tabs"
import { format } from "date-fns"
import { AlertTriangle, Pill, Plus, Printer, Search, ClipboardList, Activity, Wallet, TrendingDown } from "lucide-react"

import { MEDICINE_CATEGORIES } from "@/lib/labels"
import { demo } from "@hms/demo"
import {
  DEFAULT_PAGE_SIZE, INVENTORY_FILTERS, PHARMACY_OPERATION_LABELS, dataSource, daysToExpiry, dispenseTotals, dispensingService, encountersService, errorSummary,
  findStockShortfalls, inventorySummary, legacyNumericId, matchesInventoryFilter, medicineStatus, medicinesService, pharmacyContractStatus, planDispense, viewState,
  type DispenseRowInput, type EncounterRecord, type InventoryFilter, type MedicineRecord, type PatientRecord, type PharmacyOperation,
} from "@/lib/services"
import { useDoctors, useMedicines, usePatient, usePatients, type ReferenceList } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"
import { PharmacyApiHub } from "@/components/pharmacy/PharmacyApiHub"
import { dataSource as pmDataSource } from "@/lib/services"

const TABS = [
  { key: "inventory", label: "Inventory", icon: Pill },
  { key: "dispense", label: "Dispense", icon: Activity },
  { key: "history", label: "History", icon: ClipboardList },
] as const satisfies readonly { key: PharmacyTab; label: string; icon: unknown }[]

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

type Medicines = ReferenceList<MedicineRecord>

/**
 * In API mode an operation is offered only when its endpoint is configured (from the OpenAPI spec). Until then the screens
 * say the contract is missing, disable the action and send no request. Mock mode is always connected to its demo data.
 */
const contract = pharmacyContractStatus(dataSource)
const PENDING_HINT = "Awaiting the backend API contract"

function ContractPending({ title, operations, testId }: { title: string; operations: readonly PharmacyOperation[]; testId: string }) {
  return (
    <div role="status" data-testid={testId} className="flex items-start gap-3 rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-500/30">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        <p>
          Not connected: the Pharmacy API contract has not been provided to the frontend. No request is sent and no demo data is shown, so there is
          nothing to display here — this is not an empty inventory.
        </p>
        <p className="text-xs text-amber-800/80">Awaiting the contract for: {operations.map((op) => PHARMACY_OPERATION_LABELS[op]).join("; ")}.</p>
      </div>
    </div>
  )
}

function MockPharmacyPage() {
  const params = useParams()
  const tab = (params?.tab as string) || "inventory"

  // One catalogue for the header tiles and both stock-aware tabs. If it can't be loaded the tiles show "—", never a made-up number.
  // While the list contract is missing it is not even requested.
  const medicines = useMedicines(contract.can("medicines.list"))
  const unavailable = !contract.can("medicines.list") || (Boolean(medicines.error) && medicines.items.length === 0)
  const dispenseMissing = (["medicines.list", "dispensing.create"] as const).filter((op) => !contract.can(op))
  const summary = inventorySummary(medicines.items)
  const tile = (value: string) => (unavailable ? "—" : medicines.loading && medicines.items.length === 0 ? "…" : value)

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Pharmacy Inventory</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Manage inventory, dispense medicines, and track records
          </p>
        </div>
      </div>

      {contract.pending && (
        <div role="status" data-testid="pharmacy-not-connected" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-500/30">
          <p className="font-bold">Pharmacy is not connected to the backend</p>
          <p className="mt-1">
            The API contract for inventory and dispensing (routes and request/response schemas) has not been provided to the frontend, so nothing can be
            loaded or saved here. In API mode no Pharmacy request is sent and no demo data is shown; the figures below read “—” rather than zero.
          </p>
          <p className="mt-1 text-xs text-amber-800/80">Awaiting the contract for: {contract.missing.map((op) => PHARMACY_OPERATION_LABELS[op]).join("; ")}.</p>
        </div>
      )}

      {/* ─── STATS DASHBOARD ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><Pill className="h-12 w-12 text-[#0891B2]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Items</p>
          <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{tile(String(summary.totalItems))}</p>
        </div>
        <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0A1B33] to-[#16375F] p-5 shadow-lg ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-20 transition-opacity group-hover:opacity-40"><Wallet className="h-12 w-12 text-[#1CC0CE]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#7FA3C8] mb-1">Inventory Value</p>
          <p className="text-2xl font-black text-white whitespace-nowrap">{tile(formatCurrency(summary.inventoryValue))}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><AlertTriangle className="h-12 w-12 text-warning-500" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Low Stock</p>
          <p className="text-2xl font-black text-warning-600 whitespace-nowrap">{tile(String(summary.lowStock))}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingDown className="h-12 w-12 text-danger-500" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Expiring Soon</p>
          <p className="text-2xl font-black text-danger-600 whitespace-nowrap">{tile(String(summary.expiringSoon))}</p>
        </div>
      </div>

      {/* ─── TABS NAVIGATION ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <Link href={`/pharmacy/${t.key}`}
              key={t.key}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200",
                isActive
                  ? "bg-white text-[#0891B2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 scale-[1.02]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <t.icon className={cn("h-4 w-4", isActive ? "text-[#1CC0CE]" : "text-slate-400")} />
              {t.label}
            </Link>
          )
        })}
      </div>

      {tab === "inventory" && <InventoryTab medicines={medicines} />}
      {tab === "dispense" && (
        dispenseMissing.length > 0 ? (
          <ContractPending title="Dispensing is unavailable" operations={dispenseMissing} testId="pharmacy-dispense-pending" />
        ) : (
          <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
            <DispenseTab medicines={medicines} />
          </Suspense>
        )
      )}
      {tab === "history" && (
        contract.can("dispensing.list")
          ? <HistoryTab />
          : <ContractPending title="Dispense history is unavailable" operations={["dispensing.list"]} testId="pharmacy-history-pending" />
      )}
    </div>
  )
}

function InventoryTab({ medicines }: { medicines: Medicines }) {
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<InventoryFilter>("All")
  const [adjustTarget, setAdjustTarget] = React.useState<MedicineRecord | null>(null)
  const [editTarget, setEditTarget] = React.useState<MedicineRecord | "new" | null>(null)

  const items = medicines.items
  const lowStock = items.filter((m) => matchesInventoryFilter(m, "Low Stock"))
  const outOfStock = items.filter((m) => matchesInventoryFilter(m, "Out of Stock"))

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((m) => (!q || m.name.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q)) && matchesInventoryFilter(m, filter))
  }, [items, search, filter])
  const view = viewState({ data: items.length > 0 ? items : null, error: medicines.error, loading: medicines.loading, rowCount: rows.length })
  // No confirmed list endpoint: say so instead of rendering an empty table that looks like an empty inventory.
  const listPending = !contract.can("medicines.list")

  return (
    <div className="space-y-4">

      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lowStock.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-500/20">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Low Stock Alert</p>
                <p className="text-amber-700/80">{lowStock.slice(0, 3).map((m) => `${m.name} (${m.stock})`).join(" · ")}{lowStock.length > 3 ? "..." : ""}</p>
              </div>
            </div>
          )}
          {outOfStock.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 ring-1 ring-red-500/20">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Out of Stock Alert</p>
                <p className="text-red-700/80">{outOfStock.slice(0, 3).map((m) => m.name).join(" · ")}{outOfStock.length > 3 ? "..." : ""}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or generic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={listPending}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Select value={filter} onValueChange={(v) => setFilter(v as InventoryFilter)} disabled={listPending}>
            <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 w-44 font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INVENTORY_FILTERS.map((f) => <SelectItem key={f} value={f} className="font-medium">{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0 shrink-0" disabled={!contract.can("medicines.create")} title={contract.can("medicines.create") ? undefined : PENDING_HINT} onClick={() => setEditTarget("new")}>
            <Plus className="h-5 w-5 mr-2" /> Add Medicine
          </Button>
        </div>
      </div>

      {!medicines.complete && view === "ready" && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 ring-1 ring-amber-500/20">
          Only part of the medicine catalogue could be loaded, so stock figures and alerts may be incomplete.
        </p>
      )}

      {/* ─── DATA TABLE ────────────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {listPending ? (
          <div className="p-6"><ContractPending title="Inventory is unavailable" operations={["medicines.list"]} testId="pharmacy-inventory-pending" /></div>
        ) : view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load the medicine inventory"
              subtitle={errorSummary(medicines.error)}
              action={<Button variant="outline" className="rounded-xl font-bold" onClick={medicines.reload}>Try again</Button>}
            />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading medicine inventory">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10">
            <EmptyState
              icon={Pill}
              title="No medicines found"
              subtitle={search.trim() || filter !== "All" ? "Try adjusting your search or filter." : "No medicines have been added yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Medicine</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Generic</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Category</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Batch No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Expiry</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Stock</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Rate</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => {
                  const status = medicineStatus(m)
                  const daysLeft = daysToExpiry(m.expiry) // same formula as the inline expression it replaces (floor of days until expiry)
                  return (
                    <TableRow key={m.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{m.name}</TableCell>
                      <TableCell className="py-4 text-sm italic font-medium text-slate-500">{m.generic}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600">{m.category}</TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-[11px] font-mono font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                          {m.batchNo}
                        </span>
                      </TableCell>
                      <TableCell className={cn("py-4 text-sm font-bold whitespace-nowrap", daysLeft < 0 ? "text-danger-600" : daysLeft <= 30 ? "text-orange-600" : "text-slate-600")}>
                        {format(new Date(m.expiry), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className={cn("py-4 text-sm tabular-nums font-black", m.stock === 0 ? "text-danger-600" : m.stock < m.reorderLevel ? "text-warning-700" : "text-slate-900")}>
                        {m.stock} <span className="text-xs font-semibold text-slate-400">{m.unit}</span>
                      </TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{formatCurrency(m.saleRate)}</TableCell>
                      <TableCell className="py-4"><StatusBadge status={status.label} /></TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button aria-label={`Edit ${m.name}`} variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" disabled={!contract.can("medicines.update")} title={contract.can("medicines.update") ? undefined : PENDING_HINT} onClick={() => setEditTarget(m)}><Pill className="h-4 w-4" /></Button>
                          <Button aria-label={`Adjust stock for ${m.name}`} variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-100" disabled={!contract.can("medicines.adjustStock")} title={contract.can("medicines.adjustStock") ? undefined : PENDING_HINT} onClick={() => setAdjustTarget(m)}><Plus className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <StockAdjustModal medicine={adjustTarget} onClose={(saved) => { setAdjustTarget(null); if (saved) medicines.reload() }} />
      <MedicineModal target={editTarget} onClose={(saved) => { setEditTarget(null); if (saved) medicines.reload() }} />
    </div>
  )
}

function StockAdjustModal({ medicine, onClose }: { medicine: MedicineRecord | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [type, setType] = React.useState<"Add" | "Remove">("Add")
  const [qty, setQty] = React.useState(0)
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Start each adjustment afresh when a medicine is chosen. Derived during render (React's "adjust state on prop change"
  // pattern) rather than in an effect, so it needs no extra render pass; the behaviour is the same.
  const [seenMedicine, setSeenMedicine] = React.useState(medicine)
  if (seenMedicine !== medicine) {
    setSeenMedicine(medicine)
    if (medicine) { setType("Add"); setQty(0); setReason("") }
  }

  const save = async () => {
    if (!contract.can("medicines.adjustStock")) return
    const problems = failedChecks([[medicine, "Select a medicine"], [qty > 0, "Quantity must be greater than 0"]])
    // `!medicine` is already in `problems`; repeated here so TypeScript narrows it
    if (problems.length || !medicine) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      await medicinesService.adjustStock(medicine.id, { direction: type, quantity: qty, reason: reason.trim() || undefined })
      toast({ title: `Stock ${type === "Add" ? "added" : "removed"} for ${medicine.name}` })
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not adjust the stock", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!medicine} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Adjust Stock — {medicine?.name}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="p-1 rounded-xl bg-slate-100/50 flex">
            {(["Add", "Remove"] as const).map((t) => (
              <button
                key={t}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200",
                  type === t ? "bg-white text-[#0D1B2E] shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-quantity`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity *</Label><Input id={`${uid}-quantity`} type="number" className={inputClass} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-reason`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason</Label><Input id={`${uid}-reason`} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-6">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onClose()}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" disabled={saving || !contract.can("medicines.adjustStock")} title={contract.can("medicines.adjustStock") ? undefined : PENDING_HINT} onClick={save}>Save Stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MedicineModal({ target, onClose }: { target: MedicineRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const isNew = target === "new"
  const med = isNew || target === null ? null : target

  const [name, setName] = React.useState(med?.name ?? "")
  const [generic, setGeneric] = React.useState(med?.generic ?? "")
  const [category, setCategory] = React.useState(med?.category ?? MEDICINE_CATEGORIES[0])
  const [batchNo, setBatchNo] = React.useState(med?.batchNo ?? "")
  const [expiry, setExpiry] = React.useState(med?.expiry ?? "")
  const [stock, setStock] = React.useState(med?.stock ?? 0)
  const [saleRate, setSaleRate] = React.useState(med?.saleRate ?? 0)
  const [reorderLevel, setReorderLevel] = React.useState(med?.reorderLevel ?? 10)
  const [saving, setSaving] = React.useState(false)

  // Reload the fields whenever the dialog is pointed at a different medicine (or reopened for a new one). Derived during
  // render instead of in an effect; `med` is a function of `target`, so this fires exactly when the effect did.
  const [seenTarget, setSeenTarget] = React.useState(target)
  if (seenTarget !== target) {
    setSeenTarget(target)
    setName(med?.name ?? ""); setGeneric(med?.generic ?? ""); setCategory(med?.category ?? MEDICINE_CATEGORIES[0])
    setBatchNo(med?.batchNo ?? ""); setExpiry(med?.expiry ?? ""); setStock(med?.stock ?? 0)
    setSaleRate(med?.saleRate ?? 0); setReorderLevel(med?.reorderLevel ?? 10)
  }
  const canSave = contract.can(isNew ? "medicines.create" : "medicines.update")

  const save = async () => {
    if (!canSave) return
    const problems = failedChecks([[name, "Medicine Name is required"], [batchNo, "Batch No. is required"], [expiry, "Expiry Date is required"], [saleRate, "Sale Rate is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    const input = { name, generic, category, batchNo, expiry, stock, saleRate, reorderLevel }
    setSaving(true)
    try {
      if (isNew) {
        await medicinesService.create(input)
        toast({ title: `${name} added to catalogue` })
      } else if (med) {
        await medicinesService.update(med.id, input)
        toast({ title: `${name} updated` })
      }
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: isNew ? "Could not add the medicine" : "Could not update the medicine", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle>{isNew ? "Add Medicine" : `Edit Medicine — ${med?.name}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-2">
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor={`${uid}-medicine-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Medicine Name *</Label><Input id={`${uid}-medicine-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-generic-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Generic Name</Label><Input id={`${uid}-generic-name`} className={inputClass} value={generic} onChange={(e) => setGeneric(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-batch-no`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Batch No. *</Label><Input id={`${uid}-batch-no`} className={inputClass} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-expiry-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Expiry Date *</Label><Input id={`${uid}-expiry-date`} type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-stock-quantity`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Quantity *</Label><Input id={`${uid}-stock-quantity`} type="number" className={inputClass} value={stock || ""} onChange={(e) => setStock(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-sale-rate-rs`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Sale Rate (Rs.) *</Label><Input id={`${uid}-sale-rate-rs`} type="number" className={inputClass} value={saleRate || ""} onChange={(e) => setSaleRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-reorder-level`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Reorder Level</Label><Input id={`${uid}-reorder-level`} type="number" className={inputClass} value={reorderLevel || ""} onChange={(e) => setReorderLevel(Number(e.target.value))} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-6">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onClose()}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" disabled={saving || !canSave} title={canSave ? undefined : PENDING_HINT} onClick={save}>Save Medicine</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Row { medicineId: string | null; qty: number; instructions: string; discountPct: number; includedInPackage: boolean }

function emptyRow(): Row {
  return { medicineId: null, qty: 1, instructions: "", discountPct: 0, includedInPackage: false }
}

/**
 * Rows for an encounter's prescription. A prescription line names its medicine as free text, so the match to the
 * inventory is by name (as it always was); a line with no match becomes an empty row. How a prescription refers to
 * inventory is CONTRACT REQUIRED.
 */
function prescriptionRows(encounter: EncounterRecord, medicines: readonly MedicineRecord[]): Row[] {
  return encounter.prescription.map((rx) => {
    const med = medicines.find((m) => m.name === rx.medicine)
    return { medicineId: med?.id ?? null, qty: 1, instructions: rx.instructions, discountPct: 0, includedInPackage: false }
  })
}

const DISPENSE_MODES: PaymentMode[] = ["Cash", "Card", "On Account"]
const MODE_LABELS: Partial<Record<PaymentMode, string>> = { "On Account": "Credit" }
/** Only a short numeric legacy id is worth showing next to a medicine name; a backend id (ULID) is not. */
const shortId = (id: string) => (legacyNumericId(id) !== null ? id : null)

function DispenseTab({ medicines }: { medicines: Medicines }) {
  const uid = React.useId()
  const { toast } = useToast()
  const params = useSearchParams()

  // ?patientId= / ?encounterId= are opaque string ids (never Number()-ed). `picked` overrides the preselected patient once the
  // user chooses/clears one.
  const preselected = usePatient(params?.get("patientId") ?? undefined)
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : preselected.data
  const initialEncounterId = params?.get("encounterId")
  const [encounterChoice, setEncounterChoice] = React.useState(initialEncounterId ?? "none")
  const doctors = useDoctors()
  const [doctorId, setDoctorId] = React.useState<string | undefined>(undefined)
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  // `rowsEdit` is null until the user touches the rows; until then a linked prescription (from the URL) pre-fills them.
  const [rowsEdit, setRowsEdit] = React.useState<Row[] | null>(null)
  const [discountPct, setDiscountPct] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [remarks, setRemarks] = React.useState("")
  const [printReceipt, setPrintReceipt] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState("")

  const loadEncounters = React.useCallback(
    (signal: AbortSignal) =>
      patient ? encountersService.list({ patientId: patient.id, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [], total: 0 }),
    [patient]
  )
  const encountersQuery = useResource(loadEncounters)
  const patientEncounters = patient ? (encountersQuery.data?.items ?? []).filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? patientEncounters.find((e) => e.id === encounterChoice) : undefined

  const prefill =
    initialEncounterId && chosenEncounter && chosenEncounter.id === initialEncounterId && chosenEncounter.prescription.length > 0
      ? prescriptionRows(chosenEncounter, medicines.items)
      : null
  const rows = rowsEdit ?? prefill ?? [emptyRow()]
  const setRows = (next: Row[]) => setRowsEdit(next)

  const lines = planDispense(
    rows.filter((r): r is Row & { medicineId: string } => r.medicineId !== null).map((r): DispenseRowInput => ({
      medicineId: r.medicineId, qty: r.qty, discountPct: r.discountPct, includedInPackage: r.includedInPackage, instructions: r.instructions,
    })),
    (id) => medicines.lookup.get(id)
  )
  const { grossTotal, subtotal, netPayable } = dispenseTotals(lines, discountPct, gstPct)
  // The Task List says dispensing is refused on short stock: a row asking for more than is on the shelf (the same medicine on
  // several rows draws on one shelf) blocks the whole dispense. Nothing is trimmed to what is in stock.
  const shortfalls = findStockShortfalls(rows.map((r) => ({ medicineId: r.medicineId, qty: r.qty })), (id) => medicines.lookup.get(id))
  const shortByRow = new Map(shortfalls.map((s) => [s.rowIndex, s]))

  const updateRow = (i: number, patch: Partial<Row>) => setRows(rows.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const finish = async () => {
    if (!patient || lines.length === 0 || shortfalls.length > 0 || !contract.can("dispensing.create")) return
    setSaveError("")
    setSaving(true)
    try {
      const record = await dispensingService.create({
        patientId: patient.id,
        encounterId: chosenEncounter?.id,
        doctorId,
        lines: rows
          .filter((r): r is Row & { medicineId: string } => r.medicineId !== null)
          .map((r) => ({ medicineId: r.medicineId, quantity: r.qty, instructions: r.instructions || undefined, discountPct: r.discountPct, includedInPackage: r.includedInPackage })),
        discountPct,
        gstPct,
        paymentMode: mode,
        notes: remarks || undefined,
      })
      toast({ title: `Dispensed — ${patient.name} · ${formatCurrency(record.netPayable)}` })
      if (printReceipt) window.print()
      setPicked(null); setRowsEdit([emptyRow()]); setEncounterChoice("none"); setDoctorId(undefined); setDiscountPct(0); setGstPct(0); setRemarks("")
      medicines.reload()
    } catch (err) {
      setSaveError(errorSummary(err))
      toast({ variant: "destructive", title: "Could not dispense", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[58%_1fr]">
      <Card className="rounded-[1.5rem] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-patient`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <PatientRecordPicker id={`${uid}-patient`} value={patient ?? null} onChange={(p) => { setPicked(p); setEncounterChoice("none") }} />
          </div>

          <PatientInfoPanel patient={patient} />

          {patient && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-4 rounded-xl bg-slate-50 ring-1 ring-slate-100">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-opd-ipd-encounter`} className="text-xs font-bold uppercase tracking-wider text-slate-500">OPD/IPD Encounter</Label>
                <Select value={encounterChoice} onValueChange={setEncounterChoice}>
                  <SelectTrigger id={`${uid}-opd-ipd-encounter`} className={selectClass}><SelectValue placeholder="Link to a visit (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a visit</SelectItem>
                    {patientEncounters.map((e) => <SelectItem key={e.id} value={e.id}>{e.encId} — {e.type} · {e.diagnosis}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-doctor`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor</Label>
                <div className="flex gap-2">
                  <Select value={doctorId} onValueChange={setDoctorId} disabled={doctors.loading}>
                    <SelectTrigger id={`${uid}-doctor`} className={selectClass}><SelectValue placeholder={doctors.loading ? "Loading doctors…" : "Select doctor (optional)"} /></SelectTrigger>
                    <SelectContent>{doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-white border-slate-200" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
              </div>
            </div>
          )}

          {chosenEncounter && chosenEncounter.prescription.length > 0 && (
            <Button type="button" className="w-full bg-[#1CC0CE]/10 text-[#0891B2] hover:bg-[#1CC0CE]/20 font-bold border-0 rounded-xl" onClick={() => setRows(prescriptionRows(chosenEncounter, medicines.items))}>
              Load Rx from {chosenEncounter.encId} ({chosenEncounter.prescription.length} item{chosenEncounter.prescription.length > 1 ? "s" : ""})
            </Button>
          )}

          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Medicines</Label>
            {medicines.loading && medicines.items.length === 0 && (
              <div role="status" className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500">Loading medicines…</div>
            )}
            {Boolean(medicines.error) && medicines.items.length === 0 && !medicines.loading && (
              <div role="alert" className="space-y-2 rounded-md border border-dashed border-red-200 p-3 text-xs text-red-600">
                <p>Couldn&apos;t load the medicine inventory: {errorSummary(medicines.error)}</p>
                <Button type="button" variant="outline" size="sm" onClick={medicines.reload}>Try again</Button>
              </div>
            )}
            {!medicines.loading && !medicines.error && medicines.items.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500">No medicines in the inventory yet.</div>
            )}
            {rows.map((row, i) => {
              const med = row.medicineId ? medicines.lookup.get(row.medicineId) : undefined
              return (
                <div key={i} className="space-y-3 rounded-xl border border-slate-200 p-4 bg-white shadow-sm">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-5">
                      <Select value={row.medicineId ?? undefined} onValueChange={(v) => updateRow(i, { medicineId: v })}>
                        <SelectTrigger className={selectClass}><SelectValue placeholder="Select medicine..." /></SelectTrigger>
                        <SelectContent>{medicines.items.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{shortId(m.id) ? ` (${m.id})` : ""}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Input type="number" placeholder="Qty" className={inputClass} value={row.qty || ""} onChange={(e) => updateRow(i, { qty: Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-4">
                      <Input placeholder="Instructions" className={inputClass} value={row.instructions} onChange={(e) => updateRow(i, { instructions: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">Discount %
                        <Input type="number" className="h-8 w-16 px-2 text-xs rounded-md border-slate-200 focus:border-[#1CC0CE]" value={row.discountPct} disabled={row.includedInPackage}
                          onChange={(e) => updateRow(i, { discountPct: Number(e.target.value) })} />
                      </span>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <Checkbox checked={row.includedInPackage} onCheckedChange={(v) => updateRow(i, { includedInPackage: v === true })} />
                        Included in Package
                      </label>
                    </div>
                    {med && (() => {
                      const short = shortByRow.get(i)
                      return (
                        <span
                          role={short ? "alert" : undefined}
                          data-testid={short ? "insufficient-stock" : undefined}
                          className={cn("px-2 py-1 rounded-md", short || med.stock === 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600")}
                        >
                          {short ? `Insufficient stock — ${short.available} ${med.unit} available` : med.stock === 0 ? "Out of stock" : `Stock: ${med.stock} ${med.unit}`}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
            <Button type="button" variant="outline" className="w-full rounded-xl border-dashed border-2 h-12 font-bold text-slate-500 hover:text-[#0D1B2E]" onClick={() => setRows([...rows, emptyRow()])}>
              <Plus className="h-4 w-4 mr-2" /> Add Medicine
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-pharmacist-remarks`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Pharmacist Remarks</Label>
            <Textarea id={`${uid}-pharmacist-remarks`} rows={2} className="rounded-xl border-slate-200 focus:border-[#1CC0CE] resize-none" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-24 rounded-[1.5rem] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="bg-gradient-to-r from-[#0F2A4D] to-[#16375F] p-5 text-white">
          <h3 className="text-sm font-bold opacity-80 uppercase tracking-wider mb-1">Dispense Summary</h3>
          <p className="font-mono text-xl">{dataSource === "mock" ? demo.data.nextDispenseNo() : "Number assigned on save"}</p>
        </div>
        <CardContent className="space-y-4 p-5 bg-white">
          {lines.length === 0 ? (
            <div className="py-6 text-center text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
              Add medicines to see the summary.
            </div>
          ) : (
            <div className="space-y-3 text-sm max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {lines.map((l, i) => (
                <div key={`${l.medicineId}-${i}`} className="flex items-start justify-between pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                  <div>
                    <div className="font-bold text-[#0D1B2E]">{l.medicineName} {shortId(l.medicineId) && <span className="font-mono text-[10px] bg-slate-100 px-1 rounded text-slate-500 ml-1">#{l.medicineId}</span>}</div>
                    <div className="text-xs font-medium text-slate-500 mt-0.5">
                      {l.prescribedQty} × {formatCurrency(l.unitRate)}
                      {l.includedInPackage && <span className="ml-1 text-[#0891B2] bg-[#1CC0CE]/10 px-1 rounded">(package)</span>}
                      {!l.includedInPackage && (l.discountPct ?? 0) > 0 && <span className="ml-1 text-emerald-600">(-{l.discountPct}%)</span>}
                    </div>
                  </div>
                  <span className="font-bold text-[#0D1B2E]">{formatCurrency(l.total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2.5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="flex items-center justify-between text-sm font-semibold"><span className="text-slate-500">Gross Total</span><span className="text-[#0D1B2E]">{formatCurrency(grossTotal)}</span></div>
            <div className="flex items-center justify-between text-sm font-semibold"><span className="text-slate-500">Subtotal</span><span className="text-[#0D1B2E]">{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200/60">
              <span className="text-xs font-bold text-slate-500">Flat Discount %</span>
              <Input type="number" className="h-8 w-16 px-2 text-xs rounded-md border-slate-200 font-semibold" value={discountPct || ""} onChange={(e) => setDiscountPct(Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-500">GST %</span>
              <Input type="number" className="h-8 w-16 px-2 text-xs rounded-md border-slate-200 font-semibold" value={gstPct || ""} onChange={(e) => setGstPct(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-500/20">
            <span className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Net Payable</span>
            <span className="text-2xl font-black text-emerald-700">{formatCurrency(netPayable)}</span>
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor={`${uid}-payment-mode`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
              <SelectTrigger id={`${uid}-payment-mode`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{DISPENSE_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m] ?? m}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 pb-2">
            <Checkbox checked={printReceipt} onCheckedChange={(v) => setPrintReceipt(v === true)} /> Print Receipt
          </label>

          {shortfalls.length > 0 && (
            <p data-testid="dispense-blocked" className="rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
              Can&apos;t dispense: not enough stock for {Array.from(new Set(shortfalls.map((s) => s.medicineName))).join(", ")}. Reduce the quantity or restock — nothing is dispensed on short stock.
            </p>
          )}

          {saveError && <p role="alert" className="rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">{saveError}</p>}

          <Button className="w-full rounded-xl h-12 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold text-lg shadow-lg shadow-[#0F2A4D]/20" disabled={!patient || lines.length === 0 || shortfalls.length > 0 || saving} onClick={finish}>
            {saving ? "Dispensing…" : <>Dispense &amp; Finish</>}
          </Button>
        </CardContent>
      </Card>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreatedRecord={(d) => { doctors.reload(); setDoctorId(d.id) }} />
    </div>
  )
}

function HistoryTab() {
  const [search, setSearch] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)

  // Debounce the search; a new search restarts at page 1.
  React.useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const load = React.useCallback(
    (signal: AbortSignal) => dispensingService.list({ search: query, page, pageSize: DEFAULT_PAGE_SIZE, signal }),
    [query, page]
  )
  const { data, error, loading, reload } = useResource(load)
  const rows = data?.items ?? []
  const view = viewState({ data, error, loading, rowCount: rows.length })
  const patients = usePatients(rows.map((r) => r.patientId))

  return (
    <div className="space-y-4">
      {/* ─── SEARCH BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient or dispense number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>
      </div>

      {/* ─── ELEVATED DATA TABLE ──────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load dispense records"
              subtitle={errorSummary(error)}
              action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>}
            />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading dispense records">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10"><EmptyState icon={Pill} title="No dispense records" subtitle={query ? "Try adjusting your search." : undefined} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Dispense No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Medicines</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Total</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Dispensed By</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const patient = patients.lookup.get(d.patientId)
                  return (
                    <TableRow key={d.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <TableCell className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                          {d.disNo}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{patient?.name ?? (patients.loading ? "…" : patients.failed ? "—" : "Unknown Patient")}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 max-w-[220px] truncate">{d.lines.map((l) => l.medicineName).join(", ")}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{formatCurrency(d.netPayable)}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-500">{d.dispensedBy}</TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Button aria-label={`Print ${d.disNo}`} variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {data && rows.length > 0 && data.total > DEFAULT_PAGE_SIZE && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data.total} onPageChange={setPage} itemLabel="dispense records" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function PharmacyPage() {
  const params = useParams()
  if (pmDataSource === "api") return <PharmacyApiHub tab={(params?.tab as string) || "inventory"} />
  return <MockPharmacyPage />
}
