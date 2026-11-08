"use client"
import * as React from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Printer } from "lucide-react"

import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { imagingApiService, type DxImagingOrder, type DxImagingOrderAction, type DxImagingTest, type DxImagingTestAction } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { showMoney } from "@/components/billing/billingUi"
import { DxStatusBadge, DxTestStatusBadge, PriorityBadge } from "./DxBits"
import { AddTestsDialog, ConfirmDialog, ReasonDialog } from "./DxDialogs"
import { ReportDialog } from "./ImagingDialogs"
const ImagingReportDialog = dynamic(() => import("./PrintViews").then((m) => m.ImagingReportDialog), { ssr: false })
import { IMAGING_ORDER_ACTION_LABEL, IMAGING_ORDER_ACTION_ORDER, IMAGING_TEST_ACTION_LABEL, IMAGING_TEST_ACTION_ORDER, inOrder } from "./dxUi"

type Open =
  | { kind: "order"; action: DxImagingOrderAction }
  | { kind: "test"; action: DxImagingTestAction; test: DxImagingTest }
  | { kind: "print" }
  | null

const btn = "h-9 rounded-lg px-3 text-xs font-bold"

/**
 * An imaging order (I3 to I5). Every button is one of the `allowedActions` the server sent for this user and this state, on the order and on each test, in a fixed
 * order, and nothing else. A radiographer or nurse marks a test performed; ONE doctor writes and signs the report, final only once signed (`signedAt`). A test that
 * needs no report (an ECG tracing) is done once performed. Every action is one request; the answer replaces what is on screen.
 */
