"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { History } from "lucide-react"

import { ItemHistoryView } from "@/components/shared/ItemHistoryView"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { dataSource, itemHistoryService, type ItemHistorySubject } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"

/**
 * The change log of one record (Item History): newest first, "Field: from -> to", a change by the system shown as "System". Read fresh every time it is
 * opened (cache class: audit entries, 0). Values arrive as plain text and are rendered as text.
 */
export function ItemHistoryDialog({ subject, id, title, onClose }: { subject: ItemHistorySubject; id: string; title: string; onClose: () => void }) {
  const key = useScopedKey("audit", subject, id)
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => itemHistoryService.list({ subject, id, signal }),
    staleTime: 0,
    gcTime: 0,
  })
  const items = q.data?.items ?? null
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl" data-testid="item-history-dialog">
        <DialogHeader><DialogTitle className="text-xl">Item History: {title}</DialogTitle></DialogHeader>
        <ItemHistoryView source={dataSource} state={{ entries: items, error: q.error, loading: q.isPending, onRetry: () => void q.refetch() }} />
        {q.data && q.data.total > q.data.items.length && <p className="text-xs text-slate-500">Showing the newest {q.data.items.length} of {q.data.total} entries.</p>}
        <DialogFooter><Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The Item History button. Only users with `audit.read` see it (handoff 5), and only against the real API (the demo keeps no audit log). */
export function ItemHistoryButton({ subject, id, label, className = "" }: { subject: ItemHistorySubject; id: string; label: string; className?: string }) {
  const { can } = useAccess()
  const [open, setOpen] = React.useState(false)
  if (dataSource !== "api" || !can("audit.read")) return null
  return (
    <>
      <Button type="button" aria-label={`Item History for ${label}`} title="Item History" variant="ghost" size="icon" className={`h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2] ${className}`} onClick={() => setOpen(true)}>
        <History className="h-4 w-4" />
      </Button>
      {open && <ItemHistoryDialog subject={subject} id={id} title={label} onClose={() => setOpen(false)} />}
    </>
  )
}
