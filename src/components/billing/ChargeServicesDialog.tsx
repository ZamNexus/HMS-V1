"use client"
import * as React from "react"
import { Search, X } from "lucide-react"

import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePickerOptions } from "@/lib/query/usePickerOptions"
import { billingService, serviceCatalogService, type ChargeLineInput, type InvoiceDetail, type PatientRecord } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { BillingActionDialog } from "./BillingActionDialog"
import { showMoney } from "./billingUi"

interface Line {
  key: number
  serviceId: string
  name: string
  /** The catalogue rate exactly as the server sent it (shown, never used in a sum). */
  catalogueRate: string | null
  qty: string
  rate: string
  discountType: "" | "amount" | "percent"
  discountValue: string
}

/** Turns the screen's rows into the API's charge lines. An own rate or discount is only sent when typed (and is only offered to billing.write). */
export function chargeLinesOf(lines: readonly Line[]): ChargeLineInput[] {
  return lines.map((l) => ({
    serviceId: l.serviceId,
    qty: l.qty,
    rate: l.rate.trim() === "" ? undefined : l.rate,
    discount: l.discountType === "" || l.discountValue.trim() === "" ? undefined : { type: l.discountType, value: l.discountValue },
  }))
}

/**
 * B3: charge services. Either on an existing invoice (`invoice`: POST /invoices/{id}/charges) or as a NEW stand-alone (walk-in) invoice for a chosen patient
 * (POST /invoices). Services come from the catalogue (searched from 2 characters, 300 ms, aborted). The server prices them; an own rate or discount per line
 * is offered only to users with billing.write (billing.charge alone charges the catalogue rate). The consultation is never charged here: it is charged at check-in.
 * The totals come back from the server; nothing is added up on this screen.
 */
export function ChargeServicesDialog({ invoice, onClose, onDone }: {
  invoice?: { id: string; invoiceNo: string }
  onClose: () => void
  onDone: (saved: InvoiceDetail | null) => void
}) {
  const { can } = useAccess()
  const ownPrice = can("billing.write")
  const [patient, setPatient] = React.useState<PatientRecord | null>(null)
  const [lines, setLines] = React.useState<Line[]>([])
  const next = React.useRef(1)
  const picker = usePickerOptions("services", async ({ search, perPage, signal }) => (search ? (await serviceCatalogService.list({ search, pageSize: perPage, active: true, signal })).items : []))
  const add = (s: { id: string; name: string; rateText?: string }) => {
    setLines((cur) => (cur.some((l) => l.serviceId === s.id) ? cur : [...cur, { key: next.current++, serviceId: s.id, name: s.name, catalogueRate: s.rateText ?? null, qty: "1", rate: "", discountType: "", discountValue: "" }]))
    picker.onInputChange("")
  }
  const set = (key: number, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const canConfirm = lines.length > 0 && (!!invoice || !!patient)
  return (
    <BillingActionDialog
      wide title={invoice ? "Add services" : "New services invoice"} confirmLabel={invoice ? "Add to invoice" : "Create invoice"} pendingLabel="Saving…" canConfirm={canConfirm} onClose={onClose} onDone={onDone}
      description={invoice ? `Charges are added to invoice ${invoice.invoiceNo} at the catalogue rate.` : "A stand-alone invoice for a patient, not tied to a visit. The consultation is charged at check-in, not here."}
      onConfirm={() => (invoice ? billingService.addCharges(invoice.id, chargeLinesOf(lines)) : billingService.createInvoice({ patientId: (patient as PatientRecord).id, charges: chargeLinesOf(lines) }))}
    >
      {!invoice && (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
          <PatientRecordPicker value={patient} onChange={setPatient} id="charge-patient" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="charge-service-search" className="text-xs font-bold uppercase tracking-wider text-slate-500">Find a service</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input id="charge-service-search" autoComplete="off" placeholder="Type 2 or more letters of the service name…" className="h-11 rounded-xl pl-10" value={picker.input} onChange={(e) => picker.onInputChange(e.target.value)} />
        </div>
        {picker.searching && (
          <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1" data-testid="service-options">
            {picker.options.length === 0 ? <p className="p-2 text-xs text-slate-500">{picker.loading ? "Searching…" : "No service matches."}</p> : picker.options.map((s) => (
              <button key={s.id} type="button" onClick={() => add(s)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                <span className="truncate font-semibold">{s.name}</span><span className="shrink-0 text-xs text-slate-500">{s.rateText ? showMoney(s.rateText) : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2" data-testid="charge-lines">
        {lines.length === 0 ? <p className="text-sm text-slate-500">No service chosen yet.</p> : lines.map((l, i) => (
          <div key={l.key} className="rounded-xl border border-slate-200 p-3" data-testid={`charge-line-${i}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{l.name}</div>{l.catalogueRate && <div className="text-xs text-slate-500">Catalogue rate {showMoney(l.catalogueRate)}</div>}</div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${l.name}`} className="h-8 w-8" onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Qty<Input aria-label={`Quantity of ${l.name}`} inputMode="decimal" className="mt-1 h-10 rounded-lg" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} /></label>
              {ownPrice && (
                <>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Own rate<Input aria-label={`Own rate of ${l.name}`} inputMode="decimal" placeholder="catalogue" className="mt-1 h-10 rounded-lg" value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} /></label>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Discount
                    <Select value={l.discountType || "none"} onValueChange={(v) => set(l.key, { discountType: v === "none" ? "" : (v as "amount" | "percent") })}>
                      <SelectTrigger aria-label={`Discount type of ${l.name}`} className="mt-1 h-10 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="percent">Percent</SelectItem><SelectItem value="amount">Amount</SelectItem></SelectContent>
                    </Select>
                  </label>
                  {l.discountType !== "" && <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{l.discountType === "percent" ? "Percent" : "Amount"}<Input aria-label={`Discount of ${l.name}`} inputMode="decimal" className="mt-1 h-10 rounded-lg" value={l.discountValue} onChange={(e) => set(l.key, { discountValue: e.target.value })} /></label>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </BillingActionDialog>
  )
}
