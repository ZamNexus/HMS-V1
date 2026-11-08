"use client"
import Link from "next/link"
import { Suspense } from "react"
import { ClipboardList, Pill, ShoppingBag } from "lucide-react"

import { useAccess } from "@/lib/session/useAccess"
import { cn } from "@/lib/utils"
import { DispenseHistoryTab } from "./DispenseHistoryTab"
import { DispenseScreen } from "./DispenseScreen"
import { MedicinesTab } from "./MedicinesTab"
import { PM_TABS, PM_TAB_LABEL, type PmTab } from "./pmUi"

const ICON = { inventory: Pill, dispense: ShoppingBag, history: ClipboardList } as const

/**
 * The pharmacy in API mode (handoff 8.9): Inventory (medicines with the server's stock levels, batches, the stock card), Dispense (a patient from a prescription, or a counter sale) and
 * History (slips and returns). The header tiles of the demo summed the catalogue in the browser; the server computes every stock figure, so there are none here.
 */
export function PharmacyApiHub({ tab }: { tab: string }) {
  const { can } = useAccess()
  const tabs = PM_TABS.filter((t) => t !== "dispense" || can("pharmacy.dispense")) // dispensing needs pharmacy.dispense: not shown to a user who never can
  const active: PmTab = PM_TABS.find((t) => t === tab) ?? "inventory"
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10" data-testid="pharmacy-hub">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Pharmacy</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Stock is received as batches with an expiry; every change is a stock movement.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((t) => {
          const Icon = ICON[t]
          return (
            <Link key={t} href={`/pharmacy/${t}`} aria-current={active === t ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all", active === t ? "scale-[1.02] bg-white text-[#0891B2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}>
              <Icon className={cn("h-4 w-4", active === t ? "text-[#1CC0CE]" : "text-slate-400")} />
              {PM_TAB_LABEL[t]}
            </Link>
          )
        })}
      </div>
      {/* useSearchParams (the filters in the address bar, ?patientId=) needs a Suspense boundary */}
      <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading…</div>}>
        {active === "inventory" && <MedicinesTab />}
        {active === "dispense" && <DispenseScreen />}
        {active === "history" && <DispenseHistoryTab />}
      </Suspense>
    </div>
  )
}
