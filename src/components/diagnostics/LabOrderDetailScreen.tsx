"use client"
import * as React from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FlaskConical, Printer } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { labApiService, type DxLabOrder, type DxLabOrderAction, type DxLabTest, type DxLabTestAction, type DxSpecimen, type DxSpecimenAction } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { showMoney } from "@/components/billing/billingUi"
import { CriticalBadge, DxStatusBadge, DxTestStatusBadge, FlagValue, PriorityBadge } from "./DxBits"
import { AddTestsDialog, ConfirmDialog, ReasonDialog } from "./DxDialogs"
import { RemarksDialog, ResultDialog } from "./LabDialogs"
const SpecimenLabelDialog = dynamic(() => import("./SpecimenLabel").then((m) => m.SpecimenLabelDialog), { ssr: false })
const LabReportDialog = dynamic(() => import("./PrintViews").then((m) => m.LabReportDialog), { ssr: false })
import { LAB_ORDER_ACTION_LABEL, LAB_ORDER_ACTION_ORDER, LAB_TEST_ACTION_LABEL, LAB_TEST_ACTION_ORDER, SPECIMEN_ACTION_LABEL, SPECIMEN_ACTION_ORDER, SPECIMEN_STATUS_LABEL, inOrder } from "./dxUi"

type Open =
  | { kind: "order"; action: DxLabOrderAction }
  | { kind: "specimen"; action: DxSpecimenAction; specimen: DxSpecimen }
  | { kind: "test"; action: DxLabTestAction; test: DxLabTest }
  | { kind: "report" }
  | { kind: "label"; specimen: DxSpecimen }
  | null

const btn = "h-9 rounded-lg px-3 text-xs font-bold"

/**
 * A lab order (L3 to L7). Every button is one of the `allowedActions` the server sent for this user and this state, on the order, on each specimen and on each
 * test, in a fixed order, and nothing else. A result is final only when it is verified; an amendment shows the old values beside the new ones. A critical value
 * is loud. Every action is one request; the answer replaces what is on screen.
 */
