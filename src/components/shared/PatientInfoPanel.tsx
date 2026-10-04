import { format } from "date-fns"

import { patientBillBreakdown } from "@/lib/billingAggregate"
import { getPanel } from "@/data/organisations"
import { formatCurrency, cn } from "@/lib/utils"
import type { Patient } from "@/types"

function Field({ label, value, className, valueClassName }: { label: string; value: string; className?: string; valueClassName?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("truncate text-sm", valueClassName)}>{value}</div>
    </div>
  )
}

/**
 * Read-only demographic snapshot shown once a patient is picked on a billing/order form —
 * mirrors the MR No/CNIC/DOB/Age/Phone/Address/Pre-Balance block the desktop shows on every
 * Checkup, Laboratory, X-Ray and Pharmacy invoice so staff can confirm identity at a glance.
 */
export function PatientInfoPanel({ patient }: { patient: Patient | null }) {
  if (!patient) return null
  const bill = patientBillBreakdown(patient.id)
  const panel = getPanel(patient.panelId)

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-4">
      <Field label="MR No" value={patient.mrNo} valueClassName="font-mono text-secondary" />
      <Field label="CNIC" value={patient.cnic || "—"} />
      <Field label="DOB" value={format(new Date(patient.dob), "dd MMM yyyy")} />
      <Field label="Age / Gender" value={`${patient.age} yrs · ${patient.gender.charAt(0)}`} />
      <Field label="Phone" value={patient.phone} />
      <Field label="Emp/SS No" value={patient.ssEmpNo || "—"} />
      <Field label="Organization" value={panel?.name ?? "Self-Pay"} />
      <Field label="Address" value={[patient.address, patient.city].filter(Boolean).join(", ") || "—"} className="col-span-2" />
      <Field
        label="Pre Balance"
        value={formatCurrency(bill.balance)}
        className="col-span-2 sm:col-span-4 sm:border-t sm:border-border sm:pt-3"
        valueClassName={cn("font-semibold", bill.balance > 0 ? "text-danger-600" : "text-success-600")}
      />
    </div>
  )
}
