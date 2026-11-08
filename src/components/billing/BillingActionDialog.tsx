"use client"
import * as React from "react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { showMoney } from "./billingUi"

type Failure = Extract<CreateFailure, { kind: "failed" }>

/** What the server says is owed when it refuses an overpayment (`details.owed`, its own string), or null. */
function owedOf(err: unknown): string | null {
  if (!isApiError(err) || err.code !== "OVERPAYMENT") return null
  const d = err.body?.details as { owed?: unknown } | undefined
  return d && typeof d.owed === "string" ? d.owed : null
}

/**
 * One confirmable money action (a payment, an advance, a refund, a discount, a void...). The same behaviour for all of them, because the backend has NO
 * idempotency keys (two identical payments are two payments):
 *  - ONE request per click, however fast the clicks; the button is off from the click until the answer arrives;
 *  - the write is never sent a second time: a refusal shows the backend's own message and support reference, an answer that cannot be read is announced as
 *    done ("check the register") and nothing is re-sent, and a dropped connection says the outcome is unknown;
 *  - a rule the form checks itself (RangeError) shows its message and sends nothing.
 */
export function BillingActionDialog<T>({
  title, description, confirmLabel, pendingLabel, destructive = false, canConfirm = true, onClose, onConfirm, onDone, children, wide = false,
}: {
  title: string
  description?: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  destructive?: boolean
  canConfirm?: boolean
  onClose: () => void
  /** Makes the ONE request. */
  onConfirm: () => Promise<T>
  /** `null` = the server accepted it but its answer could not be read: refresh, do not send again. */
  onDone: (result: T | null) => void
  children?: React.ReactNode
  wide?: boolean
}) {
  const { toast } = useToast()
  const { pending, run, blocked } = useSubmitGuard()
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [owed, setOwed] = React.useState<string | null>(null)

  const confirm = async () => {
    setFailure(null); setProblem(null); setOwed(null)
    await run(async () => {
      try {
        const result = await onConfirm()
        toast({ title: `${title}: done` })
        onDone(result)
        onClose()
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setProblem(err.message); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Done. Refreshing." : outcome.message })
          onDone(null)
          onClose()
          return
        }
        setOwed(owedOf(err))
        setFailure(outcome)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className={wide ? "max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl" : "max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-md"} data-testid="billing-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {blocked && <p role="status" data-testid="outcome-unknown-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">No answer came back, so this may have been saved. It will not be sent again from here: close this window and check the list.</p>}
        {problem && <p role="alert" data-testid="billing-problem" className="text-sm font-bold text-destructive">{problem}</p>}
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {owed && <p data-testid="owed-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">The most that is owed is {showMoney(owed)}.</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} className={destructive ? "h-11 rounded-xl font-bold" : "h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]"} disabled={pending || blocked || !canConfirm} onClick={() => void confirm()}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
