import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { differenceInYears, differenceInMonths } from "date-fns"
import { Plus } from "lucide-react"

import { PATIENTS, getPatient, nextMrNo } from "@/data/patients"
import { PANELS } from "@/data/organisations"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { formatCurrency } from "@/lib/utils"
import type { Gender, BloodGroup, PanelType } from "@/types"
import { PageHeader } from "@/components/shared/PageHeader"
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
    <div>
      <PageHeader
        title={mode === "create" ? "Register New Patient" : `Edit Patient — ${existing?.name ?? ""}`}
        actions={mode === "edit" && existing ? (
          <div className="flex items-center gap-4 rounded-md border border-border bg-card px-4 py-2">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</div>
              <div className={existingBalance && existingBalance > 0 ? "font-mono font-bold text-danger-600" : "font-mono font-bold text-success-600"}>
                {formatCurrency(existingBalance ?? 0)}
              </div>
            </div>
          </div>
        ) : undefined}
      />

      <form onSubmit={handleSubmit((v) => onSubmit(v))} className="space-y-6" noValidate>
        <Card>
          <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <PhotoUpload value={photoUrl} onChange={setPhotoUrl} />
            </div>
            <div className="space-y-1.5">
              <Label>MR Number</Label>
              <Input value={mrNo} readOnly className="font-mono text-secondary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="medicalRecordNo">Medical Record No</Label>
              <Input id="medicalRecordNo" placeholder="Manual reference (optional)" {...register("medicalRecordNo")} />
            </div>
            <div className="space-y-1.5">
              <Label>Registration Date</Label>
              <Input type="date" defaultValue={existing?.registrationDate ?? new Date().toISOString().slice(0, 10)} readOnly />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="active" className="cursor-pointer font-normal">Active</Label>
              <Switch id="active" checked={watch("active") ?? true} onCheckedChange={(v) => setValue("active", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs font-medium text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fatherName">Father/Husband Name</Label>
              <Input id="fatherName" {...register("fatherName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ssEmpNo">SS/Emp No</Label>
              <Input id="ssEmpNo" placeholder="Scheme or employee number" {...register("ssEmpNo")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of Birth *</Label>
              <Input id="dob" type="date" {...register("dob")} />
              {errors.dob && <p className="text-xs font-medium text-destructive">{errors.dob.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input value={dob ? ageBreakdown(dob) : ""} readOnly />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Gender *</Label>
              <RadioGroup
                className="flex gap-6"
                defaultValue={existing?.gender ?? "Male"}
                onValueChange={(v) => setValue("gender", v as Gender)}
              >
                {(["Male", "Female", "Other"] as const).map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <RadioGroupItem value={g} id={`gender-${g}`} />
                    <Label htmlFor={`gender-${g}`} className="cursor-pointer font-normal">{g}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnic">CNIC</Label>
              <Input id="cnic" placeholder="12345-1234567-1" {...register("cnic")} />
            </div>
            <div className="space-y-1.5">
              <Label>Blood Group</Label>
              <Select defaultValue={existing?.bloodGroup ?? "Unknown"} onValueChange={(v) => setValue("bloodGroup", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                placeholder="03XX-XXXXXXX"
                {...register("phone", { onBlur: (e) => checkDuplicate(e.target.value) })}
              />
              {errors.phone && <p className="text-xs font-medium text-destructive">{errors.phone.message}</p>}
              {duplicateWarning && (
                <p className="text-xs font-medium text-warning-700">{duplicateWarning}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContact">Emergency Contact</Label>
              <Input id="emergencyContact" {...register("emergencyContact")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="patient@example.com" {...register("email")} />
              {errors.email && <p className="text-xs font-medium text-destructive">{errors.email.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" rows={2} {...register("address")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Area/Locality</Label>
              <Input id="area" placeholder="Scheme III" {...register("area")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Clinical &amp; Administrative</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Guardian/Relation</Label>
              <div className="flex gap-2">
                <Select defaultValue={existing?.guardianRelation ?? "Self"} onValueChange={(v) => setValue("guardianRelation", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GUARDIAN_RELATIONS.filter((r) => r.active).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new relation" onClick={() => setRelationDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {guardianRelation && guardianRelation !== "Self" && (
              <div className="space-y-1.5">
                <Label htmlFor="guardianName">Guardian Name</Label>
                <Input id="guardianName" placeholder={`${guardianRelation}'s name`} {...register("guardianName")} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Panel/Organisation</Label>
              <div className="flex gap-2">
                <Select defaultValue={existing?.panelId ? String(existing.panelId) : "none"} onValueChange={(v) => setValue("panelId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Self-Pay)</SelectItem>
                    {PANELS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new organisation" onClick={() => setPanelDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referredBy">Referred By</Label>
              <Input id="referredBy" {...register("referredBy")} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea id="remarks" rows={3} {...register("remarks")} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          {mode === "edit" ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete Patient
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            {mode === "create" && (
              <>
                <Button type="button" variant="teal" onClick={handleSubmit((v) => onSubmit(v, "OPD"))}>
                  Save &amp; Generate OPD Ticket
                </Button>
                <Button type="button" variant="teal" onClick={handleSubmit((v) => onSubmit(v, "IPD"))}>
                  Save &amp; Generate IPD Ticket
                </Button>
              </>
            )}
            <Button type="submit">Save</Button>
          </div>
        </div>
      </form>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete {existing?.name}?</DialogTitle>
            <DialogDescription>This action cannot be undone. All patient records will be permanently removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
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
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Register New Organisation</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
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
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Register New Relation</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>Relation Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Uncle, Guardian" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
