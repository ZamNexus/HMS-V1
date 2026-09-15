import * as React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { AlertTriangle, Pill, Plus, Printer } from "lucide-react"

import { MEDICINES, MEDICINE_CATEGORIES } from "@/data/medicines"
import { DISPENSE_RECORDS, nextDispenseNo } from "@/data/pharmacy"
import { ENCOUNTERS } from "@/data/encounters"
import { PATIENTS, getPatient } from "@/data/patients"
import type { DispenseLine, DispenseRecord, Medicine, Patient } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

const TABS = [
  { key: "inventory", label: "Inventory" },
  { key: "dispense", label: "Dispense" },
  { key: "history", label: "History" },
] as const

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

  return (
    <div>
      <PageHeader title="Pharmacy" />
      <div className="mb-4 flex gap-1 rounded-md bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(`/pharmacy/${t.key}`)}
            className={cn("rounded-sm px-4 py-1.5 text-sm font-medium transition-colors", tab === t.key ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
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
  }, [search, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-3 py-1 font-medium">Total: {MEDICINES.length}</span>
        <span className="rounded-full bg-success-100 px-3 py-1 font-medium text-success-700">In Stock: {MEDICINES.length - lowStock.length - outOfStock.length}</span>
        <span className="rounded-full bg-warning-100 px-3 py-1 font-medium text-warning-700">Low Stock: {lowStock.length}</span>
        <span className="rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-700">Expiring 30d: {expiringSoon.length}</span>
      </div>

      {lowStock.length > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Low stock: {lowStock.slice(0, 3).map((m) => `${m.name} (${m.stock})`).join(" · ")}
        </div>
      )}
      {outOfStock.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Out of stock: {outOfStock.map((m) => m.name).join(" · ")}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search by name or generic..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["All", "Low Stock", "Out of Stock", "Expiring Soon", "Expired"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEditTarget("new")}><Plus className="h-4 w-4" /> Add Medicine</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Medicine</TableHead><TableHead>Generic</TableHead><TableHead>Category</TableHead>
            <TableHead>Batch No.</TableHead><TableHead>Expiry</TableHead><TableHead>Stock</TableHead>
            <TableHead>Rate</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((m) => {
              const status = medicineStatus(m)
              const daysToExpiry = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000)
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-semibold">{m.name}</TableCell>
                  <TableCell className="italic text-muted-foreground">{m.generic}</TableCell>
                  <TableCell>{m.category}</TableCell>
                  <TableCell className="font-mono text-xs">{m.batchNo}</TableCell>
                  <TableCell className={cn(daysToExpiry < 0 ? "text-danger-600" : daysToExpiry <= 30 ? "text-orange-600" : "")}>
                    {format(new Date(m.expiry), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className={cn("tabular-nums font-semibold", m.stock === 0 ? "text-danger-600" : m.stock < m.reorderLevel ? "text-warning-700" : "")}>
                    {m.stock} {m.unit}
                  </TableCell>
                  <TableCell>{formatCurrency(m.saleRate)}</TableCell>
                  <TableCell><StatusBadge status={status.label} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditTarget(m)}><Pill className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setAdjustTarget(m)}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
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
    if (!medicine) return
    const idx = MEDICINES.findIndex((m) => m.id === medicine.id)
    if (idx >= 0) {
      MEDICINES[idx] = { ...MEDICINES[idx], stock: Math.max(0, MEDICINES[idx].stock + (type === "Add" ? qty : -qty)) }
    }
    toast({ title: `Stock ${type === "Add" ? "added" : "removed"} for ${medicine.name}` })
    onClose()
  }

  return (
    <Dialog open={!!medicine} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Adjust Stock — {medicine?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <RadioGroup className="flex gap-4" value={type} onValueChange={(v) => setType(v as "Add" | "Remove")}>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="Add" id="adj-add" /><Label htmlFor="adj-add" className="cursor-pointer font-normal">Add</Label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="Remove" id="adj-rem" /><Label htmlFor="adj-rem" className="cursor-pointer font-normal">Remove</Label></div>
          </RadioGroup>
          <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{isNew ? "Add Medicine" : `Edit Medicine — ${med?.name}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Medicine Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Generic Name</Label><Input value={generic} onChange={(e) => setGeneric(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MEDICINE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Batch No. *</Label><Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Expiry Date *</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Stock Quantity *</Label><Input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Sale Rate (Rs.) *</Label><Input type="number" value={saleRate} onChange={(e) => setSaleRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Reorder Level</Label><Input type="number" value={reorderLevel} onChange={(e) => setReorderLevel(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function emptyRow(): { medicineId: number | null; qty: number; instructions: string } {
  return { medicineId: null, qty: 1, instructions: "" }
}

function DispenseTab() {
  const { toast } = useToast()
  const [params] = useSearchParams()
  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })
  const [linkedEncounterId, setLinkedEncounterId] = React.useState<string>("manual")
  const [rows, setRows] = React.useState([emptyRow()])
  const [discountPct, setDiscountPct] = React.useState(0)
  const [mode, setMode] = React.useState<"Cash" | "Card" | "On Account">("Cash")
  const [printReceipt, setPrintReceipt] = React.useState(true)

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id && e.prescription.length > 0) : []

  const linkEncounter = (encId: string) => {
    setLinkedEncounterId(encId)
    if (encId === "manual") return
    const enc = ENCOUNTERS.find((e) => e.id === Number(encId))
    if (!enc) return
    const newRows = enc.prescription.map((rx) => {
      const med = MEDICINES.find((m) => m.name === rx.medicine)
      return { medicineId: med?.id ?? null, qty: 1, instructions: rx.instructions }
    })
    setRows(newRows.length > 0 ? newRows : [emptyRow()])
  }

  React.useEffect(() => {
    const encId = params.get("encounterId")
    if (encId && patient) linkEncounter(encId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient])

  const lines: DispenseLine[] = rows
    .filter((r) => r.medicineId !== null)
    .map((r) => {
      const med = MEDICINES.find((m) => m.id === r.medicineId)!
      const dispensed = Math.min(r.qty, med.stock)
      return { medicineId: med.id, medicineName: med.name, prescribedQty: r.qty, dispensedQty: dispensed, unitRate: med.saleRate, total: dispensed * med.saleRate, instructions: r.instructions }
    })
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const netPayable = Math.max(0, subtotal - (subtotal * discountPct) / 100)

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
      encounterId: linkedEncounterId !== "manual" ? Number(linkedEncounterId) : null,
      date: new Date().toISOString(), lines, subtotal, discountPct, netPayable, paymentMode: mode, dispensedBy: "Omar Farooq",
    }
    DISPENSE_RECORDS.push(record)
    toast({ title: `Dispensed — ${patient.name} · ${formatCurrency(netPayable)}` })
    if (printReceipt) window.print()
    setPatient(null); setRows([emptyRow()]); setLinkedEncounterId("manual"); setDiscountPct(0)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[58%_1fr]">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>

          {patientEncounters.length > 0 && (
            <div className="space-y-1.5">
              <Label>Link Prescription</Label>
              <Select value={linkedEncounterId} onValueChange={linkEncounter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {patientEncounters.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.encId} — {e.diagnosis}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row, i) => {
              const med = MEDICINES.find((m) => m.id === row.medicineId)
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Select value={row.medicineId ? String(row.medicineId) : undefined} onValueChange={(v) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, medicineId: Number(v) } : x))}>
                      <SelectTrigger><SelectValue placeholder="Select medicine..." /></SelectTrigger>
                      <SelectContent>{MEDICINES.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Qty" value={row.qty} onChange={(e) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, qty: Number(e.target.value) } : x))} />
                    <Input placeholder="Instructions" value={row.instructions} onChange={(e) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, instructions: e.target.value } : x))} />
                  </div>
                  {med && (
                    <p className={cn("mt-1 text-xs", med.stock === 0 ? "font-medium text-danger-600" : med.stock < row.qty ? "text-warning-700" : "text-muted-foreground")}>
                      {med.stock === 0 ? "Out of stock" : `Stock: ${med.stock} ${med.unit}`}
                    </p>
                  )}
                </div>
              )
            })}
            <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, emptyRow()])}><Plus className="h-4 w-4" /> Add Medicine</Button>
          </div>

          <div className="space-y-1.5"><Label>Pharmacist Remarks</Label><Textarea rows={2} /></div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">Dispense Summary</h3>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add medicines to see the summary.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {lines.map((l) => (
                <div key={l.medicineId} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{l.medicineName}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.prescribedQty} × {formatCurrency(l.unitRate)}
                      {l.dispensedQty < l.prescribedQty && <span className="ml-1 text-warning-700">(partial: {l.dispensedQty})</span>}
                    </div>
                  </div>
                  <span className="font-semibold">{formatCurrency(l.total)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Discount %</Label>
              <Input type="number" className="w-20" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between text-base font-bold"><span>Net Payable</span><span className="text-secondary">{formatCurrency(netPayable)}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "Cash" | "Card" | "On Account")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Cash", "Card", "On Account"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={printReceipt} onChange={(e) => setPrintReceipt(e.target.checked)} /> Print Receipt</label>
          <Button className="w-full" disabled={!patient || lines.length === 0} onClick={finish}>Dispense &amp; Finish</Button>
        </CardContent>
      </Card>
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
    <div>
      <Input placeholder="Search by patient or dispense number..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      <div className="rounded-lg border border-border bg-card">
        {rows.length === 0 ? <EmptyState icon={Pill} title="No dispense records" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Dispense No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
              <TableHead>Medicines</TableHead><TableHead>Total</TableHead><TableHead>Dispensed By</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((d) => {
                const patient = PATIENTS.find((p) => p.id === d.patientId)
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-secondary">{d.disNo}</TableCell>
                    <TableCell>{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patient?.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{d.lines.map((l) => l.medicineName).join(", ")}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(d.netPayable)}</TableCell>
                    <TableCell>{d.dispensedBy}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
