"use client"
import { useQuery } from "@tanstack/react-query"
import { Wallet } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { billingService, type AccountBalance, type Receipt } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { showMoney } from "./billingUi"
import { AdvanceDialog, ApplyCreditDialog, CreditNoteDialog, PaymentDialog, RefundDialog } from "./MoneyForms"
import { ReceiptDialog } from "./ReceiptView"

function AccountFigures({ account, owesLabel, testId }: { account: AccountBalance; owesLabel: string; testId: string }) {
  return (
    <div className="grid grid-cols-2 gap-3" data-testid={testId}>
      <div className="rounded-xl bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{owesLabel}</div>
        <div className="mt-1 text-xl font-black tabular-nums text-[#0D1B2E]" data-testid={`${testId}-outstanding`}>{showMoney(account.outstanding)}</div>
      </div>
      <div className="rounded-xl bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Credit held</div>
        <div className="mt-1 text-xl font-black tabular-nums text-[#0D1B2E]" data-testid={`${testId}-credit`}>{showMoney(account.credit)}</div>
      </div>
    </div>
  )
}

/** The patient profile's Outstanding panel (B1): `GET /patients/{id}/account` (billing.read). The server derives both figures; nothing is summed here. */
export function PatientAccountPanel({ patientId, patientName = "this patient" }: { patientId: string; patientName?: string }) {
  const { can } = useAccess()
  const [open, setOpen] = React.useState<"advance" | "apply" | "refund" | "credit_note" | null>(null)
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  const allowed = can("billing.read")
  const key = useScopedKey("account", "patient", patientId)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.patientAccount(patientId, signal), ...CACHE_CLASSES.record, enabled: allowed })
  if (!allowed) return <EmptyState icon={Wallet} title="The account is not shown to your role" subtitle="Balances are visible to users who can read billing." />
  if (q.isPending) return <Skeleton className="h-20 w-full max-w-md rounded-xl" role="status" aria-label="Loading the account" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const patient = { id: patientId, name: patientName }
  const collect = can("billing.collect_payment")
  const write = can("billing.write")
  return (
    <div className="space-y-3">
      <AccountFigures account={q.data} owesLabel="Outstanding" testId="patient-account" />
      {(collect || write) && (
        <div className="flex flex-wrap gap-2" data-testid="patient-account-actions">
          {collect && <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setOpen("advance")}>Take advance</Button>}
          {collect && <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setOpen("apply")}>Apply credit</Button>}
          {write && <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setOpen("refund")}>Refund credit</Button>}
          {write && <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setOpen("credit_note")}>Credit note</Button>}
        </div>
      )}
      {open === "advance" && <AdvanceDialog patient={patient} onClose={() => setOpen(null)} onDone={(r) => { if (r) setReceipt(r) }} />}
      {open === "apply" && <ApplyCreditDialog patient={patient} onClose={() => setOpen(null)} onDone={() => undefined} />}
      {open === "refund" && <RefundDialog patient={patient} onClose={() => setOpen(null)} onDone={(r) => { if (r) setReceipt(r) }} />}
      {open === "credit_note" && <CreditNoteDialog patient={patient} onClose={() => setOpen(null)} onDone={(r) => { if (r) setReceipt(r) }} />}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

/** What a panel (an organisation) owes (B9): `GET /panels/{id}/account` (billing.read). Opened from the Panels list. */
export function PanelAccountDialog({ panel, open, onOpenChange }: { panel: { id: string; name: string } | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { can } = useAccess()
  const [paying, setPaying] = React.useState(false)
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  const key = useScopedKey("account", "panel", panel?.id ?? null)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.panelAccount((panel as { id: string }).id, signal), ...CACHE_CLASSES.record, enabled: open && !!panel })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="panel-account-dialog">
        <DialogHeader><DialogTitle>{panel ? `${panel.name}: account` : "Panel account"}</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-20 w-full rounded-xl" role="status" aria-label="Loading the account" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            <AccountFigures account={q.data} owesLabel="Owed by the panel" testId="panel-account" />
            {can("billing.collect_payment") && panel && <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setPaying(true)}>Record panel payment</Button>}
          </>
        )}
        {paying && panel && <PaymentDialog payer={{ kind: "panel", id: panel.id, name: panel.name }} onClose={() => setPaying(false)} onDone={(r) => { if (r) setReceipt(r) }} />}
        {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
      </DialogContent>
    </Dialog>
  )
}
