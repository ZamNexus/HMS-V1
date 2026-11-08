"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VISIT_LIMITS, type VisitPriority } from "@/lib/services"
import { LateEntryField } from "./LateEntryField"

export interface CheckInExtrasValue { priority: VisitPriority; advisedBy: string; referredBy: string; reason: string; startedAt: string | undefined; startedProblem: string | null }
export const emptyExtras = (): CheckInExtrasValue => ({ priority: "normal", advisedBy: "", referredBy: "", reason: "", startedAt: undefined, startedProblem: null })

/** The optional details of a check-in or an admission: priority, who advised or referred, why, and a late-entry time. */
export function CheckInExtras({ value, onChange, idPrefix }: { value: CheckInExtrasValue; onChange: (v: CheckInExtrasValue) => void; idPrefix: string }) {
  const set = (patch: Partial<CheckInExtrasValue>) => onChange({ ...value, ...patch })
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-priority`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Priority</Label>
        <Select value={value.priority} onValueChange={(v) => set({ priority: v as VisitPriority })}>
          <SelectTrigger id={`${idPrefix}-priority`} className="h-11 rounded-xl bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="hidden sm:block" />
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-advised`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Advised by</Label><Input id={`${idPrefix}-advised`} className="h-11 rounded-xl bg-slate-50" maxLength={VISIT_LIMITS.advisedBy} value={value.advisedBy} onChange={(e) => set({ advisedBy: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-referred`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Referred by</Label><Input id={`${idPrefix}-referred`} className="h-11 rounded-xl bg-slate-50" maxLength={VISIT_LIMITS.referredBy} value={value.referredBy} onChange={(e) => set({ referredBy: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idPrefix}-reason`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason for the visit</Label><Textarea id={`${idPrefix}-reason`} rows={2} maxLength={VISIT_LIMITS.reason} className="rounded-xl bg-slate-50 border-slate-200" value={value.reason} onChange={(e) => set({ reason: e.target.value })} /></div>
      <div className="sm:col-span-2">
        <LateEntryField label="Checked in earlier than now" idPrefix={`${idPrefix}-at`} onChange={(startedAt, startedProblem) => onChange({ ...value, startedAt, startedProblem })} />
        {value.startedProblem && <p role="alert" className="mt-1 text-xs font-bold text-destructive">{value.startedProblem}</p>}
      </div>
    </div>
  )
}
