"use client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PrintButtons } from "@/components/print/PrintButtons"
import type { DxLabOrder, DxSpecimen } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"

/**
 * The label for one specimen tube (L2 / G1), printed on a 50 x 25 mm label: the tube's number, the patient's name and MR number, the specimen type, the order number and when it was
 * collected (or ordered, before the tube is drawn). Only what is needed to match the tube to the patient is on it. The tube number is printed as large text; no barcode is drawn.
 */
export function SpecimenLabelView({ order, specimen, timezone }: { order: Pick<DxLabOrder, "orderNo" | "orderedAt" | "patient">; specimen: Pick<DxSpecimen, "specimenNo" | "specimenType" | "collectedAt">; timezone?: string }) {
  const at = specimen.collectedAt ?? order.orderedAt
  return (
    <div className="print-root mx-auto w-[50mm] space-y-0.5 rounded border border-dashed border-slate-300 p-1.5 text-[9px] leading-tight" data-testid="specimen-label">
      <div className="font-mono text-base font-black leading-none" data-testid="label-specimen-no">{specimen.specimenNo}</div>
      <div className="truncate font-bold" data-testid="label-patient">{order.patient.name}</div>
      <div className="flex justify-between gap-1"><span data-testid="label-mr">{order.patient.mrNo}</span><span>{specimen.specimenType}</span></div>
      <div className="flex justify-between gap-1 font-mono"><span>{order.orderNo}</span><span>{timezone ? formatInstant(at, timezone, { dateStyle: "short", timeStyle: "short" }) : at}</span></div>
    </div>
  )
}

export function SpecimenLabelDialog({ order, specimen, timezone, onClose }: { order: DxLabOrder; specimen: DxSpecimen; timezone?: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="label-dialog">
        <DialogHeader>
          <DialogTitle>Tube label</DialogTitle>
          <DialogDescription>Print on a 50 x 25 mm label and stick it on the tube before it leaves the patient.</DialogDescription>
        </DialogHeader>
        <SpecimenLabelView order={order} specimen={specimen} timezone={timezone} />
        <PrintButtons papers={["label"]} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
