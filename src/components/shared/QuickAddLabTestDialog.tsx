"use client"
import * as React from "react"

import { LAB_TEST_CATEGORIES } from "@/lib/labels"
import { errorSummary, labTestsService, legacyNumericId, type LabTestRecord } from "@/lib/services"
import type { LabTestCategory } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"

/**
 * Inline "register a new lab/imaging test without leaving this form" dialog — mirrors the
 * desktop's "R+" quick-register button next to the Test lookup on Lab and X-Ray invoices.
 * Lab and Imaging share one catalogue, so this dialog is shared too.
 *
 * Creates through labTestsService (mock in dev; in API mode it reports "awaiting the backend contract" instead of
 * silently adding a local-only test). Unmigrated hosts still key tests by a NUMERIC id, so `onCreated` only
 * fires for a record with a faithful numeric id; anything else is reported, never coerced. Migrated hosts use
 * `onCreatedRecord`, which receives the created record whatever its id.
 */
export function QuickAddLabTestDialog({
  open, onClose, onCreated, onCreatedRecord, defaultCategory,
}: {
  open: boolean
  onClose: () => void
  /** Legacy hosts: called with a numeric id (never for ids without a numeric form). */
  onCreated?: (id: number) => void
  /** Migrated hosts: called with the created record, any id format. */
  onCreatedRecord?: (test: LabTestRecord) => void
  defaultCategory?: LabTestCategory
}) {
  const uid = React.useId()
  const { toast } = useToast()
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<LabTestCategory>(defaultCategory ?? LAB_TEST_CATEGORIES[0])
  const [rate, setRate] = React.useState(0)
  const [turnaroundHours, setTurnaroundHours] = React.useState(4)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setCode(""); setName(""); setCategory(defaultCategory ?? LAB_TEST_CATEGORIES[0]); setRate(0); setTurnaroundHours(4) }
  }, [open, defaultCategory])

  const save = async () => {
    const problems = failedChecks([[code.trim(), "Code is required"], [name.trim(), "Test Name is required"], [rate, "Fee is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const saved = await labTestsService.create({ code: code.trim(), name: name.trim(), category, rate, turnaroundHours })
      if (onCreatedRecord) {
        toast({ title: `${name} added to catalogue` })
        onCreatedRecord(saved)
        onClose()
        return
      }
      const legacyId = legacyNumericId(saved.id)
      if (legacyId === null || !onCreated) {
        toast({ variant: "destructive", title: `${name} was added, but can't be selected here yet`, description: "This form still needs a legacy test id. It will work once the form is connected to the backend." })
        onClose()
        return
      }
      toast({ title: `${name} added to catalogue` })
      onCreated(legacyId)
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not add the test", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Register New Test</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-code`}>Code *</Label><Input id={`${uid}-code`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`}>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LabTestCategory)}>
              <SelectTrigger id={`${uid}-category`}><SelectValue /></SelectTrigger>
              <SelectContent>{LAB_TEST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-test-name`}>Test Name *</Label><Input id={`${uid}-test-name`} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-fee-rs`}>Fee (Rs.) *</Label><Input id={`${uid}-fee-rs`} type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-turnaround-hours`}>Turnaround (hours)</Label><Input id={`${uid}-turnaround-hours`} type="number" value={turnaroundHours} onChange={(e) => setTurnaroundHours(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
