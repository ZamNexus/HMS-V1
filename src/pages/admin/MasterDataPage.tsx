import * as React from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { SERVICE_CATALOG } from "@/data/services"
import { PANELS } from "@/data/organisations"
import { WARDS } from "@/data/wards"
import { EXPENSE_CATEGORIES } from "@/data/billing"
import { CLINIC_SETTINGS } from "@/data/settings"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { ECG_ULTRASOUND_TESTS } from "@/data/ecgUltrasound"
import { DISEASES } from "@/data/diseases"
import type {
  PanelType, ServiceCatalogItem, Panel, GuardianRelationItem, EcgUltrasoundTest, Disease,
} from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

const SERVICE_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]
const PANEL_TYPES: PanelType[] = ["Insurance", "Corporate", "Government", "Other"]
const DISEASE_CATEGORIES = ["Respiratory", "Endocrine", "Cardiovascular", "Gastrointestinal", "Infectious", "Haematology", "Neurology", "Musculoskeletal", "Psychiatric", "Genitourinary", "Dermatology", "Other"]

export function MasterDataPage() {
  return (
    <div>
      <PageHeader title="Master Data" />
      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services Catalog</TabsTrigger>
          <TabsTrigger value="panels">Panels &amp; Insurance</TabsTrigger>
          <TabsTrigger value="wards">Wards &amp; Beds</TabsTrigger>
          <TabsTrigger value="guardian">Guardian Relations</TabsTrigger>
          <TabsTrigger value="ecg">ECG/Ultrasound</TabsTrigger>
          <TabsTrigger value="diseases">Diseases/Diagnosis</TabsTrigger>
          <TabsTrigger value="expenses">Expense Categories</TabsTrigger>
          <TabsTrigger value="clinic">Clinic Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="panels"><PanelsTab /></TabsContent>
        <TabsContent value="wards"><WardsTab /></TabsContent>
        <TabsContent value="guardian"><GuardianRelationsTab /></TabsContent>
        <TabsContent value="ecg"><EcgUltrasoundTab /></TabsContent>
        <TabsContent value="diseases"><DiseasesTab /></TabsContent>
        <TabsContent value="expenses"><ExpenseCategoriesTab /></TabsContent>
        <TabsContent value="clinic"><ClinicSettingsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function ServicesTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [modalTarget, setModalTarget] = React.useState<ServiceCatalogItem | "new" | null>(null)

  const rows = categoryFilter === "All" ? SERVICE_CATALOG : SERVICE_CATALOG.filter((s) => s.category === categoryFilter)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Service</Button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Service Name</TableHead><TableHead>Category</TableHead>
            <TableHead>Rate</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-secondary">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category}</TableCell>
                <TableCell>{formatCurrency(s.rate)}</TableCell>
                <TableCell><Switch checked={s.active} onCheckedChange={(v) => { s.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setModalTarget(s)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ServiceModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function ServiceModal({ target, onClose }: { target: ServiceCatalogItem | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const svc = isNew ? null : target
  const [name, setName] = React.useState(svc?.name ?? "")
  const [code, setCode] = React.useState(svc?.code ?? "")
  const [category, setCategory] = React.useState(svc?.category ?? SERVICE_CATEGORIES[0])
  const [rate, setRate] = React.useState(svc?.rate ?? 0)

  React.useEffect(() => {
    setName(svc?.name ?? ""); setCode(svc?.code ?? ""); setCategory(svc?.category ?? SERVICE_CATEGORIES[0]); setRate(svc?.rate ?? 0)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!name || !code) return
    if (isNew) {
      SERVICE_CATALOG.push({ id: Math.max(0, ...SERVICE_CATALOG.map((s) => s.id)) + 1, code, name, category, rate, active: true })
      toast({ title: `${name} added to catalogue` })
    } else if (svc) {
      const idx = SERVICE_CATALOG.findIndex((s) => s.id === svc.id)
      if (idx >= 0) SERVICE_CATALOG[idx] = { ...SERVICE_CATALOG[idx], name, code, category, rate }
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{isNew ? "Add Service" : "Edit Service"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Service Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Rate (Rs.)</Label><Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PanelsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<Panel | "new" | null>(null)

  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Panel</Button></div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Panel Name</TableHead><TableHead>Type</TableHead><TableHead>Contact</TableHead>
            <TableHead>Phone</TableHead><TableHead>Commission%</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {PANELS.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell>{p.contactPerson}</TableCell>
                <TableCell>{p.phone}</TableCell>
                <TableCell>{p.commissionPct}%</TableCell>
                <TableCell><Switch checked={p.active} onCheckedChange={(v) => { p.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setModalTarget(p)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{isNew ? "Add Panel" : "Edit Panel"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Panel Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Commission %</Label><Input type="number" value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {WARDS.map((w) => {
        const occupied = w.beds.filter((b) => b.status === "occupied").length
        const pct = (occupied / w.beds.length) * 100
        return (
          <Card key={w.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{w.name}</h3>
                <StatusBadge status={w.type} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{occupied}/{w.beds.length} occupied</p>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", pct < 60 ? "bg-success-600" : pct < 90 ? "bg-warning-600" : "bg-danger-600")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <Button variant="ghost" size="sm" className="mt-2 px-0 text-secondary" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
                {expanded === w.id ? "Hide beds" : "View beds"}
              </Button>
              {expanded === w.id && (
                <Table>
                  <TableHeader><TableRow><TableHead>Bed</TableHead><TableHead>Status</TableHead><TableHead>Since</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {w.beds.map((b) => (
                      <TableRow key={b.bedNo} className="cursor-pointer" onClick={() => cycleBedStatus(w.id, b.bedNo)}>
                        <TableCell className="font-mono text-xs">{b.bedNo}</TableCell>
                        <TableCell><StatusBadge status={b.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.since ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function GuardianRelationsTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<GuardianRelationItem | "new" | null>(null)

  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Relation</Button></div>
      <div className="max-w-2xl rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Relation Name</TableHead><TableHead>Remarks</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {GUARDIAN_RELATIONS.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.remarks ?? "—"}</TableCell>
                <TableCell><Switch checked={r.active} onCheckedChange={(v) => { r.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setModalTarget(r)}><Pencil className="h-4 w-4" /></Button></TableCell>
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

  React.useEffect(() => { setName(item?.name ?? ""); setRemarks(item?.remarks ?? "") }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{isNew ? "Add Guardian Relation" : "Edit Guardian Relation"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Relation Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EcgUltrasoundTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<EcgUltrasoundTest | "new" | null>(null)

  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Test</Button></div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Test ID</TableHead><TableHead>Name</TableHead><TableHead>Fee</TableHead>
            <TableHead>Remarks</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {ECG_ULTRASOUND_TESTS.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-secondary">{t.code}</TableCell>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{formatCurrency(t.fee)}</TableCell>
                <TableCell className="text-muted-foreground">{t.remarks ?? "—"}</TableCell>
                <TableCell><Switch checked={t.active} onCheckedChange={(v) => { t.active = v; forceUpdate() }} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setModalTarget(t)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Master data only in this phase — direct ECG/Ultrasound invoicing is planned for a later release; these tests can be billed today as line items on a Services Invoice.</p>
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{isNew ? "Add ECG/Ultrasound Test" : "Edit Test"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Test Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fee (Rs.)</Label><Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Test Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
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
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Search by name or ICD code..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Diagnosis</Button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>ICD Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-secondary">{d.icdCode}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.category}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setModalTarget(d)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{isNew ? "Add Diagnosis" : "Edit Diagnosis"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>ICD Code</Label><Input value={icdCode} onChange={(e) => setIcdCode(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DISEASE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
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
    <Card className="max-w-md">
      <CardContent className="space-y-1 p-5">
        {categories.map((c, i) => (
          <div key={c + i} className="flex items-center justify-between rounded-md p-2 hover:bg-muted/40">
            {editing === i ? (
              <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" autoFocus />
            ) : (
              <span className="text-sm">{c}</span>
            )}
            <div className="flex gap-1">
              {editing === i ? (
                <Button size="sm" onClick={() => { setCategories((cs) => cs.map((x, idx) => idx === i ? editValue : x)); setEditing(null) }}>Save</Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => { setEditing(i); setEditValue(c) }}><Pencil className="h-3.5 w-3.5" /></Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setCategories((cs) => cs.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5 text-danger-600" /></Button>
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input placeholder="New category" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <Button onClick={() => { if (newValue.trim()) { setCategories((cs) => [...cs, newValue.trim()]); setNewValue("") } }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ClinicSettingsTab() {
  const { toast } = useToast()
  const [settings, setSettings] = React.useState(CLINIC_SETTINGS)

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1.5"><Label>Clinic Name (English)</Label><Input value={settings.nameEn} onChange={(e) => setSettings((s) => ({ ...s, nameEn: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Clinic Name (Urdu)</Label><Input dir="rtl" value={settings.nameUr} onChange={(e) => setSettings((s) => ({ ...s, nameUr: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Address</Label><Input value={settings.address} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Phone</Label><Input value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></div>
        </div>
        <div className="space-y-1.5"><Label>Tagline</Label><Input value={settings.tagline} onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <Plus className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-1.5"><Label>Print Header</Label><Input value={settings.printHeader} onChange={(e) => setSettings((s) => ({ ...s, printHeader: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Currency Symbol</Label>
            <Input readOnly value={settings.currencySymbol} />
            <p className="text-xs text-muted-foreground">Contact support to change</p>
          </div>
          <div className="space-y-1.5"><Label>Default City</Label><Input value={settings.defaultCity} onChange={(e) => setSettings((s) => ({ ...s, defaultCity: e.target.value }))} /></div>
        </div>
        <div className="space-y-1.5"><Label>Timezone</Label><Input readOnly value={settings.timezone} /></div>
        <div className="space-y-1.5">
          <Label>Financial Year Start</Label>
          <Select value={settings.fiscalYearStart} onValueChange={(v) => setSettings((s) => ({ ...s, fiscalYearStart: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["January", "April", "July", "October"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => toast({ title: "Settings saved successfully" })}>Save Settings</Button>
      </CardContent>
    </Card>
  )
}
