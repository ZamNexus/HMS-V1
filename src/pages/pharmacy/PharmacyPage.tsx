import * as React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { AlertTriangle, Pill, Plus, Printer, Search, ClipboardList, Activity, Wallet, TrendingDown } from "lucide-react"

import { MEDICINES, MEDICINE_CATEGORIES } from "@/data/medicines"
import { DISPENSE_RECORDS, nextDispenseNo } from "@/data/pharmacy"
import { ENCOUNTERS } from "@/data/encounters"
import { activeDoctors } from "@/data/doctors"
import { PATIENTS, getPatient } from "@/data/patients"
import type { DispenseLine, DispenseRecord, Medicine, Patient, PaymentMode } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

const TABS = [
  { key: "inventory", label: "Inventory", icon: Pill },
  { key: "dispense", label: "Dispense", icon: Activity },
  { key: "history", label: "History", icon: ClipboardList },
] as const

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

function medicineStatus(m: Medicine): { label: string; days?: number } {
  const daysToExpiry = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000)
  if (daysToExpiry < 0) return { label: "Expired" }
  if (m.stock === 0) return { label: "Out of Stock" }
  if (daysToExpiry <= 30) return { label: "Expiring Soon", days: daysToExpiry }
  if (m.stock < m.reorderLevel) return { label: "Low Stock" }
  return { label: "In Stock" }
}

