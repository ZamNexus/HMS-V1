import { format } from "date-fns"

import { errorSummary, formatMoneyString, isPositiveMoney, type PatientRecord } from "@/lib/services"
import { useBillSummary } from "@/lib/useBillSummary"
import { useOrganisations } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import type { Patient } from "@/types"

function Field({ label, value, className, valueClassName, testId, title }: { label: string; value: string; className?: string; valueClassName?: string; testId?: string; title?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div data-testid={testId} title={title} className={cn("truncate text-sm", valueClassName)}>{value}</div>
    </div>
  )
}

/**
 * Read-only demographic snapshot shown once a patient is picked on a billing/order form —
 * mirrors the MR No/CNIC/DOB/Age/Phone/Address/Pre-Balance block the desktop shows on every
 * Checkup, Laboratory, X-Ray and Pharmacy invoice so staff can confirm identity at a glance.
 *
 * Accepts the legacy `Patient` (numeric ids) or a service `PatientRecord` (string ids). The pre-balance comes
 * from billSummaryService (the backend owns the figure); until that contract is connected it says "Not yet connected"
 * rather than demo amounts or a made-up Rs 0. The organisation name comes from the shared organisations service (useOrganisations, the same
 * lookup the patient detail page uses): in API mode that service is not connected, so it reads "Organisation (not yet connected)" — it is
 * never resolved against the demo organisation array.
 */
export function PatientInfoPanel({ patient }: { patient: Patient | PatientRecord | null }) {
  const billState = useBillSummary(patient ? { kind: "patient", id: String(patient.id) } : null)
  const organisations = useOrganisations(patient != null && patient.panelId !== null)
  if (!patient) return null
  const balance = billState.data?.balance
  const balanceText = balance !== undefined ? formatMoneyString(balance) : billState.loading ? "…" : billState.pending ? "Not yet connected" : "Unavailable"
  const organisation =
    patient.panelId === null ? "Self-Pay" : organisations.lookup.get(patient.panelId)?.name ?? (organisations.loading ? "…" : "Organisation (not yet connected)")

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-4">
      <Field label="MR No" value={patient.mrNo} valueClassName="font-mono text-secondary" />
      <Field label="CNIC" value={patient.cnic || "—"} />
      <Field label="DOB" value={format(new Date(patient.dob), "dd MMM yyyy")} />
      <Field label="Age / Gender" value={`${patient.age} yrs · ${patient.gender.charAt(0)}`} />
      <Field label="Phone" value={patient.phone} />
      <Field label="Emp/SS No" value={patient.ssEmpNo || "—"} />
      <Field label="Organization" value={organisation} />
      <Field label="Address" value={[patient.address, patient.city].filter(Boolean).join(", ") || "—"} className="col-span-2" />
      <Field
        label="Pre Balance"
        value={balanceText}
        testId="pre-balance"
        title={billState.error && !billState.pending ? errorSummary(billState.error) : undefined}
        className="col-span-2 sm:col-span-4 sm:border-t sm:border-border sm:pt-3"
        valueClassName={cn("font-semibold", balance === undefined ? "text-muted-foreground" : isPositiveMoney(balance) ? "text-danger-600" : "text-success-600")}
      />
    </div>
  )
}
