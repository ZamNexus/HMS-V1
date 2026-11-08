"use client"
import * as React from "react"

import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { isConflictChanged } from "@/lib/forms/fieldErrors"
import { type VisitDetail } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { missingLabels } from "./visitUi"

type Failure = Extract<CreateFailure, { kind: "failed" }>

/**
 * One confirmable action on a visit (close, cancel, reopen, archive, transfer, discharge, correct the check-in). The same behaviour for all of them:
 * one request per click (a double click sends one), the backend's own message and support reference when it refuses, a plain list of what is missing
 * when a close is refused for an incomplete record, and a "someone else changed this" banner that reloads the visit. An answer that cannot be read is
 * announced as done and the visit is read again; the action is never sent a second time.
 */
export function ActionDialog({
  title, description, confirmLabel, pendingLabel, destructive = false, canConfirm = true, onClose, onConfirm, onDone, onReload, children, wide = false, changedWhat = "visit",
}: {
  title: string
  description?: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  destructive?: boolean
  canConfirm?: boolean
  onClose: () => void
  /** Makes the ONE request. Throwing a RangeError / TypeError (a rule the form checks itself) shows its message and sends nothing. */
  onConfirm: () => Promise<VisitDetail>
  onDone: (saved: VisitDetail | null) => void
  onReload: () => void
  children?: React.ReactNode
  wide?: boolean
  /** What "someone else changed" refers to in the banner (a visit, an appointment). */
  changedWhat?: string
}) {
  const { toast } = useToast()
  const { pending, run, blocked } = useSubmitGuard()
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [missing, setMissing] = React.useState<string[]>([])
  const [stale, setStale] = React.useState<{ requestId: string | null } | null>(null)

  const confirm = async () => {
    setFailure(null); setProblem(null); setMissing([]); setStale(null)
    await run(async () => {
      try {
        const saved = await onConfirm()
        toast({ title: `${title}: done` })
        onDone(saved)
        onClose()
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setProblem(err.message); return }
        if (isConflictChanged(err)) { setStale({ requestId: isApiError(err) ? err.requestId : null }); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Done. Refreshing the visit." : outcome.message })
          onDone(null)
          onClose()
          return
        }
        if (outcome.code === "CLINICAL_RECORD_INCOMPLETE") setMissing(missingLabels(isApiError(err) ? err.body?.details : undefined))
        setFailure(outcome)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className={wide ? "max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl" : "max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-md"} data-testid="action-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {stale && <ConflictBanner what={changedWhat} requestId={stale.requestId} onReload={() => { onReload(); onClose() }} />}
        {children}
        {blocked && <p role="status" data-testid="outcome-unknown-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">No answer came back, so this may have been saved. It will not be sent again from here: close this window and check the visit.</p>}
        {problem && <p role="alert" data-testid="action-problem" className="text-sm font-bold text-destructive">{problem}</p>}
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {missing.length > 0 && (
              <div data-testid="missing-list" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-bold">Still missing in the clinical record:</p>
                <ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
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
