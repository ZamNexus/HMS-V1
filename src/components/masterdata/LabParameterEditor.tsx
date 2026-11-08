"use client"
import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { emptyRow, type ParamRow, type RangeMode } from "@/lib/services/labParamForm"
import { inputClass, selectClass } from "./catalogStyles"

const MODE_LABEL: Record<RangeMode, string> = { none: "No normal range", any: "Same for everyone", sex: "By sex (male / female)" }

/**
 * The parameters of a measured lab test: key, name, unit, decimals, a normal range (one for everyone, or male + female) and critical limits.
 * Editing rows only changes text; nothing is sent until the dialog's Save. `errors` maps a row index to the message to show under it.
 */
export function LabParameterEditor({ rows, onChange, errors, disabled }: { rows: ParamRow[]; onChange: (rows: ParamRow[]) => void; errors: Record<number, string>; disabled?: boolean }) {
  const uid = React.useId()
  const set = (i: number, patch: Partial<ParamRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const box = (i: number, field: keyof ParamRow, label: string, extra: { placeholder?: string; width?: string } = {}) => (
    <label className={`block ${extra.width ?? ""}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <Input aria-label={`${label} ${i + 1}`} className={`${inputClass} h-9`} value={rows[i][field]} placeholder={extra.placeholder} disabled={disabled} onChange={(e) => set(i, { [field]: e.target.value } as Partial<ParamRow>)} />
    </label>
  )
  return (
    <div className="space-y-3" data-testid="lab-parameters">
      {rows.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No parameters yet. Add the first one.</p>}
      {rows.map((r, i) => (
        <fieldset key={`${uid}-${i}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" data-testid={`lab-param-${i}`}>
          <legend className="px-1 text-xs font-bold text-slate-500">Parameter {i + 1}</legend>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {box(i, "key", "Key", { placeholder: "hb" })}
            <div className="md:col-span-2">{box(i, "name", "Name", { placeholder: "Haemoglobin" })}</div>
            {box(i, "unit", "Unit", { placeholder: "g/dL" })}
            {box(i, "decimals", "Decimals", { placeholder: "1" })}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[14rem_1fr]">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Normal range</span>
              <Select value={r.mode} onValueChange={(v) => set(i, { mode: v as RangeMode })} disabled={disabled}>
                <SelectTrigger aria-label={`Normal range type ${i + 1}`} className={`${selectClass} h-9`}><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MODE_LABEL) as RangeMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {r.mode === "any" && (<>{box(i, "anyLow", "Low")}{box(i, "anyHigh", "High")}</>)}
              {r.mode === "sex" && (<>{box(i, "maleLow", "Male low")}{box(i, "maleHigh", "Male high")}{box(i, "femaleLow", "Female low")}{box(i, "femaleHigh", "Female high")}</>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            {box(i, "critLow", "Critical below")}
            {box(i, "critHigh", "Critical above")}
            <Button type="button" variant="ghost" aria-label={`Remove parameter ${i + 1}`} className="h-9 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
          </div>
          {errors[i] && <p role="alert" className="text-xs text-red-600" data-testid={`lab-param-error-${i}`}>{errors[i]}</p>}
        </fieldset>
      ))}
      {errors[60] && <p role="alert" className="text-xs text-red-600">{errors[60]}</p>}
      <Button type="button" variant="outline" className="rounded-xl" disabled={disabled || rows.length >= 60} onClick={() => onChange([...rows, emptyRow()])}><Plus className="mr-2 h-4 w-4" /> Add parameter</Button>
    </div>
  )
}
