import * as React from "react"

import { LAB_TESTS, LAB_TEST_CATEGORIES } from "@/data/labTests"
import type { LabTestCategory } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

/**
 * Inline "register a new lab/imaging test without leaving this form" dialog — mirrors the
 * desktop's "R+" quick-register button next to the Test lookup on Lab and X-Ray invoices.
 * Lab and Imaging share one catalogue (LAB_TESTS), so this dialog is shared too.
 */
export function QuickAddLabTestDialog({
  open, onClose, onCreated, defaultCategory,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
  defaultCategory?: LabTestCategory
}) {
  const { toast } = useToast()
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<LabTestCategory>(defaultCategory ?? LAB_TEST_CATEGORIES[0])
  const [rate, setRate] = React.useState(0)
  const [turnaroundHours, setTurnaroundHours] = React.useState(4)

  React.useEffect(() => {
    if (open) { setCode(""); setName(""); setCategory(defaultCategory ?? LAB_TEST_CATEGORIES[0]); setRate(0); setTurnaroundHours(4) }
  }, [open, defaultCategory])

  const save = () => {
    if (!name.trim() || !code.trim() || !rate) return
    const id = Math.max(0, ...LAB_TESTS.map((t) => t.id)) + 1
    LAB_TESTS.push({ id, code: code.trim(), name: name.trim(), category, rate, unit: "-", normalRange: "-", turnaroundHours })
    toast({ title: `${name} added to catalogue` })
    onCreated(id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Register New Test</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Code *</Label><Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LabTestCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LAB_TEST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Test Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fee (Rs.) *</Label><Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Turnaround (hours)</Label><Input type="number" value={turnaroundHours} onChange={(e) => setTurnaroundHours(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
