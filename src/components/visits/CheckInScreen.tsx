"use client"
import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/components/ui/use-toast"
import { invalidateFamily } from "@/lib/query/invalidate"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { patientsService, visitsService, type AdmissionKind, type PatientRecord, type VisitDetail } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { BedPicker } from "./BedPicker"
import { CheckInExtras, emptyExtras, type CheckInExtrasValue } from "./CheckInExtras"
import { DoctorSelect } from "./DoctorSelect"

type Failure = Extract<CreateFailure, { kind: "failed" }>
type Kind = "opd" | "ipd"

/**
 * Check a patient in for an OPD visit (E2: needs encounters.check_in; the server issues the number and a token and charges the consultation) or
 * admit one to a bed (E7: needs ipd.admit and the ipd department; the bed is chosen from the live bed board). One request per click. The
 * prototype's four-step wizard is split by the API into calls made by the role that owns each step: vitals, the record and billing come later.
 */
export function CheckInScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const { can, modules } = useAccess()
  const { pending, run } = useSubmitGuard()
  const ipdOn = modules?.ipd === true
  const canOpd = can("encounters.check_in")
  const canIpd = ipdOn && can("ipd.admit")
  const wanted = (params.get("type") ?? "").toLowerCase() === "ipd" ? "ipd" : "opd"
  const [kind, setKind] = React.useState<Kind | null>(null)
  const effective: Kind = kind ?? (wanted === "ipd" && canIpd ? "ipd" : canOpd ? "opd" : "ipd")

  const preset = params.get("patientId")
  const presetKey = useScopedKey("patient", preset ?? null)
  const presetQ = useQuery({ queryKey: presetKey, queryFn: ({ signal }) => patientsService.get(preset as string, signal), enabled: !!preset })
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : (presetQ.data ?? null)
  const [doctorId, setDoctorId] = React.useState("")
  const [extras, setExtras] = React.useState<CheckInExtrasValue>(emptyExtras())
  const [admission, setAdmission] = React.useState<AdmissionKind | "">("")
  const [bedId, setBedId] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [leaving, setLeaving] = React.useState(false)

  const blocked = patient?.archived ? "This patient is archived. Restore the patient first." : patient?.deceasedOn ? "This patient is deceased: no visit can be opened." : null
  const ready = !!patient && !blocked && !!doctorId && extras.startedProblem === null && (effective === "opd" ? canOpd : canIpd && admission !== "" && bedId !== null)

  const submit = async () => {
    if (!patient) return
    setFailure(null)
    await run(async () => {
      try {
        const common = { patientId: patient.id, doctorId, priority: extras.priority, advisedBy: extras.advisedBy, referredBy: extras.referredBy, reason: extras.reason, startedAt: extras.startedAt }
        const saved: VisitDetail = effective === "opd"
          ? await visitsService.checkInOpd(common)
          : await visitsService.admit({ ...common, bedId: bedId as string, admissionType: admission as AdmissionKind })
        toast({ title: `${saved.encId} ${effective === "opd" ? "checked in" : "admitted"}${saved.tokenNo !== null ? `, token #${saved.tokenNo}` : ""}` })
        setLeaving(true)
        router.push(`/encounters/${saved.id}`)
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // the visit exists but the answer could not be read: never send it again, go to the list that loads fresh data
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Saved. Opening the encounter list." : outcome.message })
          setLeaving(true)
          router.push("/encounters")
          return
        }
        if (outcome.code === "BED_OCCUPIED" || outcome.code === "BED_UNDER_MAINTENANCE" || outcome.code === "BED_UNAVAILABLE") { void invalidateFamily("bedBoard"); setBedId(null) }
        setFailure(outcome)
      }
    })
  }

  if (!canOpd && !canIpd) return <p className="p-10 text-center text-sm text-slate-500" role="alert">You do not have permission to check patients in or admit them.</p>
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10" data-testid="check-in-screen">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">{effective === "ipd" ? "Admit Patient" : "Check In"}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{effective === "ipd" ? "Admit the patient to a free bed." : "Opens the visit, issues the number and a token, and charges the consultation."}</p>
      </div>
      {canOpd && canIpd && (
        <RadioGroup aria-label="Visit type" className="flex h-11 w-fit items-center gap-6 rounded-xl border border-slate-200 bg-white px-4" value={effective} onValueChange={(v) => { setKind(v as Kind); setFailure(null) }}>
          <div className="flex items-center gap-2"><RadioGroupItem value="opd" id="kind-opd" /><Label htmlFor="kind-opd" className="cursor-pointer font-medium">OPD visit</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="ipd" id="kind-ipd" /><Label htmlFor="kind-ipd" className="cursor-pointer font-medium">IPD admission</Label></div>
        </RadioGroup>
      )}
      <div className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="space-y-1.5">
          <Label htmlFor="checkin-patient" className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
          <PatientRecordPicker id="checkin-patient" value={patient} onChange={setPicked} />
          {blocked && <p role="alert" data-testid="patient-blocked" className="text-xs font-bold text-destructive">{blocked}</p>}
          {patient?.admitted && effective === "opd" && <p role="status" className="text-xs font-bold text-amber-700">This patient is admitted. An admitted patient cannot be checked in as OPD.</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor *</Label>
          <DoctorSelect value={doctorId} onChange={setDoctorId} ariaLabel="Doctor" />
        </div>
        {effective === "ipd" && (
          <>
            <div className="space-y-1.5">
              <Label id="admission-label" className="text-xs font-bold uppercase tracking-wider text-slate-500">Admission type *</Label>
              <RadioGroup aria-labelledby="admission-label" className="flex h-11 w-fit items-center gap-6 rounded-xl border border-slate-200 bg-white px-4" value={admission} onValueChange={(v) => setAdmission(v as AdmissionKind)}>
                <div className="flex items-center gap-2"><RadioGroupItem value="emergency" id="adm-emergency" /><Label htmlFor="adm-emergency" className="cursor-pointer font-medium">Emergency</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="planned" id="adm-planned" /><Label htmlFor="adm-planned" className="cursor-pointer font-medium">Planned</Label></div>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Bed *</Label>
              <BedPicker value={bedId} onChange={setBedId} />
            </div>
          </>
        )}
        <CheckInExtras value={extras} onChange={setExtras} idPrefix="checkin" />
        {failure && <CreateErrorNote failure={failure} />}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => router.back()} disabled={pending || leaving}>Cancel</Button>
          <Button className="h-11 rounded-xl bg-[#0F2A4D] px-8 font-bold text-white hover:bg-[#16375F]" disabled={!ready || pending || leaving} onClick={() => void submit()}>
            {pending ? "Saving…" : effective === "ipd" ? "Admit" : "Check in"}
          </Button>
        </div>
      </div>
    </div>
  )
}
