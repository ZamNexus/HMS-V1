import * as React from "react"
import { format } from "date-fns"
import { Pencil, Plus, Trash2, History, Search } from "lucide-react"

import { SERVICE_CATALOG } from "@/data/services"
import { PANELS } from "@/data/organisations"
import { WARDS } from "@/data/wards"
import { EXPENSE_CATEGORIES, SERVICES_INVOICES } from "@/data/billing"
import { PATIENTS } from "@/data/patients"
import { CLINIC_SETTINGS, BANKS } from "@/data/settings"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { ECG_ULTRASOUND_TESTS } from "@/data/ecgUltrasound"
import { DISEASES } from "@/data/diseases"
import { LAB_TESTS, LAB_TEST_CATEGORIES } from "@/data/labTests"
import type {
  PanelType, ServiceCatalogItem, Panel, GuardianRelationItem, EcgUltrasoundTest, Disease, LabTest, BankAccount,
} from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

const SERVICE_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]
const PANEL_TYPES: PanelType[] = ["Insurance", "Corporate", "Government", "Other"]
const DISEASE_CATEGORIES = ["Respiratory", "Endocrine", "Cardiovascular", "Gastrointestinal", "Infectious", "Haematology", "Neurology", "Musculoskeletal", "Psychiatric", "Genitourinary", "Dermatology", "Other"]

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all font-semibold"
const primaryBtnClass = "rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0 shrink-0"