export function LabOrderDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const { can, modules } = useAccess()
  const off = modules ? modules.lab === false : false
  const { settings } = useHospital()
  const qc = useQueryClient()
  const key = useScopedKey("labApi", "detail", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => labApiService.get(id, signal), ...CACHE_CLASSES.record })
  const [open, setOpen] = React.useState<Open>(null)
  const close = () => setOpen(null)
  const tz = settings?.timezone
  const when = (iso: string | null) => (iso && tz ? formatInstant(iso, tz) : "—")
  // the action's answer is the order as it now is; an unreadable answer (null) is read again
  const done = (saved: DxLabOrder | null) => { if (saved) qc.setQueryData(key, saved); else void q.refetch() }

  if (q.isPending) return <div className="space-y-4" role="status" aria-label="Loading the order"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const o = q.data as NonNullable<typeof q.data>
  const critical = o.tests.some((t) => t.result?.parameters.some((p) => p.flag === "critical"))

  return (
    <div className="space-y-6 pb-10" data-testid="lab-order-detail">
      <div className="rounded-[1.5rem] bg-[#0F2A4D] p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black" data-testid="order-no">{o.orderNo}</h1>
              <DxStatusBadge status={o.status} /><PriorityBadge priority={o.priority} />{critical && <CriticalBadge />}
            </div>
            <p className="mt-1 text-sm text-teal-100">
              <Link className="font-bold underline" href={`/patients/${o.patient.id}`}>{o.patient.name}</Link> · {o.patient.mrNo} · ordered {when(o.orderedAt)}
              {o.encounter && <> · <Link className="font-bold underline" href={`/encounters/${o.encounter.id}`}>{o.encounter.encId}</Link></>}
            </p>
            <p className="text-sm text-teal-100">{o.doctor ? `Dr ${o.doctor.name.replace(/^Dr\.? /, "")}` : o.referringDoctorText ? `Outside doctor: ${o.referringDoctorText}` : "No ordering doctor"}</p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="order-actions">
            {inOrder(o.allowedActions, LAB_ORDER_ACTION_ORDER).map((a) => (
              <Button key={a} variant="outline" className={`${btn} border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white`} onClick={() => setOpen({ kind: "order", action: a })}>{LAB_ORDER_ACTION_LABEL[a]}</Button>
            ))}
            {can("diagnostics.read") && <Button variant="outline" className={`${btn} border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white`} onClick={() => setOpen({ kind: "report" })}><Printer className="mr-1 h-3.5 w-3.5" /> Report</Button>}
          </div>
        </div>
      </div>

      {off && <div role="status" data-testid="module-off-notice" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">The laboratory department is switched off here. This record stays readable; working it is refused.</div>}
      {o.archived && <div role="status" data-testid="order-archived" className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm font-bold text-slate-700">This order is archived (placed in error). It is kept on file.</div>}
      {o.fulfillment === "external_referral" && <div role="status" data-testid="order-referral" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">External referral{o.referredTo ? ` to ${o.referredTo}` : ""}: recorded, but not charged or worked here.</div>}
      {o.status === "cancelled" && <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Every test on this order was cancelled.</div>}
      {o.status === "delivered" && <div role="status" data-testid="order-delivered" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Delivered {when(o.deliveredAt)}{o.deliveredBy ? ` by ${o.deliveredBy.name}` : ""}.</div>}
      {o.clinicalNotes && <p className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5"><span className="font-bold">Clinical notes: </span>{o.clinicalNotes}</p>}
      {o.pathologistRemarks && <p data-testid="pathologist-remarks" className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5"><span className="font-bold">Pathologist&apos;s remarks: </span>{o.pathologistRemarks}</p>}

      {o.fulfillment === "internal" && (
        <section className="space-y-3" data-testid="specimens">
          <h2 className="text-lg font-black text-[#0D1B2E]">Specimens</h2>
          {o.specimens.length === 0 ? <EmptyState icon={FlaskConical} title="No specimen needed" subtitle="Tests that need no tube are worked directly." /> : o.specimens.map((s) => (
            <div key={s.id} data-testid={`specimen-${s.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div>
                <div className="font-mono text-sm font-black" data-testid={`specimen-no-${s.id}`}>{s.specimenNo}</div>
                <div className="text-xs text-slate-500">{s.specimenType} · {SPECIMEN_STATUS_LABEL[s.status]}{s.collectedAt ? ` ${when(s.collectedAt)}${s.collectedBy ? ` by ${s.collectedBy.name}` : ""}` : ""}</div>
                {s.status === "rejected" && <div className="text-xs font-bold text-red-700">Rejected: {s.rejectedReason}</div>}
                {s.replacesSpecimenId && <div className="text-xs text-slate-500">Replaces a rejected tube. Print this tube&apos;s label.</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.status !== "rejected" && <Button variant="outline" className={btn} data-testid={`label-${s.id}`} onClick={() => setOpen({ kind: "label", specimen: s })}><Printer className="mr-1.5 h-3.5 w-3.5" /> Print label</Button>}
                {inOrder(s.allowedActions, SPECIMEN_ACTION_ORDER).map((a) => <Button key={a} variant={a === "reject" ? "outline" : "default"} className={btn} onClick={() => setOpen({ kind: "specimen", action: a, specimen: s })}>{SPECIMEN_ACTION_LABEL[a]}</Button>)}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3" data-testid="tests">
        <h2 className="text-lg font-black text-[#0D1B2E]">Tests</h2>
        {o.tests.map((t) => (
          <div key={t.id} data-testid={`test-${t.id}`} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><span className="font-black">{t.name}</span><DxTestStatusBadge status={t.status} />{t.result?.parameters.some((p) => p.flag === "critical") && <CriticalBadge />}</div>
                <div className="text-xs text-slate-500">{showMoney(t.rate)}{t.charge ? (t.charge.paid ? " · paid" : ` · received ${showMoney(t.charge.received)} of ${showMoney(t.charge.total)}`) : ""}</div>
                {t.status === "cancelled" && <div className="text-xs font-bold text-red-700">Cancelled: {t.cancelledReason}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {inOrder(t.allowedActions, LAB_TEST_ACTION_ORDER).map((a) => <Button key={a} variant={a === "cancel" ? "outline" : "default"} className={btn} onClick={() => setOpen({ kind: "test", action: a, test: t })}>{LAB_TEST_ACTION_LABEL[a]}</Button>)}
              </div>
            </div>
            {t.result && (
              <div data-testid={`result-${t.id}`}>
                {t.result.parameters.length > 0 ? (
                  <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Parameter</th><th>Result</th><th>Reference</th></tr></thead>
                    <tbody>{t.result.parameters.map((p) => <tr key={p.key} className="border-b border-slate-100"><td className="py-1.5">{p.name}</td><td><FlagValue value={p.value} flag={p.flag} unit={p.unit} /></td><td className="text-xs text-slate-500">{p.normalRange ?? ""}</td></tr>)}</tbody></table>
                ) : <p className="whitespace-pre-wrap text-sm">{t.result.narrative}</p>}
                <p className="mt-1 text-xs text-slate-500" data-testid={`result-state-${t.id}`}>
                  {t.result.verifiedAt ? `Final: verified by ${t.result.verifiedBy?.name} ${when(t.result.verifiedAt)}` : "Not final: awaiting verification"} · entered by {t.result.enteredBy.name} {when(t.result.enteredAt)}
                </p>
              </div>
            )}
            {t.amendments.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs" data-testid={`amendments-${t.id}`}>
                {t.amendments.map((a) => (
                  <p key={a.version}><span className="font-bold">Amended (version {a.version}) by {a.amendedBy.name}, {when(a.amendedAt)}:</span> {a.reason}. Before: {a.previous.parameters.length > 0 ? a.previous.parameters.map((p) => `${p.name} ${p.value}${p.unit ? ` ${p.unit}` : ""}`).join(", ") : a.previous.narrative ?? "—"}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {open?.kind === "order" && open.action === "add_test" && <AddTestsDialog kind="lab" orderNo={o.orderNo} onConfirm={(tests) => labApiService.addTests(o.id, tests)} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "write_remarks" && <RemarksDialog order={o} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "deliver" && <ConfirmDialog title="Mark delivered" confirmLabel="Mark delivered" pendingLabel="Saving…" description={`Hand ${o.orderNo} over to ${o.patient.name}. Delivery is recorded under your name.`} onConfirm={() => labApiService.deliver(o.id)} onClose={close} onDone={done} />}
      {open?.kind === "label" && <SpecimenLabelDialog order={o} specimen={open.specimen} timezone={tz} onClose={close} />}
      {open?.kind === "order" && open.action === "archive" && <ReasonDialog title="Archive order" confirmLabel="Archive" pendingLabel="Archiving…" description={`Archive ${o.orderNo}? Use this for an order placed in error. It is hidden from the lists but kept on file.`} onConfirm={(reason) => labApiService.archive(o.id, reason)} onClose={close} onDone={done} />}
      {open?.kind === "order" && open.action === "restore" && <ConfirmDialog title="Restore order" confirmLabel="Restore" pendingLabel="Restoring…" description={`Bring ${o.orderNo} back into the lists.`} onConfirm={() => labApiService.restore(o.id)} onClose={close} onDone={done} />}
      {open?.kind === "specimen" && open.action === "collect" && <ConfirmDialog title="Mark collected" confirmLabel="Mark collected" pendingLabel="Saving…" description={`The tube ${open.specimen.specimenNo} (${open.specimen.specimenType}) has been drawn. It is recorded under your name, now.`} onConfirm={() => labApiService.collect(o.id, (open as { specimen: DxSpecimen }).specimen.id)} onClose={close} onDone={done} />}
      {open?.kind === "specimen" && open.action === "reject" && <ReasonDialog title="Reject specimen" confirmLabel="Reject specimen" pendingLabel="Rejecting…" description={`Reject ${open.specimen.specimenNo}. A replacement tube is opened with a new number to print.`} onConfirm={(reason) => labApiService.reject(o.id, (open as { specimen: DxSpecimen }).specimen.id, reason)} onClose={close} onDone={done} />}
      {open?.kind === "test" && (open.action === "enter_result" || open.action === "amend") && <ResultDialog order={o} test={open.test} amend={open.action === "amend"} onClose={close} onDone={done} />}
      {open?.kind === "test" && open.action === "verify" && <ConfirmDialog title="Verify result" confirmLabel="Verify" pendingLabel="Verifying…" description={`Verify ${open.test.name}. It becomes final and can be printed. You cannot verify a result you entered yourself.`} onConfirm={() => labApiService.verify(o.id, (open as { test: DxLabTest }).test.id)} onClose={close} onDone={done} />}
      {open?.kind === "test" && open.action === "cancel" && <ReasonDialog title="Cancel test" confirmLabel="Cancel test" pendingLabel="Cancelling…" description={`Cancel ${open.test.name}. Its charge is voided or credited.`} onConfirm={(reason) => labApiService.cancelTest(o.id, (open as { test: DxLabTest }).test.id, reason)} onClose={close} onDone={done} />}
      {open?.kind === "report" && <LabReportDialog id={o.id} onClose={close} />}
    </div>
  )
}
