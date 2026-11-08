"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Copy, Key, LogOut, Pencil, Plus, Power, Search, ShieldCheck } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { errorSummary, userAdminService, type DoctorProfilePatch, type UserAdminRecord, type UserPatch } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { API_USER_ROLES } from "@/lib/services/types"
import { formatInstant } from "@/lib/session/hospital"
import { normalizeMoneyInput } from "@/lib/services/moneyMath"
import { RestoredNote } from "@/components/shared/RestoredNote"
import { useDraftState } from "@/lib/session/useDraftState"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn, initials } from "@/lib/utils"

const PAGE_SIZE = 10
const ALL = "all"
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Platform admin", admin: "Administrator", doctor: "Doctor", receptionist: "Receptionist", billing: "Billing", lab_tech: "Lab Technician",
  pharmacist: "Pharmacist", nurse: "Nurse", radiographer: "Radiographer",
}
export const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
export const primaryBtn = "rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0"
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }

/**
 * Admin -> Users (the API's /users). Paged, searched and filtered on the server. Reads need users.read, changes need users.write. The system
 * generates every password: a new user, and "Reset password", each hand the admin a TEMPORARY password ONCE, in a dialog that keeps it in memory
 * only until it is closed (never in the cache, a URL, local storage or a log). Deactivating a user also ends their sessions on the server.
 */
