"use client"
import { useQuery } from "@tanstack/react-query"
import { FileText } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api/client"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { billingService } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { InvoiceView } from "./InvoiceView"

/**
 * The Billing tab of a visit (B1): `GET /encounters/{id}/invoice` (billing.read). One visit has one invoice; its charges are posted by the events that earn
 * them (check-in, a room day, a test, a medicine), so this tab READS the bill and offers the money actions on it (payment, discount, credit note, void) to
 * those who may. It is a record being worked on: always re-read when opened.
 */
export function VisitBillTab({ visitId }: { visitId: string }) {
  const { can } = useAccess()
  const { settings } = useHospital()
  const allowed = can("billing.read")
  const key = useScopedKey("invoice", "visit", visitId)
  const bill = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => billingService.invoiceForEncounter(visitId, signal),
    ...CACHE_CLASSES.record,
    enabled: allowed,
    retry: (count, error) => !(error instanceof ApiError) && count < 2, // a refusal from the server is shown, not asked again
  })

  if (!allowed) return <EmptyState icon={FileText} title="The bill is not shown to your role" subtitle="Billing is visible to users who can read billing." />
  if (bill.isPending) return <div className="space-y-3" role="status" aria-label="Loading the bill"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
  if (bill.isError) {
    const err = bill.error
    if (err instanceof ApiError && err.code === "NOTHING_BILLED") { // a 404 is a missing visit: shown as an error, not as "nothing billed"
      return <EmptyState icon={FileText} title="Nothing has been billed on this visit yet" subtitle="Charges appear here as they are posted: the consultation at check-in, then rooms, tests and medicines." />
    }
    return <ErrorState error={err} onRetry={() => void bill.refetch()} />
  }
  return <InvoiceView invoice={bill.data} timezone={settings?.timezone} showVisitLink={false} />
}
