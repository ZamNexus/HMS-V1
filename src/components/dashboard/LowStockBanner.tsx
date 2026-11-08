"use client"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pharmacyApiService } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"

/** How many low medicines are named in the banner; the rest are counted. */
export const LOW_STOCK_NAMED = 3

/**
 * The home screen's stock alert in API mode (pharmacy.read, pharmacy department on). The server decides what is low or out of stock (handoff 8.9: `GET /medicines?level=low|out_of_stock`),
 * so this asks for a handful of rows and the two totals instead of reading the whole catalogue and comparing quantities in the browser. Nothing is drawn while there is nothing to warn about
 * or while the answer is not in: an absent alert is never a claim that stock is fine.
 */
export function LowStockBanner() {
  const { can, modules } = useAccess()
  const allowed = can("pharmacy.read") && modules?.pharmacy === true
  const lowKey = useScopedKey("pharmacyApi", "dashboard-low")
  const outKey = useScopedKey("pharmacyApi", "dashboard-out")
  const low = useQuery({ queryKey: lowKey, queryFn: ({ signal }) => pharmacyApiService.listMedicines({ level: "low", active: true, page: 1, pageSize: LOW_STOCK_NAMED }, signal), ...CACHE_CLASSES.dashboard, enabled: allowed })
  const out = useQuery({ queryKey: outKey, queryFn: ({ signal }) => pharmacyApiService.listMedicines({ level: "out_of_stock", active: true, page: 1, pageSize: 1 }, signal), ...CACHE_CLASSES.dashboard, enabled: allowed })
  if (!allowed) return null
  const lowItems = low.data?.items ?? []
  const outTotal = out.data?.total ?? 0
  const lowTotal = low.data?.total ?? 0
  if (lowTotal + outTotal === 0) return null
  return (
    <div className="flex flex-col justify-between gap-4 rounded-[1.5rem] bg-rose-50 p-5 shadow-sm ring-1 ring-rose-100 sm:flex-row sm:items-center" data-testid="low-stock-banner">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><AlertTriangle className="h-6 w-6" /></div>
        <div>
          <h2 className="text-base font-black text-rose-900">Critical Inventory Alert</h2>
          <p className="mt-0.5 text-sm font-semibold text-rose-600" data-testid="low-stock-text">
            {lowItems.map((m) => `${m.name} (${m.stock.onHand})`).join(" • ")}
            {lowTotal > lowItems.length && ` • ${lowTotal - lowItems.length} more running low`}
            {outTotal > 0 && `${lowItems.length > 0 ? " • " : ""}${outTotal} ${outTotal === 1 ? "item" : "items"} completely out of stock`}
          </p>
        </div>
      </div>
      <Button asChild className="h-11 shrink-0 rounded-xl bg-rose-600 px-6 font-bold text-white shadow-sm hover:bg-rose-700"><Link href="/pharmacy/inventory">Restock Inventory</Link></Button>
    </div>
  )
}
