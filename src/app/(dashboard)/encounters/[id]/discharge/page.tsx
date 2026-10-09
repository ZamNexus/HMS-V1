"use client"
import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { differenceInDays, format } from "date-fns"
import { FileX } from "lucide-react"

import { getEncounter, ENCOUNTERS } from "@/data/encounters"
import { getPatient } from "@/data/patients"
import { WARDS } from "@/data/wards"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { IcdLookup } from "@/components/shared/IcdLookup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const CONDITIONS = ["Recovered", "Improved", "Stable", "Against Medical Advice", "Expired"]

export default function DischargeSummaryPage() {
  const uid = React.useId()
  const params = useParams()
  const id = params?.id as string | undefined
  const router = useRouter()
  const { toast } = useToast()
  const encounter = id ? getEncounter(Number(id)) : undefined
  const patient = encounter ? getPatient(encounter.patientId) : undefined

  const [dischargeDate, setDischargeDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [dischargeDiagnosis, setDischargeDiagnosis] = React.useState(encounter?.diagnosis ?? "")
  const [summary, setSummary] = React.useState("")
  const [condition, setCondition] = React.useState("Recovered")
  const [followUpDate, setFollowUpDate] = React.useState("")
  const [followUpInstructions, setFollowUpInstructions] = React.useState("")

  if (!encounter || !patient) return <EmptyState icon={FileX} title="Encounter not found" />

  const los = differenceInDays(new Date(dischargeDate), new Date(encounter.date))

  const save = () => {
    const idx = ENCOUNTERS.findIndex((e) => e.id === encounter.id)
    if (idx >= 0) {
      ENCOUNTERS[idx] = {
        ...ENCOUNTERS[idx],
        status: "discharged",
        dischargeDate,
        dischargeDiagnosis,
        dischargeSummary: summary,
        conditionOnDischarge: condition,
      }
    }

    if (encounter.ward && encounter.bedNo) {
      const w = WARDS.find((x) => x.name === encounter.ward)
      const bed = w?.beds.find((b) => b.bedNo === encounter.bedNo)
      if (bed) {
        bed.status = "available"
        bed.patientId = null
        bed.since = null
      }
    }

    toast({ title: `${encounter.encId} discharged successfully — bed ${encounter.bedNo ?? ""} is now available` })
    router.push(`/encounters/${encounter.id}`)
  }

  return (
    <div>
      <PageHeader title={`Discharge Summary — ${patient.name}`} subtitle={encounter.encId} />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-discharge-date`}>Discharge Date</Label>
              <Input id={`${uid}-discharge-date`} type="date" value={dischargeDate} onChange={(e) => setDischargeDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-length-of-stay`}>Length of Stay</Label>
              <Input id={`${uid}-length-of-stay`} readOnly value={`${Math.max(los, 0)} day${los === 1 ? "" : "s"}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-discharge-diagnosis-icdlookup-`} className="flex items-center gap-2">
              Discharge Diagnosis * <IcdLookup onSelect={(name) => setDischargeDiagnosis((d) => (d ? `${d}, ${name}` : name))} />
            </Label>
            <Textarea id={`${uid}-discharge-diagnosis-icdlookup-`} rows={2} value={dischargeDiagnosis} onChange={(e) => setDischargeDiagnosis(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-discharge-summary`}>Discharge Summary</Label>
            <Textarea id={`${uid}-discharge-summary`} rows={8} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Full clinical narrative..." />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-condition-on-discharge`}>Condition on Discharge</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger id={`${uid}-condition-on-discharge`}><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-follow-up-date`}>Follow-up Date</Label>
              <Input id={`${uid}-follow-up-date`} type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor={`${uid}-follow-up-instructions`}>Follow-up Instructions</Label>
              <Input id={`${uid}-follow-up-instructions`} value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} />
            </div>
          </div>

          {encounter.prescription.length > 0 && (
            <div>
              <Label className="mb-2 block">Discharge Medications</Label>
              <div className="rounded-md border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr><th className="p-2 text-left">Medicine</th><th className="p-2 text-left">Dose</th><th className="p-2 text-left">Frequency</th><th className="p-2 text-left">Duration</th></tr>
                    </thead>
                    <tbody>
                      {encounter.prescription.map((rx, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 font-medium">{rx.medicine}</td><td className="p-2">{rx.dose}</td>
                          <td className="p-2">{rx.frequency}</td><td className="p-2">{rx.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Save Draft</Button>
        <Button onClick={save} disabled={!dischargeDiagnosis.trim()}>Save &amp; Print Summary</Button>
      </div>

      <p className="mt-2 text-right text-xs text-muted-foreground">
        Admitted {format(new Date(encounter.date), "dd MMM yyyy")}
      </p>
    </div>
  )
}
