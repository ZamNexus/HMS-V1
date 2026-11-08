"use client"
import * as React from "react"
import { AlertTriangle, Pencil, Plus, Trash2, History, Search } from "lucide-react"

import { LAB_TEST_CATEGORIES } from "@/lib/labels"
import { demo } from "@hms/demo"
import {
  CROSS_MODULE_OPERATION_LABELS, FINANCE_OPERATION_LABELS, bankAccountsService, crossModuleContractStatus, dataSource, ecgUltrasoundTestsService, errorSummary, expenseCategoriesService,
  financeContractStatus, isNotConnectedError, itemHistoryService, labTestsService, serviceCatalogService, serviceUsageService, viewState,
  type BankAccountRecord, type EcgUltrasoundTestRecord, type LabTestRecord, type ServiceCatalogRecord,
} from "@/lib/services"
import { listAll } from "@/lib/services/reference/listAll"
import { useBankAccounts, useExpenseCategories } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import { Skeleton } from "@/components/ui/skeleton"
import { ContractPending } from "@/components/shared/ContractPending"
import { BankAccountsTab } from "@/components/masterdata/BankAccountsTab"
import { ClinicSettingsTab } from "@/components/masterdata/ClinicSettingsTab"
import { ExpenseCategoriesTab } from "@/components/masterdata/ExpenseCategoriesTab"
import { GuardianRelationsTab } from "@/components/masterdata/GuardianRelationsTab"
import { IcdCodesTab } from "@/components/masterdata/IcdCodesTab"
import { ImagingTestsTab } from "@/components/masterdata/ImagingTestsTab"
import { LabTestsTab } from "@/components/masterdata/LabTestsTab"
import { PanelsTab } from "@/components/masterdata/PanelsTab"
import { ServicesTab } from "@/components/masterdata/ServicesTab"
import { WardsTab } from "@/components/masterdata/WardsTab"
import { MockModeOnly } from "@/components/shared/MockModeOnly"
import { ItemHistoryView, ServiceUsageView } from "@/components/shared/ItemHistoryView"
import type { Disease, LabTestCategory } from "@/types"
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
import { failedChecks, validationToast } from "@/lib/validation"
import { useAccess } from "@/lib/session/useAccess"

// Panels, Guardian Relations, Clinic Settings, the Services Catalog, the Lab Tests, the Imaging Tests, the Wards and the (read-only) ICD-10 list are connected (src/components/masterdata). Nothing in this file is left without a connected service except the finance tabs: they
// still read and mutate the shared demo arrays directly. They are therefore wrapped in <MockModeOnly> — real demo behaviour in mock mode, an explicit
// contract-pending notice (children never mounted) in API mode, so demo records are never shown or "saved" as if they were real.
// Banks and Expense Categories (T7 / T6): in API mode an operation is offered only when its endpoint is configured.
const financeContract = financeContractStatus(dataSource)
// Services Catalog and its Item History (T12): in API mode each operation is offered only when its endpoint is confirmed.
const catalogContract = crossModuleContractStatus(dataSource)

const SERVICE_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]
const DISEASE_CATEGORIES = ["Respiratory", "Endocrine", "Cardiovascular", "Gastrointestinal", "Infectious", "Haematology", "Neurology", "Musculoskeletal", "Psychiatric", "Genitourinary", "Dermatology", "Other"]

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all font-semibold"
const primaryBtnClass = "rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0 shrink-0"

