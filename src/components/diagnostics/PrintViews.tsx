"use client"
import { useQuery } from "@tanstack/react-query"

import { PrintButtons } from "@/components/print/PrintButtons"
import { ErrorState } from "@/components/shared/ErrorState"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { imagingApiService, labApiService, type DxImagingPrint, type DxLabPrint, type DxPrintHospital, type DxPrintPatient } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { FlagValue } from "./DxBits"


function Header({ hospital, orderNo, patient, referringDoctor, orderedAt, encounterNo, timezone }: { hospital: DxPrintHospital; orderNo: string; patient: DxPrintPatient; referringDoctor: string; orderedAt: string; encounterNo: string | null; timezone?: string }) {
  return (
    <>
      <div className="text-center">
        <div className="text-lg font-black">{hospital.name}</div>
        {hospital.address && <div className="text-xs text-slate-500">{hospital.address}{hospital.phone ? ` · ${hospital.phone}` : ""}</div>}
        {hospital.printHeader && <div className="text-xs text-slate-500">{hospital.printHeader}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2 border-y border-slate-200 py-3 text-xs">
        <div><span className="text-slate-500">Patient </span><span className="font-bold" data-testid="print-patient">{patient.name}</span> · {patient.mrNo}</div>
        <div><span className="text-slate-500">Order </span><span className="font-mono font-bold" data-testid="print-order-no">{orderNo}</span></div>
        <div><span className="text-slate-500">Date of birth </span>{patient.dateOfBirth}{patient.dateOfBirthEstimated ? " (estimated)" : ""} · {patient.gender}</div>
        <div><span className="text-slate-500">Ordered </span>{timezone ? formatInstant(orderedAt, timezone) : orderedAt}{encounterNo ? ` · ${encounterNo}` : ""}</div>
        <div className="col-span-2"><span className="text-slate-500">Referring doctor </span>{referringDoctor}</div>
      </div>
    </>
  )
}
const Pending = ({ pending, complete, noun }: { pending: string[]; complete: boolean; noun: string }) =>
  !complete ? <div role="status" data-testid="print-pending" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-900">This report is not complete: {pending.length > 0 ? `${pending.join(", ")} ${pending.length === 1 ? "is" : "are"} still pending` : `${noun} still pending`}.</div> : null

/** The lab report: VERIFIED results only (the server leaves everything else out), amendments with what they replaced, and what is still pending. */
export function LabReportView({ report, timezone }: { report: DxLabPrint; timezone?: string }) {
  return (
    <div id="dx-print" className="print-root space-y-4 text-sm" data-testid="lab-report">
      <Header hospital={report.hospital} orderNo={report.orderNo} patient={report.patient} referringDoctor={report.referringDoctor} orderedAt={report.orderedAt} encounterNo={report.encounterNo} timezone={timezone} />
      {report.specimens.length > 0 && <p className="text-xs text-slate-500">Specimens: {report.specimens.map((s) => `${s.specimenNo} (${s.specimenType})`).join(", ")}</p>}
      {report.tests.map((t) => (
        <section key={t.name} className="space-y-1" data-testid={`print-test-${t.name}`}>
          <h4 className="font-black">{t.name}{t.amended && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Amended</span>}</h4>
          {t.parameters.length > 0 ? (
            <table className="w-full text-xs"><thead><tr className="border-b text-left text-slate-500"><th className="py-1">Test</th><th>Result</th><th>Reference</th></tr></thead>
              <tbody>{t.parameters.map((p) => <tr key={p.name} className="border-b border-slate-100"><td className="py-1">{p.name}</td><td><FlagValue value={p.value} flag={p.flag} unit={p.unit} /></td><td className="text-slate-500">{p.normalRange ?? ""}</td></tr>)}</tbody></table>
          ) : t.narrative ? <p className="whitespace-pre-wrap">{t.narrative}</p> : null}
          {t.amendments.map((a) => <p key={a.version} className="text-[11px] text-slate-500">Amended (version {a.version}): {a.reason}. Before: {a.previous.parameters.length > 0 ? a.previous.parameters.map((p) => `${p.name} ${p.value}`).join(", ") : a.previous.narrative ?? "—"}</p>)}
          <p className="text-[11px] text-slate-500">Entered by {t.enteredBy} · verified by {t.verifiedBy}, {timezone ? formatInstant(t.verifiedAt, timezone) : t.verifiedAt}</p>
        </section>
      ))}
      {report.pathologistRemarks && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs"><span className="font-bold">Pathologist&apos;s remarks: </span>{report.pathologistRemarks}</p>}
      <Pending pending={report.pending} complete={report.complete} noun="results are" />
    </div>
  )
}

/** The imaging report: SIGNED reports only. A test performed but not yet signed is listed as unreported, never as a result. */
export function ImagingReportView({ report, timezone }: { report: DxImagingPrint; timezone?: string }) {
  return (
    <div id="dx-print" className="print-root space-y-4 text-sm" data-testid="imaging-report">
      <Header hospital={report.hospital} orderNo={report.orderNo} patient={report.patient} referringDoctor={report.referringDoctor} orderedAt={report.orderedAt} encounterNo={report.encounterNo} timezone={timezone} />
      {report.reports.map((r) => (
        <section key={r.name} className="space-y-1" data-testid={`print-report-${r.name}`}>
          <h4 className="font-black">{r.name} <span className="text-xs font-normal text-slate-500">{r.modality}</span>{r.amended && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Amended</span>}</h4>
          <p className="whitespace-pre-wrap">{r.narrative}</p>
          {r.amendments.map((a) => <p key={a.version} className="text-[11px] text-slate-500">Amended (version {a.version}): {a.reason}. Before: {a.previousNarrative ?? "—"}</p>)}
          <p className="text-[11px] text-slate-500">{r.performedBy ? `Performed by ${r.performedBy} · ` : ""}Signed by {r.signedBy}, {timezone ? formatInstant(r.signedAt, timezone) : r.signedAt}</p>
        </section>
      ))}
      {report.unreported.length > 0 && <p data-testid="print-unreported" className="text-xs text-slate-500">Performed, report not yet signed: {report.unreported.map((u) => `${u.name} (${u.modality})`).join(", ")}.</p>}
      <Pending pending={report.pending} complete={report.complete} noun="reports are" />
    </div>
  )
}

function ReportDialog({ id, kind, onClose }: { id: string; kind: "lab" | "imaging"; onClose: () => void }) {
  const { settings } = useHospital()
  const key = useScopedKey(kind === "lab" ? "labApi" : "imagingApi", "report", id)
  // a print is never cached: it is read fresh every time it is opened
  const lab = useQuery({ queryKey: key, queryFn: ({ signal }) => labApiService.report(id, signal), staleTime: 0, gcTime: 0, enabled: kind === "lab" })
  const img = useQuery({ queryKey: key, queryFn: ({ signal }) => imagingApiService.report(id, signal), staleTime: 0, gcTime: 0, enabled: kind === "imaging" })
  const q = kind === "lab" ? lab : img
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="report-dialog">
        <DialogHeader><DialogTitle>{kind === "lab" ? "Lab report" : "Imaging report"}</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-56 w-full rounded-2xl" role="status" aria-label="Loading the report" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            {kind === "lab" ? <LabReportView report={lab.data as DxLabPrint} timezone={settings?.timezone} /> : <ImagingReportView report={img.data as DxImagingPrint} timezone={settings?.timezone} />}
            <PrintButtons papers={["a4"]} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
export const LabReportDialog = ({ id, onClose }: { id: string; onClose: () => void }) => <ReportDialog id={id} kind="lab" onClose={onClose} />
export const ImagingReportDialog = ({ id, onClose }: { id: string; onClose: () => void }) => <ReportDialog id={id} kind="imaging" onClose={onClose} />
