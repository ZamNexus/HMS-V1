import { Plus, Trash2 } from "lucide-react"

import { PHARMACY_OPERATION_LABELS } from "@/lib/services/pharmacyContract"
import { errorSummary } from "@/lib/services/errors"
import type { MedicineRecord } from "@/lib/services/types"
import type { PrescriptionItem } from "@/types"
import { cn } from "@/lib/utils"
import { ContractPending } from "@/components/shared/ContractPending"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ROUTES = ["Oral", "IV", "IM", "Topical", "Inhaled", "Drops"]
const FREQS = ["OD", "BD", "TDS", "QDS", "SOS", "As directed"]

export interface PrescriptionMedicines {
  items: readonly MedicineRecord[]
  loading: boolean
  error: unknown
  reload: () => void
}

/**
 * The New Encounter prescription lines. The medicine picker and its "Stock:" note read ONLY the pharmacy medicine service (the list the
 * Pharmacy screens use), never a demo array. While that list has no confirmed contract (`pending`, API mode) the lines are replaced by the
 * shared contract-pending notice: no picker, no stock figure, no free-text medicine, no request, and no "empty" message that would
 * suggest an empty inventory. Presentational only, so every state can be rendered and tested without a browser.
 */
export function PrescriptionRows({
  uid, rows, medicines, pending, onUpdate, onRemove, onAdd,
}: {
  uid: string
  rows: readonly PrescriptionItem[]
  medicines: PrescriptionMedicines
  pending: boolean
  onUpdate: (index: number, patch: Partial<PrescriptionItem>) => void
  onRemove: (index: number) => void
  onAdd: () => void
}) {
  if (pending) {
    return <ContractPending title="Prescription medicines are unavailable" awaiting={[PHARMACY_OPERATION_LABELS["medicines.list"]]} testId="encounter-medicines-pending" noun="medicine list" />
  }
  if (Boolean(medicines.error) && medicines.items.length === 0) {
    return (
      <div role="alert" data-testid="encounter-medicines-error" className="flex flex-wrap items-center gap-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
        <span>Medicines unavailable: {errorSummary(medicines.error)}</span>
        <Button type="button" variant="outline" size="sm" onClick={medicines.reload}>Try again</Button>
      </div>
    )
  }
  return (
    <>
      {rows.map((row, i) => {
        const med = medicines.items.find((m) => m.name === row.medicine)
        return (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-7">
            <div className="md:col-span-2 space-y-1">
              <Label htmlFor={`${uid}-medicine-${i}`} className="text-xs font-normal text-muted-foreground">Medicine</Label>
              <Select value={row.medicine || undefined} onValueChange={(v) => onUpdate(i, { medicine: v })} disabled={medicines.loading && medicines.items.length === 0}>
                <SelectTrigger id={`${uid}-medicine-${i}`}><SelectValue placeholder={medicines.loading && medicines.items.length === 0 ? "Loading medicines…" : "Search medicine..."} /></SelectTrigger>
                <SelectContent>
                  {medicines.items.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {med && (
                <p data-testid="encounter-medicine-stock" className={cn("text-xs", med.stock < med.reorderLevel ? "text-warning-700" : "text-muted-foreground")}>
                  Stock: {med.stock} {med.unit}{med.stock < med.reorderLevel ? " (low stock)" : ""}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-dose-${i}`} className="text-xs font-normal text-muted-foreground">Dose</Label>
              <Input id={`${uid}-dose-${i}`} value={row.dose} onChange={(e) => onUpdate(i, { dose: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-route-${i}`} className="text-xs font-normal text-muted-foreground">Route</Label>
              <Select value={row.route} onValueChange={(v) => onUpdate(i, { route: v })}>
                <SelectTrigger id={`${uid}-route-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent>{ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-freq-${i}`} className="text-xs font-normal text-muted-foreground">Freq</Label>
              <Select value={row.frequency} onValueChange={(v) => onUpdate(i, { frequency: v })}>
                <SelectTrigger id={`${uid}-freq-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent>{FREQS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-duration-${i}`} className="text-xs font-normal text-muted-foreground">Duration</Label>
              <Input id={`${uid}-duration-${i}`} value={row.duration} onChange={(e) => onUpdate(i, { duration: e.target.value })} />
            </div>
            <div className="flex items-end gap-1">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`${uid}-instructions-${i}`} className="text-xs font-normal text-muted-foreground">Instructions</Label>
                <Input id={`${uid}-instructions-${i}`} value={row.instructions} onChange={(e) => onUpdate(i, { instructions: e.target.value })} />
              </div>
              <Button aria-label="Remove medicine" type="button" variant="ghost" size="icon" onClick={() => onRemove(i)}>
                <Trash2 className="h-4 w-4 text-danger-600" />
              </Button>
            </div>
          </div>
        )
      })}
      <Button type="button" variant="outline" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Medicine
      </Button>
    </>
  )
}
