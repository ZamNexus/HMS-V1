"use client"
import * as React from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ClipboardList } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { visitsService } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { STATUS_LABEL, TYPE_LABEL } from "./visitUi"

const PAGE_SIZE = 10

/** A patient's visits, newest first (PT8: GET /patients/{id}/encounters). Needs encounters.read or encounters.check_in. Archived visits only on request. */
export function PatientVisitsTab({ patientId }: { patientId: string }) {
  const { can } = useAccess()
  const { settings } = useHospital()
  const [page, setPage] = React.useState(1)
  const [archived, setArchived] = React.useState(false)
  const key = useScopedKey("visits", "patient", patientId, page, archived)
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => visitsService.forPatient(patientId, { page, pageSize: PAGE_SIZE, includeArchived: archived || undefined, signal }),
    ...CACHE_CLASSES.record, placeholderData: keepPreviousData,
  })
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (q.isPending) return <Skeleton className="h-32 w-full rounded-xl" role="status" aria-label="Loading visits" />
  const items = q.data?.items ?? []
  return (
    <div className="space-y-3" data-testid="patient-visits">
      {can("encounters.archive") && (
        <div className="flex items-center gap-2"><Checkbox id="pv-archived" checked={archived} onCheckedChange={(v) => { setArchived(v === true); setPage(1) }} /><Label htmlFor="pv-archived" className="cursor-pointer text-sm text-slate-700">Include archived visits</Label></div>
      )}
      {items.length === 0 ? <EmptyState icon={ClipboardList} title="No visits recorded" /> : (
        <>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Encounter</TableHead><TableHead>Type</TableHead><TableHead>Doctor</TableHead><TableHead>Diagnosis</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((v) => (
                <TableRow key={v.id} data-testid={`pv-row-${v.id}`}>
                  <TableCell>{settings ? formatInstant(v.startedAt, settings.timezone, { dateStyle: "medium", timeStyle: "short" }) : v.date}</TableCell>
                  <TableCell className="font-mono text-secondary"><Link href={`/encounters/${v.id}`} className="hover:underline">{v.encId}</Link></TableCell>
                  <TableCell>{TYPE_LABEL[v.type]}</TableCell>
                  <TableCell>{v.doctor.name}</TableCell>
                  <TableCell>{v.primaryDiagnosis ?? <span className="text-slate-400">—</span>}</TableCell>
                  <TableCell><div className="flex flex-wrap items-center gap-1"><StatusBadge status={STATUS_LABEL[v.status]} />{v.pending && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">To finish</span>}{v.archived && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.data && q.data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={setPage} itemLabel="visits" />}
        </>
      )}
    </div>
  )
}
