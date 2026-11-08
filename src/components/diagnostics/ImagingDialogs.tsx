"use client"
import * as React from "react"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DX_LIMITS, imagingApiService, type DxImagingOrder, type DxImagingTest } from "@/lib/services"

/**
 * Write (I4) or amend a report. Writing starts from the test's normal-report template when it has one, and may be done by whoever performed it or by the doctor who
 * signs (diagnostics.perform or diagnostics.verify). Amending a signed report needs a reason (3 to 500) and the old text stays on file. A report is final only once
 * signed (a separate action).
 */
export function ReportDialog({ order, test, amend, onClose, onDone }: { order: DxImagingOrder; test: DxImagingTest; amend: boolean; onClose: () => void; onDone: (saved: DxImagingOrder | null) => void }) {
  const [narrative, setNarrative] = React.useState(test.report?.narrative ?? test.reportTemplate ?? "")
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      wide title={amend ? `Amend report: ${test.name}` : `Report: ${test.name}`} confirmLabel={amend ? "Save amendment" : "Save report"} pendingLabel="Saving…"
      canConfirm={narrative.trim() !== "" && (!amend || reason.trim().length >= DX_LIMITS.reason.min)} onClose={onClose} onDone={onDone}
      description={amend ? "The corrected report replaces the signed one; the old text stays on file beside it." : test.reportTemplate && !test.report ? `${order.orderNo}. Started from the normal-report template: edit it to what you found.` : `${order.orderNo} for ${order.patient.name}.`}
      onConfirm={() => (amend ? imagingApiService.amend(order.id, test.id, narrative, reason) : imagingApiService.writeReport(order.id, test.id, narrative))}
    >
      <div className="space-y-1.5">
        <Label htmlFor="report-narrative" className="text-xs font-bold uppercase tracking-wider text-slate-500">Report *</Label>
        <Textarea id="report-narrative" maxLength={DX_LIMITS.reportNarrative} rows={10} className="rounded-xl" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
      </div>
      {amend && (
        <div className="space-y-1.5">
          <Label htmlFor="report-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason for the amendment *</Label>
          <Textarea id="report-reason" maxLength={DX_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
    </BillingActionDialog>
  )
}
