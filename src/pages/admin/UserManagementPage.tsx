import * as React from "react"
import { Key, Pencil, Plus, Power, Search, ShieldCheck } from "lucide-react"

import { USERS, ROLE_LABELS, ROLE_BADGE_CLASSES } from "@/data/users"
import type { Role, User } from "@/types"
import { cn, initials } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { EmptyState } from "@/components/shared/EmptyState"

const ROLES: Role[] = ["admin", "doctor", "receptionist", "billing", "lab_tech", "pharmacist", "nurse"]

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export function UserManagementPage() {
  const { toast } = useToast()
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [sheetTarget, setSheetTarget] = React.useState<User | "new" | null>(null)
  const [deactivateTarget, setDeactivateTarget] = React.useState<User | null>(null)
  const [resetTarget, setResetTarget] = React.useState<User | null>(null)
  const [search, setSearch] = React.useState("")

  const toggleActive = (user: User) => {
    const idx = USERS.findIndex((u) => u.id === user.id)
    if (idx >= 0) USERS[idx] = { ...USERS[idx], active: !USERS[idx].active }
    setDeactivateTarget(null)
    toast({ title: `${user.name} ${user.active ? "deactivated" : "activated"}` })
    forceUpdate()
  }

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return USERS
    return USERS.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABELS[u.role].toLowerCase().includes(q))
  }, [search, USERS]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = USERS.filter(u => u.active !== false).length

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">User Management</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {USERS.length} total staff accounts ({activeCount} active)
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
        {rows.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={ShieldCheck} title="No users found" subtitle="Try adjusting your search query." />
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
                      <Badge className={cn("px-2 py-1 shadow-none text-[11px] font-bold tracking-wide uppercase", ROLE_BADGE_CLASSES[u.role] || "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{ROLE_LABELS[u.role]}</Badge>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-400">{u.lastLogin}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={u.active === false ? "Inactive" : "Active"} /></TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-[#0891B2] hover:bg-[#1CC0CE]/10" onClick={() => setSheetTarget(u)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100" onClick={() => setResetTarget(u)}><Key className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDeactivateTarget(u)}>
                          <Power className={cn("h-4 w-4", u.active === false && "text-emerald-500")} />
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

      <UserSheet target={sheetTarget} onClose={() => { setSheetTarget(null); forceUpdate() }} />

      <Dialog open={!!deactivateTarget} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle className="text-xl">{deactivateTarget?.active === false ? "Activate" : "Deactivate"} {deactivateTarget?.name}?</DialogTitle>
            <DialogDescription className="text-sm font-medium mt-2">This user will {deactivateTarget?.active === false ? "regain" : "immediately lose"} access to all modules.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button 
              className={cn("rounded-xl h-11 px-6 font-bold text-white", deactivateTarget?.active === false ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")} 
              onClick={() => deactivateTarget && toggleActive(deactivateTarget)}
            >
              {deactivateTarget?.active === false ? "Activate User" : "Deactivate User"}
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
            <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={() => { toast({ title: `Reset link sent to ${resetTarget?.email}` }); setResetTarget(null) }}>Send Reset Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserSheet({ target, onClose }: { target: User | "new" | null; onClose: () => void }) {
  const { toast } = useToast()
  const isNew = target === "new"
  const user = isNew ? null : target

  const [name, setName] = React.useState(user?.name ?? "")
  const [email, setEmail] = React.useState(user?.email ?? "")
  const [role, setRole] = React.useState<Role>(user?.role ?? "receptionist")
  const [phone, setPhone] = React.useState(user?.phone ?? "")
  const [cnic, setCnic] = React.useState(user?.cnic ?? "")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [active, setActive] = React.useState(user?.active !== false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    setName(user?.name ?? ""); setEmail(user?.email ?? ""); setRole(user?.role ?? "receptionist");
    setPhone(user?.phone ?? ""); setCnic(user?.cnic ?? ""); setPassword(""); setConfirmPassword("");
    setActive(user?.active !== false); setError("")
  }, [target])

  const save = () => {
    setError("")
    if (!name || !email) return
    const dupe = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== user?.id)
    if (dupe) { setError("Email already registered"); return }
    if (isNew && !password) { setError("Password is required for new users"); return }
    if (password && password !== confirmPassword) { setError("Passwords do not match"); return }

    if (isNew) {
      USERS.push({
        id: Math.max(0, ...USERS.map((u) => u.id)) + 1, name, email, password: password || "changeme123",
        role, spec: null, fee: null, avatar: initials(name), phone, cnic, active, lastLogin: "Never",
        joiningDate: new Date().toISOString().slice(0, 10),
      })
      toast({ title: `User ${name} created` })
    } else if (user) {
      const idx = USERS.findIndex((u) => u.id === user.id)
      if (idx >= 0) {
        USERS[idx] = { ...USERS[idx], name, email, role, phone, cnic, active, password: password || USERS[idx].password }
      }
      toast({ title: `User ${name} updated` })
    }
    onClose()
  }

  return (
    <Sheet open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="text-2xl font-black text-[#0D1B2E]">{isNew ? "Add New User" : "Edit User"}</SheetTitle></SheetHeader>
        <div className="mt-8 space-y-5">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</Label><Input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email *</Label><Input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Role *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="font-medium">{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label><Input className={inputClass} placeholder="03XX-XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">CNIC</Label><Input className={inputClass} value={cnic} onChange={(e) => setCnic(e.target.value)} /></div>
          </div>
          
          <div className="pt-4 border-t border-slate-100 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Password {!isNew && <span className="font-normal normal-case tracking-normal text-slate-400">(leave blank to keep current)</span>}</Label>
              <Input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Confirm Password</Label><Input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          </div>
          
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Status</Label>
            <RadioGroup className="flex gap-4 p-2 rounded-xl bg-slate-50 ring-1 ring-slate-100" value={active ? "Active" : "Inactive"} onValueChange={(v) => setActive(v === "Active")}>
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
          {error && <p className="text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
        </div>
        <SheetFooter className="mt-8 gap-2">
          <Button variant="ghost" className="rounded-xl h-11 font-bold" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl h-11 px-8 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={save}>Save User</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