export function UsersAdmin() {
  const { can } = useAccess()
  const canRead = can("users.read")
  const canWrite = can("users.write")
  const showActions = canWrite || can("audit.read")
  const { user: me } = useAuth()
  const { toast } = useToast()
  const { settings } = useHospital()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [role, setRole] = React.useState(ALL)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [sheet, setSheet] = React.useState<UserAdminRecord | "new" | null>(null)
  const [confirm, setConfirm] = React.useState<{ kind: "toggle" | "reset" | "signout"; user: UserAdminRecord } | null>(null)
  const [confirmError, setConfirmError] = React.useState<{ text: string; requestId: string | null } | null>(null)
  const [secret, setSecret] = React.useState<{ title: string; name: string; username: string; password: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = useScopedKey("usersAdmin", "list", search.term ?? null, role, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => userAdminService.list({ search: search.term, role: role === ALL ? undefined : role, active: ACTIVE_PARAM[activeFilter], page, pageSize: PAGE_SIZE, signal }),
    staleTime: 0,
    placeholderData: keepPreviousData,
    enabled: canRead,
  })

  async function runConfirmed() {
    if (!confirm || busy) return
    const { kind, user } = confirm
    setBusy(true)
    setConfirmError(null)
    try {
      if (kind === "toggle") {
        await userAdminService.setActive(user.id, !user.active)
        toast({ title: `${user.name} ${user.active ? "deactivated" : "reactivated"}` })
      } else if (kind === "signout") {
        await userAdminService.signOutEverywhere(user.id)
        toast({ title: `${user.name} was signed out everywhere` })
      } else {
        const password = await userAdminService.resetPassword(user.id)
        setSecret({ title: "New temporary password", name: user.name, username: user.username, password })
      }
      setConfirm(null)
    } catch (err) {
      const result = classifyCreateError(err)
      setConfirmError({ text: result.kind === "failed" ? result.message : errorSummary(err), requestId: result.kind === "failed" ? result.requestId : null })
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) return <EmptyState icon={ShieldCheck} title="User management is not available to you" subtitle="You need permission to view staff accounts." />
  const rows = list.data?.items ?? []
  const filtered = !!search.term || role !== ALL || activeFilter !== "all"
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10" data-testid="users-admin">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">User Management</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="users-count">{list.data ? `${list.data.total} ${filtered ? "matching" : "total"} staff accounts` : list.isError ? "Staff accounts unavailable" : "Loading staff accounts…"}</p>
        </div>
        {canWrite && <Button className={primaryBtn} onClick={() => setSheet("new")}><Plus className="mr-2 h-5 w-5" /> Add User</Button>}
      </div>

      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search users" placeholder="Search by name, username or email…" className={`${inputClass} pl-10`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1) }}>
          <SelectTrigger aria-label="Role" className={cn(inputClass, "w-full md:w-52")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Roles</SelectItem>
            {API_USER_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
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
          <div className="space-y-3 p-6" role="status" aria-label="Loading users">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10"><EmptyState icon={ShieldCheck} title="No users found" subtitle={filtered ? "Try adjusting your search or filters." : "No staff accounts have been added yet."} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Name</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Email</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Role</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Last Login</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Status</TableHead>
                  {showActions && <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const mine = me?.id === u.id
                  return (
                    <TableRow key={u.id} data-testid={`user-row-${u.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 shadow-sm ring-1 ring-slate-100"><AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-600">{initials(u.name)}</AvatarFallback></Avatar>
                          <div><p className="font-bold text-[#0D1B2E]">{u.name}</p><p className="font-mono text-[11px] text-slate-500">{u.username}</p></div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-500">{u.email ?? "—"}</TableCell>
                      <TableCell className="py-4"><Badge className="bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700 shadow-none hover:bg-slate-200">{ROLE_LABEL[u.role] ?? u.role}</Badge></TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-400">{u.lastLoginAt ? formatInstant(u.lastLoginAt, settings?.timezone ?? "UTC") : "Never"}</TableCell>
                      <TableCell className="space-y-1 py-4">
                        <StatusBadge status={u.active ? "Active" : "Inactive"} />
                        {u.locked && <p className="text-[11px] font-bold text-red-600">Locked out</p>}
                        {u.mustChangePassword && <p className="text-[11px] font-semibold text-amber-600">Must change password</p>}
                      </TableCell>
                      {showActions && (
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <ItemHistoryButton subject="user" id={u.id} label={u.name} />
                            {canWrite && <Button aria-label={`Edit ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setSheet(u)}><Pencil className="h-4 w-4" /></Button>}
                            {canWrite && !mine && <Button aria-label={`Reset password for ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-amber-100 hover:text-amber-600" onClick={() => { setConfirmError(null); setConfirm({ kind: "reset", user: u }) }}><Key className="h-4 w-4" /></Button>}
                            {canWrite && !mine && <Button aria-label={`Sign ${u.name} out everywhere`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => { setConfirmError(null); setConfirm({ kind: "signout", user: u }) }}><LogOut className="h-4 w-4" /></Button>}
                            {canWrite && !mine && <Button aria-label={`${u.active ? "Deactivate" : "Activate"} ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => { setConfirmError(null); setConfirm({ kind: "toggle", user: u }) }}><Power className={cn("h-4 w-4", !u.active && "text-emerald-500")} /></Button>}
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
        {list.data && list.data.total > PAGE_SIZE && <div className="px-6"><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="users" /></div>}
      </div>

      {sheet !== null && (
        <UserDialog
          key={sheet === "new" ? "new" : sheet.id}
          target={sheet}
          isSelf={sheet !== "new" && me?.id === sheet.id}
          onClose={() => setSheet(null)}
          onSecret={(s) => setSecret(s)}
        />
      )}

      <Dialog open={!!confirm} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
        <DialogContent className="rounded-[1.5rem] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {confirm?.kind === "reset" ? "Reset password?" : confirm?.kind === "signout" ? "Sign out everywhere?" : confirm?.user.active ? `Deactivate ${confirm?.user.name}?` : `Reactivate ${confirm?.user.name}?`}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm font-medium">
              {confirm?.kind === "reset" && <>A new temporary password is made for <strong className="text-slate-700">{confirm.user.name}</strong>. The old one stops working and they must change the new one when they sign in. You will see it once.</>}
              {confirm?.kind === "signout" && <><strong className="text-slate-700">{confirm.user.name}</strong> is signed out on every device now.</>}
              {confirm?.kind === "toggle" && (confirm.user.active ? "This user loses access at once and is signed out everywhere." : "This user regains access to the modules their role allows.")}
            </DialogDescription>
          </DialogHeader>
          {confirmError && (
            <div role="alert" data-testid="confirm-error" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <p>{confirmError.text}</p>
              {confirmError.requestId && <p data-testid="support-reference" className="mt-1 text-[11px] text-red-600/80">Support reference: <span className="font-mono">{confirmError.requestId}</span></p>}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="h-11 rounded-xl font-bold" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button disabled={busy} className={cn("h-11 rounded-xl px-6 font-bold text-white", confirm?.kind === "toggle" && confirm.user.active ? "bg-red-600 hover:bg-red-700" : "bg-[#0F2A4D] hover:bg-[#16375F]")} onClick={() => void runConfirmed()}>
              {busy ? "Working…" : confirm?.kind === "reset" ? "Reset password" : confirm?.kind === "signout" ? "Sign out everywhere" : confirm?.user.active ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemporaryPasswordDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  )
}

/** The one-time temporary password. Held in this component's props only; closing it drops it. */
export function TemporaryPasswordDialog({ secret, onClose }: { secret: { title: string; name: string; username: string; password: string } | null; onClose: () => void }) {
  const { toast } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret?.password ?? "")
      toast({ title: "Copied" })
    } catch {
      toast({ variant: "destructive", title: "Could not copy", description: "Select the password and copy it by hand." })
    }
  }
  return (
    <Dialog open={!!secret} onOpenChange={(v) => !v && onClose()}>
      {/* The password cannot be shown again, so a stray click outside or Esc must not close the dialog: only the button does. */}
      <DialogContent className="rounded-[1.5rem] sm:max-w-[460px]" data-testid="temp-password-dialog" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">{secret?.title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm font-medium">For <strong className="text-slate-700">{secret?.name}</strong> (<span className="font-mono">{secret?.username}</span>). Give it to them privately. <strong>It is shown only once</strong> and cannot be seen again; they must choose a new password when they first sign in.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <code data-testid="temp-password" className="flex-1 select-all break-all text-lg font-bold tracking-wide text-[#0D1B2E]">{secret?.password}</code>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
        </div>
        <DialogFooter className="mt-2"><Button className={primaryBtn} onClick={onClose}>I have saved it</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UserDialog({ target, isSelf, lockRole, onClose, onSecret }: { target: UserAdminRecord | "new"; isSelf: boolean; /** Fix the role (the Doctors screen adds and edits doctors only). */ lockRole?: string; onClose: () => void; onSecret: (s: { title: string; name: string; username: string; password: string }) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  // The latest SAVED version of this user: the account call and the doctor-profile call are two requests, so a retry after a half-saved attempt
  // compares with what the server already holds and sends only what is still missing.
  const [base, setBase] = React.useState<UserAdminRecord | null>(original)
  const [partialNote, setPartialNote] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState(original?.username ?? "")
  const [name, setName] = React.useState(original?.name ?? "")
  const [role, setRole] = React.useState<string>(original?.role ?? lockRole ?? "")
  const [email, setEmail] = React.useState(original?.email ?? "")
  const [phone, setPhone] = React.useState(original?.phone ?? "")
  const [cnic, setCnic] = React.useState(original?.cnic ?? "")
  const [city, setCity] = React.useState(original?.city ?? "")
  const [address, setAddress] = React.useState(original?.address ?? "")
  const [joining, setJoining] = React.useState(original?.joiningDate ?? "")
  const dp = original?.doctorProfile
  const [specialization, setSpecialization] = React.useState(dp?.specialization ?? "")
  const [qualifications, setQualifications] = React.useState(dp?.qualifications ?? "")
  const [pmc, setPmc] = React.useState(dp?.pmcRegNo ?? "")
  const [fee, setFee] = React.useState(dp ? dp.consultationFee : "")
  const [commission, setCommission] = React.useState(dp?.commissionPct != null ? String(dp.commissionPct) : "")
  const [notes, setNotes, notesRestored] = useDraftState(`user-notes:${original?.id ?? "new"}`, dp?.notes ?? "")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)
  const isDoctor = role === "doctor"
  const roleLocked = original?.role === "super_admin"

  function validate() {
    const found: Record<string, string> = {}
    if (!/^[a-z0-9._-]{3,32}$/.test(username.trim().toLowerCase())) found.username = "3 to 32 characters: lower-case letters, digits and . _ - only"
    if (name.trim().length < 2 || name.trim().length > 120) found.name = "Name needs 2 to 120 characters"
    if (!role) found.role = "Choose a role"
    if (email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = "Enter a valid email address, or leave it empty"
    if (phone.trim().length > 30) found.phone = "At most 30 characters"
    if (cnic.trim().length > 20) found.cnic = "At most 20 characters"
    if (joining.trim() !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(joining.trim())) found.joining = "Use the date picker (YYYY-MM-DD)"
    let feeText = "0.00", commissionNumber: number | undefined
    if (isDoctor) {
      const normal = normalizeMoneyInput(fee)
      if (normal === null || normal.startsWith("-")) found.fee = "Enter the consultation fee, e.g. 1500 or 1500.50"
      else feeText = normal
      if (commission.trim() === "" && base?.doctorProfile?.commissionPct != null) found.commission = "Enter 0 to remove the commission (it cannot be left empty once set)"
      if (commission.trim() !== "") {
        if (!AMOUNT_RE.test(commission.trim()) || Number(commission.trim()) > 100) found.commission = "Enter a percentage from 0 to 100"
        else commissionNumber = Number(commission.trim())
      }
    }
    setProblems(found)
    return Object.keys(found).length > 0 ? null : { feeText, commissionNumber }
  }

  async function save() {
    const v = validate()
    if (!v) return
    setFailure(null)
    setPartialNote(null)
    const profile = isDoctor ? { specialization, qualifications, pmcRegNo: pmc, consultationFee: v.feeText, commissionPct: v.commissionNumber, notes } : undefined
    await run(async () => {
      try {
        if (!original) {
          const created = await userAdminService.create({ username, name, role, email, phone, cnic, address, city, joiningDate: joining, doctorProfile: profile })
          onSecret({ title: "User created: temporary password", name: created.user.name, username: created.user.username, password: created.temporaryPassword })
          toast({ title: `${created.user.name} added` })
        } else {
          // Account fields go to PATCH /users/{id} (changed fields only; an emptied optional box clears the field with null). A doctor's profile and fee
          // go to PATCH /users/{id}/doctor-profile (changed fields only), except when the user BECOMES a doctor: then the profile travels with the role change.
          let current = base ?? original
          const patch: UserPatch = {}
          if (username.trim().toLowerCase() !== current.username) patch.username = username
          if (name.trim() !== current.name) patch.name = name
          if (role !== current.role) patch.role = role
          const text = (cur: string, before: string | null) => (cur.trim() === (before ?? "") ? undefined : cur.trim() === "" ? null : cur)
          const e = text(email, current.email); if (e !== undefined) patch.email = e
          const p = text(phone, current.phone); if (p !== undefined) patch.phone = p
          const c = text(cnic, current.cnic); if (c !== undefined) patch.cnic = c
          const ci = text(city, current.city); if (ci !== undefined) patch.city = ci
          const a = text(address, current.address); if (a !== undefined) patch.address = a
          const j = text(joining, current.joiningDate); if (j !== undefined) patch.joiningDate = j
          if (profile && !current.doctorProfile) patch.doctorProfile = profile
          let accountSaved = false
          if (Object.keys(patch).length > 0) {
            current = await userAdminService.update(current.id, patch)
            setBase(current)
            accountSaved = true
          }
          let profileSaved = false
          if (profile && current.doctorProfile) {
            const o = current.doctorProfile
            const changes: DoctorProfilePatch = {}
            if (specialization.trim() !== o.specialization) changes.specialization = specialization
            if (qualifications.trim() !== o.qualifications) changes.qualifications = qualifications
            if (pmc.trim() !== o.pmcRegNo) changes.pmcRegNo = pmc
            if (profile.consultationFee !== o.consultationFee) changes.consultationFee = profile.consultationFee
            if (profile.commissionPct !== undefined && profile.commissionPct !== o.commissionPct) changes.commissionPct = profile.commissionPct
            if (notes.trim() !== o.notes) changes.notes = notes
            if (Object.keys(changes).length > 0) {
              try {
                current = await userAdminService.updateDoctorProfile(current.id, changes)
                setBase(current)
                profileSaved = true
              } catch (err) {
                if (accountSaved) setPartialNote("The account details were saved, but the doctor profile was not. Fix the problem below and save again: only the profile will be sent.")
                throw err
              }
            }
          }
          const changed = accountSaved || profileSaved || (profile && patch.doctorProfile !== undefined)
          toast({ title: changed ? `${name.trim()} updated` : "Nothing changed" })
        }
        onClose()
      } catch (err) {
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          // The user exists but the answer (and so the temporary password) was lost: the admin issues a new one with Reset password.
          toast({ title: !original ? "User created, but the temporary password could not be read" : "Saved. Refreshing the list.", description: !original ? "Use Reset password on the new user to get one." : undefined })
          onClose()
          return
        }
        const fromServer: Record<string, string> = {}
        const map: Record<string, string> = {
          username: "username", name: "name", role: "role", email: "email", phone: "phone", cnic: "cnic", joiningDate: "joining",
          "doctorProfile.consultationFee": "fee", "doctorProfile.commissionPct": "commission", consultationFee: "fee", commissionPct: "commission",
        }
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (map[path]) fromServer[map[path]] = message
        if (result.code === "USERNAME_TAKEN") fromServer.username = result.message
        if (result.code === "EMAIL_TAKEN") fromServer.email = result.message
        setProblems((prev) => ({ ...prev, ...fromServer }))
        setFailure(result)
      }
    })
  }

  const field = (id: string, label: string, error: string | undefined, children: React.ReactNode, className = "") => (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={`${uid}-${id}`} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
      {children}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
  const box = (id: string, value: string, set: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={`${uid}-${id}`} className={inputClass} value={value} onChange={(e) => set(e.target.value)} {...extra} />
  )

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl">
        <DialogHeader><DialogTitle className="text-xl">{lockRole === "doctor" ? (original ? "Edit Doctor" : "Add Doctor") : original ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2">
          {field("username", "Username *", problems.username, box("username", username, (v) => setUsername(v.toLowerCase()), { maxLength: 32, autoComplete: "off" }))}
          {field("name", "Full Name *", problems.name, box("name", name, setName, { maxLength: 120 }))}
          {field("role", "Role *", problems.role, (
            <Select value={role} onValueChange={setRole} disabled={isSelf || roleLocked || !!lockRole}>
              <SelectTrigger id={`${uid}-role`} className={inputClass}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{(roleLocked ? ["super_admin"] : [...API_USER_ROLES]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {field("email", "Email", problems.email, box("email", email, setEmail, { type: "email", autoComplete: "off" }))}
          {field("phone", "Phone", problems.phone, box("phone", phone, setPhone, { maxLength: 30 }))}
          {field("cnic", "CNIC", problems.cnic, box("cnic", cnic, setCnic, { maxLength: 20 }))}
          {field("city", "City", undefined, box("city", city, setCity, { maxLength: 80 }))}
          {field("joining", "Joining Date", problems.joining, box("joining", joining, setJoining, { type: "date" }))}
          {field("address", "Address", undefined, box("address", address, setAddress, { maxLength: 300 }), "sm:col-span-2")}
          {isSelf && <p className="text-xs text-slate-500 sm:col-span-2">You cannot change your own role.</p>}
          {isDoctor && (
            <fieldset className="grid grid-cols-1 gap-5 rounded-xl border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2" data-testid="doctor-profile">
              <legend className="px-1 text-xs font-bold text-slate-500">Doctor profile</legend>
              {field("fee", "Consultation Fee *", problems.fee, box("fee", fee, setFee, { inputMode: "decimal" }))}
              {field("commission", "Commission %", problems.commission, box("commission", commission, setCommission, { inputMode: "decimal" }))}
              {field("specialization", "Specialization", undefined, box("specialization", specialization, setSpecialization, { maxLength: 120 }))}
              {field("pmc", "PMC Registration No.", undefined, box("pmc", pmc, setPmc, { maxLength: 40 }))}
              {field("qualifications", "Qualifications", undefined, box("qualifications", qualifications, setQualifications, { maxLength: 300 }), "sm:col-span-2")}
              {field("notes", "Notes", undefined, <Textarea id={`${uid}-notes`} rows={2} className={cn(inputClass, "h-auto resize-none")} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />, "sm:col-span-2")}
              <RestoredNote show={notesRestored} className="sm:col-span-2" />
            </fieldset>
          )}
          {!original && <p className="text-xs text-slate-500 sm:col-span-2">No password is typed here: the system makes a temporary password and shows it to you once after saving. The user must change it at first sign-in.</p>}
        </div>
        {partialNote && <p role="status" data-testid="partial-save-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{partialNote}</p>}
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="mt-2 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtn} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save User"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
