"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Landmark, Pencil, Plus, Search } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { fieldErrorMap } from "@/lib/forms/fieldErrors"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { bankAccountsService, errorSummary, type BankAccountPatch, type BankAccountRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CATALOG_PAGE_SIZE, cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"

type ActiveFilter = "all" | "active" | "inactive"
const ACTIVE_PARAM: Record<ActiveFilter, boolean | undefined> = { all: undefined, active: true, inactive: false }
const ACCOUNT_NO_RE = /^[A-Za-z0-9][A-Za-z0-9 -]*$/

/**
 * Master Data -> Banks (GET/POST /bank-accounts, PATCH, deactivate / reactivate: handoff 8.2; fields from the proposed contract). Account numbers are
 * for money handlers only, so READING needs accounts.read and changes need catalogs.write. Nothing is deleted: a deactivated account takes no new
 * expenses or bank entries while its past entries, balances and statements stay.
 */
export function BankAccountsTab() {
  const { can } = useAccess()
  const canRead = can("accounts.read")
  const canWrite = can("catalogs.write")
  const { toast } = useToast()
  const search = useDebouncedSearch()
  const [page, setPage] = React.useState(1)
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
  const [target, setTarget] = React.useState<BankAccountRecord | "new" | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const key = useScopedKey("bankAccounts", "admin", search.term ?? null, activeFilter, page)
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => bankAccountsService.list({ search: search.term, active: ACTIVE_PARAM[activeFilter], page, pageSize: CATALOG_PAGE_SIZE, signal }),
    staleTime: CACHE_CLASSES.reference.staleTime, // handoff 6: reference data, 10 min; every Master Data write invalidates the family
    placeholderData: keepPreviousData,
    enabled: canRead,
  })

  async function toggle(b: BankAccountRecord) {
    if (busyId) return
    setBusyId(b.id)
    try {
      await bankAccountsService.setActive(b.id, !b.active)
      toast({ title: `${b.bankName} ${b.accountNo} ${b.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${b.active ? "deactivate" : "reactivate"} ${b.bankName}`, description: errorSummary(err) })
    } finally {
      setBusyId(null)
    }
  }

  if (!canRead) return <EmptyState icon={Landmark} title="Bank accounts are not available to you" subtitle="Account numbers are for money handlers only: you need permission to view the accounts." />
  const items = list.data?.items ?? []
  const filtered = !!search.term || activeFilter !== "all"
  return (
    <div className="space-y-4" data-testid="bank-accounts-tab">
      <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Search bank accounts" placeholder="Search bank, title or number…" className={`${inputClass} pl-9`} value={search.input} onChange={(e) => { search.onChange(e.target.value); setPage(1) }} />
          </div>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as ActiveFilter); setPage(1) }}>
            <SelectTrigger aria-label="Status" className={cn(selectClass, "w-full md:w-40")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canWrite && <Button className={primaryBtnClass} onClick={() => setTarget("new")}><Plus className="mr-2 h-5 w-5" /> Add Bank Account</Button>}
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Bank</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Account Title</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Account No.</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Branch</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Active</TableHead>
                  <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isPending ? (
                  <TableRow><TableCell colSpan={6} className="p-6"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="p-0"><EmptyState icon={Landmark} title={filtered ? "No bank account matches" : "No bank accounts yet"} subtitle={filtered ? "Try a different search or filter." : canWrite ? "Add the first account." : undefined} /></TableCell></TableRow>
                ) : (
                  items.map((b) => (
                    <TableRow key={b.id} data-testid={`bank-row-${b.id}`} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50">
                      <TableCell className="px-6 py-4 font-bold text-[#0D1B2E]">{b.bankName}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-700">{b.accountTitle}</TableCell>
                      <TableCell className="py-4 font-mono text-xs text-slate-600">{b.accountNo}</TableCell>
                      <TableCell className="py-4 font-medium text-slate-500">{b.branch || "—"}</TableCell>
                      <TableCell className="py-4"><Switch aria-label={`${b.active ? "Deactivate" : "Reactivate"} ${b.bankName} ${b.accountNo}`} checked={b.active} disabled={!canWrite || busyId !== null} onCheckedChange={() => void toggle(b)} /></TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <ItemHistoryButton subject="bankAccount" id={b.id} label={`${b.bankName} ${b.accountNo}`} />
                          {canWrite && <Button aria-label={`Edit ${b.bankName} ${b.accountNo}`} variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-[#1CC0CE]/10 hover:text-[#0891B2]" onClick={() => setTarget(b)}><Pencil className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > CATALOG_PAGE_SIZE && (
            <div className="px-6"><Pagination page={page} pageSize={CATALOG_PAGE_SIZE} total={list.data.total} onPageChange={setPage} itemLabel="bank accounts" /></div>
          )}
        </div>
      )}

      {target !== null && (
        <BankDialog key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} onShowExisting={(no) => { search.onChange(no); setActiveFilter("all"); setPage(1); setTarget(null) }} />
      )}
    </div>
  )
}

