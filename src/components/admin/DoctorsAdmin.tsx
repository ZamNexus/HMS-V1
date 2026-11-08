"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CalendarClock, Pencil, Plus, Power, Search, Stethoscope } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, userAdminService, type UserAdminRecord } from "@/lib/services"
import { classifyCreateError } from "@/lib/services/createOutcome"
import { formatMoney } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { cn, initials } from "@/lib/utils"
import { DoctorScheduleDialog } from "./DoctorScheduleDialog"
import { TemporaryPasswordDialog, UserDialog, inputClass, primaryBtn } from "./UsersAdmin"

const PAGE_SIZE = 10
type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Admin -> Doctors. A doctor is a staff user with the Doctor role and a doctor profile (specialization, qualifications, PMC number, consultation fee,
 * commission): there is no separate doctor record. This screen lists those users (server-side paging, search, status) and adds / edits them through
 * the same dialog as Admin > Users; a new doctor gets a temporary password shown once. Working days and hours belong to the weekly schedule
 * (a later chunk), and photos are not stored yet. Reads need users.read, changes users.write.
 */
export function DoctorsAdmin() {
  const { can } = useAccess()
  const canRead = can("users.read")
  const canWrite = can("users.write")
  const showActions = canWrite || can("audit.read") || can("doctors.read")
  const { user: me } = useAuth()
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [sheet, setSheet] = React.useState<UserAdminRecord | "new" | null>(null)
  const [toggle, setToggle] = React.useState<UserAdminRecord | null>(null)
  const [scheduleFor, setScheduleFor] = React.useState<UserAdminRecord | null>(null)
  const [toggleError, setToggleError] = React.useState<{ text: string; requestId: string | null } | null>(null)
  const [secret, setSecret] = React.useState<{ title: string; name: string; username: string; password: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = useScopedKey("usersAdmin", "doctors", search.term ?? null, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => userAdminService.list({ search: search.term, role: "doctor", active: ACTIVE_PARAM[activeFilter], page, pageSize: PAGE_SIZE, signal }),
    staleTime: 0,
    placeholderData: keepPreviousData,
    enabled: canRead,
  })
  // money is always the exact text from the server ("1500.00"); it is never turned into a JavaScript number
  const money = (text: string) => formatMoney(text, settings?.currencyCode ?? "PKR")

  async function runToggle() {
    if (!toggle || busy) return
    setBusy(true)
    setToggleError(null)
    try {
      await userAdminService.setActive(toggle.id, !toggle.active)
      toast({ title: `${toggle.name} ${toggle.active ? "deactivated" : "reactivated"}` })
      setToggle(null)
    } catch (err) {
      const result = classifyCreateError(err)
      setToggleError({ text: result.kind === "failed" ? result.message : errorSummary(err), requestId: result.kind === "failed" ? result.requestId : null })
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) return <EmptyState icon={Stethoscope} title="Doctors are not available to you" subtitle="You need permission to view staff accounts." />
  const rows = list.data?.items ?? []
  const filtered = !!search.term || activeFilter !== "all"
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10" data-testid="doctors-admin">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Doctors</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="doctors-count">{list.data ? `${list.data.total} ${filtered ? "matching" : "total"} doctors` : list.isError ? "Doctors unavailable" : "Loading doctors…"}</p>
        </div>
        {canWrite && <Button className={primaryBtn} onClick={() => setSheet("new")}><Plus className="mr-2 h-5 w-5" /> Add Doctor</Button>}
      </div>

      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search doctors" placeholder="Search by name, username or email…" className={`${inputClass} pl-10`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
        </div>
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as ActiveFilter); setPage(1) }}>
          <SelectTrigger aria-label="Status" className={cn(inputClass, "w-full md:w-40")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        {list.isError && !list.data ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading doctors">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10"><EmptyState icon={Stethoscope} title="No doctors found" subtitle={filtered ? "Try adjusting your search or filter." : canWrite ? "Add the first doctor." : undefined} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Doctor</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Specialization</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">PMC No.</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Fee</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Commission</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Status</TableHead>
                  {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const p = d.doctorProfile
                  return (
                    <TableRow key={d.id} data-testid={`doctor-row-${d.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 shadow-sm ring-1 ring-slate-100"><AvatarFallback className="bg-teal-600 text-xs font-bold text-white">{initials(d.name)}</AvatarFallback></Avatar>
                          <div><p className="font-bold text-[#0D1B2E]">{d.name}</p><p className="text-[11px] text-slate-500">{p?.qualifications || "—"}</p></div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{p?.specialization || "—"}</TableCell>
                      <TableCell className="py-4 font-mono text-xs text-slate-600">{p?.pmcRegNo || "—"}</TableCell>
                      <TableCell className="py-4 font-black text-slate-900">{p ? money(p.consultationFee) : "—"}</TableCell>
                      <TableCell className="py-4 font-semibold text-slate-500">{p?.commissionPct != null ? `${p.commissionPct}%` : "—"}</TableCell>
                      <TableCell className="py-4"><StatusBadge status={d.active ? "Active" : "Inactive"} /></TableCell>
                      {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {can("doctors.read") && d.active && (
                              <Button aria-label={`Appointment hours for ${d.name}`} title="Appointment hours" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setScheduleFor(d)}>
                                <CalendarClock className="h-4 w-4" />
                              </Button>
                            )}
                            <ItemHistoryButton subject="doctor" id={d.id} label={d.name} />
                            {canWrite && <Button aria-label={`Edit ${d.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setSheet(d)}><Pencil className="h-4 w-4" /></Button>}
                            {canWrite && me?.id !== d.id && <Button aria-label={`${d.active ? "Deactivate" : "Activate"} ${d.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => { setToggleError(null); setToggle(d) }}><Power className={cn("h-4 w-4", !d.active && "text-emerald-500")} /></Button>}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {list.data && list.data.total > PAGE_SIZE && <div className="px-6"><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="doctors" /></div>}
      </div>

      {sheet !== null && <UserDialog key={sheet === "new" ? "new" : sheet.id} target={sheet} isSelf={sheet !== "new" && me?.id === sheet.id} lockRole="doctor" onClose={() => setSheet(null)} onSecret={(s) => setSecret(s)} />}

      <Dialog open={!!toggle} onOpenChange={(v) => !v && !busy && setToggle(null)}>
        <DialogContent className="rounded-[1.5rem] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl">{toggle?.active ? `Deactivate ${toggle?.name}?` : `Reactivate ${toggle?.name}?`}</DialogTitle>
            <DialogDescription className="mt-2 text-sm font-medium">{toggle?.active ? "This doctor loses access at once, is signed out everywhere and no longer appears in doctor lists." : "This doctor regains access and appears in doctor lists again."}</DialogDescription>
          </DialogHeader>
          {toggleError && (
            <div role="alert" data-testid="confirm-error" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <p>{toggleError.text}</p>
              {toggleError.requestId && <p data-testid="support-reference" className="mt-1 text-[11px] text-red-600/80">Support reference: <span className="font-mono">{toggleError.requestId}</span></p>}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="h-11 rounded-xl font-bold" disabled={busy} onClick={() => setToggle(null)}>Cancel</Button>
            <Button disabled={busy} className={cn("h-11 rounded-xl px-6 font-bold text-white", toggle?.active ? "bg-red-600 hover:bg-red-700" : "bg-[#0F2A4D] hover:bg-[#16375F]")} onClick={() => void runToggle()}>{busy ? "Working…" : toggle?.active ? "Deactivate" : "Reactivate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemporaryPasswordDialog secret={secret} onClose={() => setSecret(null)} />
      {scheduleFor && <DoctorScheduleDialog doctorId={scheduleFor.id} doctorName={scheduleFor.name} onClose={() => setScheduleFor(null)} />}
    </div>
  )
}
