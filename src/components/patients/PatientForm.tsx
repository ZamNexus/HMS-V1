"use client"
import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { differenceInYears, differenceInMonths } from "date-fns"
import { AlertTriangle, FileText, Plus, Save, X } from "lucide-react"

import { nextMrNo } from "@/data/patients"
import {
  dataSource, errorSummary, findDuplicatePhone, formatMoneyString, guardianRelationsService, isNotConnectedError, isPositiveMoney, organisationsService, patientsService,
  type PatientInput, type PatientRecord,
} from "@/lib/services"
import { useGuardianRelations, useOrganisations, usePatient } from "@/lib/useReferenceData"
import { isApiError } from "@/lib/api/client"
import { patientSchema, type PatientFormValues } from "./patientSchema"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { useBillSummary } from "@/lib/useBillSummary"
import { cn } from "@/lib/utils"
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
import { failedChecks, validationToast } from "@/lib/validation"
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

type FormValues = PatientFormValues


const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export function PatientForm({ mode }: { mode: "create" | "edit" }) {
  const params = useParams()
  const id = params?.id as string | undefined
  // Edit mode loads the patient through the shared hook (id passed through untouched); create mode loads nothing.
  const { data, error, loading, reload } = usePatient(mode === "edit" ? id : undefined)

  if (mode === "edit") {
    if (error && !data) {
      const notFound = isApiError(error) && error.status === 404
      return (
        <div className="p-10" role="alert">
          <EmptyState
            icon={notFound ? FileText : AlertTriangle}
            title={notFound ? "Patient not found" : "Couldn't load this patient"}
            subtitle={notFound ? "This patient record does not exist." : errorSummary(error)}
            action={notFound ? undefined : <Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>}
          />
        </div>
      )
    }
    if (loading || !data) {
      return (
        <div className="mx-auto max-w-6xl space-y-4 pb-10" role="status" aria-label="Loading patient">
          <Skeleton className="h-10 w-72 rounded-xl" />
          <Skeleton className="h-64 w-full rounded-[1.5rem]" />
          <Skeleton className="h-40 w-full rounded-[1.5rem]" />
        </div>
      )
    }
  }
  return <PatientFormBody mode={mode} existing={data} />
}

