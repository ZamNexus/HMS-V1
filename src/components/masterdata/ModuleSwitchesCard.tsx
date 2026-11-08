"use client"
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { invalidateFamily } from "@/lib/query/invalidate"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, isSavedButUnreadableError, settingsService } from "@/lib/services"
import { classifyCreateError, writeOutcomeUnknown } from "@/lib/services/createOutcome"
import { MODULE_NAMES } from "@/lib/session/hospital"
import type { ModuleName } from "@/lib/session/permissions"
import { useHospital } from "@/lib/session/useHospital"
import { cardClass } from "./catalogStyles"

const LABEL: Record<ModuleName, { name: string; hint: string }> = {
  pharmacy: { name: "Pharmacy", hint: "Medicines, stock, dispensing and returns." },
  lab: { name: "Laboratory", hint: "Lab orders, specimens and results." },
  imaging: { name: "Imaging & Radiology", hint: "X-ray, ultrasound, Doppler, echo and ECG orders and reports." },
  ipd: { name: "Inpatient (IPD)", hint: "Admissions, beds, transfers and discharge." },
}

/** Patients still admitted, from a 422 MODULE_IN_USE (details.openAdmissions), or null when the server did not say. */
function openAdmissionsOf(err: unknown): number | null {
  const details: unknown = isApiError(err) ? err.body?.details : undefined
  const n = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>).openAdmissions : undefined
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/**
 * Department switches (POST /settings/modules/{module}/enable | disable). A switch only moves after the server says so; turning a department off
 * while it is in use is refused (MODULE_IN_USE) and the reason is shown. Menus and screens follow the switches without reloading the page.
 */
export function ModuleSwitchesCard() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const modulesKey = useScopedKey("settings", "modules")
  const { modules, loading } = useHospital()
  const [busy, setBusy] = React.useState<ModuleName | null>(null)
  const [problem, setProblem] = React.useState<{ module: ModuleName; text: string; requestId: string | null } | null>(null)

  async function toggle(module: ModuleName, enabled: boolean) {
    if (busy) return
    setBusy(module)
    setProblem(null)
    try {
      const state = await settingsService.setModule(module, enabled)
      qc.setQueryData<Record<ModuleName, boolean>>(modulesKey, (old) => ({ pharmacy: false, lab: false, imaging: false, ipd: false, ...(old ?? {}), [module]: state.enabled }))
      toast({ title: `${LABEL[module].name} switched ${state.enabled ? "on" : "off"}` })
    } catch (err) {
      if (isSavedButUnreadableError(err) || writeOutcomeUnknown(err)) void invalidateFamily("settings")
      const result = classifyCreateError(err)
      if (result.kind === "saved-unreadable") {
        toast({ title: "Saved. Refreshing the switches." })
      } else {
        const open = result.code === "MODULE_IN_USE" ? openAdmissionsOf(err) : null
        const text =
          result.code === "MODULE_IN_USE"
            ? `${LABEL[module].name} cannot be switched off while it is in use${open !== null ? `: ${open} ${open === 1 ? "patient is" : "patients are"} still admitted` : ""}. ${result.message}`
            : `Could not switch ${LABEL[module].name} ${enabled ? "on" : "off"}. ${errorSummary(err)}`
        setProblem({ module, text, requestId: result.requestId })
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`${cardClass} max-w-3xl p-8`} data-testid="module-switches">
      <h3 className="mb-2 text-xl font-black text-[#0D1B2E]">Departments</h3>
      <p className="mb-6 text-sm text-slate-500">Switch a department off to hide it everywhere. A department that is still in use cannot be switched off.</p>
      {loading || !modules ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {MODULE_NAMES.map((m) => (
            <li key={m} className="flex items-center justify-between gap-4 py-4" data-testid={`module-row-${m}`}>
              <div>
                <p className="font-bold text-[#0D1B2E]">{LABEL[m].name}</p>
                <p className="text-xs text-slate-500">{LABEL[m].hint}</p>
              </div>
              <Switch aria-label={`${LABEL[m].name} ${modules[m] ? "on" : "off"}`} checked={modules[m]} disabled={busy !== null} onCheckedChange={(next) => void toggle(m, next)} />
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <div role="alert" data-testid="module-error" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <p>{problem.text}</p>
          {problem.requestId && <p data-testid="support-reference" className="mt-1.5 text-[11px] text-red-600/80">Support reference: <span className="font-mono">{problem.requestId}</span></p>}
        </div>
      )}
    </div>
  )
}