function BankDialog({ target, onClose, onShowExisting }: { target: BankAccountRecord | "new"; onClose: () => void; onShowExisting: (accountNo: string) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const original = target === "new" ? null : target
  const [bankName, setBankName] = React.useState(original?.bankName ?? "")
  const [accountTitle, setAccountTitle] = React.useState(original?.accountTitle ?? "")
  const [accountNo, setAccountNo] = React.useState(original?.accountNo ?? "")
  const [branch, setBranch] = React.useState(original?.branch ?? "")
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)

  function validate(): boolean {
    const found: Record<string, string> = {}
    if (bankName.trim().length < 2 || bankName.trim().length > 80) found.bankName = "Bank name needs 2 to 80 characters"
    if (accountTitle.trim().length < 2 || accountTitle.trim().length > 120) found.accountTitle = "Account title needs 2 to 120 characters"
    const no = accountNo.trim()
    if (no.length < 4 || no.length > 34 || !ACCOUNT_NO_RE.test(no)) found.accountNo = "4 to 34 characters: letters, digits, spaces and hyphens only"
    if (branch.trim().length > 120) found.branch = "Branch can be at most 120 characters"
    setProblems(found)
    return Object.keys(found).length === 0
  }

  async function save() {
    if (!validate()) return
    setFailure(null)
    await run(async () => {
      try {
        if (!original) {
          await bankAccountsService.create({ bankName, accountTitle, accountNo, branch })
          toast({ title: `${bankName.trim()} account added` })
        } else {
          // PATCH carries ONLY what changed; an emptied branch clears it
          const patch: BankAccountPatch = {}
          if (bankName.trim() !== original.bankName) patch.bankName = bankName
          if (accountTitle.trim() !== original.accountTitle) patch.accountTitle = accountTitle
          if (accountNo.trim() !== original.accountNo) patch.accountNo = accountNo
          if (branch.trim() !== original.branch) patch.branch = branch
          if (Object.keys(patch).length > 0) await bankAccountsService.patch(original.id, patch)
          toast({ title: Object.keys(patch).length > 0 ? `${bankName.trim()} account updated` : "Nothing changed" })
        }
        onClose()
      } catch (err) {
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          toast({ title: result.message === SAVED_REFRESHING_MESSAGE ? "Saved. Refreshing the list." : result.message })
          onClose()
          return
        }
        const fromServer: Record<string, string> = {}
        for (const [path, message] of Object.entries(fieldErrorMap(err))) if (["bankName", "accountTitle", "accountNo", "branch"].includes(path)) fromServer[path] = message
        if (result.code === "BANK_ACCOUNT_NO_TAKEN") fromServer.accountNo = result.message
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

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-xl">
        <DialogHeader><DialogTitle className="text-xl">{original ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2">
          {field("bank", "Bank Name *", problems.bankName, <Input id={`${uid}-bank`} className={inputClass} value={bankName} maxLength={80} onChange={(e) => setBankName(e.target.value)} />)}
          {field("title", "Account Title *", problems.accountTitle, <Input id={`${uid}-title`} className={inputClass} value={accountTitle} maxLength={120} onChange={(e) => setAccountTitle(e.target.value)} />)}
          {field("no", "Account No. *", problems.accountNo, <Input id={`${uid}-no`} className={inputClass} value={accountNo} maxLength={34} autoComplete="off" onChange={(e) => setAccountNo(e.target.value)} />)}
          {field("branch", "Branch", problems.branch, <Input id={`${uid}-branch`} className={inputClass} value={branch} maxLength={120} onChange={(e) => setBranch(e.target.value)} />)}
          <p className="text-xs text-slate-500 sm:col-span-2">Changing an account&apos;s details never changes past bank entries.</p>
        </div>
        {failure && (
          <div className="space-y-2">
            <CreateErrorNote failure={failure} />
            {failure.code === "BANK_ACCOUNT_NO_TAKEN" && <Button type="button" variant="outline" className="rounded-xl" onClick={() => onShowExisting(accountNo.trim())}>Show the existing account</Button>}
          </div>
        )}
        <DialogFooter className="mt-2 gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className={primaryBtnClass} onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save Account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