export function ImagingOrderDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const { can, modules } = useAccess()
  const off = modules ? modules.imaging === false : false
  const { settings } = useHospital()
  const qc = useQueryClient()
  const key = useScopedKey("imagingApi", "detail", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => imagingApiService.get(id, signal), ...CACHE_CLASSES.record })
  const [open, setOpen] = React.useState<Open>(null)
  const close = () => setOpen(null)
  const tz = settings?.timezone
  const when = (iso: string | null) => (iso && tz ? formatInstant(iso, tz) : "—")
  const done = (saved: DxImagingOrder | null) => { if (saved) qc.setQueryData(key, saved); else void q.refetch() }

  if (q.isPending) return <div className="space-y-4" role="status" aria-label="Loading the order"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const o = q.data as NonNullable<typeof q.data>

  return (
    <div className="space-y-6 pb-10" data-testid="imaging-order-detail">
      <div className="rounded-[1.5rem] bg-[#0F2A4D] p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black" data-testid="order-no">{o.orderNo}</h1><DxStatusBadge status={o.status} /><PriorityBadge priority={o.priority} /></div>
            <p className="mt-1 text-sm text-teal-100">
              <Link className="font-bold underline" href={`/patients/${o.patient.id}`}>{o.patient.name}</Link> · {o.patient.mrNo} · ordered {when(o.orderedAt)}
              {o.encounter && <> · <Link className="font-bold underline" href={`/encounters/${o.encounter.id}`}>{o.encounter.encId}</Link></>}
            </p>
            <p className="text-sm text-teal-100">{o.doctor ? o.doctor.name : o.referringDoctorText ? `Outside doctor: ${o.referringDoctorText}` : "No ordering doctor"}</p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="order-actions">
            {inOrder(o.allowedActions, IMAGING_ORDER_ACTION_ORDER).map((a) => (
              <Button key={a} variant="outline" className={`${btn} border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white`} onClick={() => setOpen({ kind: "order", action: a })}>{IMAGING_ORDER_ACTION_LABEL[a]}</Button>
            ))}
            {can("diagnostics.read") && <Button variant="outline" className={`${btn} border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white`} onClick={() => setOpen({ kind: "print" })}><Printer className="mr-1 h-3.5 w-3.5" /> Report</Button>}
          </div>
        </div>
      </div>

      {off && <div role="status" data-testid="module-off-notice" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">The imaging department is switched off here. This record stays readable; working it is refused.</div>}
      {o.archived && <div role="status" data-testid="order-archived" className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm font-bold text-slate-700">This order is archived (placed in error). It is kept on file.</div>}
      {o.fulfillment === "external_referral" && <div role="status" data-testid="order-referral" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">External referral{o.referredTo ? ` to ${o.referredTo}` : ""}: recorded, but not charged or worked here.</div>}
      {o.status === "delivered" && <div role="status" data-testid="order-delivered" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Delivered {when(o.deliveredAt)}{o.deliveredBy ? ` by ${o.deliveredBy.name}` : ""}.</div>}
      {o.clinicalNotes && <p className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5"><span className="font-bold">Clinical notes: </span>{o.clinicalNotes}</p>}

      <section className="space-y-3" data-testid="tests">
        <h2 className="text-lg font-black text-[#0D1B2E]">Tests</h2>
        {o.tests.map((t) => (
          <div key={t.id} data-testid={`test-${t.id}`} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><span className="font-black">{t.name}</span><span className="text-xs text-slate-500">{t.modality}</span><DxTestStatusBadge status={t.status} /></div>
                <div className="text-xs text-slate-500">{showMoney(t.rate)}{t.charge ? (t.charge.paid ? " · paid" : ` · received ${showMoney(t.charge.received)} of ${showMoney(t.charge.total)}`) : ""}{!t.reportRequired ? " · no report needed" : ""}</div>
                {t.performedBy && <div className="text-xs text-slate-500">Performed by {t.performedBy.name} {when(t.performedAt)}</div>}
                {t.status === "cancelled" && <div className="text-xs font-bold text-red-700">Cancelled: {t.cancelledReason}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {inOrder(t.allowedActions, IMAGING_TEST_ACTION_ORDER).map((a) => <Button key={a} variant={a === "cancel" ? "outline" : "default"} className={btn} onClick={() => setOpen({ kind: "test", action: a, test: t })}>{IMAGING_TEST_ACTION_LABEL[a]}</Button>)}
              </div>
            </div>
            {t.report && (
              <div data-testid={`report-${t.id}`}>
                <p className="whitespace-pre-wrap text-sm">{t.report.narrative}</p>
                <p className="mt-1 text-xs text-slate-500" data-testid={`report-state-${t.id}`}>
                  {t.report.signedAt ? `Final: signed by ${t.report.signedBy?.name} ${when(t.report.signedAt)}` : "Not final: awaiting the doctor's signature"} · written by {t.report.writtenBy.name} {when(t.report.writtenAt)}
                </p>
              </div>
            )}
            {t.amendments.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs" data-testid={`amendments-${t.id}`}>
                {t.amendments.map((a) => <p key={a.version}><span className="font-bold">Amended (version {a.version}) by {a.amendedBy.name}, {when(a.amendedAt)}:</span> {a.reason}. Before: {a.previousNarrative ?? "—"}</p>)}
              </div>
            )}
          </div>
        ))}
      </section>

      {open?.kind === "order" && open.action === "add_test" && <AddTestsDialog kind="imaging" orderNo={o.orderNo} onConfirm={(tests) => imagingApiService.addTests(o.id, tests)} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "deliver" && <ConfirmDialog title="Mark delivered" confirmLabel="Mark delivered" pendingLabel="Saving…" description={`Hand the films and reports of ${o.orderNo} over to ${o.patient.name}. Delivery is recorded under your name.`} onConfirm={() => imagingApiService.deliver(o.id)} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "archive" && <ReasonDialog title="Archive order" confirmLabel="Archive" pendingLabel="Archiving…" description={`Archive ${o.orderNo}? Use this for an order placed in error. It is hidden from the lists but kept on file.`} onConfirm={(reason) => imagingApiService.archive(o.id, reason)} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "restore" && <ConfirmDialog title="Restore order" confirmLabel="Restore" pendingLabel="Restoring…" description={`Bring ${o.orderNo} back into the lists.`} onConfirm={() => imagingApiService.restore(o.id)} onClose={close} onDone={done} />}
      {open?.kind === "test" && open.action === "perform" && <ConfirmDialog title="Mark performed" confirmLabel="Mark performed" pendingLabel="Saving…" description={`${open.test.name} has been done. It is recorded under your name, now.`} onConfirm={() => imagingApiService.perform(o.id, (open as { test: DxImagingTest }).test.id)} onClose={close} onDone={done} />}
      {open?.kind === "test" && (open.action === "write_report" || open.action === "amend") && <ReportDialog order={o} test={open.test} amend={open.action === "amend"} onClose={close} onDone={done} />}
      {open?.kind === "test" && open.action === "sign" && <ConfirmDialog title="Sign report" confirmLabel="Sign report" pendingLabel="Signing…" description={`Sign the report of ${open.test.name}. It becomes final and can be printed; later changes are amendments.`} onConfirm={() => imagingApiService.sign(o.id, (open as { test: DxImagingTest }).test.id)} onClose={close} onDone={done} />}
      {open?.kind === "test" && open.action === "cancel" && <ReasonDialog title="Cancel test" confirmLabel="Cancel test" pendingLabel="Cancelling…" description={`Cancel ${open.test.name}. Its charge is voided or credited.`} onConfirm={(reason) => imagingApiService.cancelTest(o.id, (open as { test: DxImagingTest }).test.id, reason)} onClose={close} onDone={done} />}
      {open?.kind === "print" && <ImagingReportDialog id={o.id} onClose={close} />}
    </div>
  )
}
