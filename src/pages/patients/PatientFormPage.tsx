import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { differenceInYears, differenceInMonths } from "date-fns"
import { Plus, Save, X } from "lucide-react"

import { PATIENTS, getPatient, nextMrNo } from "@/data/patients"
import { PANELS } from "@/data/organisations"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { formatCurrency, cn } from "@/lib/utils"
import type { Gender, BloodGroup, PanelType } from "@/types"
import { PhotoUpload } from "@/components/shared/PhotoUpload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

const PANEL_TYPES: PanelType[] = ["Insurance", "Corporate", "Government", "Other"]

function ageBreakdown(dob: string): string {
  const now = new Date()
  const years = differenceInYears(now, new Date(dob))
  const months = differenceInMonths(now, new Date(dob)) % 12
  return `${years} yr${years === 1 ? "" : "s"}${months > 0 ? `, ${months} mo${months === 1 ? "" : "s"}` : ""}`
}

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"]

const schema = z.object({
  medicalRecordNo: z.string().optional(),
  ssEmpNo: z.string().optional(),
  name: z.string().min(2, "Full name must be at least 2 characters"),
  fatherName: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  cnic: z.string().optional(),
  bloodGroup: z.string().min(1),
  phone: z.string().regex(/^03\d{2}-\d{7}$/, "Format: 03XX-XXXXXXX"),
  emergencyContact: z.string().optional(),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  address: z.string().optional(),
  area: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  guardianRelation: z.string().optional(),
  guardianName: z.string().optional(),
  panelId: z.string().optional(),
  referredBy: z.string().optional(),
  remarks: z.string().max(500).optional(),
  active: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export function PatientFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const existing = mode === "edit" && id ? getPatient(Number(id)) : undefined
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [photoUrl, setPhotoUrl] = React.useState<string | undefined>(existing?.photoUrl)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          medicalRecordNo: existing.medicalRecordNo, ssEmpNo: existing.ssEmpNo,
          name: existing.name, fatherName: existing.fatherName, dob: existing.dob, gender: existing.gender,
          cnic: existing.cnic, bloodGroup: existing.bloodGroup, phone: existing.phone,
          emergencyContact: existing.emergencyContact, email: existing.email, address: existing.address, area: existing.area,
          city: existing.city, country: existing.country ?? "Pakistan", guardianRelation: existing.guardianRelation,
          guardianName: existing.guardianName,
          panelId: existing.panelId ? String(existing.panelId) : "none",
          referredBy: existing.referredBy, remarks: existing.remarks,
          active: existing.status !== "inactive",
        }
      : { city: "Rawalpindi", country: "Pakistan", bloodGroup: "Unknown", gender: "Male", panelId: "none", active: true },
  })

  const [panelDialogOpen, setPanelDialogOpen] = React.useState(false)
  const [relationDialogOpen, setRelationDialogOpen] = React.useState(false)

  const dob = watch("dob")
  const age = dob ? Math.max(0, differenceInYears(new Date(), new Date(dob))) : undefined
  const guardianRelation = watch("guardianRelation")
  const mrNo = existing?.mrNo ?? nextMrNo()
  const existingBalance = existing ? patientBillBreakdown(existing.id).balance : undefined

  const checkDuplicate = (phone: string) => {
    const dup = PATIENTS.find((p) => p.phone === phone && p.id !== existing?.id)
    setDuplicateWarning(dup ? `A patient with this phone number already exists: ${dup.name} (${dup.mrNo})` : null)
  }

  const onSubmit = (values: FormValues, ticketType?: "OPD" | "IPD") => {
    const targetId = existing?.id ?? Math.max(...PATIENTS.map((p) => p.id)) + 1
    const status = values.active === false ? "inactive" : existing?.status === "ipd" ? "ipd" : "active"
    const record = {
      id: targetId,
      mrNo,
      medicalRecordNo: values.medicalRecordNo,
      ssEmpNo: values.ssEmpNo,
      name: values.name,
      fatherName: values.fatherName ?? "",
      dob: values.dob,
      age: age ?? 0,
      gender: values.gender as Gender,
      phone: values.phone,
      emergencyContact: values.emergencyContact,
      email: values.email || undefined,
      address: values.address ?? "",
      area: values.area,
      city: values.city ?? "Rawalpindi",
      country: values.country || "Pakistan",
      bloodGroup: values.bloodGroup as BloodGroup,
      cnic: values.cnic ?? "",
      guardianRelation: values.guardianRelation ?? "Self",
      guardianName: values.guardianRelation && values.guardianRelation !== "Self" ? values.guardianName : undefined,
      panelId: values.panelId && values.panelId !== "none" ? Number(values.panelId) : null,
      referredBy: values.referredBy,
      remarks: values.remarks,
      status: status as "active" | "ipd" | "inactive",
      registrationDate: existing?.registrationDate ?? new Date().toISOString().slice(0, 10),
      photoUrl,
    }

    if (existing) {
      const idx = PATIENTS.findIndex((p) => p.id === existing.id)
      PATIENTS[idx] = record
      toast({ title: "Patient record updated" })
      navigate(`/patients/${targetId}`)
    } else {
      PATIENTS.push(record)
      toast({ title: `Patient ${mrNo} registered` })
      if (ticketType) navigate(`/encounters/new?patientId=${targetId}&type=${ticketType}`)
      else navigate(`/patients/${targetId}`)
    }
  }

  const handleDelete = () => {
    if (!existing) return
    const idx = PATIENTS.findIndex((p) => p.id === existing.id)
    if (idx >= 0) PATIENTS.splice(idx, 1)
    toast({ title: "Patient record deleted" })
    navigate("/patients")
  }

  return (
    <div className="space-y-8 pb-10 max-w-6xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">
            {mode === "create" ? "Register New Patient" : `Edit Patient — ${existing?.name ?? ""}`}
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {mode === "create" ? "Enter patient demographic and clinical details." : "Update patient records and settings."}
          </p>
        </div>
        {mode === "edit" && existing && (
          <div className="flex flex-col items-end rounded-2xl border-none bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Outstanding Balance</div>
            <div className={cn(
              "text-lg font-black leading-none", 
              existingBalance && existingBalance > 0 ? "text-danger-600" : "text-success-600"
            )}>
              {formatCurrency(existingBalance ?? 0)}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit((v) => onSubmit(v))} className="space-y-6" noValidate>
        
        {/* ─── PERSONAL INFORMATION CARD ────────────────────────────── */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 px-6 pt-6">
            <CardTitle className="text-lg font-bold text-[#0D1B2E]">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2 lg:col-span-3 pb-2">
              <PhotoUpload value={photoUrl} onChange={setPhotoUrl} />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">MR Number</Label>
              <div className="flex h-11 w-full items-center rounded-xl bg-[#1CC0CE]/10 px-4 ring-1 ring-inset ring-[#1CC0CE]/20">
                <span className="font-mono font-bold text-[#0891B2]">{mrNo}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="medicalRecordNo" className="text-xs font-bold uppercase tracking-wider text-slate-500">Old Medical Record No</Label>
              <Input id="medicalRecordNo" placeholder="Manual reference (optional)" className={inputClass} {...register("medicalRecordNo")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Registration Date</Label>
              <Input type="date" defaultValue={existing?.registrationDate ?? new Date().toISOString().slice(0, 10)} readOnly className={inputClass} />
            </div>
            
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Switch id="active" checked={watch("active") ?? true} onCheckedChange={(v) => setValue("active", v)} />
                <div className="flex flex-col">
                  <Label htmlFor="active" className="cursor-pointer font-bold text-slate-700">Patient Active Status</Label>
                  <span className="text-[11px] text-slate-500">Inactive patients will not appear in default searches or new appointments.</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</Label>
              <Input id="name" className={inputClass} placeholder="John Doe" {...register("name")} />
              {errors.name && <p className="text-xs font-bold text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fatherName" className="text-xs font-bold uppercase tracking-wider text-slate-500">Father/Husband Name</Label>
              <Input id="fatherName" className={inputClass} {...register("fatherName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ssEmpNo" className="text-xs font-bold uppercase tracking-wider text-slate-500">SS/Emp No</Label>
              <Input id="ssEmpNo" placeholder="Scheme or employee number" className={inputClass} {...register("ssEmpNo")} />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="dob" className="text-xs font-bold uppercase tracking-wider text-slate-500">Date of Birth *</Label>
              <Input id="dob" type="date" className={inputClass} {...register("dob")} />
              {errors.dob && <p className="text-xs font-bold text-destructive">{errors.dob.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Calculated Age</Label>
              <div className="flex h-11 w-full items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-500">
                {dob ? ageBreakdown(dob) : "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Gender *</Label>
              <RadioGroup
                className="flex h-11 items-center gap-6 rounded-xl border border-slate-200 bg-white px-4"
                defaultValue={existing?.gender ?? "Male"}
                onValueChange={(v) => setValue("gender", v as Gender)}
              >
                {(["Male", "Female", "Other"] as const).map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <RadioGroupItem value={g} id={`gender-${g}`} className="text-[#1CC0CE] border-slate-300" />
                    <Label htmlFor={`gender-${g}`} className="cursor-pointer text-sm font-medium text-slate-700">{g}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="cnic" className="text-xs font-bold uppercase tracking-wider text-slate-500">CNIC</Label>
              <Input id="cnic" placeholder="12345-1234567-1" className={inputClass} {...register("cnic")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Blood Group</Label>
              <Select defaultValue={existing?.bloodGroup ?? "Unknown"} onValueChange={(v) => setValue("bloodGroup", v)}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Phone *</Label>
              <Input
                id="phone"
                placeholder="03XX-XXXXXXX"
                className={inputClass}
                {...register("phone", { onBlur: (e) => checkDuplicate(e.target.value) })}
              />
              {errors.phone && <p className="text-xs font-bold text-destructive">{errors.phone.message}</p>}
              {duplicateWarning && (
                <p className="text-xs font-bold text-amber-600 mt-1">{duplicateWarning}</p>
              )}
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContact" className="text-xs font-bold uppercase tracking-wider text-slate-500">Emergency Contact</Label>
              <Input id="emergencyContact" className={inputClass} placeholder="03XX-XXXXXXX" {...register("emergencyContact")} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</Label>
              <Input id="email" type="email" placeholder="patient@example.com" className={inputClass} {...register("email")} />
              {errors.email && <p className="text-xs font-bold text-destructive">{errors.email.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ─── ADDRESS CARD ────────────────────────────────────────────── */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 px-6 pt-6">
            <CardTitle className="text-lg font-bold text-[#0D1B2E]">Location & Address</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider text-slate-500">Street Address</Label>
              <Textarea id="address" rows={2} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all resize-none" {...register("address")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area" className="text-xs font-bold uppercase tracking-wider text-slate-500">Area/Locality</Label>
              <Input id="area" placeholder="e.g. Scheme III" className={inputClass} {...register("area")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-xs font-bold uppercase tracking-wider text-slate-500">City</Label>
              <Input id="city" className={inputClass} {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country" className="text-xs font-bold uppercase tracking-wider text-slate-500">Country</Label>
              <Input id="country" className={inputClass} {...register("country")} />
            </div>
          </CardContent>
        </Card>

        {/* ─── CLINICAL & ADMIN CARD ────────────────────────────────────── */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 px-6 pt-6">
            <CardTitle className="text-lg font-bold text-[#0D1B2E]">Clinical & Administrative</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Guardian/Relation</Label>
              <div className="flex gap-2">
                <Select defaultValue={existing?.guardianRelation ?? "Self"} onValueChange={(v) => setValue("guardianRelation", v)}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GUARDIAN_RELATIONS.filter((r) => r.active).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new relation" onClick={() => setRelationDialogOpen(true)}>
                  <Plus className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
            </div>
            
            {guardianRelation && guardianRelation !== "Self" ? (
              <div className="space-y-1.5">
                <Label htmlFor="guardianName" className="text-xs font-bold uppercase tracking-wider text-slate-500">Guardian Name</Label>
                <Input id="guardianName" placeholder={`${guardianRelation}'s name`} className={inputClass} {...register("guardianName")} />
              </div>
            ) : <div className="hidden md:block" />}
            
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Panel/Organisation</Label>
              <div className="flex gap-2">
                <Select defaultValue={existing?.panelId ? String(existing.panelId) : "none"} onValueChange={(v) => setValue("panelId", v)}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Self-Pay)</SelectItem>
                    {PANELS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new organisation" onClick={() => setPanelDialogOpen(true)}>
                  <Plus className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referredBy" className="text-xs font-bold uppercase tracking-wider text-slate-500">Referred By</Label>
              <Input id="referredBy" className={inputClass} placeholder="Doctor or Clinic name" {...register("referredBy")} />
            </div>
            
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="remarks" className="text-xs font-bold uppercase tracking-wider text-slate-500">Internal Remarks</Label>
              <Textarea id="remarks" rows={3} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all resize-none" {...register("remarks")} />
            </div>
          </CardContent>
        </Card>

        {/* ─── ACTION BAR ──────────────────────────────────────────────── */}
        <div className="sticky bottom-6 z-10 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 rounded-2xl bg-white/80 p-4 shadow-xl backdrop-blur-md ring-1 ring-black/5">
          {mode === "edit" ? (
            <Button type="button" variant="destructive" className="rounded-xl font-bold px-6 h-11 w-full sm:w-auto" onClick={() => setConfirmDelete(true)}>
              Delete Patient
            </Button>
          ) : <div className="hidden sm:block" />}
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button type="button" variant="outline" className="rounded-xl font-bold px-6 h-11" onClick={() => navigate(-1)}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            {mode === "create" && (
              <>
                <Button type="button" className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" onClick={handleSubmit((v) => onSubmit(v, "OPD"))}>
                  Save & OPD Ticket
                </Button>
                <Button type="button" className="rounded-xl h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleSubmit((v) => onSubmit(v, "IPD"))}>
                  Save & IPD Ticket
                </Button>
              </>
            )}
            <Button type="submit" className="rounded-xl h-11 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0">
              <Save className="mr-2 h-4 w-4" /> {mode === "create" ? "Register Patient" : "Update Profile"}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Delete {existing?.name}?</DialogTitle>
            <DialogDescription>This action cannot be undone. All patient records will be permanently removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" className="rounded-xl font-bold" onClick={handleDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddPanelDialog
        open={panelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        onCreated={(id) => setValue("panelId", String(id))}
      />
      <QuickAddRelationDialog
        open={relationDialogOpen}
        onClose={() => setRelationDialogOpen(false)}
        onCreated={(name) => setValue("guardianRelation", name)}
      />
    </div>
  )
}

function QuickAddPanelDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<PanelType>("Insurance")
  const [contactPerson, setContactPerson] = React.useState("")
  const [phone, setPhone] = React.useState("")

  React.useEffect(() => {
    if (open) { setName(""); setType("Insurance"); setContactPerson(""); setPhone("") }
  }, [open])

  const save = () => {
    if (!name.trim()) return
    const id = Math.max(0, ...PANELS.map((p) => p.id)) + 1
    PANELS.push({ id, name: name.trim(), type, contactPerson, phone, commissionPct: 0, active: true })
    toast({ title: `${name} registered` })
    onCreated(id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Register New Organisation</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Name *</Label>
            <Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact Person</Label><Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Organisation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickAddRelationDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState("")

  React.useEffect(() => { if (open) setName("") }, [open])

  const save = () => {
    if (!name.trim()) return
    const id = Math.max(0, ...GUARDIAN_RELATIONS.map((r) => r.id)) + 1
    GUARDIAN_RELATIONS.push({ id, name: name.trim(), active: true })
    toast({ title: `${name} added` })
    onCreated(name.trim())
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Register New Relation</DialogTitle></DialogHeader>
        <div className="space-y-1.5 pt-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Relation Name *</Label>
          <Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Uncle, Guardian" />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Relation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