export default function MasterDataPage() {
  const { can } = useAccess()
  // Clinic Settings (and the department switches in it) need settings.write; the demo data has no such permission, so mock mode always shows it.
  const showClinicSettings = dataSource !== "api" || can("settings.write")
  // Bank accounts are read with accounts.read (handoff 8.2: account numbers are for money handlers only), not catalogs.read: hide the tab from everyone else
  const showBanks = dataSource !== "api" || can("accounts.read")
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
          <TabsTrigger value="labtests" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">{dataSource === "api" ? "Lab Tests" : "Lab & Imaging Tests"}</TabsTrigger>
          <TabsTrigger value="panels" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Panels &amp; Insurance</TabsTrigger>
          <TabsTrigger value="wards" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Wards &amp; Beds</TabsTrigger>
          <TabsTrigger value="guardian" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Guardian Relations</TabsTrigger>
          <TabsTrigger value="ecg" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">{dataSource === "api" ? "Imaging Tests" : "ECG/Ultrasound"}</TabsTrigger>
          <TabsTrigger value="diseases" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Diseases/Diagnosis</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Expense Categories</TabsTrigger>
          {showBanks && <TabsTrigger value="banks" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Banks</TabsTrigger>}
          {showClinicSettings && <TabsTrigger value="clinic" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0891B2] data-[state=active]:shadow-sm px-4 py-2.5 text-sm font-bold text-slate-500 transition-all whitespace-nowrap">Clinic Settings</TabsTrigger>}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="services" className="mt-0 outline-none">
            {dataSource === "api" ? <ServicesTab /> : <MockServicesTab />}
          </TabsContent>
          <TabsContent value="labtests" className="mt-0 outline-none">
            {dataSource === "api" ? <LabTestsTab /> : <MockLabTestsTab />}
          </TabsContent>
          <TabsContent value="panels" className="mt-0 outline-none">
            <PanelsTab />
          </TabsContent>
          <TabsContent value="wards" className="mt-0 outline-none">
            {dataSource === "api" ? <WardsTab /> : <MockWardsTab />}
          </TabsContent>
          <TabsContent value="guardian" className="mt-0 outline-none">
            <GuardianRelationsTab />
          </TabsContent>
          <TabsContent value="ecg" className="mt-0 outline-none">
            {dataSource === "api" ? <ImagingTestsTab /> : <MockEcgUltrasoundTab />}
          </TabsContent>
          <TabsContent value="diseases" className="mt-0 outline-none">
            {dataSource === "api" ? <IcdCodesTab /> : <DiseasesTab />}
          </TabsContent>
          <TabsContent value="expenses" className="mt-0 outline-none">
            {dataSource === "api" ? <ExpenseCategoriesTab /> : <MockExpenseCategoriesTab />}
          </TabsContent>
          {showBanks && (
            <TabsContent value="banks" className="mt-0 outline-none">
              {dataSource === "api" ? <BankAccountsTab /> : <MockBanksTab />}
            </TabsContent>
          )}
          {showClinicSettings && (
            <TabsContent value="clinic" className="mt-0 outline-none">
              {dataSource === "api" ? <ClinicSettingsTab /> : <MockClinicSettingsTab />}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}

// Demo-only (mock mode): the in-memory catalogue with Item History. API mode uses src/components/masterdata/ServicesTab.tsx.
function MockServicesTab() {
  const { toast } = useToast()
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [modalTarget, setModalTarget] = React.useState<ServiceCatalogRecord | "new" | null>(null)
  const [historyTarget, setHistoryTarget] = React.useState<ServiceCatalogRecord | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const loadServices = React.useCallback(
    (signal: AbortSignal) => listAll((o) => serviceCatalogService.list({ ...o, category: categoryFilter === "All" ? undefined : categoryFilter }), { signal }),
    [categoryFilter]
  )
  const { data, error, loading, reload } = useResource(loadServices)
  const rows = data?.items ?? []
  const pending = isNotConnectedError(error)
  const view = viewState({ data, error, loading, rowCount: rows.length })

  // The Active switch is "deactivate" in the Task List's words; it goes through the same update operation as Edit.
  const setActive = async (s: ServiceCatalogRecord, active: boolean) => {
    const { id, ...rest } = s
    setBusyId(id)
    try {
      await serviceCatalogService.update(id, { ...rest, active })
      reload()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update the service", description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {catalogContract.pending && (
        <div data-testid="services-catalog-banner" role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-500/30">
          <p className="font-bold">The services catalogue is not connected to the backend.</p>
          <p className="mt-1">
            No catalogue contract has been provided to the frontend (awaiting: {catalogContract.missing.filter((op) => op.startsWith("serviceCatalog.") || op === "itemHistory.list").map((op) => CROSS_MODULE_OPERATION_LABELS[op]).join("; ")}).
            No request is sent and no demo service is shown; adding, editing, deactivating and Item History stay disabled until the matching contract is confirmed.
          </p>
        </div>
      )}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={cn(selectClass, "w-full md:w-64")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className={primaryBtnClass} disabled={!catalogContract.can("serviceCatalog.create")} title={catalogContract.can("serviceCatalog.create") ? undefined : "Not connected: the add-service contract has not been provided"} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Service</Button>
      </div>

      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {pending ? (
          <div className="p-6"><ContractPending title="The services catalogue is unavailable" awaiting={[CROSS_MODULE_OPERATION_LABELS["serviceCatalog.list"]]} testId="services-catalog-pending" noun="catalogue" /></div>
        ) : view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState icon={AlertTriangle} title="Couldn't load the services catalogue" subtitle={errorSummary(error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>} />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading services">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10"><EmptyState icon={Search} title="No services found" subtitle={categoryFilter === "All" ? "The catalogue has no services yet." : "No services in this category."} /></div>
        ) : (
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
                    <Switch aria-label={`${s.name} active`} checked={s.active} disabled={busyId === s.id || !catalogContract.can("serviceCatalog.update")} onCheckedChange={(v) => setActive(s, v)} />
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button aria-label={`Item History for ${s.name}`} variant="ghost" size="icon" disabled={!catalogContract.can("itemHistory.list")} className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" title={catalogContract.can("itemHistory.list") ? "Item History" : "Item History is not connected: the audit-log contract has not been provided"} onClick={() => setHistoryTarget(s)}><History className="h-4 w-4" /></Button>
                      <Button aria-label={`Edit ${s.name}`} variant="ghost" size="icon" disabled={!catalogContract.can("serviceCatalog.update")} className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(s)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </div>
      <ServiceModal target={modalTarget} onClose={(saved) => { setModalTarget(null); if (saved) reload() }} />
      <ServiceHistoryDialog target={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  )
}

/**
 * Item History (T12) is the AUDIT LOG: backend events describing changes to the item, read by entity type and ID. The Task List restricts it
 * to admins; that restriction must be enforced by the backend — this button being shown or hidden is not access control, and the frontend
 * infers nothing from a role name. In API mode the audit view is CONTRACT REQUIRED and says so (never "no history"); in mock mode it says the
 * demo keeps no audit log. The old invoice-line list is NOT audit history: it lives on its own clearly labelled "Invoice usage (demo)" tab,
 * offered in mock mode only.
 */
function ServiceHistoryDialog({ target, onClose }: { target: ServiceCatalogRecord | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">Item History — {target?.name}</DialogTitle></DialogHeader>
        {target && <ServiceHistoryBody key={target.id} target={target} />}
        <DialogFooter className="mt-4"><Button variant="ghost" className="rounded-xl font-bold h-11" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ServiceHistoryBody({ target }: { target: ServiceCatalogRecord }) {
  return (
    <Tabs defaultValue="audit" className="pt-2">
      <TabsList aria-label="History views">
        <TabsTrigger value="audit">Audit history</TabsTrigger>
        {dataSource === "mock" && <TabsTrigger value="usage">Invoice usage (demo)</TabsTrigger>}
      </TabsList>
      <TabsContent value="audit" className="mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar"><AuditHistoryPanel target={target} /></TabsContent>
      {dataSource === "mock" && <TabsContent value="usage" className="mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar"><ServiceUsagePanel target={target} /></TabsContent>}
    </Tabs>
  )
}

function AuditHistoryPanel({ target }: { target: ServiceCatalogRecord }) {
  const load = React.useCallback(
    (signal: AbortSignal) => itemHistoryService.list({ subject: "serviceCatalogItem", id: target.id, signal }),
    [target.id]
  )
  const { data, error, loading, reload } = useResource(load)
  return <ItemHistoryView source={dataSource} state={{ entries: data?.items ?? null, error, loading, onRetry: reload }} />
}

function ServiceUsagePanel({ target }: { target: ServiceCatalogRecord }) {
  const load = React.useCallback(
    (signal: AbortSignal) => serviceUsageService.list({ id: target.id, signal }),
    [target.id]
  )
  const { data, error, loading, reload } = useResource(load)
  return <ServiceUsageView state={{ entries: data?.items ?? null, error, loading, onRetry: reload }} />
}

function ServiceModal({ target, onClose }: { target: ServiceCatalogRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
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
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setName(svc?.name ?? ""); setNameLocal(svc?.nameLocal ?? ""); setCode(svc?.code ?? ""); setCategory(svc?.category ?? SERVICE_CATEGORIES[0]); setRate(svc?.rate ?? 0)
    setGstPct(svc?.gstPct ?? 0); setDiscountPct(svc?.discountPct ?? 0); setRemarks(svc?.remarks ?? ""); setBarcode(svc?.barcode ?? false)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const problems = failedChecks([[code, "Code is required"], [name, "Service Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      if (isNew) {
        await serviceCatalogService.create({ code, name, nameLocal, category, rate, gstPct, discountPct, remarks, barcode, active: true })
        toast({ title: `${name} added to catalogue` })
      } else if (svc) {
        await serviceCatalogService.update(svc.id, { code, name, nameLocal, category, rate, gstPct, discountPct, remarks, barcode, active: svc.active })
        toast({ title: `${name} updated` })
      }
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save the service", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Service" : "Edit Service"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-code`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Code *</Label><Input id={`${uid}-code`} className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-service-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Service Name *</Label><Input id={`${uid}-service-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-local-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Local Name (اردو)</Label><Input id={`${uid}-local-name`} className={inputClass} dir="rtl" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-rate-rs`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Rate (Rs.)</Label><Input id={`${uid}-rate-rs`} className={inputClass} type="number" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-gst`} className="text-xs font-bold uppercase tracking-wider text-slate-500">GST %</Label><Input id={`${uid}-gst`} className={inputClass} type="number" value={gstPct || ""} onChange={(e) => setGstPct(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-discount`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Discount %</Label><Input id={`${uid}-discount`} className={inputClass} type="number" value={discountPct || ""} onChange={(e) => setDiscountPct(Number(e.target.value))} /></div>
          <div className="flex items-center gap-3 pt-6">
            <Checkbox checked={barcode} onCheckedChange={(v) => setBarcode(v === true)} id="svc-barcode" className="h-5 w-5 rounded-md" />
            <Label htmlFor="svc-barcode" className="cursor-pointer font-bold text-slate-700">Enable Barcode Generation</Label>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-remarks`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Textarea id={`${uid}-remarks`} rows={2} className={cn(inputClass, "h-auto resize-none")} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => onClose()}>Cancel</Button>
          <Button className={primaryBtnClass} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Service"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Demo-only (mock mode): the shared lab + imaging demo catalogue. API mode uses src/components/masterdata/LabTestsTab.tsx.
function MockLabTestsTab() {
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [modalTarget, setModalTarget] = React.useState<LabTestRecord | "new" | null>(null)
  const loadTests = React.useCallback(
    () => listAll((o) => labTestsService.list({ ...o, category: categoryFilter === "All" ? undefined : (categoryFilter as LabTestCategory) })),
    [categoryFilter]
  )
  const { data, error, loading, reload } = useResource(loadTests)
  const rows = data?.items ?? []
  const view = viewState({ data, error, loading, rowCount: rows.length })

  return (
    <div className="space-y-4">
      <div className="rounded-[1.25rem] bg-indigo-50/50 p-4 border border-indigo-100 text-sm font-medium text-indigo-800">
        <p>Radiology and Cardiology tests here (e.g. X-Ray, Ultrasound, ECG) are the same catalogue used by the Imaging module — edit a test&apos;s fee once and it updates both Laboratory and Imaging order forms.</p>
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
        {view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState icon={AlertTriangle} title="Couldn't load lab tests" subtitle={errorSummary(error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>} />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading lab tests">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10"><EmptyState icon={Search} title="No tests found" subtitle={categoryFilter === "All" ? "The catalogue has no lab tests yet." : "No tests in this category."} /></div>
        ) : (
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
                    <Button aria-label={`Edit ${t.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(t)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </div>
      <LabTestModal target={modalTarget} onClose={(saved) => { setModalTarget(null); if (saved) reload() }} />
    </div>
  )
}

function LabTestModal({ target, onClose }: { target: LabTestRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const problems = failedChecks([[code.trim(), "Code is required"], [name.trim(), "Test Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const input = { code, name, category, rate, turnaroundHours }
      if (isNew) {
        await labTestsService.create(input)
        toast({ title: `${name} added to catalogue` })
      } else if (item) {
        await labTestsService.update(item.id, input)
        toast({ title: `${name} updated` })
      }
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save the test", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Lab/Imaging Test" : "Edit Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-code`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Code *</Label><Input id={`${uid}-code`} className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LabTestCategory)}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{LAB_TEST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-test-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Name *</Label><Input id={`${uid}-test-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-fee-rs`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee (Rs.)</Label><Input id={`${uid}-fee-rs`} className={inputClass} type="number" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-turnaround-hours`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Turnaround (hours)</Label><Input id={`${uid}-turnaround-hours`} className={inputClass} type="number" value={turnaroundHours || ""} onChange={(e) => setTurnaroundHours(Number(e.target.value))} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => onClose()}>Cancel</Button>
          <Button disabled={saving} className={primaryBtnClass} onClick={save}>Save Test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Demo-only (mock mode). API mode uses src/components/masterdata/BankAccountsTab.tsx.
function MockBanksTab() {
  const { toast } = useToast()
  const accounts = useBankAccounts(financeContract.can("bankAccounts.list"))
  const [modalTarget, setModalTarget] = React.useState<BankAccountRecord | "new" | null>(null)
  const listPending = !financeContract.can("bankAccounts.list")
  const view = viewState({ data: accounts.items.length > 0 ? accounts.items : null, error: accounts.error, loading: accounts.loading, rowCount: accounts.items.length })

  const toggleActive = async (b: BankAccountRecord, active: boolean) => {
    try {
      await bankAccountsService.update(b.id, { bankName: b.bankName, accountTitle: b.accountTitle, accountNo: b.accountNo, branch: b.branch, active })
      accounts.reload()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update the bank account", description: errorSummary(err) })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className={primaryBtnClass} disabled={!financeContract.can("bankAccounts.create")} title={financeContract.can("bankAccounts.create") ? undefined : "Awaiting the backend API contract"} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Bank Account</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {listPending ? (
          <div className="p-6"><ContractPending title="Bank accounts are unavailable" awaiting={[FINANCE_OPERATION_LABELS["bankAccounts.list"]]} testId="masterdata-banks-pending" /></div>
        ) : view === "error" ? (
          <div className="p-10" role="alert"><EmptyState icon={AlertTriangle} title="Couldn't load bank accounts" subtitle={errorSummary(accounts.error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={accounts.reload}>Try again</Button>} /></div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading bank accounts">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : view === "empty" ? (
          <EmptyState icon={AlertTriangle} title="No bank accounts" subtitle="No bank accounts have been added yet." />
        ) : (
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
              {accounts.items.map((b) => (
                <TableRow key={b.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{b.bankName}</TableCell>
                  <TableCell className="py-4 font-semibold text-slate-700">{b.accountTitle}</TableCell>
                  <TableCell className="py-4"><span className="font-mono text-[11px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{b.accountNo}</span></TableCell>
                  <TableCell className="py-4 font-medium text-slate-500">{b.branch}</TableCell>
                  <TableCell className="py-4"><Switch aria-label={`Active: ${b.bankName}`} checked={b.active} disabled={!financeContract.can("bankAccounts.update")} onCheckedChange={(v) => { void toggleActive(b, v) }} /></TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <Button aria-label={`Edit ${b.bankName}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" disabled={!financeContract.can("bankAccounts.update")} onClick={() => setModalTarget(b)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </div>
      <BankModal target={modalTarget} onClose={(saved) => { setModalTarget(null); if (saved) accounts.reload() }} />
    </div>
  )
}

function BankModal({ target, onClose }: { target: BankAccountRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [bankName, setBankName] = React.useState(item?.bankName ?? "")
  const [accountTitle, setAccountTitle] = React.useState(item?.accountTitle ?? "")
  const [accountNo, setAccountNo] = React.useState(item?.accountNo ?? "")
  const [branch, setBranch] = React.useState(item?.branch ?? "")
  const [saving, setSaving] = React.useState(false)
  const canSave = financeContract.can(isNew ? "bankAccounts.create" : "bankAccounts.update")

  // Reload the fields whenever the dialog is pointed at a different account (derived during render rather than in an effect).
  const [seenTarget, setSeenTarget] = React.useState(target)
  if (seenTarget !== target) {
    setSeenTarget(target)
    setBankName(item?.bankName ?? ""); setAccountTitle(item?.accountTitle ?? ""); setAccountNo(item?.accountNo ?? ""); setBranch(item?.branch ?? "")
  }

  const save = async () => {
    if (!canSave) return
    const problems = failedChecks([[bankName.trim(), "Bank Name is required"], [accountNo.trim(), "Account No. is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      if (isNew) {
        await bankAccountsService.create({ bankName, accountTitle, accountNo, branch })
        toast({ title: `${bankName} added` })
      } else if (item) {
        await bankAccountsService.update(item.id, { bankName, accountTitle, accountNo, branch })
        toast({ title: `${bankName} updated` })
      }
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: isNew ? "Could not add the bank account" : "Could not update the bank account", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Bank Account" : "Edit Bank Account"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-bank-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Bank Name *</Label><Input id={`${uid}-bank-name`} className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-account-title`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Title</Label><Input id={`${uid}-account-title`} className={inputClass} value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-account-no`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Account No. *</Label><Input id={`${uid}-account-no`} className={inputClass} value={accountNo} onChange={(e) => setAccountNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-branch`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Branch</Label><Input id={`${uid}-branch`} className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => onClose()}>Cancel</Button>
          <Button className={primaryBtnClass} disabled={saving || !canSave} title={canSave ? undefined : "Awaiting the backend API contract"} onClick={save}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Demo-only (mock mode): wards from the demo arrays, bed status cycled by clicking. API mode uses src/components/masterdata/WardsTab.tsx.
function MockWardsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [expanded, setExpanded] = React.useState<number | null>(null)

  const cycleBedStatus = (wardId: number, bedNo: string) => {
    const ward = demo.data.WARDS.find((w) => w.id === wardId)
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
      {demo.data.WARDS.map((w) => {
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
                      <TableRow
                        key={b.bedNo}
                        className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0 focus-visible:outline-none focus-visible:bg-slate-100"
                        onClick={() => cycleBedStatus(w.id, b.bedNo)}
                        tabIndex={0}
                        aria-label={`Bed ${b.bedNo}: ${b.status}. Press Enter to change status`}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleBedStatus(w.id, b.bedNo) } }}
                      >
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

// Demo-only (mock mode): the ECG / ultrasound demo catalogue. API mode uses src/components/masterdata/ImagingTestsTab.tsx.
function MockEcgUltrasoundTab() {
  const { toast } = useToast()
  const [modalTarget, setModalTarget] = React.useState<EcgUltrasoundTestRecord | "new" | null>(null)
  const loadTests = React.useCallback(() => listAll((o) => ecgUltrasoundTestsService.list(o)), [])
  const { data, error, loading, reload } = useResource(loadTests)
  const rows = data?.items ?? []
  const view = viewState({ data, error, loading, rowCount: rows.length })

  const toggleActive = async (t: EcgUltrasoundTestRecord, active: boolean) => {
    try {
      await ecgUltrasoundTestsService.update(t.id, { code: t.code, name: t.name, fee: t.fee, remarks: t.remarks, active })
      reload()
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${active ? "activate" : "deactivate"} ${t.name}`, description: errorSummary(err) })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className={primaryBtnClass} onClick={() => setModalTarget("new")}><Plus className="h-5 w-5 mr-2" /> Add Test</Button></div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState icon={AlertTriangle} title="Couldn't load ECG/Ultrasound tests" subtitle={errorSummary(error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>} />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading ECG/Ultrasound tests">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10"><EmptyState icon={Search} title="No ECG/Ultrasound tests" subtitle="None have been added yet." /></div>
        ) : (
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
            {rows.map((t) => (
              <TableRow key={t.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                <TableCell className="px-6 py-4">
                  <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold font-mono text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                    {t.code}
                  </span>
                </TableCell>
                <TableCell className="py-4 font-bold text-[#0D1B2E]">{t.name}</TableCell>
                <TableCell className="py-4 font-black text-slate-900">{formatCurrency(t.fee)}</TableCell>
                <TableCell className="py-4 font-medium text-slate-500">{t.remarks ?? "—"}</TableCell>
                <TableCell className="py-4"><Switch checked={t.active} onCheckedChange={(v) => toggleActive(t, v)} /></TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <Button aria-label={`Edit ${t.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(t)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </div>
      <p className="mt-4 text-xs font-bold text-slate-400">Master data only in this phase — direct ECG/Ultrasound invoicing is planned for a later release; these tests can be billed today as line items on a Services Invoice.</p>
      <EcgUltrasoundModal target={modalTarget} onClose={(saved) => { setModalTarget(null); if (saved) reload() }} />
    </div>
  )
}

function EcgUltrasoundModal({ target, onClose }: { target: EcgUltrasoundTestRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const isNew = target === "new"
  const item = isNew ? null : target
  const [code, setCode] = React.useState(item?.code ?? "")
  const [name, setName] = React.useState(item?.name ?? "")
  const [fee, setFee] = React.useState(item?.fee ?? 0)
  const [remarks, setRemarks] = React.useState(item?.remarks ?? "")

  React.useEffect(() => {
    setCode(item?.code ?? ""); setName(item?.name ?? ""); setFee(item?.fee ?? 0); setRemarks(item?.remarks ?? "")
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const problems = failedChecks([[code.trim(), "Test Code is required"], [name.trim(), "Test Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      if (isNew) {
        await ecgUltrasoundTestsService.create({ code, name, fee, remarks, active: true })
        toast({ title: `${name} added` })
      } else if (item) {
        await ecgUltrasoundTestsService.update(item.id, { code, name, fee, remarks, active: item.active })
        toast({ title: `${name} updated` })
      }
      onClose(true)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save the test", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add ECG/Ultrasound Test" : "Edit Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-test-code`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Code *</Label><Input id={`${uid}-test-code`} className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-fee-rs`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee (Rs.)</Label><Input id={`${uid}-fee-rs`} className={inputClass} type="number" value={fee || ""} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-test-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Name *</Label><Input id={`${uid}-test-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-remarks`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Input id={`${uid}-remarks`} className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => onClose()}>Cancel</Button>
          <Button disabled={saving} className={primaryBtnClass} onClick={save}>Save</Button>
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
    ? demo.data.DISEASES.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.icdCode.toLowerCase().includes(search.toLowerCase()))
    : demo.data.DISEASES

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
                    <Button aria-label={`Edit ${d.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(d)}><Pencil className="h-4 w-4" /></Button>
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
  const uid = React.useId()
  const { toast } = useToast()
  const isNew = target === "new"
  const item = isNew ? null : target
  const [icdCode, setIcdCode] = React.useState(item?.icdCode ?? "")
  const [name, setName] = React.useState(item?.name ?? "")
  const [category, setCategory] = React.useState(item?.category ?? DISEASE_CATEGORIES[0])

  React.useEffect(() => {
    setIcdCode(item?.icdCode ?? ""); setName(item?.name ?? ""); setCategory(item?.category ?? DISEASE_CATEGORIES[0])
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const problems = failedChecks([[icdCode.trim(), "ICD Code is required"], [name.trim(), "Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    if (isNew) {
      demo.data.DISEASES.push({ id: Math.max(0, ...demo.data.DISEASES.map((d) => d.id)) + 1, icdCode, name, category })
      toast({ title: `${name} added` })
    } else if (item) {
      const idx = demo.data.DISEASES.findIndex((d) => d.id === item.id)
      if (idx >= 0) demo.data.DISEASES[idx] = { ...demo.data.DISEASES[idx], icdCode, name, category }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-[1.5rem]">
        <DialogHeader><DialogTitle className="text-xl">{isNew ? "Add Diagnosis" : "Edit Diagnosis"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-icd-code`} className="text-xs font-bold uppercase tracking-wider text-slate-500">ICD Code *</Label><Input id={`${uid}-icd-code`} className={inputClass} value={icdCode} onChange={(e) => setIcdCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{DISEASE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Name *</Label><Input id={`${uid}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Demo-only (mock mode). API mode uses src/components/masterdata/ExpenseCategoriesTab.tsx.
function MockExpenseCategoriesTab() {
  const { toast } = useToast()
  const heads = useExpenseCategories(financeContract.can("expenseCategories.list"))
  const [editing, setEditing] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")
  const [newValue, setNewValue] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const listPending = !financeContract.can("expenseCategories.list")
  const view = viewState({ data: heads.items.length > 0 ? heads.items : null, error: heads.error, loading: heads.loading, rowCount: heads.items.length })
  const hint = (op: "expenseCategories.create" | "expenseCategories.update" | "expenseCategories.remove") => (financeContract.can(op) ? undefined : "Awaiting the backend API contract")

  // Runs one head operation; a failure is shown (with the backend's request id when there is one), never swallowed.
  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    try {
      await action()
      heads.reload()
      return true
    } catch (err) {
      toast({ variant: "destructive", title: failure, description: errorSummary(err) })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 max-w-md">
      <h3 className="text-lg font-black text-[#0D1B2E] mb-6">Expense Categories</h3>
      {listPending ? (
        <div className="mb-6"><ContractPending title="Expense categories are unavailable" awaiting={[FINANCE_OPERATION_LABELS["expenseCategories.list"]]} testId="masterdata-expense-categories-pending" /></div>
      ) : view === "error" ? (
        <div className="mb-6" role="alert"><EmptyState icon={AlertTriangle} title="Couldn't load expense categories" subtitle={errorSummary(heads.error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={heads.reload}>Try again</Button>} /></div>
      ) : view === "loading" ? (
        <div className="space-y-2 mb-6" role="status" aria-label="Loading expense categories">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : (
      <div className="space-y-2 mb-6">
        {view === "empty" && <p className="text-sm text-slate-500">No expense categories yet.</p>}
        {heads.items.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl p-3 bg-slate-50 ring-1 ring-slate-100 group">
            {editing === c.id ? (
              <Input aria-label={`New name for ${c.name}`} value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-9 rounded-lg" autoFocus />
            ) : (
              <span className="text-sm font-bold text-slate-700">{c.name}</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {editing === c.id ? (
                <Button size="sm" className="h-8 rounded-lg bg-[#0F2A4D]" disabled={busy || !editValue.trim()} onClick={async () => { if (await run(() => expenseCategoriesService.update(c.id, { name: editValue }), "Could not rename the category")) setEditing(null) }}>Save</Button>
              ) : (
                <Button aria-label={`Edit ${c.name}`} variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={!financeContract.can("expenseCategories.update")} title={hint("expenseCategories.update")} onClick={() => { setEditing(c.id); setEditValue(c.name) }}><Pencil className="h-3.5 w-3.5 text-slate-400" /></Button>
              )}
              <Button aria-label={`Delete ${c.name}`} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 hover:text-red-600" disabled={busy || !financeContract.can("expenseCategories.remove")} title={hint("expenseCategories.remove")} onClick={() => { void run(() => expenseCategoriesService.remove(c.id), "Could not delete the category") }}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
            </div>
          </div>
        ))}
      </div>
      )}
      <div className="flex gap-2">
        <Input placeholder="New category name..." className={inputClass} value={newValue} disabled={!financeContract.can("expenseCategories.create")} onChange={(e) => setNewValue(e.target.value)} />
        <Button aria-label="Add category" className={primaryBtnClass} disabled={busy || !financeContract.can("expenseCategories.create")} title={hint("expenseCategories.create")} onClick={async () => { if (newValue.trim() && (await run(() => expenseCategoriesService.create({ name: newValue }), "Could not add the category"))) setNewValue("") }}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

// Demo-only (mock mode): local state that is never saved. API mode uses src/components/masterdata/ClinicSettingsTab.tsx.
function MockClinicSettingsTab() {
  const uid = React.useId()
  const { toast } = useToast()
  const [settings, setSettings] = React.useState(demo.data.CLINIC_SETTINGS)

  return (
    <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-8 max-w-3xl">
      <h3 className="text-xl font-black text-[#0D1B2E] mb-6 pb-4 border-b border-slate-100">Clinic Settings</h3>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-clinic-name-english`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinic Name (English)</Label><Input id={`${uid}-clinic-name-english`} className={inputClass} value={settings.nameEn} onChange={(e) => setSettings((s) => ({ ...s, nameEn: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-clinic-name-urdu`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinic Name (Urdu)</Label><Input id={`${uid}-clinic-name-urdu`} className={inputClass} dir="rtl" value={settings.nameUr} onChange={(e) => setSettings((s) => ({ ...s, nameUr: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-address`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Address</Label><Input id={`${uid}-address`} className={inputClass} value={settings.address} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-phone`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input id={`${uid}-phone`} className={inputClass} value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-email`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</Label><Input id={`${uid}-email`} className={inputClass} value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-tagline`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Tagline</Label><Input id={`${uid}-tagline`} className={inputClass} value={settings.tagline} onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))} /></div>
          
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Logo</Label>
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-[#1CC0CE] hover:text-[#0891B2] transition-colors cursor-pointer">
              <Plus className="h-6 w-6" />
            </div>
          </div>
          
          <div className="space-y-1.5 sm:col-span-2 pt-4 border-t border-slate-100"><Label htmlFor={`${uid}-print-header`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Print Header</Label><Input id={`${uid}-print-header`} className={inputClass} value={settings.printHeader} onChange={(e) => setSettings((s) => ({ ...s, printHeader: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-currency-symbol`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Currency Symbol</Label>
            <Input id={`${uid}-currency-symbol`} className={cn(inputClass, "bg-slate-100 font-bold text-slate-500")} readOnly value={settings.currencySymbol} />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact support to change</p>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-default-city`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Default City</Label><Input id={`${uid}-default-city`} className={inputClass} value={settings.defaultCity} onChange={(e) => setSettings((s) => ({ ...s, defaultCity: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-timezone`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Timezone</Label><Input id={`${uid}-timezone`} className={cn(inputClass, "bg-slate-100 font-bold text-slate-500")} readOnly value={settings.timezone} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-financial-year-start`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Financial Year Start</Label>
            <Select value={settings.fiscalYearStart} onValueChange={(v) => setSettings((s) => ({ ...s, fiscalYearStart: v }))}>
              <SelectTrigger id={`${uid}-financial-year-start`} className={selectClass}><SelectValue /></SelectTrigger>
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
