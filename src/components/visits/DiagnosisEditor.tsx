"use client"
import * as React from "react"
import { Plus, X } from "lucide-react"

import { IcdLookup } from "@/components/shared/IcdLookup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VISIT_LIMITS } from "@/lib/services"
import { addDiagnosis, removeDiagnosis, withPrimary, type DiagnosisRow } from "./visitUi"

/**
 * The diagnoses of a record: each is an ICD-10 code (searched on the server, only real codes) or free text, and exactly one is the primary one.
 * The first row is primary by default; removing the primary promotes the next. `disabled` shows them read-only.
 */
export function DiagnosisEditor({ rows, onChange, disabled = false, idPrefix }: { rows: DiagnosisRow[]; onChange: (next: DiagnosisRow[]) => void; disabled?: boolean; idPrefix: string }) {
  const [draft, setDraft] = React.useState("")
  const add = () => {
    const text = draft.trim()
    if (!text || rows.length >= VISIT_LIMITS.diagnoses) return
    onChange(addDiagnosis(rows, { text }))
    setDraft("")
  }
  return (
    <div className="space-y-3" data-testid={`${idPrefix}-diagnoses`}>
      {rows.length === 0 && <p className="text-sm text-slate-500">No diagnosis yet.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <input type="radio" name={`${idPrefix}-primary`} aria-label={`Primary diagnosis: ${r.code ? `${r.code} ` : ""}${r.text}`} checked={r.isPrimary} disabled={disabled} onChange={() => onChange(withPrimary(rows, r.key))} className="h-4 w-4 accent-[#0891B2]" />
            <div className="min-w-0 flex-1 text-sm">
              {r.code && <span className="mr-2 rounded-md bg-[#1CC0CE]/10 px-1.5 py-0.5 font-mono text-xs font-bold text-[#0891B2]">{r.code}</span>}
              <span className="font-medium text-slate-800">{r.text}</span>
              {r.isPrimary && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-[#0891B2]">Primary</span>}
            </div>
            {!disabled && <Button type="button" variant="ghost" size="icon" aria-label={`Remove diagnosis ${r.text}`} className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => onChange(removeDiagnosis(rows, r.key))}><X className="h-4 w-4" /></Button>}
          </li>
        ))}
      </ul>
      {!disabled && rows.length < VISIT_LIMITS.diagnoses && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input aria-label="Diagnosis as text" placeholder="Type a diagnosis, or look up an ICD-10 code" maxLength={VISIT_LIMITS.diagnosisText} className="h-11 rounded-xl bg-slate-50" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} />
            <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={!draft.trim()} onClick={add}><Plus className="mr-1 h-4 w-4" /> Add</Button>
          </div>
          <IcdLookup onSelect={(name, code, icdCodeId) => { if (icdCodeId) onChange(addDiagnosis(rows, { icdCodeId, code, text: name })) }} />
        </div>
      )}
    </div>
  )
}
