"use client"
import * as React from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, FileText } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isApiError } from "@/lib/api/client"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { formatPatientAge, visitsService, type VisitDetail } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { ClinicalRecordForm } from "./ClinicalRecordForm"
import { ProgressNotesPanel } from "./ProgressNotesPanel"
import { ArchiveDialog, CloseVisitDialog, CorrectCheckInDialog, DischargeDialog, ReasonDialog, TransferDialog } from "./VisitDialogs"
import { VitalsPanel } from "./VitalsPanel"
import { VisitBillTab } from "@/components/billing/VisitBillTab"
import { ACTION_LABEL, CONDITION_LABEL, STATUS_LABEL, TYPE_LABEL, tokenLabel, visitActionStates, type VisitAction } from "./visitUi"

type TabId = "overview" | "vitals" | "record" | "notes" | "billing"
type Dialog = "close" | "cancel" | "reopen" | "archive" | "restore" | "transfer" | "discharge" | "correct_check_in"

/**
 * One encounter (E6): the check-in details, vitals, the doctor's record (the front desk gets `clinical: null` and sees no record), ward-round notes
 * for an admission, and the buttons its status, type and the user's permissions allow. The record is re-read every time it is opened.
 */
export function VisitDetailScreen({ id }: { id: string }) {
  const qc = useQueryClient()
  const { can, modules } = useAccess()
  const { settings } = useHospital()
  const key = useScopedKey("visits", "detail", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => visitsService.get(id, signal), ...CACHE_CLASSES.record })
  const [tab, setTab] = React.useState<TabId>("overview")
  const [recordDirty, setRecordDirty] = React.useState(false) // the clinical record form holds changes that are not saved
  const [dialog, setDialog] = React.useState<Dialog | null>(null)
  const [discarded, setDiscarded] = React.useState<{ label: string; value: string }[]>([])

  if (q.isError && !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404
    return (
      <div role="alert" data-testid="visit-error">
        <EmptyState icon={notFound ? FileText : AlertTriangle} title={notFound ? "Encounter not found" : "Couldn't load this encounter"} subtitle={notFound ? "This encounter does not exist." : undefined}
          action={notFound ? undefined : <Button variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
        {!notFound && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </div>
    )
  }
  if (!q.data) return <div className="space-y-4" role="status" aria-label="Loading encounter"><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>

  const v: VisitDetail = q.data
  const ipdOn = modules?.ipd === true
  const tz = settings?.timezone
  const when = (iso: string | null) => (iso && tz ? formatInstant(iso, tz) : "—")
  const reload = () => void q.refetch()
  const done = (saved: VisitDetail | null) => { if (saved) qc.setQueryData(key, saved); else reload() }
  const actionStates = visitActionStates(v, can, ipdOn)
  const editable = !v.archived && v.status === "open" && actionStates.some((s) => s.enabled && s.action === "edit_record")
  const canVitals = can("encounters.read")
  const showNotes = v.type === "ipd" && can("encounters.read")
  const open = (a: VisitAction) => {
    if (a === "record_vitals") return setTab("vitals")
    if (a === "edit_record") return setTab("record")
    if (a === "add_note") return setTab("notes")
    setDialog(a)
  }
  const common = { visit: v, onClose: () => setDialog(null), onDone: done, onReload: reload }

  return (
    <div className="space-y-6 pb-10" data-testid="visit-detail">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 to-teal-800 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold" data-testid="visit-encid">{v.encId}</h1>
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold">{TYPE_LABEL[v.type]}</span>
              <StatusBadge status={STATUS_LABEL[v.status]} />
              {v.priority === "urgent" && <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold">Urgent</span>}
              {v.pending && <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">To finish</span>}
            </div>
            <div className="mt-2 text-lg font-bold">
              <Link href={`/patients/${v.patient.id}`} className="hover:underline">{v.patient.name}</Link>
              <span className="ml-3 font-mono text-sm font-normal text-teal-100">{v.patient.mrNo}</span>
              {settings && <span className="ml-3 text-sm font-normal text-teal-100">{formatPatientAge(v.patient, settings.today)} · {v.patient.gender.charAt(0)}</span>}
            </div>
            <div className="mt-1 text-sm text-teal-100">
              {v.doctor.name}{v.tokenNo !== null && <> · token {tokenLabel(v)}</>}{v.bed && <> · {v.bed.wardName}, bed {v.bed.bedNo}</>} · started {when(v.startedAt)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="visit-actions">
            {actionStates.map((s) => (
              <span key={s.action} title={s.reason ?? undefined} className="inline-flex">
                <Button variant="outline" disabled={!s.enabled} title={s.reason ?? undefined} data-reason={s.reason ?? undefined} className="h-10 rounded-xl border-white/40 bg-transparent font-bold text-white hover:bg-white/10 hover:text-white disabled:opacity-50" onClick={() => open(s.action)}>{ACTION_LABEL[s.action]}</Button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {v.archived && <div role="status" data-testid="visit-archived" className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800"><span className="font-bold">Archived{v.archivedAt ? ` on ${when(v.archivedAt)}` : ""}.</span> It is hidden from the lists and cannot be changed until it is restored.</div>}
      {v.status === "cancelled" && <div role="status" data-testid="visit-cancelled" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><span className="font-bold">Cancelled{v.cancelledAt ? ` on ${when(v.cancelledAt)}` : ""}.</span> {v.cancelReason}</div>}
      {v.patient.deceasedOn && <div role="status" data-testid="visit-deceased" className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">This patient is recorded as deceased on <span className="font-bold">{v.patient.deceasedOn}</span>.</div>}

      <Tabs value={tab} onValueChange={(t) => setTab(t as TabId)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canVitals && <TabsTrigger value="vitals">Vitals</TabsTrigger>}
          <TabsTrigger value="record">Clinical record</TabsTrigger>
          {showNotes && <TabsTrigger value="notes">Progress notes</TabsTrigger>}
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5" aria-label="Check-in details">
            <h3 className="font-black text-[#0D1B2E]">{v.type === "ipd" ? "Admission" : "Check-in"}</h3>
            <Row label="Doctor" value={v.doctor.name} />
            {v.admissionType && <Row label="Admission type" value={v.admissionType === "emergency" ? "Emergency" : "Planned"} />}
            <Row label="Priority" value={v.priority === "urgent" ? "Urgent" : "Normal"} />
            <Row label="Reason" value={v.reason ?? "—"} />
            <Row label="Advised by" value={v.advisedBy ?? "—"} />
            <Row label="Referred by" value={v.referredBy ?? "—"} />
            {v.appointment && <Row label="Appointment" value={v.appointment.appointmentNo} />}
            {v.closedAt && <Row label="Closed" value={when(v.closedAt)} />}
            {v.dischargedAt && <Row label="Discharged" value={when(v.dischargedAt)} />}
          </section>
          {v.type === "ipd" && (
            <section className="space-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5" aria-label="Beds">
              <h3 className="font-black text-[#0D1B2E]">Beds</h3>
              {v.bedHistory.length === 0 ? <p className="text-slate-500">No bed assigned.</p> : (
                <ul className="space-y-1.5" data-testid="bed-history">
                  {v.bedHistory.map((b) => (
                    <li key={`${b.bedId}-${b.assignedAt}`} className="flex flex-wrap justify-between gap-2"><span className="font-bold text-slate-800">{b.wardName}, bed {b.bedNo}</span><span className="text-slate-500">{when(b.assignedAt)} → {b.releasedAt ? when(b.releasedAt) : "now"}</span></li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {v.clinical?.discharge && (
            <section className="space-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5 lg:col-span-2" aria-label="Discharge" data-testid="discharge-block">
              <h3 className="font-black text-[#0D1B2E]">Discharge</h3>
              <Row label="Condition" value={CONDITION_LABEL[v.clinical.discharge.condition] ?? v.clinical.discharge.condition} />
              <Row label="Diagnoses" value={v.clinical.discharge.diagnoses.map((d) => `${d.icdCode ? `${d.icdCode.code} ` : ""}${d.text}${d.isPrimary ? " (primary)" : ""}`).join("; ") || "—"} />
              {v.clinical.discharge.summary && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-700">{v.clinical.discharge.summary}</p>}
              {v.clinical.discharge.followUpInstructions && <Row label="Follow-up" value={v.clinical.discharge.followUpInstructions} />}
            </section>
          )}
        </TabsContent>

        {canVitals && <TabsContent value="vitals" forceMount className="data-[state=inactive]:hidden"><VitalsPanel visit={v} canRecord={!v.archived && v.status === "open" && can("encounters.record_vitals")} /></TabsContent>}

        <TabsContent value="record" forceMount className="space-y-4 data-[state=inactive]:hidden">
          {discarded.length > 0 && (
            <details open data-testid="discarded-text" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <summary className="cursor-pointer font-bold">Your unsaved text from before the latest version was loaded</summary>
              <dl className="mt-2 space-y-2">{discarded.map((d) => <div key={d.label}><dt className="text-xs font-bold uppercase tracking-wider">{d.label}</dt><dd className="whitespace-pre-line">{d.value}</dd></div>)}</dl>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setDiscarded([])}>Dismiss</Button>
            </details>
          )}
          {v.clinical === null ? (
            <EmptyState icon={FileText} title="The clinical record is not shown to your role" subtitle="Check-in details are on the Overview tab." />
          ) : (
            <ClinicalRecordForm key={`${v.id}:${v.updatedAt}`} visit={v} clinical={v.clinical} editable={editable} onDirty={setRecordDirty} onSaved={(saved) => done(saved)} onReload={(typed) => { setDiscarded(typed); reload() }} />
          )}
        </TabsContent>

        {showNotes && <TabsContent value="notes" forceMount className="data-[state=inactive]:hidden"><ProgressNotesPanel visit={v} canWrite={!v.archived && v.status === "open" && can("encounters.write")} /></TabsContent>}

        <TabsContent value="billing">
          <VisitBillTab visitId={v.id} />
        </TabsContent>
      </Tabs>

      {dialog === "close" && <CloseVisitDialog {...common} unsaved={recordDirty} />}
      {dialog === "cancel" && <ReasonDialog kind="cancel" {...common} />}
      {dialog === "reopen" && <ReasonDialog kind="reopen" {...common} />}
      {dialog === "archive" && <ArchiveDialog restore={false} {...common} />}
      {dialog === "restore" && <ArchiveDialog restore {...common} />}
      {dialog === "transfer" && <TransferDialog {...common} />}
      {dialog === "discharge" && <DischargeDialog {...common} />}
      {dialog === "correct_check_in" && <CorrectCheckInDialog {...common} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-800">{value}</span></div>
}
