"use client"
import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { DoctorSelect } from "@/components/visits/DoctorSelect"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { isUlid } from "@/lib/api/convert"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { DX_LIMITS, imagingApiService, labApiService, patientsService, type DxPriority, type PatientRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { DX_PRIORITY_LABEL } from "./dxUi"
import { TestPicker, testLinesOf, type PickedTest } from "./TestPicker"

type Failure = Extract<CreateFailure, { kind: "failed" }>

/**
 * Place a lab or an imaging order (L2, I2): POST /lab-orders or /imaging-orders (diagnostics.order). Every test is charged when ordered. The ordering doctor is a
 * user OR an outside doctor's name. With the department switched off the order is an external referral ("referred to"): recorded, not charged or worked. An own
 * discount per test needs billing.write. One request per click; an accepted but unreadable answer is never re-sent.
 */
export function OrderForm({ kind }: { kind: "lab" | "imaging" }) {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const { can, modules } = useAccess()
  const { pending, run } = useSubmitGuard()
  const base = kind === "lab" ? "/lab/orders" : "/imaging/orders"
  const moduleOff = modules ? modules[kind] === false : false
  const presetPatient = params.get("patientId")
  const presetVisit = params.get("encounterId")
  const presetKey = useScopedKey("patient", presetPatient ?? null)
  const presetQ = useQuery({ queryKey: presetKey, queryFn: ({ signal }) => patientsService.get(presetPatient as string, signal), enabled: !!presetPatient })
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : (presetQ.data ?? null)
  const [priority, setPriority] = React.useState<DxPriority>("routine")
  const [doctorId, setDoctorId] = React.useState("")
  const [outsideDoctor, setOutsideDoctor] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [referredTo, setReferredTo] = React.useState("")
  const [tests, setTests] = React.useState<PickedTest[]>([])
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [leaving, setLeaving] = React.useState(false)

  const blocked = patient?.archived ? "This patient is archived. Restore the patient first." : patient?.deceasedOn ? "This patient is deceased." : null
  const ready = !!patient && !blocked && tests.length > 0 && can("diagnostics.order")
  const encounterId = presetVisit && isUlid(presetVisit) && (!presetPatient || patient?.id === presetPatient) ? presetVisit : undefined

  const submit = async () => {
    if (!patient) return
    setFailure(null)
    await run(async () => {
      try {
        const input = {
          patientId: patient.id, encounterId, doctorId: doctorId || undefined, referringDoctorText: outsideDoctor, priority, clinicalNotes: notes, referredTo: moduleOff ? referredTo : undefined, tests: testLinesOf(tests),
        }
        const saved = kind === "lab" ? await labApiService.create(input) : await imagingApiService.create(input)
        toast({ title: `${saved.orderNo} placed` })
        setLeaving(true)
        router.push(`${base}/${saved.id}`)
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setFailure({ kind: "failed", heading: "Check the order", message: err.message, details: [], requestId: null, code: "VALIDATION", status: 0 } as Failure); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // the order exists but the answer could not be read: never send it again, go to the list, which loads fresh data
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Saved. Opening the order list." : outcome.message })
          setLeaving(true)
          router.push(base)
          return
        }
        setFailure(outcome)
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10" data-testid="order-form">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">{kind === "lab" ? "New Lab Order" : "New Imaging Order"}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Every test is charged when it is ordered.</p>
      </div>
      {moduleOff && (
        <div role="status" data-testid="referral-notice" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          The {kind === "lab" ? "laboratory" : "imaging"} department is switched off here, so this order is an external referral: it is recorded, but not charged or worked. Say where it is sent, if you know.
        </div>
      )}
      <div className="space-y-5 rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
          <PatientRecordPicker value={patient} onChange={setPicked} id="dx-patient" />
          {blocked && <p role="alert" data-testid="patient-blocked" className="text-sm font-bold text-destructive">{blocked}</p>}
          {encounterId && <p className="text-xs text-slate-500">This order will be linked to the visit you came from.</p>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dx-priority" className="text-xs font-bold uppercase tracking-wider text-slate-500">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as DxPriority)}>
              <SelectTrigger id="dx-priority" aria-label="Priority" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{(["routine", "urgent"] as const).map((p) => <SelectItem key={p} value={p}>{DX_PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dx-doctor" className="text-xs font-bold uppercase tracking-wider text-slate-500">Ordering doctor</Label>
            <DoctorSelect id="dx-doctor" ariaLabel="Ordering doctor" value={doctorId} onChange={(v) => { setDoctorId(v); setOutsideDoctor("") }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dx-outside" className="text-xs font-bold uppercase tracking-wider text-slate-500">Or an outside doctor&apos;s name</Label>
          <Input id="dx-outside" maxLength={DX_LIMITS.referringDoctor} className="h-11 rounded-xl" value={outsideDoctor} onChange={(e) => { setOutsideDoctor(e.target.value); if (e.target.value) setDoctorId("") }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dx-notes" className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinical notes</Label>
          <Textarea id="dx-notes" maxLength={DX_LIMITS.clinicalNotes} rows={3} className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {moduleOff && (
          <div className="space-y-1.5">
            <Label htmlFor="dx-referred" className="text-xs font-bold uppercase tracking-wider text-slate-500">Referred to</Label>
            <Input id="dx-referred" maxLength={DX_LIMITS.referredTo} className="h-11 rounded-xl" value={referredTo} onChange={(e) => setReferredTo(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tests *</Label>
          <TestPicker kind={kind} value={tests} onChange={setTests} allowDiscount={can("billing.write")} idPrefix="dx" />
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" disabled={pending || leaving} onClick={() => router.push(base)}>Cancel</Button>
          <Button className="h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={!ready || pending || leaving} onClick={() => void submit()}>{pending ? "Placing…" : "Place order"}</Button>
        </div>
      </div>
    </div>
  )
}
