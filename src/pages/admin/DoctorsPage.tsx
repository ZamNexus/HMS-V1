import * as React from "react"
import { Phone, Plus, Search, Stethoscope, Pencil, Clock, CheckCircle2 } from "lucide-react"

import { DOCTORS } from "@/data/doctors"
import type { Doctor } from "@/types"
import { cn, formatCurrency, initials } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { PhotoUpload } from "@/components/shared/PhotoUpload"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useToast } from "@/components/ui/use-toast"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export function DoctorsPage() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalTarget, setModalTarget] = React.useState<Doctor | "new" | null>(null)
  const [search, setSearch] = React.useState("")

  const filteredDoctors = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return DOCTORS
    return DOCTORS.filter((d) => 
      d.name.toLowerCase().includes(q) || 
      d.specialization.toLowerCase().includes(q) ||
      (d.phone && d.phone.includes(q)) ||
      (d.pmcRegNo && d.pmcRegNo.toLowerCase().includes(q))
    )
  }, [search, DOCTORS]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = DOCTORS.filter(d => d.active !== false).length

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Medical Staff</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {DOCTORS.length} registered doctors ({activeCount} active)
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" onClick={() => setModalTarget("new")}>
          <Plus className="h-5 w-5 mr-2" /> Add Doctor
        </Button>
      </div>

      {/* ─── SEARCH BAR ────────────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, specialization, phone, or PMC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>
      </div>

      {/* ─── ELEVATED DATA TABLE ──────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {filteredDoctors.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={Stethoscope} title="No doctors found" subtitle="Try adjusting your search criteria." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Doctor</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Contact & PMC</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Schedule</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Fee & Share</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDoctors.map((d) => (
                  <TableRow key={d.userId} className={cn("transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0", d.active === false && "opacity-75 bg-slate-50/30")}>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#1CC0CE]/10 text-lg font-black text-[#0891B2] ring-1 ring-[#1CC0CE]/20 shadow-sm">
                          {d.photoUrl ? <img src={d.photoUrl} alt={d.name} className="h-full w-full object-cover" /> : initials(d.name)}
                        </div>
                        <div>
                          <p className="font-bold text-[#0D1B2E] text-base">{d.name}</p>
                          <p className="text-xs font-bold text-[#0891B2]">{d.specialization}</p>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">{d.qualifications}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-1">
                        {d.phone ? (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {d.phone}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 italic">—</span>
                        )}
                        <div className="text-xs font-mono font-medium text-slate-500 bg-slate-100 w-fit px-1.5 py-0.5 rounded">PMC: {d.pmcRegNo || "N/A"}</div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {d.hoursFrom} – {d.hoursTo}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {DAYS.map((day) => {
                            const isAvail = d.availableDays.includes(day)
                            if (!isAvail) return null
                            return (
                              <span key={day} className="flex h-5 px-1.5 items-center justify-center rounded bg-[#1CC0CE]/10 text-[10px] font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20">
                                {day.charAt(0)}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-[#0D1B2E] text-base">{formatCurrency(d.fee)}</span>
                        {d.sharePct !== undefined && (
                          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 w-fit px-1.5 py-0.5 rounded mt-0.5">
                            {d.sharePct}% share
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <StatusBadge status={d.active === false ? "Inactive" : "Active"} />
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setModalTarget(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
  const [sharePct, setSharePct] = React.useState(doc?.sharePct ?? 0)
  const [fee, setFee] = React.useState(doc?.fee ?? 0)
  const [phone, setPhone] = React.useState(doc?.phone ?? "")
  const [email, setEmail] = React.useState(doc?.email ?? "")
  const [cnic, setCnic] = React.useState(doc?.cnic ?? "")
  const [city, setCity] = React.useState(doc?.city ?? "Rawalpindi")
  const [address, setAddress] = React.useState(doc?.address ?? "")
  const [country, setCountry] = React.useState(doc?.country ?? "Pakistan")
  const [active, setActive] = React.useState(doc?.active ?? true)
  const [days, setDays] = React.useState<Set<string>>(new Set(doc?.availableDays ?? []))
  const [hoursFrom, setHoursFrom] = React.useState(doc?.hoursFrom ?? "09:00")
  const [hoursTo, setHoursTo] = React.useState(doc?.hoursTo ?? "17:00")
  const [notes, setNotes] = React.useState(doc?.notes ?? "")
  const [photoUrl, setPhotoUrl] = React.useState(doc?.photoUrl)

  React.useEffect(() => {
    setName(doc?.name ?? ""); setSpecialization(doc?.specialization ?? ""); setQualifications(doc?.qualifications ?? "");
    setPmcRegNo(doc?.pmcRegNo ?? ""); setSharePct(doc?.sharePct ?? 0); setFee(doc?.fee ?? 0); setPhone(doc?.phone ?? ""); setEmail(doc?.email ?? "");
    setCnic(doc?.cnic ?? ""); setCity(doc?.city ?? "Rawalpindi"); setAddress(doc?.address ?? ""); setCountry(doc?.country ?? "Pakistan");
    setActive(doc?.active ?? true);
    setDays(new Set(doc?.availableDays ?? [])); setHoursFrom(doc?.hoursFrom ?? "09:00"); setHoursTo(doc?.hoursTo ?? "17:00");
    setNotes(doc?.notes ?? ""); setPhotoUrl(doc?.photoUrl)
  }, [target])

  const toggleDay = (day: string) => {
    setDays((s) => { const next = new Set(s); if (next.has(day)) next.delete(day); else next.add(day); return next })
  }

  const save = () => {
    if (!name || !fee) return
    const record: Doctor = {
      userId: doc?.userId ?? Math.max(0, ...DOCTORS.map((d) => d.userId)) + 1000,
      name, specialization, qualifications, pmcRegNo, sharePct, fee, phone, email,
      cnic, city, address, country, active,
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
      <DialogContent className="sm:max-w-3xl rounded-[1.5rem] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <DialogTitle className="text-2xl font-black text-[#0D1B2E]">{isNew ? "Add Doctor" : `Edit Doctor — ${doc?.name}`}</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2 bg-white p-5 rounded-2xl ring-1 ring-slate-200/60 shadow-sm flex flex-col items-center justify-center">
              <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Profile Photo (shown on prescription printout)" />
            </div>
            
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-2xl ring-1 ring-slate-200/60 shadow-sm">
              <div className="md:col-span-2"><h4 className="text-sm font-black text-[#0D1B2E] uppercase tracking-wider mb-2 border-b border-slate-100 pb-2">Professional Info</h4></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Specialization</Label><Input className={inputClass} value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Degrees</Label><Input className={inputClass} value={qualifications} onChange={(e) => setQualifications(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">PMC Reg. No.</Label><Input className={inputClass} value={pmcRegNo} onChange={(e) => setPmcRegNo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Consultation Fee (Rs.) *</Label><Input type="number" className={inputClass} value={fee || ""} onChange={(e) => setFee(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rev. Share (%)</Label><Input type="number" min={0} max={100} className={inputClass} value={sharePct || ""} onChange={(e) => setSharePct(Number(e.target.value))} /></div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-2xl ring-1 ring-slate-200/60 shadow-sm">
              <div className="md:col-span-2 flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <h4 className="text-sm font-black text-[#0D1B2E] uppercase tracking-wider">Availability & Status</h4>
                <div className="flex items-center gap-3">
                  <Label className="cursor-pointer font-bold text-sm text-slate-600">{active ? "Active" : "Inactive"}</Label>
                  <Switch checked={active} onCheckedChange={setActive} />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Working Hours</Label>
                <div className="flex gap-2 items-center">
                  <Input type="time" className={inputClass} value={hoursFrom} onChange={(e) => setHoursFrom(e.target.value)} />
                  <span className="text-slate-400 font-bold">to</span>
                  <Input type="time" className={inputClass} value={hoursTo} onChange={(e) => setHoursTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Available Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const isSelected = days.has(day)
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={cn(
                          "h-10 px-3 rounded-xl text-xs font-bold transition-all border",
                          isSelected 
                            ? "bg-[#1CC0CE]/10 text-[#0891B2] border-[#1CC0CE]/30 shadow-sm" 
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 rounded-2xl ring-1 ring-slate-200/60 shadow-sm">
              <div className="md:col-span-2"><h4 className="text-sm font-black text-[#0D1B2E] uppercase tracking-wider mb-2 border-b border-slate-100 pb-2">Contact & Personal</h4></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</Label><Input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">CNIC</Label><Input className={inputClass} placeholder="12345-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">City</Label><Input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Address</Label><Input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</Label><Textarea rows={2} className="rounded-xl border-slate-200 focus:border-[#1CC0CE] resize-none bg-slate-50" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="p-5 bg-white border-t border-slate-100 flex items-center gap-2 sm:gap-0 mt-auto">
          <Button variant="ghost" className="rounded-xl h-12 px-6 font-bold text-slate-600 hover:text-slate-900" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl h-12 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 text-base" onClick={save}>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Save Doctor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
