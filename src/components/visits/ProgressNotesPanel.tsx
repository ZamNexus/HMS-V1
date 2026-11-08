"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { NotebookPen } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { VISIT_LIMITS, visitsService, type VisitDetail } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { useDraftState } from "@/lib/session/useDraftState"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { RestoredNote } from "@/components/shared/RestoredNote"

type Failure = Extract<CreateFailure, { kind: "failed" }>

/**
 * Ward-round notes (E10) of an admission. Append-only: a note can be added, never edited or removed. Adding needs encounters.write and an open
 * admission. A half-written note survives a session that ends mid-round (kept in memory, restored after sign-in).
 */
export function ProgressNotesPanel({ visit, canWrite }: { visit: VisitDetail; canWrite: boolean }) {
  const { settings } = useHospital()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const key = useScopedKey("visits", "notes", visit.id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => visitsService.notes(visit.id, signal), ...CACHE_CLASSES.record })
  const [note, setNote, restored] = useDraftState(`visit-${visit.id}-note`, "")
  const [problem, setProblem] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const add = async () => {
    setProblem(null); setFailure(null)
    await run(async () => {
      try {
        await visitsService.addNote(visit.id, note)
        toast({ title: "Note added" })
        setNote("")
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setProblem(err.message); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message }); setNote(""); return }
        setFailure(outcome)
      }
    })
  }
  return (
    <div className="space-y-5" data-testid="notes-panel">
      {canWrite && (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <Label htmlFor="visit-note" className="text-sm font-black text-[#0D1B2E]">New ward-round note</Label>
          <Textarea id="visit-note" rows={4} maxLength={VISIT_LIMITS.note.max} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl bg-slate-50 border-slate-200" />
          <RestoredNote show={restored} />
          {problem && <p role="alert" className="text-sm font-bold text-destructive">{problem}</p>}
          {failure && <CreateErrorNote failure={failure} />}
          <Button className="h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={pending || !note.trim()} onClick={() => void add()}>{pending ? "Saving…" : "Add note"}</Button>
          <p className="text-xs text-slate-500">Notes cannot be edited or removed once added.</p>
        </div>
      )}
      {q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.isPending ? <Skeleton className="h-24 w-full rounded-xl" role="status" aria-label="Loading notes" />
      : q.data.length === 0 ? <EmptyState icon={NotebookPen} title="No notes yet" />
      : (
        <ol className="space-y-3" aria-label="Progress notes">
          {q.data.map((n) => (
            <li key={n.id} data-testid={`note-${n.id}`} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-700">{n.author.name}</span>
                <span>{settings ? formatInstant(n.writtenAt, settings.timezone) : n.writtenAt}</span>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-800">{n.note}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