export function MasterDataPage() {
  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Master Data</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Configure system catalogues, services, billing data, and clinic settings
          </p>
        </div>
      </div>

      <Tabs defaultValue="services">
        <TabsList className="h-auto p-1.5 bg-slate-100/80 rounded-2xl flex gap-1 overflow-x-auto justify-start border border-slate-200/60 shadow-inner scrollbar-none w-full">
          <TabsTrigger value="services" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Services Catalog</TabsTrigger>
          <TabsTrigger value="labtests" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Lab &amp; Imaging Tests</TabsTrigger>
          <TabsTrigger value="panels" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Panels &amp; Insurance</TabsTrigger>
          <TabsTrigger value="wards" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Wards &amp; Beds</TabsTrigger>
          <TabsTrigger value="guardian" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Guardian Relations</TabsTrigger>
          <TabsTrigger value="ecg" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">ECG/Ultrasound</TabsTrigger>
          <TabsTrigger value="diseases" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Diseases/Diagnosis</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Expense Categories</TabsTrigger>
          <TabsTrigger value="banks" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Banks</TabsTrigger>
          <TabsTrigger value="clinic" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Clinic Settings</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="services" className="mt-0 outline-none"><ServicesTab /></TabsContent>
          <TabsContent value="labtests" className="mt-0 outline-none"><LabTestsTab /></TabsContent>
          <TabsContent value="panels" className="mt-0 outline-none"><PanelsTab /></TabsContent>
          <TabsContent value="wards" className="mt-0 outline-none"><WardsTab /></TabsContent>
          <TabsContent value="guardian" className="mt-0 outline-none"><GuardianRelationsTab /></TabsContent>
          <TabsContent value="ecg" className="mt-0 outline-none"><EcgUltrasoundTab /></TabsContent>
          <TabsContent value="diseases" className="mt-0 outline-none"><DiseasesTab /></TabsContent>
          <TabsContent value="expenses" className="mt-0 outline-none"><ExpenseCategoriesTab /></TabsContent>
          <TabsContent value="banks" className="mt-0 outline-none"><BanksTab /></TabsContent>
          <TabsContent value="clinic" className="mt-0 outline-none"><ClinicSettingsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function ServicesTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [modalTarget, setModalTarget] = React.useState<ServiceCatalogItem | "new" | null>(null)
  const [historyTarget, setHistoryTarget] = React.useState<ServiceCatalogItem | null>(null)

  const rows = categoryFilter === "All" ? SERVICE_CATALOG : SERVICE_CATALOG.filter((s) => s.category === categoryFilter)

  return (
    <div className="space-y-4">
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={cn(selectClass, "w-full md:w-64")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Service</Button>
      </div>

      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Code</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Service Name</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Category</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Rate</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">GST%</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Disc%</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Active</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold font-mono text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                      {s.code}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">
                    {s.name}
                    {s.nameLocal && <span className="ml-2 font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md" dir="rtl">{s.nameLocal}</span>}
                  </TableCell>
                  <TableCell className="py-4 font-medium text-slate-600">{s.category}</TableCell>
                  <TableCell className="py-4 font-black text-slate-900">{formatCurrency(s.rate)}</TableCell>
                  <TableCell className="py-4 font-semibold text-slate-500">{s.gstPct ?? 0}%</TableCell>
                  <TableCell className="py-4 font-semibold text-slate-500">{s.discountPct ?? 0}%</TableCell>
                  <TableCell className="py-4">
                    <Switch checked={s.active} onCheckedChange={(v) => { s.active = v; forceUpdate() }} />
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" title="Item History" onClick={() => setHistoryTarget(s)}><History className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(s)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <ServiceModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
      <ServiceHistoryDialog target={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  )
}

function ServiceHistoryDialog({ target, onClose }: { target: ServiceCatalogItem | null; onClose: () => void }) {
  const usages = React.useMemo(() => {
    if (!target) return []
    return SERVICES_INVOICES.flatMap((inv) =>
      inv.lines.filter((l) => l.name === target.name).map((l) => ({
        invoiceNo: inv.invoiceNo, date: inv.date, patientId: inv.patientId, qty: l.qty, rate: l.rate, amount: l.amount,
      }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [target])

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">History — {target?.name}</DialogTitle></DialogHeader>
        <div className="pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {usages.length === 0 ? (
            <div className="py-10"><EmptyState icon={History} title="No usage yet" subtitle="This service hasn't appeared on any invoice." /></div>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Invoice No.</TableHead>
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Date</TableHead>
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Patient</TableHead>
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Qty</TableHead>
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Rate</TableHead>
                    <TableHead className="font-bold text-slate-500 h-auto py-3">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usages.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-[11px] font-bold text-slate-500">{u.invoiceNo}</TableCell>
                      <TableCell className="text-sm font-medium">{format(new Date(u.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-bold">{PATIENTS.find((p) => p.id === u.patientId)?.name ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{u.qty}</TableCell>
                      <TableCell className="font-medium text-slate-600">{formatCurrency(u.rate)}</TableCell>
                      <TableCell className="font-black">{formatCurrency(u.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4"><Button variant="ghost" className="rounded-xl font-bold h-11" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ServiceModal({ target, onClose }: { target: ServiceCatalogItem | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const svc = isNew ? null : target
  const [name, setName] = React.useState(svc?.name ?? "")
  const [nameLocal, setNameLocal] = React.useState(svc?.nameLocal ?? "")
  const [code, setCode] = React.useState(svc?.code ?? "")
  const [category, setCategory] = React.useState(svc?.category ?? SERVICE_CATEGORIES[0])
  const [rate, setRate] = React.useState(svc?.rate ?? 0)
  const [gstPct, setGstPct] = React.useState(svc?.gstPct ?? 0)
  const [discountPct, setDiscountPct] = React.useState(svc?.discountPct ?? 0)
  const [remarks, setRemarks] = React.useState(svc?.remarks ?? "")
  const [barcode, setBarcode] = React.useState(svc?.barcode ?? false)

  React.useEffect(() => {
    setName(svc?.name ?? ""); setNameLocal(svc?.nameLocal ?? ""); setCode(svc?.code ?? ""); setCategory(svc?.category ?? SERVICE_CATEGORIES[0]); setRate(svc?.rate ?? 0)
    setGstPct(svc?.gstPct ?? 0); setDiscountPct(svc?.discountPct ?? 0); setRemarks(svc?.remarks ?? ""); setBarcode(svc?.barcode ?? false)
  }, [target])

  const save = () => {
    if (!name || !code) return
    if (isNew) {
      SERVICE_CATALOG.push({ id: Math.max(0, ...SERVICE_CATALOG.map((s) => s.id)) + 1, code, name, nameLocal, category, rate, gstPct, discountPct, remarks, barcode, active: true })
      toast({ title: `${name} added to catalogue` })
    } else if (svc) {
      const idx = SERVICE_CATALOG.findIndex((s) => s.id === svc.id)
      if (idx >= 0) SERVICE_CATALOG[idx] = { ...SERVICE_CATALOG[idx], name, nameLocal, code, category, rate, gstPct, discountPct, remarks, barcode }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Service" : "Edit Service"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Code</Label><Input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Service Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Local Name (اردو)</Label><Input className={inputClass} dir="rtl" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rate (Rs.)</Label><Input className={inputClass} type="number" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">GST %</Label><Input className={inputClass} type="number" value={gstPct || ""} onChange={(e) => setGstPct(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Discount %</Label><Input className={inputClass} type="number" value={discountPct || ""} onChange={(e) => setDiscountPct(Number(e.target.value))} /></div>
          <div className="flex items-center gap-3 pt-6">
            <Checkbox checked={barcode} onCheckedChange={(v) => setBarcode(v === true)} id="svc-barcode" className="h-5 w-5 rounded-md" />
            <Label htmlFor="svc-barcode" className="cursor-pointer font-bold text-slate-700">Enable Barcode Generation</Label>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Textarea rows={2} className={cn(inputClass, "h-auto resize-none")} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save Service</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LabTestsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [modalTarget, setModalTarget] = React.useState<LabTest | "new" | null>(null)

  const rows = categoryFilter === "All" ? LAB_TESTS : LAB_TESTS.filter((t) => t.category === categoryFilter)

  return (
    <div className="space-y-4">
      <div className="rounded-[1.25rem] bg-indigo-50/50 p-4 border border-indigo-100 text-sm font-medium text-indigo-800">
        <p>Radiology and Cardiology tests here (e.g. X-Ray, Ultrasound, ECG) are the same catalogue used by the Imaging module — edit a test's fee once and it updates both Laboratory and Imaging order forms.</p>
      </div>
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={cn(selectClass, "w-full md:w-64")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {LAB_TEST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Test</Button>
      </div>

      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Code</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Test Name</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Category</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Fee</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Turnaround</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold font-mono text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                      {t.code}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{t.name}</TableCell>
                  <TableCell className="py-4"><StatusBadge status={t.category} /></TableCell>
                  <TableCell className="py-4 font-black text-slate-900">{formatCurrency(t.rate)}</TableCell>
                  <TableCell className="py-4 font-bold text-slate-500">{t.turnaroundHours}h</TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(t)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <LabTestModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function LabTestModal({ target, onClose }: { target: LabTest | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [code, setCode] = React.useState(item?.code ?? "")
  const [name, setName] = React.useState(item?.name ?? "")
  const [category, setCategory] = React.useState(item?.category ?? LAB_TEST_CATEGORIES[0])
  const [rate, setRate] = React.useState(item?.rate ?? 0)
  const [turnaroundHours, setTurnaroundHours] = React.useState(item?.turnaroundHours ?? 4)

  React.useEffect(() => {
    setCode(item?.code ?? ""); setName(item?.name ?? ""); setCategory(item?.category ?? LAB_TEST_CATEGORIES[0]);
    setRate(item?.rate ?? 0); setTurnaroundHours(item?.turnaroundHours ?? 4)
  }, [target])

  const save = () => {
    if (!name.trim() || !code.trim()) return
    if (isNew) {
      LAB_TESTS.push({ id: Math.max(0, ...LAB_TESTS.map((t) => t.id)) + 1, code, name, category, rate, unit: "-", normalRange: "-", turnaroundHours })
      toast({ title: `${name} added to catalogue` })
    } else if (item) {
      const idx = LAB_TESTS.findIndex((t) => t.id === item.id)
      if (idx >= 0) LAB_TESTS[idx] = { ...LAB_TESTS[idx], code, name, category, rate, turnaroundHours }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Lab/Imaging Test" : "Edit Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Code</Label><Input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LabTest["category"])}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{LAB_TEST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee (Rs.)</Label><Input className={inputClass} type="number" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Turnaround (hours)</Label><Input className={inputClass} type="number" value={turnaroundHours || ""} onChange={(e) => setTurnaroundHours(Number(e.target.value))} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save Test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BanksTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<BankAccount | "new" | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Bank Account</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Bank</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Account Title</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Account No.</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Branch</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Active</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BANKS.map((b) => (
                <TableRow key={b.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{b.bankName}</TableCell>
                  <TableCell className="py-4 font-semibold text-slate-700">{b.accountTitle}</TableCell>
                  <TableCell className="py-4"><span className="font-mono text-[11px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{b.accountNo}</span></TableCell>
                  <TableCell className="py-4 font-medium text-slate-500">{b.branch}</TableCell>
                  <TableCell className="py-4"><Switch checked={b.active} onCheckedChange={(v) => { b.active = v; forceUpdate() }} /></TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(b)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <BankModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function BankModal({ target, onClose }: { target: BankAccount | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [bankName, setBankName] = React.useState(item?.bankName ?? "")
  const [accountTitle, setAccountTitle] = React.useState(item?.accountTitle ?? "")
  const [accountNo, setAccountNo] = React.useState(item?.accountNo ?? "")
  const [branch, setBranch] = React.useState(item?.branch ?? "")

  React.useEffect(() => {
    setBankName(item?.bankName ?? ""); setAccountTitle(item?.accountTitle ?? ""); setAccountNo(item?.accountNo ?? ""); setBranch(item?.branch ?? "")
  }, [target])

  const save = () => {
    if (!bankName.trim() || !accountNo.trim()) return
    if (isNew) {
      BANKS.push({ id: Math.max(0, ...BANKS.map((b) => b.id)) + 1, bankName, accountTitle, accountNo, branch, active: true })
      toast({ title: `${bankName} added` })
    } else if (item) {
      const idx = BANKS.findIndex((b) => b.id === item.id)
      if (idx >= 0) BANKS[idx] = { ...BANKS[idx], bankName, accountTitle, accountNo, branch }
      toast({ title: `${bankName} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Bank Account" : "Edit Bank Account"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Bank Name</Label><Input className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Title</Label><Input className={inputClass} value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Account No.</Label><Input className={inputClass} value={accountNo} onChange={(e) => setAccountNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Branch</Label><Input className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PanelsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<Panel | "new" | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Panel</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Panel Name</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Type</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Contact</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Phone</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Commission%</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Active</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PANELS.map((p) => (
                <TableRow key={p.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{p.name}</TableCell>
                  <TableCell className="py-4 font-medium text-slate-600">{p.type}</TableCell>
                  <TableCell className="py-4 font-medium text-slate-700">{p.contactPerson}</TableCell>
                  <TableCell className="py-4 font-medium text-slate-500">{p.phone}</TableCell>
                  <TableCell className="py-4 font-bold text-emerald-600">{p.commissionPct}%</TableCell>
                  <TableCell className="py-4"><Switch checked={p.active} onCheckedChange={(v) => { p.active = v; forceUpdate() }} /></TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(p)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <PanelModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function PanelModal({ target, onClose }: { target: Panel | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const panel = isNew ? null : target
  const [name, setName] = React.useState(panel?.name ?? "")
  const [type, setType] = React.useState<PanelType>(panel?.type ?? "Insurance")
  const [contactPerson, setContactPerson] = React.useState(panel?.contactPerson ?? "")
  const [phone, setPhone] = React.useState(panel?.phone ?? "")
  const [commissionPct, setCommissionPct] = React.useState(panel?.commissionPct ?? 0)

  React.useEffect(() => {
    setName(panel?.name ?? ""); setType(panel?.type ?? "Insurance"); setContactPerson(panel?.contactPerson ?? "");
    setPhone(panel?.phone ?? ""); setCommissionPct(panel?.commissionPct ?? 0)
  }, [target])

  const save = () => {
    if (!name) return
    if (isNew) {
      PANELS.push({ id: Math.max(0, ...PANELS.map((p) => p.id)) + 1, name, type, contactPerson, phone, commissionPct, active: true })
      toast({ title: `${name} added` })
    } else if (panel) {
      const idx = PANELS.findIndex((p) => p.id === panel.id)
      if (idx >= 0) PANELS[idx] = { ...PANELS[idx], name, type, contactPerson, phone, commissionPct }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Panel" : "Edit Panel"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Panel Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Commission %</Label><Input className={inputClass} type="number" value={commissionPct || ""} onChange={(e) => setCommissionPct(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact Person</Label><Input className={inputClass} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save Panel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WardsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [expanded, setExpanded] = React.useState<number | null>(null)

  const cycleBedStatus = (wardId: number, bedNo: string) => {
    const ward = WARDS.find((w) => w.id === wardId)
    const bed = ward?.beds.find((b) => b.bedNo === bedNo)
    if (!bed) return
    const order = ["available", "occupied", "maintenance"] as const
    const next = order[(order.indexOf(bed.status) + 1) % order.length]
    bed.status = next
    if (next !== "occupied") bed.patientId = null
    forceUpdate()
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {WARDS.map((w) => {
        const occupied = w.beds.filter((b) => b.status === "occupied").length
        const pct = (occupied / w.beds.length) * 100
        return (
          <div key={w.id} className="rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#0D1B2E]">{w.name}</h3>
              <StatusBadge status={w.type} />
            </div>
            <p className="text-sm font-bold text-slate-500 mb-2">{occupied} of {w.beds.length} beds occupied</p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60">
              <div
                className={cn("h-full rounded-full transition-all duration-500", pct < 60 ? "bg-emerald-500" : pct < 90 ? "bg-amber-500" : "bg-red-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <Button variant="ghost" className="mt-4 w-full rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border-0 transition-colors" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
              {expanded === w.id ? "Hide beds overview" : "View beds overview"}
            </Button>
            {expanded === w.id && (
              <div className="mt-4 rounded-xl border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50/50"><TableHead className="font-bold text-slate-500 py-3 h-auto text-xs">Bed</TableHead><TableHead className="font-bold text-slate-500 py-3 h-auto text-xs">Status</TableHead><TableHead className="font-bold text-slate-500 py-3 h-auto text-xs">Since</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {w.beds.map((b) => (
                      <TableRow key={b.bedNo} className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0" onClick={() => cycleBedStatus(w.id, b.bedNo)}>
                        <TableCell className="font-mono text-[11px] font-bold text-slate-600">{b.bedNo}</TableCell>
                        <TableCell><StatusBadge status={b.status} /></TableCell>
                        <TableCell className="text-[11px] font-semibold text-slate-400">{b.since ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function GuardianRelationsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<GuardianRelationItem | "new" | null>(null)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end"><Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Relation</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
              <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Relation Name</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Remarks</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Active</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GUARDIAN_RELATIONS.map((r) => (
              <TableRow key={r.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{r.name}</TableCell>
                <TableCell className="py-4 font-medium text-slate-500">{r.remarks ?? "—"}</TableCell>
                <TableCell className="py-4"><Switch checked={r.active} onCheckedChange={(v) => { r.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(r)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <GuardianRelationModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function GuardianRelationModal({ target, onClose }: { target: GuardianRelationItem | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [name, setName] = React.useState(item?.name ?? "")
  const [remarks, setRemarks] = React.useState(item?.remarks ?? "")

  React.useEffect(() => { setName(item?.name ?? ""); setRemarks(item?.remarks ?? "") }, [target])

  const save = () => {
    if (!name.trim()) return
    if (isNew) {
      GUARDIAN_RELATIONS.push({ id: Math.max(0, ...GUARDIAN_RELATIONS.map((r) => r.id)) + 1, name: name.trim(), remarks, active: true })
      toast({ title: `${name} added` })
    } else if (item) {
      const idx = GUARDIAN_RELATIONS.findIndex((r) => r.id === item.id)
      if (idx >= 0) GUARDIAN_RELATIONS[idx] = { ...GUARDIAN_RELATIONS[idx], name: name.trim(), remarks }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Guardian Relation" : "Edit Guardian Relation"}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Relation Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EcgUltrasoundTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<EcgUltrasoundTest | "new" | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Test</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
              <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Test ID</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Name</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Fee</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Remarks</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 h-auto">Active</TableHead>
              <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ECG_ULTRASOUND_TESTS.map((t) => (
              <TableRow key={t.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                <TableCell className="px-6 py-4">
                  <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold font-mono text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                    {t.code}
                  </span>
                </TableCell>
                <TableCell className="py-4 font-bold text-[#0D1B2E]">{t.name}</TableCell>
                <TableCell className="py-4 font-black text-slate-900">{formatCurrency(t.fee)}</TableCell>
                <TableCell className="py-4 font-medium text-slate-500">{t.remarks ?? "—"}</TableCell>
                <TableCell className="py-4"><Switch checked={t.active} onCheckedChange={(v) => { t.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(t)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-xs font-bold text-slate-400">Master data only in this phase — direct ECG/Ultrasound invoicing is planned for a later release; these tests can be billed today as line items on a Services Invoice.</p>
      <EcgUltrasoundModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function EcgUltrasoundModal({ target, onClose }: { target: EcgUltrasoundTest | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [code, setCode] = React.useState(item?.code ?? "")
  const [name, setName] = React.useState(item?.name ?? "")
  const [fee, setFee] = React.useState(item?.fee ?? 0)
  const [remarks, setRemarks] = React.useState(item?.remarks ?? "")

  React.useEffect(() => {
    setCode(item?.code ?? ""); setName(item?.name ?? ""); setFee(item?.fee ?? 0); setRemarks(item?.remarks ?? "")
  }, [target])

  const save = () => {
    if (!name.trim() || !code.trim()) return
    if (isNew) {
      ECG_ULTRASOUND_TESTS.push({ id: Math.max(0, ...ECG_ULTRASOUND_TESTS.map((t) => t.id)) + 1, code, name, fee, remarks, active: true })
      toast({ title: `${name} added` })
    } else if (item) {
      const idx = ECG_ULTRASOUND_TESTS.findIndex((t) => t.id === item.id)
      if (idx >= 0) ECG_ULTRASOUND_TESTS[idx] = { ...ECG_ULTRASOUND_TESTS[idx], code, name, fee, remarks }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add ECG/Ultrasound Test" : "Edit Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Code</Label><Input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee (Rs.)</Label><Input className={inputClass} type="number" value={fee || ""} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DiseasesTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [search, setSearch] = React.useState("")
  const [modalTarget, setModalTarget] = React.useState<Disease | "new" | null>(null)

  const rows = search.trim()
    ? DISEASES.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.icdCode.toLowerCase().includes(search.toLowerCase()))
    : DISEASES

  return (
    <div className="space-y-4">
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or ICD code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>
        <Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Diagnosis</Button>
      </div>

      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">ICD Code</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Name</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Category</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold font-mono text-slate-600 ring-1 ring-inset ring-slate-200 whitespace-nowrap">
                      {d.icdCode}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{d.name}</TableCell>
                  <TableCell className="py-4 font-medium text-slate-600">{d.category}</TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(d)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <DiseaseModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function DiseaseModal({ target, onClose }: { target: Disease | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [icdCode, setIcdCode] = React.useState(item?.icdCode ?? "")
  const [name, setName] = React.useState(item?.name ?? "")
  const [category, setCategory] = React.useState(item?.category ?? DISEASE_CATEGORIES[0])

  React.useEffect(() => {
    setIcdCode(item?.icdCode ?? ""); setName(item?.name ?? ""); setCategory(item?.category ?? DISEASE_CATEGORIES[0])
  }, [target])

  const save = () => {
    if (!name.trim() || !icdCode.trim()) return
    if (isNew) {
      DISEASES.push({ id: Math.max(0, ...DISEASES.map((d) => d.id)) + 1, icdCode, name, category })
      toast({ title: `${name} added` })
    } else if (item) {
      const idx = DISEASES.findIndex((d) => d.id === item.id)
      if (idx >= 0) DISEASES[idx] = { ...DISEASES[idx], icdCode, name, category }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Diagnosis" : "Edit Diagnosis"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">ICD Code</Label><Input className={inputClass} value={icdCode} onChange={(e) => setIcdCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{DISEASE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Name</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExpenseCategoriesTab() {
  const [categories, setCategories] = React.useState<string[]>(EXPENSE_CATEGORIES)
  const [editing, setEditing] = React.useState<number | null>(null)
  const [editValue, setEditValue] = React.useState("")
  const [newValue, setNewValue] = React.useState("")

  return (
    <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 max-w-md">
      <h3 className="text-lg font-black text-[#0D1B2E] mb-6">Expense Categories</h3>
      <div className="space-y-2 mb-6">
        {categories.map((c, i) => (
          <div key={c + i} className="flex items-center justify-between rounded-xl p-3 bg-slate-50 ring-1 ring-slate-100 group">
            {editing === i ? (
              <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-9 rounded-lg" autoFocus />
            ) : (
              <span className="text-sm font-bold text-slate-700">{c}</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {editing === i ? (
                <Button size="sm" className="h-8 rounded-lg bg-[#0F2A4D]" onClick={() => { setCategories((cs) => cs.map((x, idx) => idx === i ? editValue : x)); setEditing(null) }}>Save</Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setEditing(i); setEditValue(c) }}><Pencil className="h-3.5 w-3.5 text-slate-400" /></Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 hover:text-red-600" onClick={() => setCategories((cs) => cs.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="New category name..." className={inputClass} value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <Button className={primaryBtnClass} onClick={() => { if (newValue.trim()) { setCategories((cs) => [...cs, newValue.trim()]); setNewValue("") } }}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

function ClinicSettingsTab() {
  const { toast } = useToast()
  const [settings, setSettings] = React.useState(CLINIC_SETTINGS)

  return (
    <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-8 max-w-3xl">
      <h3 className="text-xl font-black text-[#0D1B2E] mb-6 pb-4 border-b border-slate-100">Clinic Settings</h3>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinic Name (English)</Label><Input className={inputClass} value={settings.nameEn} onChange={(e) => setSettings((s) => ({ ...s, nameEn: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinic Name (Urdu)</Label><Input className={inputClass} dir="rtl" value={settings.nameUr} onChange={(e) => setSettings((s) => ({ ...s, nameUr: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Address</Label><Input className={inputClass} value={settings.address} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input className={inputClass} value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</Label><Input className={inputClass} value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tagline</Label><Input className={inputClass} value={settings.tagline} onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))} /></div>
          
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Logo</Label>
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-[#1CC0CE] hover:text-[#0891B2] transition-colors cursor-pointer">
              <Plus className="h-6 w-6" />
            </div>
          </div>
          
          <div className="space-y-1.5 sm:col-span-2 pt-4 border-t border-slate-100"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Print Header</Label><Input className={inputClass} value={settings.printHeader} onChange={(e) => setSettings((s) => ({ ...s, printHeader: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Currency Symbol</Label>
            <Input className={cn(inputClass, "bg-slate-100 font-bold text-slate-500")} readOnly value={settings.currencySymbol} />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact support to change</p>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Default City</Label><Input className={inputClass} value={settings.defaultCity} onChange={(e) => setSettings((s) => ({ ...s, defaultCity: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Timezone</Label><Input className={cn(inputClass, "bg-slate-100 font-bold text-slate-500")} readOnly value={settings.timezone} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Financial Year Start</Label>
            <Select value={settings.fiscalYearStart} onValueChange={(v) => setSettings((s) => ({ ...s, fiscalYearStart: v }))}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {["January", "April", "July", "October"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="pt-6 border-t border-slate-100">
          <Button className={cn(primaryBtnClass, "w-full md:w-auto h-12")} onClick={() => toast({ title: "Settings saved successfully" })}>Save Settings</Button>
        </div>
      </div>
    </div>
  )
}
