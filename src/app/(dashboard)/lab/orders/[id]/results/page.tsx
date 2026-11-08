"use client"
import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { AlertTriangle, FileX } from "lucide-react"

import { errorSummary, flagFor, labOrdersService, type LabOrderRecord, type LabResultEntryInput } from "@/lib/services"
import { isApiError } from "@/lib/api/client"
import { useLabOrder, useLabTests, usePatient, type ReferenceList } from "@/lib/useReferenceData"
import type { LabTestRecord } from "@/lib/services"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth"
import * as ReactNs from "react"
import { useParams as useRouteParams, useRouter as useRouteRouter } from "next/navigation"
import { dataSource as dxDataSource } from "@/lib/services"

function MockLabResultEntryPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const orderQuery = useLabOrder(id)
  const catalog = useLabTests()

  const failure = (orderQuery.error && !orderQuery.data ? orderQuery.error : null) ?? (catalog.error && !catalog.items.length ? catalog.error : null)
  if (failure) {
    const notFound = isApiError(failure) && failure.status === 404
    return (
      <div role="alert">
        <EmptyState
          icon={notFound ? FileX : AlertTriangle}
          title={notFound ? "Lab order not found" : "Couldn't load the results form"}
          subtitle={notFound ? undefined : errorSummary(failure)}
          action={notFound ? undefined : <Button variant="outline" onClick={() => { orderQuery.reload(); catalog.reload() }}>Try again</Button>}
        />
      </div>
    )
  }
  if (orderQuery.loading || catalog.loading || !orderQuery.data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading results form">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  return <ResultEntryForm order={orderQuery.data} catalog={catalog} />
}

function ResultEntryForm({ order, catalog }: { order: LabOrderRecord; catalog: ReferenceList<LabTestRecord> }) {
  const uid = React.useId()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const patientQuery = usePatient(order.patientId)
  const patient = patientQuery.data

  const [paramResults, setParamResults] = React.useState<Record<string, string>>({})
  const [narratives, setNarratives] = React.useState<Record<string, string>>({})
  const [remarks, setRemarks] = React.useState("")
  const [verifiedBy, setVerifiedBy] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const setParam = (testId: string, param: string, value: string) => {
    setParamResults((r) => ({ ...r, [`${testId}::${param}`]: value }))
  }

  const applyNormal = (testId: string) => {
    setNarratives((n) => ({ ...n, [testId]: "No significant abnormality detected." }))
  }

  const save = async (markComplete: boolean) => {
    setError("")
    // Values only: the Task List says the server auto-flags against the normal ranges, so no flag is sent.
    const tests: LabResultEntryInput["tests"] = order.tests.flatMap((t): LabResultEntryInput["tests"] => {
      const test = catalog.lookup.get(t.testId)
      if (!test) return []
      if (test.narrative) return [{ testId: t.testId, narrativeResult: narratives[t.testId] ?? t.narrativeResult }]
      if (test.parameters) {
        return [{
          testId: t.testId,
          results: test.parameters.map((p) => ({
            parameter: p.parameter,
            result: paramResults[`${t.testId}::${p.parameter}`] ?? t.results?.find((r) => r.parameter === p.parameter)?.result ?? "",
          })),
        }]
      }
      return [{ testId: t.testId, results: [{ parameter: test.name, result: paramResults[`${t.testId}::single`] ?? t.results?.[0]?.result ?? "" }] }]
    })
    setSaving(true)
    try {
      await labOrdersService.enterResults(order.id, {
        tests,
        pathologistRemarks: remarks || undefined,
        performedBy: user?.name,
        verifiedBy: verifiedBy || undefined,
        markComplete,
      })
      toast({ title: markComplete ? "Results saved and marked complete" : "Results saved" })
      router.push(`/lab/orders/${order.id}`)
    } catch (err) {
      setError(errorSummary(err))
      toast({ variant: "destructive", title: "Could not save results", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={`Enter Results — ${patient?.name ?? (patientQuery.loading ? "…" : "—")}`} subtitle={order.labNo} />

      <div className="space-y-4">
        {order.tests.map((t) => {
          const test = catalog.lookup.get(t.testId)
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
                        // Live preview only; the saved order carries the flag the service returns.
                        const flag = flagFor(parseFloat(value), p.normalLow, p.normalHigh)
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
                      <Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-result-${t.testId}`}>Result</Label>
                      <Input
                        id={`${uid}-result-${t.testId}`}
                        value={paramResults[`${t.testId}::single`] ?? t.results?.[0]?.result ?? ""}
                        onChange={(e) => setParam(t.testId, "single", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-unit-${t.testId}`}>Unit</Label><Input id={`${uid}-unit-${t.testId}`} readOnly value={test.unit} /></div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-range-${t.testId}`}>Normal Range</Label><Input id={`${uid}-range-${t.testId}`} readOnly value={test.normalRange} /></div>
                    <div className="space-y-1"><Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-flag-${t.testId}`}>Flag</Label><Input id={`${uid}-flag-${t.testId}`} readOnly value="Auto" /></div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="space-y-1.5"><Label htmlFor={`${uid}-pathologist-apos-s-remarks`}>Pathologist&apos;s Remarks</Label><Textarea id={`${uid}-pathologist-apos-s-remarks`} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`${uid}-performed-by`}>Performed By</Label><Input id={`${uid}-performed-by`} readOnly value={user?.name ?? ""} /></div>
              <div className="space-y-1.5"><Label htmlFor={`${uid}-verified-by`}>Verified By</Label><Input id={`${uid}-verified-by`} value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Pathologist / doctor name" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && <p role="alert" className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={() => save(false)}>Save Results</Button>
        <Button disabled={saving} onClick={() => save(true)}>{saving ? "Saving…" : "Save & Mark Complete"}</Button>
      </div>
    </div>
  )
}

// Against the real API a result is entered in a dialog on the order itself (the server lists the buttons it allows), so this old route goes back to the order.
export default function LabResultEntryPage() {
  const params = useRouteParams()
  const router = useRouteRouter()
  const id = params?.id as string | undefined
  ReactNs.useEffect(() => {
    if (dxDataSource === "api" && id) router.replace(`/lab/orders/${id}`)
  }, [id, router])
  if (dxDataSource === "api") return <p className="p-10 text-center text-sm text-slate-500" role="status">Opening the order…</p>
  return <MockLabResultEntryPage />
}
