"use client"
import * as React from "react"
import Link from "next/link"

import { dataSource, doctorsService, errorSummary, legacyNumericId, type DoctorRecord } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"

/**
 * Inline "register a new doctor without leaving this form" dialog — mirrors the desktop's
 * "R+" quick-register button next to the Doctor lookup on every billing/order screen.
 *
 * Creates through doctorsService (mock in dev; in API mode it reports "awaiting the backend contract" instead of
 * silently creating a local-only doctor). The host forms are not migrated yet and still key doctors by a NUMERIC id,
 * so `onCreated` only fires for a record that has a faithful numeric id; anything else is reported, never coerced.
 * Migrated forms (string doctor ids) use `onCreatedRecord` instead, which receives the created record whatever its id.
 */
type QuickAddProps = {
  open: boolean
  onClose: () => void
  /** Legacy hosts: called with a numeric id (never for ids without a numeric form). */
  onCreated?: (id: number) => void
  /** Migrated hosts: called with the created record, any id format. */
  onCreatedRecord?: (doctor: DoctorRecord) => void
}

/**
 * Against the real API a doctor is a staff account (POST /users with a doctor profile, handoff 8.1), which needs a sign-in, a role and a temporary
 * password: that is Admin > Doctors, not a one-line inline form. So API mode points there instead of offering a form that could only fail.
 */
export function QuickAddDoctorDialog(props: QuickAddProps) {
  return dataSource === "api" ? <ApiModeNotice open={props.open} onClose={props.onClose} /> : <MockQuickAddDoctorDialog {...props} />
}

function ApiModeNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAccess()
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md" data-testid="quick-add-doctor-api-notice">
        <DialogHeader><DialogTitle>Register New Doctor</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          A doctor is a staff account with a sign-in, so doctors are registered under Admin &gt; Doctors.
          {can("users.write") ? " Open it, add the doctor, then come back and pick them here." : " Ask an administrator to add the doctor, then pick them here."}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {can("users.write") && <Button asChild><Link href="/admin/doctors" target="_blank" rel="noopener">Open Admin &gt; Doctors</Link></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MockQuickAddDoctorDialog({ open, onClose, onCreated, onCreatedRecord }: QuickAddProps) {
  const uid = React.useId()
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [specialization, setSpecialization] = React.useState("")
  const [fee, setFee] = React.useState(0)
  const [sharePct, setSharePct] = React.useState(0)
  const [phone, setPhone] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setName(""); setSpecialization(""); setFee(0); setSharePct(0); setPhone("") }
  }, [open])

  const save = async () => {
    const problems = failedChecks([[name.trim(), "Doctor Name is required"], [fee, "Fee is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const saved = await doctorsService.create({
        name: name.trim(), specialization, qualifications: "", pmcRegNo: "", sharePct, fee, phone,
        country: "Pakistan", active: true, availableDays: [], hoursFrom: "09:00", hoursTo: "17:00",
      })
      if (onCreatedRecord) {
        toast({ title: `${name} registered` })
        onCreatedRecord(saved)
        onClose()
        return
      }
      const legacyId = legacyNumericId(saved.id)
      if (legacyId === null || !onCreated) {
        toast({ variant: "destructive", title: `${name} was registered, but can't be selected here yet`, description: "This form still needs a legacy doctor id. It will work once the form is connected to the backend." })
        onClose()
        return
      }
      toast({ title: `${name} registered` })
      onCreated(legacyId)
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not register doctor", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
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
          <Button disabled={saving} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