export function PharmacyPage() {
  const { tab = "inventory" } = useParams()
  const navigate = useNavigate()

  const totalItems = MEDICINES.length
  const inventoryValue = MEDICINES.reduce((acc, m) => acc + (m.stock * m.saleRate), 0)
  const lowStockCount = MEDICINES.filter((m) => m.stock > 0 && m.stock < m.reorderLevel).length
  const expiringCount = MEDICINES.filter((m) => {
    const days = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 30
  }).length

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

      {/* ─── STATS DASHBOARD ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><Pill className="h-12 w-12 text-[#0891B2]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Items</p>
          <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{totalItems}</p>
        </div>
        <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0A1B33] to-[#16375F] p-5 shadow-lg ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-20 transition-opacity group-hover:opacity-40"><Wallet className="h-12 w-12 text-[#1CC0CE]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#7FA3C8] mb-1">Inventory Value</p>
          <p className="text-2xl font-black text-white whitespace-nowrap">{formatCurrency(inventoryValue)}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><AlertTriangle className="h-12 w-12 text-warning-500" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Low Stock</p>
          <p className="text-2xl font-black text-warning-600 whitespace-nowrap">{lowStockCount}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingDown className="h-12 w-12 text-danger-500" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Expiring Soon</p>
          <p className="text-2xl font-black text-danger-600 whitespace-nowrap">{expiringCount}</p>
        </div>
      </div>

      {/* ─── TABS NAVIGATION ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => navigate(`/pharmacy/${t.key}`)}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200",
                isActive
                  ? "bg-white text-[#0891B2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 scale-[1.02]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <t.icon className={cn("h-4 w-4", isActive ? "text-[#1CC0CE]" : "text-slate-400")} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === "inventory" && <InventoryTab />}
      {tab === "dispense" && <DispenseTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  )
}

function InventoryTab() {
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState("All")
  const [adjustTarget, setAdjustTarget] = React.useState<Medicine | null>(null)
  const [editTarget, setEditTarget] = React.useState<Medicine | "new" | null>(null)
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

  const lowStock = MEDICINES.filter((m) => m.stock > 0 && m.stock < m.reorderLevel)
  const outOfStock = MEDICINES.filter((m) => m.stock === 0)
  const expiringSoon = MEDICINES.filter((m) => {
    const days = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 30
  })

  const rows = React.useMemo(() => {
    let list = MEDICINES
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q))
    if (filter === "Low Stock") list = list.filter((m) => m.stock > 0 && m.stock < m.reorderLevel)
    if (filter === "Out of Stock") list = list.filter((m) => m.stock === 0)
    if (filter === "Expiring Soon") list = list.filter((m) => expiringSoon.includes(m))
    if (filter === "Expired") list = list.filter((m) => new Date(m.expiry).getTime() < Date.now())
    return list
  }, [search, filter])

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
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 w-44 font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["All", "Low Stock", "Out of Stock", "Expiring Soon", "Expired"].map((f) => <SelectItem key={f} value={f} className="font-medium">{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0 shrink-0" onClick={() => setEditTarget("new")}>
            <Plus className="h-5 w-5 mr-2" /> Add Medicine
          </Button>
        </div>
      </div>

      {/* ─── DATA TABLE ────────────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
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
                const daysToExpiry = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000)
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
                    <TableCell className={cn("py-4 text-sm font-bold whitespace-nowrap", daysToExpiry < 0 ? "text-danger-600" : daysToExpiry <= 30 ? "text-orange-600" : "text-slate-600")}>
                      {format(new Date(m.expiry), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className={cn("py-4 text-sm tabular-nums font-black", m.stock === 0 ? "text-danger-600" : m.stock < m.reorderLevel ? "text-warning-700" : "text-slate-900")}>
                      {m.stock} <span className="text-xs font-semibold text-slate-400">{m.unit}</span>
                    </TableCell>
                    <TableCell className="py-4 font-black text-slate-900">{formatCurrency(m.saleRate)}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={status.label} /></TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setEditTarget(m)}><Pill className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-100" onClick={() => setAdjustTarget(m)}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <StockAdjustModal medicine={adjustTarget} onClose={() => { setAdjustTarget(null); forceUpdate() }} />
      <MedicineModal target={editTarget} onClose={() => { setEditTarget(null); forceUpdate() }} />
    </div>
  )
}

function StockAdjustModal({ medicine, onClose }: { medicine: Medicine | null; onClose: () => void }) {
  const { toast } = useToast()
  const [type, setType] = React.useState<"Add" | "Remove">("Add")
  const [qty, setQty] = React.useState(0)
  const [reason, setReason] = React.useState("")

  React.useEffect(() => { if (medicine) { setType("Add"); setQty(0); setReason("") } }, [medicine])

  const save = () => {
    if (!medicine || qty <= 0) return
    const idx = MEDICINES.findIndex((m) => m.id === medicine.id)
    if (idx >= 0) {
      MEDICINES[idx] = { ...MEDICINES[idx], stock: Math.max(0, MEDICINES[idx].stock + (type === "Add" ? qty : -qty)) }
    }
    toast({ title: `Stock ${type === "Add" ? "added" : "removed"} for ${medicine.name}` })
    onClose()
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
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity</Label><Input type="number" className={inputClass} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason</Label><Input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-6">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={save}>Save Stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MedicineModal({ target, onClose }: { target: Medicine | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const med = isNew ? null : target

  const [name, setName] = React.useState(med?.name ?? "")
  const [generic, setGeneric] = React.useState(med?.generic ?? "")
  const [category, setCategory] = React.useState(med?.category ?? MEDICINE_CATEGORIES[0])
  const [batchNo, setBatchNo] = React.useState(med?.batchNo ?? "")
  const [expiry, setExpiry] = React.useState(med?.expiry ?? "")
  const [stock, setStock] = React.useState(med?.stock ?? 0)
  const [saleRate, setSaleRate] = React.useState(med?.saleRate ?? 0)
  const [reorderLevel, setReorderLevel] = React.useState(med?.reorderLevel ?? 10)

  React.useEffect(() => {
    setName(med?.name ?? ""); setGeneric(med?.generic ?? ""); setCategory(med?.category ?? MEDICINE_CATEGORIES[0]);
    setBatchNo(med?.batchNo ?? ""); setExpiry(med?.expiry ?? ""); setStock(med?.stock ?? 0);
    setSaleRate(med?.saleRate ?? 0); setReorderLevel(med?.reorderLevel ?? 10)
  }, [target])

  const save = () => {
    if (!name || !batchNo || !expiry || !saleRate) return
    if (isNew) {
      MEDICINES.push({
        id: Math.max(0, ...MEDICINES.map((m) => m.id)) + 1, name, generic, category, batchNo, expiry,
        stock, unit: "Tablet", purchaseRate: Math.round(saleRate * 0.6), saleRate, reorderLevel,
      })
      toast({ title: `${name} added to catalogue` })
    } else if (med) {
      const idx = MEDICINES.findIndex((m) => m.id === med.id)
      if (idx >= 0) MEDICINES[idx] = { ...MEDICINES[idx], name, generic, category, batchNo, expiry, stock, saleRate, reorderLevel }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle>{isNew ? "Add Medicine" : `Edit Medicine — ${med?.name}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-2">
          <div className="space-y-1.5 md:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Medicine Name *</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Generic Name</Label><Input className={inputClass} value={generic} onChange={(e) => setGeneric(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Batch No. *</Label><Input className={inputClass} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Expiry Date *</Label><Input type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Quantity *</Label><Input type="number" className={inputClass} value={stock || ""} onChange={(e) => setStock(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sale Rate (Rs.) *</Label><Input type="number" className={inputClass} value={saleRate || ""} onChange={(e) => setSaleRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Reorder Level</Label><Input type="number" className={inputClass} value={reorderLevel || ""} onChange={(e) => setReorderLevel(Number(e.target.value))} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-6">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={save}>Save Medicine</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function emptyRow() {
  return { medicineId: null as number | null, qty: 1, instructions: "", discountPct: 0, includedInPackage: false }
}

const DISPENSE_MODES: PaymentMode[] = ["Cash", "Card", "On Account"]
const MODE_LABELS: Partial<Record<PaymentMode, string>> = { "On Account": "Credit" }

function DispenseTab() {
  const { toast } = useToast()
  const [params] = useSearchParams()
  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })
  const [encounterChoice, setEncounterChoice] = React.useState("none")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(undefined)
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [rows, setRows] = React.useState([emptyRow()])
  const [discountPct, setDiscountPct] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [remarks, setRemarks] = React.useState("")
  const [printReceipt, setPrintReceipt] = React.useState(true)

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? ENCOUNTERS.find((e) => e.id === Number(encounterChoice)) : undefined

  const loadPrescription = () => {
    if (!chosenEncounter || chosenEncounter.prescription.length === 0) return
    const newRows = chosenEncounter.prescription.map((rx) => {
      const med = MEDICINES.find((m) => m.name === rx.medicine)
      return { medicineId: med?.id ?? null, qty: 1, instructions: rx.instructions, discountPct: 0, includedInPackage: false }
    })
    setRows(newRows)
  }

  React.useEffect(() => {
    const encId = params.get("encounterId")
    if (encId && patient) {
      setEncounterChoice(encId)
      const enc = ENCOUNTERS.find((e) => e.id === Number(encId))
      if (enc && enc.prescription.length > 0) {
        setRows(enc.prescription.map((rx) => {
          const med = MEDICINES.find((m) => m.name === rx.medicine)
          return { medicineId: med?.id ?? null, qty: 1, instructions: rx.instructions, discountPct: 0, includedInPackage: false }
        }))
      }
    }
  }, [patient])

  const lines: DispenseLine[] = rows
    .filter((r) => r.medicineId !== null)
    .map((r) => {
      const med = MEDICINES.find((m) => m.id === r.medicineId)!
      const dispensed = Math.min(r.qty, med.stock)
      const charge = r.includedInPackage ? 0 : dispensed * med.saleRate
      const total = charge - (charge * r.discountPct) / 100
      return {
        medicineId: med.id, medicineName: med.name, prescribedQty: r.qty, dispensedQty: dispensed, unitRate: med.saleRate,
        discountPct: r.discountPct, includedInPackage: r.includedInPackage, total, instructions: r.instructions,
      }
    })
  const grossTotal = lines.reduce((s, l) => s + l.dispensedQty * l.unitRate, 0)
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const afterDiscount = Math.max(0, subtotal - (subtotal * discountPct) / 100)
  const netPayable = afterDiscount + (afterDiscount * gstPct) / 100

  const updateRow = (i: number, patch: Partial<ReturnType<typeof emptyRow>>) => {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  const finish = () => {
    if (!patient || lines.length === 0) return
    lines.forEach((l) => {
      const idx = MEDICINES.findIndex((m) => m.id === l.medicineId)
      if (idx >= 0) MEDICINES[idx] = { ...MEDICINES[idx], stock: Math.max(0, MEDICINES[idx].stock - l.dispensedQty) }
    })
    const disNo = nextDispenseNo()
    const record: DispenseRecord = {
      id: Math.max(0, ...DISPENSE_RECORDS.map((d) => d.id)) + 1,
      disNo, patientId: patient.id,
      encounterId: chosenEncounter?.id ?? null,
      doctorId,
      date: new Date().toISOString(), lines, subtotal, discountPct, gstPct, netPayable, paymentMode: mode,
      dispensedBy: "Omar Farooq", notes: remarks || undefined,
    }
    DISPENSE_RECORDS.push(record)
    toast({ title: `Dispensed — ${patient.name} · ${formatCurrency(netPayable)}` })
    if (printReceipt) window.print()
    setPatient(null); setRows([emptyRow()]); setEncounterChoice("none"); setDoctorId(undefined); setDiscountPct(0); setGstPct(0); setRemarks("")
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[58%_1fr]">
      <Card className="rounded-[1.5rem] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setEncounterChoice("none") }} />
          </div>

          <PatientInfoPanel patient={patient} />

          {patient && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-4 rounded-xl bg-slate-50 ring-1 ring-slate-100">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">OPD/IPD Encounter</Label>
                <Select value={encounterChoice} onValueChange={setEncounterChoice}>
                  <SelectTrigger className={selectClass}><SelectValue placeholder="Link to a visit (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a visit</SelectItem>
                    {patientEncounters.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.encId} — {e.type} · {e.diagnosis}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor</Label>
                <div className="flex gap-2">
                  <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                    <SelectTrigger className={selectClass}><SelectValue placeholder="Select doctor (optional)" /></SelectTrigger>
                    <SelectContent>{activeDoctors().map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-white border-slate-200" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {chosenEncounter && chosenEncounter.prescription.length > 0 && (
            <Button type="button" className="w-full bg-[#1CC0CE]/10 text-[#0891B2] hover:bg-[#1CC0CE]/20 font-bold border-0 rounded-xl" onClick={loadPrescription}>
              Load Rx from {chosenEncounter.encId} ({chosenEncounter.prescription.length} item{chosenEncounter.prescription.length > 1 ? "s" : ""})
            </Button>
          )}

          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Medicines</Label>
            {rows.map((row, i) => {
              const med = MEDICINES.find((m) => m.id === row.medicineId)
              return (
                <div key={i} className="space-y-3 rounded-xl border border-slate-200 p-4 bg-white shadow-sm">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-5">
                      <Select value={row.medicineId ? String(row.medicineId) : undefined} onValueChange={(v) => updateRow(i, { medicineId: Number(v) })}>
                        <SelectTrigger className={selectClass}><SelectValue placeholder="Select medicine..." /></SelectTrigger>
                        <SelectContent>{MEDICINES.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name} ({m.id})</SelectItem>)}</SelectContent>
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
                    {med && (
                      <span className={cn("px-2 py-1 rounded-md", med.stock === 0 ? "bg-red-50 text-red-600" : med.stock < row.qty ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>
                        {med.stock === 0 ? "Out of stock" : `Stock: ${med.stock} ${med.unit}`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            <Button type="button" variant="outline" className="w-full rounded-xl border-dashed border-2 h-12 font-bold text-slate-500 hover:text-[#0D1B2E]" onClick={() => setRows((r) => [...r, emptyRow()])}>
              <Plus className="h-4 w-4 mr-2" /> Add Medicine
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pharmacist Remarks</Label>
            <Textarea rows={2} className="rounded-xl border-slate-200 focus:border-[#1CC0CE] resize-none" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-24 rounded-[1.5rem] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="bg-gradient-to-r from-[#0F2A4D] to-[#16375F] p-5 text-white">
          <h3 className="text-sm font-bold opacity-80 uppercase tracking-wider mb-1">Dispense Summary</h3>
          <p className="font-mono text-xl">{nextDispenseNo()}</p>
        </div>
        <CardContent className="space-y-4 p-5 bg-white">
          {lines.length === 0 ? (
            <div className="py-6 text-center text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
              Add medicines to see the summary.
            </div>
          ) : (
            <div className="space-y-3 text-sm max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {lines.map((l) => (
                <div key={l.medicineId} className="flex items-start justify-between pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                  <div>
                    <div className="font-bold text-[#0D1B2E]">{l.medicineName} <span className="font-mono text-[10px] bg-slate-100 px-1 rounded text-slate-500 ml-1">#{l.medicineId}</span></div>
                    <div className="text-xs font-medium text-slate-500 mt-0.5">
                      {l.prescribedQty} × {formatCurrency(l.unitRate)}
                      {l.dispensedQty < l.prescribedQty && <span className="ml-1 text-amber-600">(partial: {l.dispensedQty})</span>}
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
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{DISPENSE_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m] ?? m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 pb-2">
            <Checkbox checked={printReceipt} onCheckedChange={(v) => setPrintReceipt(v === true)} /> Print Receipt
          </label>
          
          <Button className="w-full rounded-xl h-12 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold text-lg shadow-lg shadow-[#0F2A4D]/20" disabled={!patient || lines.length === 0} onClick={finish}>
            Dispense &amp; Finish
          </Button>
        </CardContent>
      </Card>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreated={(id) => setDoctorId(id)} />
    </div>
  )
}

function HistoryTab() {
  const [search, setSearch] = React.useState("")
  const rows = DISPENSE_RECORDS.filter((d) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const patient = PATIENTS.find((p) => p.id === d.patientId)
    return patient?.name.toLowerCase().includes(q) || d.disNo.toLowerCase().includes(q)
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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
        {rows.length === 0 ? <div className="p-10"><EmptyState icon={Pill} title="No dispense records" /></div> : (
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
                  const patient = PATIENTS.find((p) => p.id === d.patientId)
                  return (
                    <TableRow key={d.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <TableCell className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                          {d.disNo}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">{patient?.name || "Unknown Patient"}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 max-w-[220px] truncate">{d.lines.map((l) => l.medicineName).join(", ")}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{formatCurrency(d.netPayable)}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-500">{d.dispensedBy}</TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
