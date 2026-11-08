"use client"
import { AlertTriangle } from "lucide-react"

import { StatusBadge } from "@/components/shared/StatusBadge"
import type { DxFlag, DxPriority, DxStatus, DxTestStatus } from "@/lib/services"
import { cn } from "@/lib/utils"
import { DX_FLAG_LABEL, DX_PRIORITY_LABEL, DX_STATUS_LABEL, DX_TEST_STATUS_LABEL, flagClass } from "./dxUi"

export function DxStatusBadge({ status }: { status: DxStatus }) {
  return <StatusBadge status={DX_STATUS_LABEL[status]} />
}
export function DxTestStatusBadge({ status }: { status: DxTestStatus }) {
  return <StatusBadge status={DX_TEST_STATUS_LABEL[status]} />
}
export function PriorityBadge({ priority }: { priority: DxPriority }) {
  return priority === "urgent" ? <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700" data-testid="priority-urgent">{DX_PRIORITY_LABEL.urgent}</span> : null
}
/** A critical result is impossible to miss. */
export function CriticalBadge() {
  return (
    <span role="status" className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-black uppercase text-white shadow-sm ring-2 ring-red-300" data-testid="critical-badge">
      <AlertTriangle className="h-3 w-3" aria-hidden /> Critical
    </span>
  )
}
export function FlagValue({ value, flag, unit }: { value: string; flag: DxFlag; unit?: string | null }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums", flagClass(flag))} data-flag={flag ?? "none"}>
      {value}{unit ? ` ${unit}` : ""}
      {flag && flag !== "normal" && <span className="text-[10px] font-black uppercase">{DX_FLAG_LABEL[flag]}</span>}
    </span>
  )
}
