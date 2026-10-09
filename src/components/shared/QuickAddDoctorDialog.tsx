import * as React from "react"

import { DOCTORS } from "@/data/doctors"
import type { Doctor } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"

/**
 * Inline "register a new doctor without leaving this form" dialog — mirrors the desktop's
 * "R+" quick-register button next to the Doctor lookup on every billing/order screen.
 */
export function QuickAddDoctorDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [specialization, setSpecialization] = React.useState("")
  const [fee, setFee] = React.useState(0)
  const [sharePct, setSharePct] = React.useState(0)
  const [phone, setPhone] = React.useState("")

  React.useEffect(() => {
    if (open) { setName(""); setSpecialization(""); setFee(0); setSharePct(0); setPhone("") }
  }, [open])

  const save = () => {
    const problems = failedChecks([[name.trim(), "Doctor Name is required"], [fee, "Fee is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    const userId = Math.max(0, ...DOCTORS.map((d) => d.userId)) + 1000
    const record: Doctor = {
      userId, name: name.trim(), specialization, qualifications: "", pmcRegNo: "", sharePct, fee, phone,
      country: "Pakistan", active: true, availableDays: [], hoursFrom: "09:00", hoursTo: "17:00",
    }
    DOCTORS.push(record)
    toast({ title: `${name} registered` })
    onCreated(userId)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Register New Doctor</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-doctor-name`}>Doctor Name *</Label><Input id={`${uid}-doctor-name`} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-specialization`}>Specialization</Label><Input id={`${uid}-specialization`} value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-phone`}>Phone</Label><Input id={`${uid}-phone`} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-fee-rs`}>Fee (Rs.) *</Label><Input id={`${uid}-fee-rs`} type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-share`}>Share (%)</Label><Input id={`${uid}-share`} type="number" value={sharePct} onChange={(e) => setSharePct(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
