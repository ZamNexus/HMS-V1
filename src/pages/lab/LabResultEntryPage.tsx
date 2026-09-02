import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FileX } from "lucide-react"

import { getLabOrder, LAB_ORDERS } from "@/data/lab"
import { getLabTest } from "@/data/labTests"
import { getPatient } from "@/data/patients"
import type { LabResultParam } from "@/types"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth"

function flagFor(value: number, low: number, high: number): LabResultParam["flag"] {
  if (Number.isNaN(value)) return ""
  if (value > high) return "High"
  if (value < low) return "Low"
  return "Normal"
}

export function LabResultEntryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const order = id ? getLabOrder(Number(id)) : undefined
  const patient = order ? getPatient(order.patientId) : undefined

  const [paramResults, setParamResults] = React.useState<Record<string, string>>({})
  const [narratives, setNarratives] = React.useState<Record<number, string>>({})
  const [remarks, setRemarks] = React.useState("")
  const [verifiedBy, setVerifiedBy] = React.useState("")

  if (!order || !patient) return <EmptyState icon={FileX} title="Lab order not found" />

  const setParam = (testId: number, param: string, value: string) => {
    setParamResults((r) => ({ ...r, [`${testId}::${param}`]: value }))
  }

  const applyNormal = (testId: number) => {
    setNarratives((n) => ({ ...n, [testId]: "No significant abnormality detected." }))
  }

  const save = (markComplete: boolean) => {
    const idx = LAB_ORDERS.findIndex((o) => o.id === order.id)
    if (idx < 0) return
    const updatedTests = order.tests.map((t) => {
      const test = getLabTest(t.testId)
      if (!test) return t
      if (test.narrative) {
        return { ...t, narrativeResult: narratives[t.testId] ?? t.narrativeResult }
      }
      if (test.parameters) {
        const results: LabResultParam[] = test.parameters.map((p) => {
          const raw = paramResults[`${t.testId}::${p.parameter}`]
          const val = raw !== undefined ? raw : t.results?.find((r) => r.parameter === p.parameter)?.result ?? ""
          const num = parseFloat(val)
          return {
            parameter: p.parameter, result: val, unit: p.unit,
            normalRange: `${p.normalLow}–${p.normalHigh}`, flag: flagFor(num, p.normalLow, p.normalHigh),
          }
        })
        return { ...t, results }
      }
      const raw = paramResults[`${t.testId}::single`] ?? t.results?.[0]?.result ?? ""
      return {
        ...t,
        results: [{ parameter: test.name, result: raw, unit: test.unit, normalRange: test.normalRange, flag: "Normal" as const }],
      }
    })
    LAB_ORDERS[idx] = {
      ...LAB_ORDERS[idx],
      tests: updatedTests,
      pathologistRemarks: remarks || LAB_ORDERS[idx].pathologistRemarks,
      performedBy: user?.name ?? LAB_ORDERS[idx].performedBy,
      verifiedBy: verifiedBy || LAB_ORDERS[idx].verifiedBy,
      status: markComplete ? "Completed" : LAB_ORDERS[idx].status,
    }
    toast({ title: markComplete ? "Results saved and marked complete" : "Results saved" })
    navigate(`/lab/orders/${order.id}`)
  }

  return (
    <div>
      <PageHeader title={`Enter Results — ${patient.name}`} subtitle={order.labNo} />

      <div className="space-y-4">
        {order.tests.map((t) => {
          const test = getLabTest(t.testId)
          if (!test) return null
          return (
            <Card key={t.testId}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{test.name}</CardTitle>
                <StatusBadge status={test.category} />
              </CardHeader>
              <CardContent>
                {test.narrative ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={4}
                      placeholder="Report / Impression"
                      value={narratives[t.testId] ?? t.narrativeResult ?? ""}
                      onChange={(e) => setNarratives((n) => ({ ...n, [t.testId]: e.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox onCheckedChange={(v) => v && applyNormal(t.testId)} /> Normal Study
                    </label>
                  </div>
                ) : test.parameters ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Parameter</TableHead><TableHead>Result</TableHead><TableHead>Unit</TableHead>
                      <TableHead>Normal Range</TableHead><TableHead>Flag</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {test.parameters.map((p) => {
                        const key = `${t.testId}::${p.parameter}`
                        const existing = t.results?.find((r) => r.parameter === p.parameter)?.result ?? ""
                        const value = paramResults[key] ?? existing
                        const num = parseFloat(value)
                        const flag = flagFor(num, p.normalLow, p.normalHigh)
                        return (
                          <TableRow key={p.parameter}>
                            <TableCell className="font-medium">{p.parameter}</TableCell>
                            <TableCell><Input className="w-28" value={value} onChange={(e) => setParam(t.testId, p.parameter, e.target.value)} /></TableCell>
                            <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                            <TableCell className="text-muted-foreground">{p.normalLow}–{p.normalHigh}</TableCell>
                            <TableCell>{flag && flag !== "Normal" && <StatusBadge status={flag} />}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-normal text-muted-foreground">Result</Label>
                      <Input
                        value={paramResults[`${t.testId}::single`] ?? t.results?.[0]?.result ?? ""}
                        onChange={(e) => setParam(t.testId, "single", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground">Unit</Label><Input readOnly value={test.unit} /></div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground">Normal Range</Label><Input readOnly value={test.normalRange} /></div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground">Flag</Label><Input readOnly value="Auto" /></div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="space-y-1.5"><Label>Pathologist's Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Performed By</Label><Input readOnly value={user?.name ?? ""} /></div>
              <div className="space-y-1.5"><Label>Verified By</Label><Input value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Pathologist / doctor name" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>Save Results</Button>
        <Button onClick={() => save(true)}>Save &amp; Mark Complete</Button>
      </div>
    </div>
  )
}
