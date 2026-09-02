import * as React from "react"
import { Key, Pencil, Plus, Power } from "lucide-react"

import { USERS, ROLE_LABELS, ROLE_BADGE_CLASSES } from "@/data/users"
import type { Role, User } from "@/types"
import { cn, initials } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
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

const ROLES: Role[] = ["admin", "doctor", "receptionist", "billing", "lab_tech", "pharmacist", "nurse"]

export function UserManagementPage() {
  const { toast } = useToast()
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [sheetTarget, setSheetTarget] = React.useState<User | "new" | null>(null)
  const [deactivateTarget, setDeactivateTarget] = React.useState<User | null>(null)
  const [resetTarget, setResetTarget] = React.useState<User | null>(null)

  const toggleActive = (user: User) => {
    const idx = USERS.findIndex((u) => u.id === user.id)
    if (idx >= 0) USERS[idx] = { ...USERS[idx], active: !USERS[idx].active }
    setDeactivateTarget(null)
    toast({ title: `${user.name} ${user.active ? "deactivated" : "activated"}` })
    forceUpdate()
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage staff accounts and system access"
        actions={<Button onClick={() => setSheetTarget("new")}><Plus className="h-4 w-4" /> Add User</Button>}
      />

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
            <TableHead>Last Login</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {USERS.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className={cn("text-xs", ROLE_BADGE_CLASSES[u.role])}>{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge className={cn(ROLE_BADGE_CLASSES[u.role])}>{ROLE_LABELS[u.role]}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{u.lastLogin}</TableCell>
                <TableCell><StatusBadge status={u.active === false ? "Inactive" : "Active"} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setSheetTarget(u)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setResetTarget(u)}><Key className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(u)}><Power className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserSheet target={sheetTarget} onClose={() => { setSheetTarget(null); forceUpdate() }} />

      <Dialog open={!!deactivateTarget} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{deactivateTarget?.active === false ? "Activate" : "Deactivate"} {deactivateTarget?.name}?</DialogTitle>
            <DialogDescription>This user will {deactivateTarget?.active === false ? "regain" : "immediately lose"} access to all modules.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deactivateTarget && toggleActive(deactivateTarget)}>
              {deactivateTarget?.active === false ? "Activate" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(v) => !v && setResetTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Send password reset email to {resetTarget?.email}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={() => { toast({ title: `Reset link sent to ${resetTarget?.email}` }); setResetTarget(null) }}>Send</Button>
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
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <SheetContent side="right">
        <SheetHeader><SheetTitle>{isNew ? "Add New User" : "Edit User"}</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label>Full Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="03XX-XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>CNIC</Label><Input value={cnic} onChange={(e) => setCnic(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Password {!isNew && <span className="font-normal text-muted-foreground">(leave blank to keep current)</span>}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <RadioGroup className="flex gap-4" value={active ? "Active" : "Inactive"} onValueChange={(v) => setActive(v === "Active")}>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="Active" id="st-active" /><Label htmlFor="st-active" className="cursor-pointer font-normal">Active</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="Inactive" id="st-inactive" /><Label htmlFor="st-inactive" className="cursor-pointer font-normal">Inactive</Label></div>
            </RadioGroup>
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
