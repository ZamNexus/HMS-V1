import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { differenceInYears } from "date-fns"

import { PATIENTS, getPatient, nextMrNo } from "@/data/patients"
import { PANELS } from "@/data/organisations"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import type { Gender, BloodGroup } from "@/types"
import { PageHeader } from "@/components/shared/PageHeader"
import { PhotoUpload } from "@/components/shared/PhotoUpload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"]

const schema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  fatherName: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  cnic: z.string().optional(),
  bloodGroup: z.string().min(1),
  phone: z.string().regex(/^03\d{2}-\d{7}$/, "Format: 03XX-XXXXXXX"),
  emergencyContact: z.string().optional(),
  address: z.string().optional(),
  area: z.string().optional(),
  city: z.string().optional(),
  guardianRelation: z.string().optional(),
  panelId: z.string().optional(),
  referredBy: z.string().optional(),
  remarks: z.string().max(500).optional(),
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
          name: existing.name, fatherName: existing.fatherName, dob: existing.dob, gender: existing.gender,
          cnic: existing.cnic, bloodGroup: existing.bloodGroup, phone: existing.phone,
          emergencyContact: existing.emergencyContact, address: existing.address, area: existing.area,
          city: existing.city, guardianRelation: existing.guardianRelation,
          panelId: existing.panelId ? String(existing.panelId) : "none",
          referredBy: existing.referredBy, remarks: existing.remarks,
        }
      : { city: "Rawalpindi", bloodGroup: "Unknown", gender: "Male", panelId: "none" },
  })

  const dob = watch("dob")
  const age = dob ? Math.max(0, differenceInYears(new Date(), new Date(dob))) : undefined
  const mrNo = existing?.mrNo ?? nextMrNo()

  const checkDuplicate = (phone: string) => {
    const dup = PATIENTS.find((p) => p.phone === phone && p.id !== existing?.id)
    setDuplicateWarning(dup ? `A patient with this phone number already exists: ${dup.name} (${dup.mrNo})` : null)
  }

  const onSubmit = (values: FormValues, ticketType?: "OPD" | "IPD") => {
    const targetId = existing?.id ?? Math.max(...PATIENTS.map((p) => p.id)) + 1
    const record = {
      id: targetId,
      mrNo,
      name: values.name,
      fatherName: values.fatherName ?? "",
      dob: values.dob,
      age: age ?? 0,
      gender: values.gender as Gender,
      phone: values.phone,
      emergencyContact: values.emergencyContact,
      address: values.address ?? "",
      area: values.area,
      city: values.city ?? "Rawalpindi",
      bloodGroup: values.bloodGroup as BloodGroup,
      cnic: values.cnic ?? "",
      guardianRelation: values.guardianRelation ?? "Self",
      panelId: values.panelId && values.panelId !== "none" ? Number(values.panelId) : null,
      referredBy: values.referredBy,
      remarks: values.remarks,
      status: existing?.status ?? ("active" as const),
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
      <PageHeader title={mode === "create" ? "Register New Patient" : `Edit Patient — ${existing?.name ?? ""}`} />

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
              <Label>Registration Date</Label>
              <Input type="date" defaultValue={existing?.registrationDate ?? new Date().toISOString().slice(0, 10)} readOnly />
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
              <Label htmlFor="dob">Date of Birth *</Label>
              <Input id="dob" type="date" {...register("dob")} />
              {errors.dob && <p className="text-xs font-medium text-destructive">{errors.dob.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input value={age !== undefined ? `${age} years` : ""} readOnly />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Clinical &amp; Administrative</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Guardian/Relation</Label>
              <Select defaultValue={existing?.guardianRelation ?? "Self"} onValueChange={(v) => setValue("guardianRelation", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GUARDIAN_RELATIONS.filter((r) => r.active).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Panel/Insurance</Label>
              <Select defaultValue={existing?.panelId ? String(existing.panelId) : "none"} onValueChange={(v) => setValue("panelId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Self-Pay)</SelectItem>
                  {PANELS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
    </div>
  )
}
