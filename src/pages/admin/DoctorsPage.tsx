import * as React from "react"
import { Phone, Plus } from "lucide-react"

import { DOCTORS } from "@/data/doctors"
import type { Doctor } from "@/types"
import { cn, formatCurrency, initials } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PhotoUpload } from "@/components/shared/PhotoUpload"
import { useToast } from "@/components/ui/use-toast"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function DoctorsPage() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<Doctor | "new" | null>(null)

  return (
    <div>
      <PageHeader title="Doctors" actions={<Button onClick={() => setModalTarget("new")}><Plus className="h-4 w-4" /> Add Doctor</Button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOCTORS.map((d) => (
          <Card key={d.userId}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-lg font-bold text-teal-700">
                  {d.photoUrl ? <img src={d.photoUrl} alt={d.name} className="h-full w-full object-cover" /> : initials(d.name)}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-foreground">{d.name}</h3>
                  <Badge className="mt-0.5 bg-teal-600 text-white">Doctor</Badge>
                  <p className="mt-0.5 truncate text-sm italic text-secondary">{d.specialization}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>{d.qualifications}</p>
                <p className="font-mono">{d.pmcRegNo}</p>
                <p className="text-sm font-bold text-success-600">{formatCurrency(d.fee)}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {DAYS.map((day) => (
                    <span
                      key={day}
                      className={cn(
                        "flex h-5 w-8 items-center justify-center rounded text-[10px] font-medium",
                        d.availableDays.includes(day) ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <p>{d.hoursFrom} – {d.hoursTo}</p>
                {d.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {d.phone}</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="teal" size="sm" className="flex-1" onClick={() => setModalTarget(d)}>Edit</Button>
                <Button variant="outline" size="sm" className="flex-1 cursor-not-allowed opacity-60" disabled>Schedule</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DoctorModal target={modalTarget} onClose={() => { setModalTarget(null); forceUpdate() }} />
    </div>
  )
}

function DoctorModal({ target, onClose }: { target: Doctor | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const doc = isNew ? null : target

  const [name, setName] = React.useState(doc?.name ?? "")
  const [specialization, setSpecialization] = React.useState(doc?.specialization ?? "")
  const [qualifications, setQualifications] = React.useState(doc?.qualifications ?? "")
  const [pmcRegNo, setPmcRegNo] = React.useState(doc?.pmcRegNo ?? "")
  const [fee, setFee] = React.useState(doc?.fee ?? 0)
  const [phone, setPhone] = React.useState(doc?.phone ?? "")
  const [email, setEmail] = React.useState(doc?.email ?? "")
  const [days, setDays] = React.useState<Set<string>>(new Set(doc?.availableDays ?? []))
  const [hoursFrom, setHoursFrom] = React.useState(doc?.hoursFrom ?? "09:00")
  const [hoursTo, setHoursTo] = React.useState(doc?.hoursTo ?? "17:00")
  const [notes, setNotes] = React.useState(doc?.notes ?? "")
  const [photoUrl, setPhotoUrl] = React.useState(doc?.photoUrl)

  React.useEffect(() => {
    setName(doc?.name ?? ""); setSpecialization(doc?.specialization ?? ""); setQualifications(doc?.qualifications ?? "");
    setPmcRegNo(doc?.pmcRegNo ?? ""); setFee(doc?.fee ?? 0); setPhone(doc?.phone ?? ""); setEmail(doc?.email ?? "");
    setDays(new Set(doc?.availableDays ?? [])); setHoursFrom(doc?.hoursFrom ?? "09:00"); setHoursTo(doc?.hoursTo ?? "17:00");
    setNotes(doc?.notes ?? ""); setPhotoUrl(doc?.photoUrl)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (day: string) => {
    setDays((s) => { const next = new Set(s); if (next.has(day)) next.delete(day); else next.add(day); return next })
  }

  const save = () => {
    if (!name || !fee) return
    const record: Doctor = {
      userId: doc?.userId ?? Math.max(0, ...DOCTORS.map((d) => d.userId)) + 1000,
      name, specialization, qualifications, pmcRegNo, fee, phone, email,
      availableDays: [...days], hoursFrom, hoursTo, notes, photoUrl,
    }
    if (isNew) { DOCTORS.push(record); toast({ title: `${name} added` }) }
    else {
      const idx = DOCTORS.findIndex((d) => d.userId === doc!.userId)
      if (idx >= 0) DOCTORS[idx] = record
      toast({ title: `${name} updated` })
    }
    onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{isNew ? "Add Doctor" : `Edit Doctor — ${doc?.name}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Profile Photo (shown on prescription printout)" />
          </div>
          <div className="space-y-1.5"><Label>Full Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Specialization</Label><Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Degrees</Label><Input value={qualifications} onChange={(e) => setQualifications(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>PMC Reg. No.</Label><Input value={pmcRegNo} onChange={(e) => setPmcRegNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fee (Rs.) *</Label><Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Hours</Label>
            <div className="flex gap-2">
              <Input type="time" value={hoursFrom} onChange={(e) => setHoursFrom(e.target.value)} />
              <Input type="time" value={hoursTo} onChange={(e) => setHoursTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Available Days</Label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={days.has(day)} onCheckedChange={() => toggleDay(day)} /> {day}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