function PatientFormBody({ mode, existing }: { mode: "create" | "edit"; existing: PatientRecord | null }) {
  const uid = React.useId()
  const router = useRouter()
  const { toast } = useToast()
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [submitError, setSubmitError] = React.useState("")
  const [photoUrl, setPhotoUrl] = React.useState<string | undefined>(existing?.photoUrl)

  // Organisations and guardian relations come from the shared reference-data services. When they can't be
  // loaded (API mode: contract not confirmed) their pickers are disabled and the record's current value is kept.
  const organisations = useOrganisations()
  const relations = useGuardianRelations()
  const orgsReady = !organisations.loading && !organisations.error
  const relationsReady = !relations.loading && !relations.error
  const currentPanel = existing?.panelId ?? null
  const orgOptions = [
    ...organisations.items.map((o) => ({ id: o.id, name: o.name })),
    ...(currentPanel && !organisations.lookup.get(currentPanel) ? [{ id: currentPanel, name: "Current organisation (details unavailable)" }] : []),
  ]
  const relationNames = relations.active.map((r) => r.name)
  const currentRelation = existing?.guardianRelation
  const relationOptions = currentRelation && !relationNames.includes(currentRelation) ? [...relationNames, currentRelation] : relationNames.length ? relationNames : ["Self"]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: existing
      ? {
          medicalRecordNo: existing.medicalRecordNo, ssEmpNo: existing.ssEmpNo,
          name: existing.name, fatherName: existing.fatherName, dob: existing.dob, gender: existing.gender,
          cnic: existing.cnic, bloodGroup: existing.bloodGroup, phone: existing.phone,
          emergencyContact: existing.emergencyContact, email: existing.email, address: existing.address, area: existing.area,
          city: existing.city, country: existing.country ?? "Pakistan", guardianRelation: existing.guardianRelation,
          guardianName: existing.guardianName,
          panelId: existing.panelId ?? "none",
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
  // MR number: shown for the mock only. Whether the real backend assigns it is CONTRACT REQUIRED, so API mode never invents one.
  const mrNo = existing?.mrNo ?? (dataSource === "mock" ? nextMrNo() : "Assigned on registration")
  // Outstanding balance comes from billSummaryService (the backend owns the figure). Until its contract is confirmed, API mode says
  // "Not connected" — a real patient is never displayed with demo amounts or a made-up Rs 0. Balance contract: see the handoff doc.
  const billState = useBillSummary(mode === "edit" && existing ? { kind: "patient", id: existing.id } : null)
  const existingBalance = billState.data?.balance
  const balanceText = existingBalance !== undefined ? formatMoneyString(existingBalance) : billState.loading ? "…" : billState.pending ? "Not connected" : "Unavailable"

  const checkDuplicate = async (phone: string) => {
    if (!phone) { setDuplicateWarning(null); return }
    try {
      const { items } = await patientsService.list({ search: phone, pageSize: 5 })
      const dup = findDuplicatePhone(items, phone, existing?.id)
      setDuplicateWarning(dup ? `A patient with this phone number already exists: ${dup.name} (${dup.mrNo})` : null)
    } catch (err) {
      // Advisory check only: a failed lookup must not block registration. Genuine failures surface on save.
      if (!isNotConnectedError(err)) setDuplicateWarning(null)
    }
  }

  const onSubmit = async (values: FormValues, ticketType?: "OPD" | "IPD") => {
    setSubmitError("")
    const status = values.active === false ? "inactive" : existing?.status === "ipd" ? "ipd" : "active"
    const input: PatientInput = {
      medicalRecordNo: values.medicalRecordNo,
      ssEmpNo: values.ssEmpNo,
      name: values.name,
      fatherName: values.fatherName ?? "",
      dob: values.dob,
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
      // Organisations unavailable (not connected): leave an existing value untouched, never send a made-up id.
      panelId: orgsReady ? (values.panelId && values.panelId !== "none" ? values.panelId : null) : (existing?.panelId ?? null),
      referredBy: values.referredBy,
      remarks: values.remarks,
      status: status as "active" | "ipd" | "inactive",
      photoUrl,
    }

    setSaving(true)
    try {
      if (existing) {
        const saved = await patientsService.update(existing.id, input)
        toast({ title: "Patient record updated" })
        router.push(`/patients/${saved.id}`)
      } else {
        const saved = await patientsService.create(input)
        toast({ title: `Patient ${saved.mrNo} registered` })
        if (ticketType) router.push(`/encounters/new?patientId=${saved.id}&type=${ticketType}`)
        else router.push(`/patients/${saved.id}`)
      }
    } catch (err) {
      setSubmitError(errorSummary(err))
      toast({ variant: "destructive", title: existing ? "Could not update patient" : "Could not register patient", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    setSaving(true)
    try {
      await patientsService.remove(existing.id)
      toast({ title: "Patient record deleted" })
      router.push("/patients")
    } catch (err) {
      toast({ variant: "destructive", title: "Could not delete patient", description: errorSummary(err) })
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
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
            <div
              data-testid="outstanding-balance"
              title={billState.error && !billState.pending ? errorSummary(billState.error) : billState.pending ? "The balance contract is not connected yet — no figure is shown." : undefined}
              className={cn(
                "text-lg font-black leading-none",
                existingBalance === undefined ? "text-slate-400" : isPositiveMoney(existingBalance) ? "text-danger-600" : "text-success-600"
              )}
            >
              {balanceText}
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
              <Label htmlFor={`${uid}-registration-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Registration Date</Label>
              <Input id={`${uid}-registration-date`} type="date" defaultValue={existing?.registrationDate ?? new Date().toISOString().slice(0, 10)} readOnly className={inputClass} />
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
              <Label id={`${uid}-gender-label`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Gender *</Label>
              <RadioGroup aria-labelledby={`${uid}-gender-label`}
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
              <Label htmlFor={`${uid}-blood-group`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Blood Group</Label>
              <Select defaultValue={existing?.bloodGroup ?? "Unknown"} onValueChange={(v) => setValue("bloodGroup", v)}>
                <SelectTrigger id={`${uid}-blood-group`} className={selectClass}><SelectValue /></SelectTrigger>
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
              <Label htmlFor={`${uid}-guardian-relation`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Guardian/Relation</Label>
              <div className="flex gap-2">
                <Select key={relationsReady ? "ready" : "pending"} disabled={!relationsReady} value={guardianRelation ?? existing?.guardianRelation ?? "Self"} onValueChange={(v) => setValue("guardianRelation", v)}>
                  <SelectTrigger id={`${uid}-guardian-relation`} className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {relationOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" disabled={!relationsReady} className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new relation" onClick={() => setRelationDialogOpen(true)}>
                  <Plus className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
              {Boolean(relations.error) && <p role="alert" className="text-xs font-medium text-slate-500">Guardian relations unavailable: {errorSummary(relations.error)} The current value is kept.</p>}
            </div>
            
            {guardianRelation && guardianRelation !== "Self" ? (
              <div className="space-y-1.5">
                <Label htmlFor="guardianName" className="text-xs font-bold uppercase tracking-wider text-slate-500">Guardian Name</Label>
                <Input id="guardianName" placeholder={`${guardianRelation}'s name`} className={inputClass} {...register("guardianName")} />
              </div>
            ) : <div className="hidden md:block" />}
            
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-panel-organisation`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Panel/Organisation</Label>
              <div className="flex gap-2">
                <Select key={orgsReady ? "ready" : "pending"} disabled={!orgsReady} value={watch("panelId") ?? existing?.panelId ?? "none"} onValueChange={(v) => setValue("panelId", v)}>
                  <SelectTrigger id={`${uid}-panel-organisation`} className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Self-Pay)</SelectItem>
                    {orgOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" disabled={!orgsReady} className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new organisation" onClick={() => setPanelDialogOpen(true)}>
                  <Plus className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
              {Boolean(organisations.error) && <p role="alert" className="text-xs font-medium text-slate-500">Organisations unavailable: {errorSummary(organisations.error)} The current value is kept.</p>}
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

        {submitError && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">{submitError}</p>}

        {/* ─── ACTION BAR ──────────────────────────────────────────────── */}
        <div className="sticky bottom-6 z-10 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 rounded-2xl bg-white/80 p-4 shadow-xl backdrop-blur-md ring-1 ring-black/5">
          {mode === "edit" ? (
            <Button type="button" variant="destructive" className="rounded-xl font-bold px-6 h-11 w-full sm:w-auto" onClick={() => setConfirmDelete(true)}>
              Delete Patient
            </Button>
          ) : <div className="hidden sm:block" />}
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button type="button" variant="outline" className="rounded-xl font-bold px-6 h-11" onClick={() => router.back()}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            {mode === "create" && (
              <>
                <Button type="button" className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" disabled={saving} onClick={handleSubmit((v) => onSubmit(v, "OPD"))}>
                  Save & OPD Ticket
                </Button>
                <Button type="button" className="rounded-xl h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" disabled={saving} onClick={handleSubmit((v) => onSubmit(v, "IPD"))}>
                  Save & IPD Ticket
                </Button>
              </>
            )}
            <Button type="submit" disabled={saving} className="rounded-xl h-11 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0">
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
            <Button variant="destructive" disabled={saving} className="rounded-xl font-bold" onClick={handleDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddPanelDialog
        open={panelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        onCreated={(id) => { organisations.reload(); setValue("panelId", id) }}
      />
      <QuickAddRelationDialog
        open={relationDialogOpen}
        onClose={() => setRelationDialogOpen(false)}
        onCreated={(name) => { relations.reload(); setValue("guardianRelation", name) }}
      />
    </div>
  )
}

function QuickAddPanelDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<PanelType>("Insurance")
  const [contactPerson, setContactPerson] = React.useState("")
  const [phone, setPhone] = React.useState("")

  React.useEffect(() => {
    if (open) { setName(""); setType("Insurance"); setContactPerson(""); setPhone("") }
  }, [open])

  const save = async () => {
    const problems = failedChecks([[name.trim(), "Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const saved = await organisationsService.create({ name: name.trim(), type, contactPerson, phone, commissionPct: 0, active: true })
      toast({ title: `${name} registered` })
      onCreated(saved.id)
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not register organisation", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Register New Organisation</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Name *</Label>
            <Input id={`${uid}-name`} className="h-11 rounded-xl bg-slate-50 border-slate-200" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-type`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PanelType)}>
              <SelectTrigger id={`${uid}-type`} className="h-11 rounded-xl bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>{PANEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-contact-person`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact Person</Label><Input id={`${uid}-contact-person`} className="h-11 rounded-xl bg-slate-50 border-slate-200" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-phone`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input id={`${uid}-phone`} className="h-11 rounded-xl bg-slate-50 border-slate-200" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Organisation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickAddRelationDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")

  React.useEffect(() => { if (open) setName("") }, [open])

  const save = async () => {
    const problems = failedChecks([[name.trim(), "Relation Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const saved = await guardianRelationsService.create({ name: name.trim(), active: true })
      toast({ title: `${name} added` })
      onCreated(saved.name)
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not add relation", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Register New Relation</DialogTitle></DialogHeader>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor={`${uid}-relation-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Relation Name *</Label>
          <Input id={`${uid}-relation-name`} className="h-11 rounded-xl bg-slate-50 border-slate-200" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Uncle, Guardian" />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Relation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
