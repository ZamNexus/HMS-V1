"use client"
import * as React from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PATIENT_LIMITS } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { NO_PANEL, type CoverageDraft, type CoverageDrafts } from "./coverageDrafts"

const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

/**
 * Primary and secondary organisation (handoff 8.3: at most one of each), with the member details the contract carries. Saving sends the whole
 * set; "None (Self-Pay)" for the primary means no coverage at all.
 */
export function CoverageFields({
  drafts, onChange, panels, ready, error, onAddOrganisation, hasPanelError,
}: {
  drafts: CoverageDrafts
  onChange: (next: CoverageDrafts) => void
  panels: readonly { id: string; name: string }[]
  /** The organisation list loaded; until then the pickers are disabled and the current values are kept. */
  ready: boolean
  error?: string | null
  onAddOrganisation: () => void
  hasPanelError?: string | null
}) {
  const uid = React.useId()
  const { can } = useAccess()
  const set = (slot: "primary" | "secondary", patch: Partial<CoverageDraft>) => onChange({ ...drafts, [slot]: { ...drafts[slot], ...patch } })
  const options = (slot: "primary" | "secondary") => {
    const other = slot === "primary" ? drafts.secondary.panelId : drafts.primary.panelId
    const shown = panels.filter((p) => p.id !== other || p.id === drafts[slot].panelId)
    const current = drafts[slot].panelId
    // a panel the list does not (yet) contain keeps its place instead of silently dropping
    return current !== NO_PANEL && !shown.some((p) => p.id === current) ? [...shown, { id: current, name: drafts[slot].panelName ? `${drafts[slot].panelName} (inactive)` : "Current organisation (details unavailable)" }] : shown
  }
  const slot = (which: "primary" | "secondary", label: string) => {
    const d = drafts[which]
    const chosen = d.panelId !== NO_PANEL
    const locked = which === "secondary" && drafts.primary.panelId === NO_PANEL
    return (
      <div className="space-y-3" data-testid={`coverage-${which}`}>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-${which}`} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
          <div className="flex gap-2">
            <Select key={ready ? "ready" : "pending"} disabled={!ready || locked} value={d.panelId} onValueChange={(v) => set(which, which === "primary" && v === NO_PANEL ? { panelId: NO_PANEL } : { panelId: v })}>
              <SelectTrigger id={`${uid}-${which}`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PANEL}>{which === "primary" ? "None (Self-Pay)" : "None"}</SelectItem>
                {options(which).map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {which === "primary" && can("catalogs.write") && (
              <Button type="button" variant="outline" disabled={!ready} className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200" title="Add new organisation" aria-label="Add new organisation" onClick={onAddOrganisation}>
                <Plus className="h-4 w-4 text-slate-500" />
              </Button>
            )}
          </div>
          {locked && <p className="text-[11px] text-slate-500">Choose the primary organisation first.</p>}
        </div>
        {chosen && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-${which}-member`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Member no.</Label>
              <Input id={`${uid}-${which}-member`} className={inputClass} value={d.memberNo} maxLength={PATIENT_LIMITS.memberNo} onChange={(e) => set(which, { memberNo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-${which}-principal`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Principal member</Label>
              <Input id={`${uid}-${which}-principal`} className={inputClass} value={d.principalMemberName} maxLength={PATIENT_LIMITS.principalMemberName} onChange={(e) => set(which, { principalMemberName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-${which}-relation`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Relation to principal</Label>
              <Input id={`${uid}-${which}-relation`} className={inputClass} value={d.principalRelation} maxLength={PATIENT_LIMITS.principalRelation} onChange={(e) => set(which, { principalRelation: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-${which}-from`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Valid from</Label>
              <Input id={`${uid}-${which}-from`} type="date" className={inputClass} value={d.validFrom} max={d.validTo || undefined} onChange={(e) => set(which, { validFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-${which}-to`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Valid to</Label>
              <Input id={`${uid}-${which}-to`} type="date" className={inputClass} value={d.validTo} min={d.validFrom || undefined} onChange={(e) => set(which, { validTo: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-5 md:col-span-2">
      {slot("primary", "Primary Panel/Organisation")}
      {slot("secondary", "Secondary Panel/Organisation")}
      {hasPanelError && <p role="alert" className="text-xs font-bold text-destructive">{hasPanelError}</p>}
      {error && <p role="alert" className="text-xs font-medium text-slate-500">Organisations unavailable: {error} The current value is kept.</p>}
    </div>
  )
}
