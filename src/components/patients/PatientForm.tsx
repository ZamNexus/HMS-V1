"use client"
import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { AlertTriangle, FileText, Save, X } from "lucide-react"

import { demo } from "@hms/demo"
import {
  ageParts, classifyCreateError, dataSource, duplicateMatchesOf, errorSummary, formatPatientAge, formatMoneyString, guardianRelationsService, isPositiveMoney, organisationsService, patientsService,
  type CreateFailure, type DuplicateMatch, type PatientInput, type PatientRecord,
} from "@/lib/services"
import { scopedKey } from "@/lib/query/scope"
import { fieldErrorMap, isConflictChanged } from "@/lib/forms/fieldErrors"
import { isApiError } from "@/lib/api/client"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { useGuardianRelations, useOrganisations, usePatient } from "@/lib/useReferenceData"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { createSingleFlight } from "@/lib/singleFlight"
import { usePatientToday } from "@/lib/usePatientToday"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { apiPatientSchema, patientSchema, type PatientFormValues } from "./patientSchema"
import { CoverageFields } from "./CoverageFields"
import { NO_PANEL, coverageProblem, coveragesOf, draftsOf, type CoverageDrafts } from "./coverageDrafts"
import { DuplicateMatchesPanel } from "./DuplicateMatchesPanel"
import { PatientLifecycleActions } from "./PatientLifecycleActions"
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
const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"]
const NO_RELATION = "none"

type FormValues = PatientFormValues
type Failure = Extract<CreateFailure, { kind: "failed" }>
type AgeMode = "dob" | "estimated"
/** Text fields the form sends; in an edit only the ones the user changed are taken from the form (the rest come from the loaded record). */
type TextKey = "name" | "fatherName" | "cnic" | "phone" | "emergencyContact" | "email" | "address" | "area" | "city" | "country" | "guardianName" | "referredBy" | "remarks" | "medicalRecordNo"
const TEXT_KEYS: readonly TextKey[] = ["name", "fatherName", "cnic", "phone", "emergencyContact", "email", "address", "area", "city", "country", "guardianName", "referredBy", "remarks", "medicalRecordNo"]
const FORM_FIELDS = new Set<string>(["name", "fatherName", "dob", "gender", "cnic", "bloodGroup", "phone", "emergencyContact", "email", "address", "area", "city", "country", "guardianRelation", "guardianName", "referredBy", "remarks", "medicalRecordNo"])

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

/** The estimated age that stands for a stored (estimated) date of birth, in the unit the form offers. */
function estimateOf(dob: string, today: string | null): { value: string; unit: "years" | "months" } {
  const age = today ? ageParts(dob, today) : null
  if (!age) return { value: "", unit: "years" }
  return age.years >= 2 ? { value: String(age.years), unit: "years" } : { value: String(age.years * 12 + age.months), unit: "months" }
}

