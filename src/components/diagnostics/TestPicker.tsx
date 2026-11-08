"use client"
import * as React from "react"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePickerOptions } from "@/lib/query/usePickerOptions"
import { ecgUltrasoundTestsService, labTestsService, type DxTestLine } from "@/lib/services"
import { showMoney } from "@/components/billing/billingUi"

export interface PickedTest {
  id: string
  name: string
  /** The catalogue rate exactly as the server sent it (shown, never summed). */
  rateText: string | null
  modality: string | null
  discountType: "" | "amount" | "percent"
  discountValue: string
}

/** The API's test lines from the chosen tests. An own discount is sent only when a type and a value were typed (it needs billing.write). */
export function testLinesOf(picked: readonly PickedTest[]): DxTestLine[] {
  return picked.map((t) => ({
    testId: t.id,
    discount: t.discountType === "" || t.discountValue.trim() === "" ? undefined : { type: t.discountType, value: t.discountValue },
  }))
}

/**
 * Choose tests from the catalogue (lab tests or imaging tests): searched from 2 characters after 300 ms, the previous request aborted, active tests only. A test
 * can be chosen once. An own discount per test is offered only to users with billing.write (`allowDiscount`).
 */
export function TestPicker({ kind, value, onChange, allowDiscount, idPrefix = "dx" }: {
  kind: "lab" | "imaging"
  value: PickedTest[]
  onChange: (next: PickedTest[]) => void
  allowDiscount: boolean
  idPrefix?: string
}) {
  const picker = usePickerOptions<PickedTest>(kind === "lab" ? "labTests" : "ecgUltrasound", async ({ search, perPage, signal }) => {
    if (!search) return []
    if (kind === "lab") return (await labTestsService.list({ search, pageSize: perPage, active: true, signal })).items.map((t) => ({ id: t.id, name: t.name, rateText: t.rateText ?? null, modality: null, discountType: "", discountValue: "" }))
    return (await ecgUltrasoundTestsService.list({ search, pageSize: perPage, active: true, signal })).items.map((t) => ({ id: t.id, name: t.name, rateText: t.feeText ?? null, modality: t.modality ?? null, discountType: "", discountValue: "" }))
  })
  const add = (t: PickedTest) => { if (!value.some((v) => v.id === t.id)) onChange([...value, t]); picker.onInputChange("") }
  const set = (id: string, patch: Partial<PickedTest>) => onChange(value.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  return (
    <div className="space-y-3" data-testid="test-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input id={`${idPrefix}-test-search`} aria-label="Find a test" autoComplete="off" placeholder="Type 2 or more letters of the test name…" className="h-11 rounded-xl pl-10" value={picker.input} onChange={(e) => picker.onInputChange(e.target.value)} />
      </div>
      {picker.searching && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1" data-testid="test-options">
          {picker.options.length === 0 ? <p className="p-2 text-xs text-slate-500">{picker.loading ? "Searching…" : "No test matches."}</p> : picker.options.map((t) => (
            <button key={t.id} type="button" onClick={() => add(t)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="truncate font-semibold">{t.name}{t.modality ? <span className="ml-2 text-xs font-normal text-slate-500">{t.modality}</span> : null}</span>
              <span className="shrink-0 text-xs text-slate-500">{t.rateText ? showMoney(t.rateText) : ""}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-2" data-testid="picked-tests">
        {value.length === 0 ? <li className="text-sm text-slate-500">No test chosen yet.</li> : value.map((t) => (
          <li key={t.id} className="rounded-xl border border-slate-200 p-3" data-testid={`picked-${t.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{t.name}</div>{t.rateText && <div className="text-xs text-slate-500">Rate {showMoney(t.rateText)}</div>}</div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${t.name}`} className="h-8 w-8" onClick={() => onChange(value.filter((v) => v.id !== t.id))}><X className="h-4 w-4" /></Button>
            </div>
            {allowDiscount && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Select value={t.discountType || "none"} onValueChange={(v) => set(t.id, { discountType: v === "none" ? "" : (v as "amount" | "percent") })}>
                  <SelectTrigger aria-label={`Discount type of ${t.name}`} className="h-9 w-36 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No discount</SelectItem><SelectItem value="percent">Percent</SelectItem><SelectItem value="amount">Amount</SelectItem></SelectContent>
                </Select>
                {t.discountType !== "" && <Input aria-label={`Discount of ${t.name}`} inputMode="decimal" className="h-9 w-28 rounded-lg" value={t.discountValue} onChange={(e) => set(t.id, { discountValue: e.target.value })} />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
