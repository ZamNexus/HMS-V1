"use client"
import * as React from "react"
import { AlertTriangle, Key, Pencil, Plus, Power, Search, ShieldCheck } from "lucide-react"

import { ROLE_LABELS, ROLE_BADGE_CLASSES } from "@/data/users"
import { DEFAULT_PAGE_SIZE, activeSuffix, errorSummary, rolesService, usersService, validateUserForm, viewState, type UserRecord } from "@/lib/services"
import { Pagination } from "@/components/shared/Pagination"
import { useResource } from "@/lib/useResource"
import { cn, initials } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { EmptyState } from "@/components/shared/EmptyState"

// Role display: backend label if supplied, else the known label, else the raw role code.
const roleText = (u: Pick<UserRecord, "role" | "roleLabel">) => u.roleLabel ?? ROLE_LABELS[u.role] ?? u.role

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export default function UserManagementPage() {
  const { toast } = useToast()
  const [sheetTarget, setSheetTarget] = React.useState<UserRecord | "new" | null>(null)
  const [deactivateTarget, setDeactivateTarget] = React.useState<UserRecord | null>(null)
  const [resetTarget, setResetTarget] = React.useState<UserRecord | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)

  // Debounce so a server-side search isn't fired on every keystroke; a new search restarts at page 1.
  React.useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const loadUsers = React.useCallback(
    (signal: AbortSignal) => usersService.list({ search: query, page, pageSize: DEFAULT_PAGE_SIZE, signal }),
    [query, page]
  )
  const { data, error, loading, reload } = useResource(loadUsers)
  const rows = data?.items ?? []
  const view = viewState({ data, error, loading, rowCount: rows.length })

  const failure = (title: string, err: unknown) => toast({ variant: "destructive", title, description: errorSummary(err) })

  const toggleActive = async (user: UserRecord) => {
    setBusy(true)
    try {
      await usersService.setActive(user.id, !user.active)
      toast({ title: `${user.name} ${user.active ? "deactivated" : "activated"}` })
      setDeactivateTarget(null)
      reload()
    } catch (err) {
      failure(`Could not ${user.active ? "deactivate" : "activate"} ${user.name}`, err)
    } finally {
      setBusy(false)
    }
  }

  const sendReset = async (user: UserRecord) => {
    setBusy(true)
    try {
      await usersService.sendPasswordReset(user.id)
      toast({ title: `Reset link sent to ${user.email}` })
      setResetTarget(null)
    } catch (err) {
      failure("Could not send reset link", err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">User Management</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {view === "error" ? "Staff accounts unavailable" : data ? `${data.total} ${query ? "matching" : "total"} staff accounts${activeSuffix(rows, data.total)}` : "Loading staff accounts…"}
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" onClick={() => setSheetTarget("new")}>
          <Plus className="h-5 w-5 mr-2" /> Add User
        </Button>
      </div>

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>
      </div>

      {/* ─── ELEVATED DATA TABLE ──────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load users"
              subtitle={errorSummary(error)}
              action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>}
            />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading users">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10">
            <EmptyState icon={ShieldCheck} title="No users found" subtitle={query ? "Try adjusting your search query." : "No staff accounts have been added yet."} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Name</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Email</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Role</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Last Login</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 ring-1 ring-slate-100 shadow-sm">
                          <AvatarFallback className={cn("text-xs font-bold", ROLE_BADGE_CLASSES[u.role] || "bg-slate-100 text-slate-600")}>{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-[#0D1B2E]">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-500">{u.email}</TableCell>
                    <TableCell className="py-4">
                      <Badge className={cn("px-2 py-1 shadow-none text-[11px] font-bold tracking-wide uppercase", ROLE_BADGE_CLASSES[u.role] || "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{roleText(u)}</Badge>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-400">{u.lastLogin ?? "—"}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={u.active ? "Active" : "Inactive"} /></TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button aria-label={`Edit ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setSheetTarget(u)}><Pencil className="h-4 w-4" /></Button>
                        <Button aria-label={`Reset password for ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100" onClick={() => setResetTarget(u)}><Key className="h-4 w-4" /></Button>
                        <Button aria-label={`${u.active ? "Deactivate" : "Activate"} ${u.name}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDeactivateTarget(u)}>
                          <Power className={cn("h-4 w-4", !u.active && "text-emerald-500")} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data && data.total > DEFAULT_PAGE_SIZE && (
          <div className="px-6"><Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data.total} onPageChange={setPage} itemLabel="users" /></div>
        )}
      </div>

      <UserSheet target={sheetTarget} onClose={(saved) => { setSheetTarget(null); if (saved) reload() }} />

      <Dialog open={!!deactivateTarget} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle className="text-xl">{deactivateTarget && !deactivateTarget.active ? "Activate" : "Deactivate"} {deactivateTarget?.name}?</DialogTitle>
            <DialogDescription className="text-sm font-medium mt-2">This user will {deactivateTarget && !deactivateTarget.active ? "regain" : "immediately lose"} access to all modules.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button
              disabled={busy}
              className={cn("rounded-xl h-11 px-6 font-bold text-white", deactivateTarget && !deactivateTarget.active ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}
              onClick={() => deactivateTarget && toggleActive(deactivateTarget)}
            >
              {deactivateTarget && !deactivateTarget.active ? "Activate User" : "Deactivate User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(v) => !v && setResetTarget(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle className="text-xl">Reset Password</DialogTitle>
            <DialogDescription className="text-sm font-medium mt-2">Send a password reset email to <strong className="text-slate-700">{resetTarget?.email}</strong>?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button disabled={busy} className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={() => resetTarget && sendReset(resetTarget)}>Send Reset Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserSheet({ target, onClose }: { target: UserRecord | "new" | null; onClose: (saved?: boolean) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const isNew = target === "new"
  const user = isNew ? null : target

  const [name, setName] = React.useState(user?.name ?? "")
  const [email, setEmail] = React.useState(user?.email ?? "")
  const [role, setRole] = React.useState(user?.role ?? "")
  const [phone, setPhone] = React.useState(user?.phone ?? "")
  const [cnic, setCnic] = React.useState(user?.cnic ?? "")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [active, setActive] = React.useState(user?.active ?? true)
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Roles come from the backend only; nothing is assumed when they are unavailable.
  const loadRoles = React.useCallback((signal: AbortSignal) => rolesService.list(signal), [])
  const { data: roles, error: rolesError } = useResource(loadRoles)
  const roleOptions = React.useMemo(() => {
    const list = roles ?? []
    return user && user.role && !list.some((r) => r.value === user.role) ? [...list, { value: user.role, label: roleText(user) }] : list
  }, [roles, user])

  React.useEffect(() => {
    setName(user?.name ?? ""); setEmail(user?.email ?? ""); setRole(user?.role ?? "");
    setPhone(user?.phone ?? ""); setCnic(user?.cnic ?? ""); setPassword(""); setConfirmPassword("");
    setActive(user?.active ?? true); setError("")
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setError("")
    const problems = validateUserForm({ name, email, role, password, confirmPassword, isNew })
    if (problems.length) { setError(problems.join(". ")); return }

    const input = { name, email, role, phone: phone || undefined, cnic: cnic || undefined, active, password: password || undefined }
    setSaving(true)
    try {
      if (isNew) {
        await usersService.create(input)
        toast({ title: `User ${name} created` })
      } else if (user) {
        await usersService.update(user.id, input)
        toast({ title: `User ${name} updated` })
      }
      onClose(true)
    } catch (err) {
      setError(errorSummary(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="text-2xl font-black text-[#0D1B2E]">{isNew ? "Add New User" : "Edit User"}</SheetTitle></SheetHeader>
        <div className="mt-8 space-y-5">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-full-name`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</Label><Input id={`${uid}-full-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-email`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Email *</Label><Input id={`${uid}-email`} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-role`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id={`${uid}-role`} className={selectClass}><SelectValue placeholder={roles || rolesError ? "Select a role" : "Loading roles…"} /></SelectTrigger>
              <SelectContent>{roleOptions.map((r) => <SelectItem key={r.value} value={r.value} className="font-medium">{r.label}</SelectItem>)}</SelectContent>
            </Select>
            {rolesError ? <p role="alert" className="text-xs font-medium text-red-600">Roles unavailable: {errorSummary(rolesError)}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor={`${uid}-phone`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input id={`${uid}-phone`} className={inputClass} placeholder="03XX-XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor={`${uid}-cnic`} className="text-xs font-bold uppercase tracking-wider text-slate-500">CNIC</Label><Input id={`${uid}-cnic`} className={inputClass} value={cnic} onChange={(e) => setCnic(e.target.value)} /></div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-password`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Password {!isNew && <span className="font-normal normal-case tracking-normal text-slate-400">(leave blank to keep current)</span>}</Label>
              <Input id={`${uid}-password`} type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5"><Label htmlFor={`${uid}-confirm-password`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Confirm Password</Label><Input id={`${uid}-confirm-password`} type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <Label id={`${uid}-account-status-label`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Status</Label>
            <RadioGroup aria-labelledby={`${uid}-account-status-label`} className="flex gap-4 p-2 rounded-xl bg-slate-50 ring-1 ring-slate-100" value={active ? "Active" : "Inactive"} onValueChange={(v) => setActive(v === "Active")}>
              <label className={cn("flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all", active ? "bg-white shadow-sm ring-1 ring-black/5 text-[#0D1B2E]" : "text-slate-500 hover:bg-slate-100")}>
                <RadioGroupItem value="Active" id="st-active" className="sr-only" />
                <span className="font-bold text-sm">Active</span>
              </label>
              <label className={cn("flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all", !active ? "bg-white shadow-sm ring-1 ring-black/5 text-[#0D1B2E]" : "text-slate-500 hover:bg-slate-100")}>
                <RadioGroupItem value="Inactive" id="st-inactive" className="sr-only" />
                <span className="font-bold text-sm">Inactive</span>
              </label>
            </RadioGroup>
          </div>
          {error && <p role="alert" className="text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
        </div>
        <SheetFooter className="mt-8 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={() => onClose()}>Cancel</Button>
          <Button disabled={saving} className="rounded-xl h-11 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={save}>{saving ? "Saving…" : "Save User"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