export function PatientForm({ mode }: { mode: "create" | "edit" }) {
  const params = useParams()
  const id = params?.id as string | undefined
  // Edit mode loads the patient through the shared hook (id passed through untouched); create mode loads nothing.
  const { data, error, reload } = usePatient(mode === "edit" ? id : undefined)

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
    // Only the FIRST load shows the skeleton: a later refetch must never unmount the form, or what the user typed would be lost.
    if (!data) {
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
  const qc = useQueryClient()
  const { toast } = useToast()
  const { can, modules } = useAccess()
  const { settings } = useHospital()
  const today = usePatientToday()
  const isApi = dataSource !== "mock"
  const isEdit = mode === "edit" && existing !== null
  // The record this form started from. It changes only when the user chooses "Load latest" after a conflict (never silently), so the version
  // sent as expectedUpdatedAt is the one the form was opened with.
  const [base, setBase] = React.useState<PatientRecord | null>(existing)
  const { pending, run } = useSubmitGuard()
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [conflict, setConflict] = React.useState<{ requestId: string | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false) // the demo's hard delete only
  const [leaving, setLeaving] = React.useState(false) // the save worked and the page is changing: keep the buttons off until it has
  const [photoUrl, setPhotoUrl] = React.useState<string | undefined>(existing?.photoUrl)

  // Organisations and guardian relations come from the shared reference-data services. When they can't be loaded their pickers are disabled
  // and the record's current value is kept.
  const organisations = useOrganisations()
  const relations = useGuardianRelations()
  const orgsReady = !organisations.loading && !organisations.error
  const relationsReady = !relations.loading && !relations.error
  const [coverage, setCoverageState] = React.useState<CoverageDrafts>(() => draftsOf(existing))
  // Like every other field, the coverage is only sent when the user changed it: after "Load latest" an untouched coverage follows the fresh record.
  const [coverageTouched, setCoverageTouched] = React.useState(false)
  const setCoverage = (next: CoverageDrafts | ((prev: CoverageDrafts) => CoverageDrafts)) => { setCoverageTouched(true); setCoverageState(next) }
  const currentRelation = existing?.guardianRelation
  const relationNames = relations.active.map((r) => r.name)
  const relationOptions = currentRelation && !relationNames.includes(currentRelation) ? [...relationNames, currentRelation] : relationNames
  const relationIdFor = (name: string | undefined): string | undefined =>
    !name ? undefined : (relations.active.find((r) => r.name === name)?.id ?? (name === base?.guardianRelation ? (base?.guardianRelationId ?? undefined) : undefined))

  const [ageMode, setAgeMode] = React.useState<AgeMode>(existing?.dobEstimated ? "estimated" : "dob")
  const [estValue, setEstValue] = React.useState("")
  const [estUnit, setEstUnit] = React.useState<"years" | "months">("years")
  const [estTouched, setEstTouched] = React.useState(false)
  const [ageProblem, setAgeProblem] = React.useState<string | null>(null)
  const derivedEstimate = base?.dobEstimated ? estimateOf(base.dob, today) : { value: "", unit: "years" as const }
  // what the boxes show: the typed value once the user touched them, else the estimate that stands for the stored date of birth
  const shownEstValue = estTouched ? estValue : derivedEstimate.value
  const shownEstUnit = estTouched ? estUnit : derivedEstimate.unit

  const [dupMatches, setDupMatches] = React.useState<DuplicateMatch[]>([])
  const [conflictMatches, setConflictMatches] = React.useState<DuplicateMatch[] | null>(null)
  const [restoredIds, setRestoredIds] = React.useState<ReadonlySet<string>>(new Set())
  const [restoringId, setRestoringId] = React.useState<string | null>(null)
  const dupAbort = React.useRef<AbortController | null>(null)
  const pendingCreate = React.useRef<{ input: PatientInput; ticketType?: "OPD" | "IPD" } | null>(null)

  const {
    register, handleSubmit, watch, setValue, getValues, setError,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isApi ? (apiPatientSchema as unknown as typeof patientSchema) : patientSchema),
    defaultValues: existing
      ? {
          medicalRecordNo: existing.medicalRecordNo, ssEmpNo: existing.ssEmpNo,
          name: existing.name, fatherName: existing.fatherName, dob: existing.dob, gender: existing.gender,
          cnic: existing.cnic, bloodGroup: existing.bloodGroup, phone: existing.phone,
          emergencyContact: existing.emergencyContact, email: existing.email, address: existing.address, area: existing.area,
          city: existing.city, country: existing.country ?? (isApi ? "" : "Pakistan"), guardianRelation: existing.guardianRelation,
          guardianName: existing.guardianName,
          referredBy: existing.referredBy, remarks: existing.remarks,
          active: existing.status !== "inactive",
        }
      : isApi
        ? { city: settings?.defaultCity ?? "", country: settings?.defaultCountry ?? "", bloodGroup: "Unknown", gender: "Male", guardianRelation: "", active: true }
        : { city: "Rawalpindi", country: "Pakistan", bloodGroup: "Unknown", gender: "Male", guardianRelation: "Self", active: true },
  })
  const [panelDialogOpen, setPanelDialogOpen] = React.useState(false)
  const [relationDialogOpen, setRelationDialogOpen] = React.useState(false)

  const dob = watch("dob")
  const guardianRelation = watch("guardianRelation")
  const archived = base?.archived === true
  const deceased = !!base?.deceasedOn
  const canRestoreMatches = can("patients.archive")
  // MR number: issued by the server on save, never predicted. Only the demo makes one up.
  const mrNo = existing?.mrNo ?? (dataSource === "mock" ? demo.data.nextMrNo() : "Assigned on registration")
  // Outstanding balance comes from billSummaryService (the backend owns the figure). Until its contract is confirmed, API mode says
  // "Not connected": a real patient is never displayed with demo amounts or a made-up Rs 0.
  const billState = useBillSummary(isEdit && existing ? { kind: "patient", id: existing.id } : null)
  const existingBalance = billState.data?.balance
  const balanceText = existingBalance !== undefined ? formatMoneyString(existingBalance) : billState.loading ? "…" : billState.pending ? "Not connected" : "Unavailable"

  // ── Duplicate warning when the phone or CNIC box loses focus (advisory: never blocks a save) ──
  const checkDuplicates = async () => {
    dupAbort.current?.abort()
    const ctrl = new AbortController()
    dupAbort.current = ctrl
    try {
      const found = await patientsService.duplicates({ phone: getValues("phone"), cnic: getValues("cnic"), signal: ctrl.signal })
      if (!ctrl.signal.aborted) setDupMatches(found.filter((m) => m.id !== existing?.id))
    } catch {
      // a failed lookup must not block registration; a real problem shows on save
      if (!ctrl.signal.aborted) setDupMatches([])
    }
  }
  React.useEffect(() => () => dupAbort.current?.abort(), [])

  const restoreMatch = async (m: DuplicateMatch) => {
    if (restoringId) return
    setRestoringId(m.id)
    try {
      await patientsService.restore(m.id)
      setRestoredIds((prev) => new Set(prev).add(m.id))
      toast({ title: `${m.name} (${m.mrNo}) restored`, description: "Open the record instead of registering the patient again." })
    } catch (err) {
      toast({ variant: "destructive", title: "Could not restore the patient", description: errorSummary(err) })
    } finally {
      setRestoringId(null)
    }
  }

  // ── What the form sends ──
  const buildInput = (values: FormValues): PatientInput => {
    const dirty = dirtyFields as Record<string, unknown>
    // In an edit only the fields the user changed come from the form; every other field is the loaded record's, so a "Load latest" after a
    // conflict can never send an old value over someone else's change.
    const text = (k: TextKey): string => (isEdit && base && !dirty[k] ? ((base[k] as string | undefined) ?? "") : ((values[k] as string | undefined) ?? ""))
    const chosenRelation = isEdit && base && !dirty.guardianRelation ? base.guardianRelation : (values.guardianRelation ?? "")
    const keepRelationName = chosenRelation === NO_RELATION ? "" : chosenRelation
    const estimated = ageMode === "estimated" && (!isEdit || estTouched || !base?.dobEstimated)
    const status = values.active === false ? "inactive" : base?.status === "ipd" ? "ipd" : "active"
    const coverages = isEdit && base && !coverageTouched ? coveragesOf(draftsOf(base)) : coveragesOf(coverage)
    return {
      medicalRecordNo: text("medicalRecordNo") || undefined,
      ssEmpNo: values.ssEmpNo,
      name: text("name"),
      fatherName: text("fatherName"),
      dob: ageMode === "dob" ? (isEdit && base && !dirty.dob ? base.dob : (values.dob ?? "")) : (isEdit && base ? base.dob : ""),
      estimatedAge: estimated ? { value: Number(shownEstValue), unit: shownEstUnit } : null,
      gender: (isEdit && base && !dirty.gender ? base.gender : values.gender) as Gender,
      phone: text("phone"),
      emergencyContact: text("emergencyContact") || undefined,
      email: text("email") || undefined,
      address: text("address"),
      area: text("area") || undefined,
      city: text("city"),
      country: text("country") || undefined,
      bloodGroup: (isEdit && base && !dirty.bloodGroup ? base.bloodGroup : values.bloodGroup) as BloodGroup,
      cnic: text("cnic"),
      guardianRelation: keepRelationName,
      guardianRelationId: relationIdFor(keepRelationName) ?? null,
      guardianName: keepRelationName && keepRelationName !== "Self" ? (text("guardianName") || undefined) : undefined,
      // the primary panel for the demo's single-panel model, the whole set for the API
      panelId: coverages.find((c) => c.priority === "primary")?.panelId ?? null,
      coverages: isApi ? coverages : undefined,
      referredBy: text("referredBy") || undefined,
      remarks: text("remarks") || undefined,
      status: status as "active" | "ipd" | "inactive",
      photoUrl,
      version: base?.version,
    }
  }

  /** Checks the age choice and the coverage; returns a message or null. */
  const preflight = (): string | null => {
    const problem = coverageProblem(coverage)
    if (problem) return problem
    if (ageMode === "estimated" && (!isEdit || estTouched || !base?.dobEstimated)) {
      const n = Number(shownEstValue)
      if (shownEstValue.trim() === "" || !Number.isInteger(n) || n < 0 || n > (shownEstUnit === "years" ? 150 : 1800)) return "Enter the estimated age as a whole number (up to 150 years)"
    }
    if (ageMode === "dob" && (!isEdit || dirtyFields.dob)) {
      const d = getValues("dob") ?? ""
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Date of birth is required (or choose Estimated age)"
      if (today !== null && d > today) return "The date of birth cannot be in the future"
    }
    return null
  }

  const submitCreate = async (input: PatientInput, ticketType?: "OPD" | "IPD") => {
    await run(async () => {
      try {
        const saved = await patientsService.create(input)
        toast({ title: `Patient ${saved.mrNo} registered` })
        setLeaving(true)
        if (ticketType) router.push(`/encounters/new?patientId=${saved.id}&type=${ticketType}`)
        else router.push(`/patients/${saved.id}`)
      } catch (err) {
        const matches = duplicateMatchesOf(err)
        if (matches) {
          // 409 POSSIBLE_DUPLICATE: show who matched; the register-anyway choice re-sends this ONE more time with acknowledgeDuplicates.
          pendingCreate.current = { input, ticketType }
          setConflictMatches(matches)
          return
        }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // The server accepted the save but its answer could not be read: say so, do NOT offer a retry (it would duplicate), and go to the list,
          // which loads fresh data. The create is never re-sent.
          toast({ title: outcome.message })
          router.push("/patients")
          return
        }
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (FORM_FIELDS.has(path)) setError(path as keyof FormValues, { message })
        setFailure(outcome)
        toast({ variant: "destructive", title: "Could not register patient", description: outcome.message })
      }
    })
  }

  const submitUpdate = async (input: PatientInput) => {
    if (!base) return
    await run(async () => {
      try {
        const saved = await patientsService.update(base.id, input, base)
        toast({ title: saved === base ? "Nothing changed" : "Patient record updated" })
        setLeaving(true)
        router.push(`/patients/${saved.id}`)
      } catch (err) {
        if (isConflictChanged(err)) {
          // 409 PATIENT_CHANGED: someone saved first. Keep what was typed; nothing is overwritten until the user loads the latest version.
          setConflict({ requestId: isApiError(err) ? err.requestId : null })
          return
        }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // the server may have saved it but its answer could not be read: show the stored record, never send the edit again
          toast({ title: outcome.message })
          setLeaving(true)
          router.push(`/patients/${base.id}`)
          return
        }
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (FORM_FIELDS.has(path)) setError(path as keyof FormValues, { message })
        setFailure(outcome)
        toast({ variant: "destructive", title: "Could not update patient", description: outcome.message })
      }
    })
  }

  const onSubmit = async (values: FormValues, ticketType?: "OPD" | "IPD") => {
    setFailure(null)
    setConflictMatches(null)
    const problem = isApi ? preflight() : null
    if (problem) { setAgeProblem(problem); toast({ variant: "destructive", title: "Check the form", description: problem }); return }
    setAgeProblem(null)
    let input: PatientInput
    try {
      input = buildInput(values)
    } catch (err) {
      toast({ variant: "destructive", title: "Check the form", description: errorSummary(err) })
      return
    }
    if (isEdit) await submitUpdate(input)
    else await submitCreate(input, ticketType)
  }

  const registerAnyway = async () => {
    const held = pendingCreate.current
    if (!held) return
    setConflictMatches(null)
    await submitCreate({ ...held.input, acknowledgeDuplicates: true }, held.ticketType)
  }

  /** After a conflict: read the current record, make it the new base. What the user typed stays on screen; only the fields they changed are sent. */
  const loadLatest = async () => {
    if (!base) return
    try {
      const fresh = await patientsService.get(base.id)
      qc.setQueryData(scopedKey("patient", base.id), fresh)
      setBase(fresh)
      if (!coverageTouched) setCoverageState(draftsOf(fresh))
      // fields the user did not touch now show the fresh record, so the screen never shows a value that is no longer the stored one
      const dirty = dirtyFields as Record<string, unknown>
      for (const k of TEXT_KEYS) if (!dirty[k]) setValue(k, (fresh[k] as string | undefined) ?? "", { shouldDirty: false })
      if (!dirty.gender) setValue("gender", fresh.gender, { shouldDirty: false })
      if (!dirty.bloodGroup) setValue("bloodGroup", fresh.bloodGroup, { shouldDirty: false })
      if (!dirty.dob) setValue("dob", fresh.dob, { shouldDirty: false })
      if (!dirty.guardianRelation) setValue("guardianRelation", fresh.guardianRelation, { shouldDirty: false })
      setConflict(null)
      setFailure(null)
      toast({ title: "Latest version loaded", description: "Your changes are still on the form. Check them, then save again." })
    } catch (err) {
      toast({ variant: "destructive", title: "Could not load the latest version", description: errorSummary(err) })
    }
  }

  const handleDelete = async () => {
    if (!base) return
    await run(async () => {
      try {
        await patientsService.remove(base.id)
        toast({ title: "Patient record deleted" })
        router.push("/patients")
      } catch (err) {
        toast({ variant: "destructive", title: "Could not delete patient", description: errorSummary(err) })
        setConfirmDelete(false)
      }
    })
  }

  const ageText = dob && today ? formatPatientAge({ dob }, today) : "—"
  const saveBlocked = pending || leaving || (isApi && isEdit && archived)

  return (
    <div className="space-y-8 pb-10 max-w-6xl mx-auto">
      {/* ─── PAGE HEADER ─────────────────────────────────────────────── */}
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

      {isApi && isEdit && archived && (
        <div role="alert" data-testid="archived-banner" className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800">
          <p className="font-bold">This patient is archived.</p>
          <p>An archived record cannot be edited. {can("patients.archive") ? "Restore the patient below, then edit." : "Ask someone with permission to restore patients."}</p>
        </div>
      )}
      {isApi && isEdit && deceased && (
        <div role="status" data-testid="deceased-banner" className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          Recorded as deceased on <span className="font-bold">{base?.deceasedOn}</span>. The record can still be corrected.
        </div>
      )}
      {conflict && <ConflictBanner what="patient" requestId={conflict.requestId} onReload={() => void loadLatest()} />}

      <form onSubmit={handleSubmit((v) => onSubmit(v))} className="space-y-6" noValidate>

        {/* ─── PERSONAL INFORMATION CARD ────────────────────────────── */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 px-6 pt-6">
            <CardTitle className="text-lg font-bold text-[#0D1B2E]">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {!isApi && (
              <div className="md:col-span-2 lg:col-span-3 pb-2">
                <PhotoUpload value={photoUrl} onChange={setPhotoUrl} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">MR Number</Label>
              <div className="flex h-11 w-full items-center rounded-xl bg-[#1CC0CE]/10 px-4 ring-1 ring-inset ring-[#1CC0CE]/20">
                <span className="font-mono font-bold text-[#0891B2]" data-testid="mr-number">{mrNo}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="medicalRecordNo" className="text-xs font-bold uppercase tracking-wider text-slate-500">Old Medical Record No</Label>
              <Input id="medicalRecordNo" placeholder="Manual reference (optional)" maxLength={60} className={inputClass} {...register("medicalRecordNo")} />
              {errors.medicalRecordNo && <p className="text-xs font-bold text-destructive">{errors.medicalRecordNo.message}</p>}
            </div>
            {(isEdit || !isApi) && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-registration-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Registration Date</Label>
                <Input id={`${uid}-registration-date`} type="date" defaultValue={existing?.registrationDate ?? today ?? ""} readOnly className={inputClass} />
              </div>
            )}

            {!isApi && (
              <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Switch id="active" checked={watch("active") ?? true} onCheckedChange={(v) => setValue("active", v)} />
                  <div className="flex flex-col">
                    <Label htmlFor="active" className="cursor-pointer font-bold text-slate-700">Patient Active Status</Label>
                    <span className="text-[11px] text-slate-500">Inactive patients will not appear in default searches or new appointments.</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</Label>
              <Input id="name" className={inputClass} placeholder="John Doe" {...register("name")} />
              {errors.name && <p className="text-xs font-bold text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fatherName" className="text-xs font-bold uppercase tracking-wider text-slate-500">Father/Husband Name</Label>
              <Input id="fatherName" className={inputClass} maxLength={120} {...register("fatherName")} />
              {errors.fatherName && <p className="text-xs font-bold text-destructive">{errors.fatherName.message}</p>}
            </div>
            {!isApi && (
              <div className="space-y-1.5">
                <Label htmlFor="ssEmpNo" className="text-xs font-bold uppercase tracking-wider text-slate-500">SS/Emp No</Label>
                <Input id="ssEmpNo" placeholder="Scheme or employee number" className={inputClass} {...register("ssEmpNo")} />
              </div>
            )}

            {isApi && (
              <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                <Label id={`${uid}-age-mode-label`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Age *</Label>
                <RadioGroup aria-labelledby={`${uid}-age-mode-label`} className="flex h-11 items-center gap-6 rounded-xl border border-slate-200 bg-white px-4" value={ageMode} onValueChange={(v) => { setAgeMode(v as AgeMode); setAgeProblem(null) }}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="dob" id={`${uid}-age-dob`} className="text-[#1CC0CE] border-slate-300" />
                    <Label htmlFor={`${uid}-age-dob`} className="cursor-pointer text-sm font-medium text-slate-700">Date of birth</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="estimated" id={`${uid}-age-est`} className="text-[#1CC0CE] border-slate-300" />
                    <Label htmlFor={`${uid}-age-est`} className="cursor-pointer text-sm font-medium text-slate-700">Estimated age (date of birth unknown)</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            {ageMode === "dob" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dob" className="text-xs font-bold uppercase tracking-wider text-slate-500">Date of Birth *</Label>
                  <Input id="dob" type="date" className={inputClass} max={today ?? undefined} {...register("dob")} />
                  {errors.dob && <p className="text-xs font-bold text-destructive">{errors.dob.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Calculated Age</Label>
                  <div className="flex h-11 w-full items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-500" data-testid="calculated-age">{ageText}</div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-est-value`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated Age *</Label>
                  <Input id={`${uid}-est-value`} type="number" inputMode="numeric" min={0} className={inputClass} value={shownEstValue} onChange={(e) => { setEstTouched(true); setEstValue(e.target.value); setEstUnit(shownEstUnit) }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-est-unit`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Unit</Label>
                  <Select value={shownEstUnit} onValueChange={(v) => { setEstTouched(true); setEstValue(shownEstValue); setEstUnit(v as "years" | "months") }}>
                    <SelectTrigger id={`${uid}-est-unit`} className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="years">Years</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">Shown as &quot;~{shownEstValue || "?"} {shownEstUnit === "years" ? "yrs" : "mo"}&quot; wherever the age appears.</p>
                </div>
              </>
            )}
            {ageProblem && <p role="alert" className="md:col-span-2 lg:col-span-3 text-xs font-bold text-destructive">{ageProblem}</p>}
            <div className="space-y-1.5">
              <Label id={`${uid}-gender-label`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Gender *</Label>
              <RadioGroup aria-labelledby={`${uid}-gender-label`}
                className="flex h-11 items-center gap-6 rounded-xl border border-slate-200 bg-white px-4"
                value={watch("gender") ?? "Male"}
                onValueChange={(v) => setValue("gender", v as Gender, { shouldDirty: true })}
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
              <Input id="cnic" placeholder="12345-1234567-1" className={inputClass} {...register("cnic", { onBlur: () => void checkDuplicates() })} />
              {errors.cnic && <p className="text-xs font-bold text-destructive">{errors.cnic.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-blood-group`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Blood Group</Label>
              <Select value={watch("bloodGroup") ?? "Unknown"} onValueChange={(v) => setValue("bloodGroup", v, { shouldDirty: true })}>
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
                inputMode="tel"
                className={inputClass}
                {...register("phone", { onBlur: () => void checkDuplicates() })}
              />
              {errors.phone && <p className="text-xs font-bold text-destructive">{errors.phone.message}</p>}
            </div>

            {dupMatches.length > 0 && !conflictMatches && (
              <div className="md:col-span-2 lg:col-span-3">
                <DuplicateMatchesPanel matches={dupMatches} mode="inline" canRestore={canRestoreMatches} restoringId={restoringId} restoredIds={restoredIds} onRestore={(m) => void restoreMatch(m)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="emergencyContact" className="text-xs font-bold uppercase tracking-wider text-slate-500">Emergency Contact</Label>
              <Input id="emergencyContact" className={inputClass} placeholder="03XX-XXXXXXX" inputMode="tel" {...register("emergencyContact")} />
              {errors.emergencyContact && <p className="text-xs font-bold text-destructive">{errors.emergencyContact.message}</p>}
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
              <Textarea id="address" rows={2} maxLength={300} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all resize-none" {...register("address")} />
              {errors.address && <p className="text-xs font-bold text-destructive">{errors.address.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area" className="text-xs font-bold uppercase tracking-wider text-slate-500">Area/Locality</Label>
              <Input id="area" placeholder="e.g. Scheme III" maxLength={120} className={inputClass} {...register("area")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-xs font-bold uppercase tracking-wider text-slate-500">City</Label>
              <Input id="city" maxLength={80} className={inputClass} {...register("city")} />
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
                <Select key={relationsReady ? "ready" : "pending"} disabled={!relationsReady} value={guardianRelation ? guardianRelation : isApi ? NO_RELATION : "Self"} onValueChange={(v) => setValue("guardianRelation", v === NO_RELATION ? "" : v, { shouldDirty: true })}>
                  <SelectTrigger id={`${uid}-guardian-relation`} className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isApi && <SelectItem value={NO_RELATION}>None</SelectItem>}
                    {(relationOptions.length ? relationOptions : isApi ? [] : ["Self"]).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                {can("catalogs.write") && <Button type="button" variant="outline" disabled={!relationsReady} className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new relation" aria-label="Add new relation" onClick={() => setRelationDialogOpen(true)}>
                  <span className="text-lg leading-none text-slate-500">+</span>
                </Button>}
              </div>
              {Boolean(relations.error) && <p role="alert" className="text-xs font-medium text-slate-500">Guardian relations unavailable: {errorSummary(relations.error)} The current value is kept.</p>}
            </div>

            {guardianRelation && guardianRelation !== "Self" ? (
              <div className="space-y-1.5">
                <Label htmlFor="guardianName" className="text-xs font-bold uppercase tracking-wider text-slate-500">Guardian Name</Label>
                <Input id="guardianName" placeholder={`${guardianRelation}'s name`} maxLength={120} className={inputClass} {...register("guardianName")} />
              </div>
            ) : <div className="hidden md:block" />}

            {isApi ? (
              <CoverageFields
                drafts={coverage}
                onChange={setCoverage}
                panels={organisations.active.map((o) => ({ id: o.id, name: o.name }))}
                ready={orgsReady}
                error={organisations.error ? errorSummary(organisations.error) : null}
                onAddOrganisation={() => setPanelDialogOpen(true)}
                hasPanelError={coverageProblem(coverage)}
              />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-panel-organisation`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Panel/Organisation</Label>
                <div className="flex gap-2">
                  <Select key={orgsReady ? "ready" : "pending"} disabled={!orgsReady} value={coverage.primary.panelId} onValueChange={(v) => setCoverage((c) => ({ ...c, primary: { ...c.primary, panelId: v } }))}>
                    <SelectTrigger id={`${uid}-panel-organisation`} className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PANEL}>None (Self-Pay)</SelectItem>
                      {organisations.items.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {can("catalogs.write") && <Button type="button" variant="outline" disabled={!orgsReady} className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new organisation" aria-label="Add new organisation" onClick={() => setPanelDialogOpen(true)}>
                    <span className="text-lg leading-none text-slate-500">+</span>
                  </Button>}
                </div>
                {Boolean(organisations.error) && <p role="alert" className="text-xs font-medium text-slate-500">Organisations unavailable: {errorSummary(organisations.error)} The current value is kept.</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="referredBy" className="text-xs font-bold uppercase tracking-wider text-slate-500">Referred By</Label>
              <Input id="referredBy" className={inputClass} maxLength={120} placeholder="Doctor or Clinic name" {...register("referredBy")} />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="remarks" className="text-xs font-bold uppercase tracking-wider text-slate-500">Internal Remarks</Label>
              <Textarea id="remarks" rows={3} maxLength={500} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all resize-none" {...register("remarks")} />
              {errors.remarks && <p className="text-xs font-bold text-destructive">{errors.remarks.message}</p>}
            </div>
          </CardContent>
        </Card>

        {conflictMatches && (
          <DuplicateMatchesPanel
            matches={conflictMatches} mode="conflict" canRestore={canRestoreMatches} restoringId={restoringId} restoredIds={restoredIds}
            onRestore={(m) => void restoreMatch(m)} onRegisterAnyway={() => void registerAnyway()} registering={pending}
          />
        )}
        {failure && <CreateErrorNote failure={failure} />}

        {/* ─── ACTION BAR ──────────────────────────────────────────────── */}
        <div className="sticky bottom-6 z-10 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 rounded-2xl bg-white/80 p-4 shadow-xl backdrop-blur-md ring-1 ring-black/5">
          {isEdit && base ? (
            isApi ? (
              <PatientLifecycleActions patient={base} onChanged={(action) => router.push(action === "archived" ? "/patients" : `/patients/${base.id}`)} />
            ) : (
              <Button type="button" variant="destructive" className="rounded-xl font-bold px-6 h-11 w-full sm:w-auto" onClick={() => setConfirmDelete(true)}>
                Delete Patient
              </Button>
            )
          ) : <div className="hidden sm:block" />}

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button type="button" variant="outline" className="rounded-xl font-bold px-6 h-11" onClick={() => router.back()}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            {mode === "create" && (
              <>
                <Button type="button" className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" disabled={pending || leaving || (isApi && !can("encounters.check_in"))} title={isApi && !can("encounters.check_in") ? "Checking a patient in needs permission to check in" : undefined} onClick={handleSubmit((v) => onSubmit(v, "OPD"))}>
                  Save & OPD Ticket
                </Button>
                <Button type="button" className="rounded-xl h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" disabled={pending || leaving || (isApi && !(modules?.ipd === true && can("ipd.admit")))} title={isApi && !(modules?.ipd === true && can("ipd.admit")) ? "Admitting a patient needs permission to admit and the inpatient department" : undefined} onClick={handleSubmit((v) => onSubmit(v, "IPD"))}>
                  Save & IPD Ticket
                </Button>
              </>
            )}
            <Button type="submit" disabled={saveBlocked} className="rounded-xl h-11 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0">
              <Save className="mr-2 h-4 w-4" /> {pending ? "Saving…" : mode === "create" ? "Register Patient" : "Update Profile"}
            </Button>
          </div>
        </div>
      </form>

      {!isApi && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
            <DialogHeader>
              <DialogTitle>Delete {existing?.name}?</DialogTitle>
              <DialogDescription>This action cannot be undone. All patient records will be permanently removed.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="destructive" disabled={pending} className="rounded-xl font-bold" onClick={handleDelete}>Delete Permanently</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <QuickAddPanelDialog
        open={panelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        onCreated={(id) => { organisations.reload(); setCoverage((c) => ({ ...c, primary: { ...c.primary, panelId: id } })) }}
        onRefresh={organisations.reload}
      />
      <QuickAddRelationDialog
        open={relationDialogOpen}
        onClose={() => setRelationDialogOpen(false)}
        onCreated={(name) => { relations.reload(); setValue("guardianRelation", name, { shouldDirty: true }) }}
        onRefresh={relations.reload}
      />
    </div>
  )
}

function QuickAddPanelDialog({ open, onClose, onCreated, onRefresh }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; onRefresh: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)
  const flight = React.useRef(createSingleFlight()).current
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<PanelType>("Insurance")
  const [contactPerson, setContactPerson] = React.useState("")
  const [phone, setPhone] = React.useState("")

  React.useEffect(() => {
    if (open) { setName(""); setType("Insurance"); setContactPerson(""); setPhone(""); setFailure(null) }
  }, [open])

  const save = async () => {
    const problems = failedChecks([[name.trim(), "Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    await flight(async () => {
      setSaving(true)
      setFailure(null)
      try {
        const saved = await organisationsService.create({ name: name.trim(), type, contactPerson, phone, commissionPct: 0, active: true })
        toast({ title: `${name} registered` })
        onCreated(saved.id)
        onClose()
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // Saved on the server, answer unreadable: refresh the list so it appears, and never re-send the create.
          toast({ title: outcome.message })
          onRefresh()
          onClose()
        } else {
          setFailure(outcome)
        }
      } finally {
        setSaving(false)
      }
    })
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
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Organisation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickAddRelationDialog({ open, onClose, onCreated, onRefresh }: { open: boolean; onClose: () => void; onCreated: (name: string) => void; onRefresh: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)
  const flight = React.useRef(createSingleFlight()).current
  const [name, setName] = React.useState("")

  React.useEffect(() => { if (open) { setName(""); setFailure(null) } }, [open])

  const save = async () => {
    const problems = failedChecks([[name.trim(), "Relation Name is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    await flight(async () => {
      setSaving(true)
      setFailure(null)
      try {
        const saved = await guardianRelationsService.create({ name: name.trim(), active: true })
        toast({ title: `${name} added` })
        onCreated(saved.name)
        onClose()
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          toast({ title: outcome.message })
          onRefresh()
          onClose()
        } else {
          setFailure(outcome)
        }
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Register New Relation</DialogTitle></DialogHeader>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor={`${uid}-relation-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Relation Name *</Label>
          <Input id={`${uid}-relation-name`} className="h-11 rounded-xl bg-slate-50 border-slate-200" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Uncle, Guardian" />
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} className="rounded-xl bg-[#1CC0CE] hover:bg-[#0891B2] font-bold" onClick={save}>Save Relation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
