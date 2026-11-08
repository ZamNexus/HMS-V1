"use client"
import * as React from "react"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DX_LIMITS, type DxTestLine } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { TestPicker, testLinesOf, type PickedTest } from "./TestPicker"

/** The dialogs the lab and imaging screens share. Each makes ONE request (the backend has no idempotency keys) and shows the backend's own refusal. */

/** An action that needs a reason of 3 to 500 characters: cancelling a test, rejecting a specimen, archiving an order, signing off an amendment. */
export function ReasonDialog<T>({ title, description, confirmLabel, pendingLabel, destructive = true, onConfirm, onClose, onDone }: {
  title: string
  description: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  destructive?: boolean
  onConfirm: (reason: string) => Promise<T>
  onClose: () => void
  onDone: (result: T | null) => void
}) {
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      title={title} description={description} confirmLabel={confirmLabel} pendingLabel={pendingLabel} destructive={destructive} canConfirm={reason.trim().length >= DX_LIMITS.reason.min} onClose={onClose} onDone={onDone}
      onConfirm={() => onConfirm(reason)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="dx-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason *</Label>
        <Textarea id="dx-reason" maxLength={DX_LIMITS.reason.max} rows={3} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs text-slate-500">{DX_LIMITS.reason.min} to {DX_LIMITS.reason.max} characters. Kept on file.</p>
      </div>
    </BillingActionDialog>
  )
}

/** A single-request action with nothing to fill in (collect, verify, deliver, restore, sign, perform). */
export function ConfirmDialog<T>({ title, description, confirmLabel, pendingLabel, onConfirm, onClose, onDone }: {
  title: string
  description: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  onConfirm: () => Promise<T>
  onClose: () => void
  onDone: (result: T | null) => void
}) {
  return <BillingActionDialog title={title} description={description} confirmLabel={confirmLabel} pendingLabel={pendingLabel} onClose={onClose} onDone={onDone} onConfirm={onConfirm} />
}

/** Add tests to an existing order (diagnostics.order). Each is charged when added. */
export function AddTestsDialog<T>({ kind, orderNo, onConfirm, onClose, onDone }: {
  kind: "lab" | "imaging"
  orderNo: string
  onConfirm: (tests: DxTestLine[]) => Promise<T>
  onClose: () => void
  onDone: (result: T | null) => void
}) {
  const { can } = useAccess()
  const [tests, setTests] = React.useState<PickedTest[]>([])
  return (
    <BillingActionDialog
      wide title="Add tests" description={`Added to ${orderNo}. Each test is charged when it is added.`} confirmLabel="Add tests" pendingLabel="Adding…" canConfirm={tests.length > 0} onClose={onClose} onDone={onDone}
      onConfirm={() => onConfirm(testLinesOf(tests))}
    >
      <TestPicker kind={kind} value={tests} onChange={setTests} allowDiscount={can("billing.write")} idPrefix="dx-add" />
    </BillingActionDialog>
  )
}
