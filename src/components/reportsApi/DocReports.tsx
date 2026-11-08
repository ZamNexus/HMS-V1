"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { BarChart3, ClipboardList, Search } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { isUlid } from "@/lib/api/convert"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { RP_SOURCE_TYPES, reportsApiService, type RpPeriod, type RpSourceType } from "@/lib/services"
import { seriesOf } from "@/lib/services/http/series"
import { useAccess } from "@/lib/session/useAccess"
import { useDoctors } from "@/lib/useReferenceData"
import { SOURCE_LABEL } from "@/components/billing/billingUi"
import { SeriesBars } from "./SeriesBars"
import { RecordsTable, ServerDocument } from "./ServerDocument"

export type DocReportKind = "daily" | "opd" | "demographics" | "lab" | "pharmacy" | "expense" | "cash-flow" | "financial-summary"

const TITLE: Record<DocReportKind, string> = {
  daily: "Daily Summary", opd: "OPD Statistics", demographics: "Patient Demographics", lab: "Laboratory", pharmacy: "Pharmacy", expense: "Expenses", "cash-flow": "Cash Flow", "financial-summary": "Financial Summary",
}
/** The permission each report needs (handoff 8.11): the accounts reports need accounts.read, the rest reports.read. */
export const DOC_REPORT_PERMISSION: Record<DocReportKind, string> = {
  daily: "reports.read", opd: "reports.read", demographics: "reports.read", lab: "reports.read", pharmacy: "reports.read", "financial-summary": "reports.read", expense: "accounts.read", "cash-flow": "accounts.read",
}
const EXPIRY_CHOICES = [30, 60, 90] as const

function load(kind: DocReportKind, p: RpPeriod, days: number | undefined, signal: AbortSignal): Promise<unknown> {
  switch (kind) {
    case "daily": return reportsApiService.dailySummary(p, signal)
    case "opd": return reportsApiService.opd(p, signal)
    case "demographics": return reportsApiService.demographics(p, signal)
    case "lab": return reportsApiService.lab(p, signal)
    case "pharmacy": return reportsApiService.pharmacy(p, { expiringWithinDays: days }, signal)
    case "expense": return reportsApiService.expensesReport(p, signal)
    case "cash-flow": return reportsApiService.cashFlow({ dateFrom: p.dateFrom, dateTo: p.dateTo }, signal)
    case "financial-summary": return reportsApiService.financialSummary(p, signal)
  }
}

/**
 * A report whose answer the handoff describes in words but not field by field (Daily Summary, OPD, Demographics, Laboratory, Pharmacy, the Expenses report, Cash Flow and the Financial
 * Summary): the period goes to the server, and the answer is shown as it arrived with a CSV export of the same tables. Nothing is added up or renamed here.
 */
export function DocReport({ kind, period }: { kind: DocReportKind; period: RpPeriod | null }) {
  const { can } = useAccess()
  const allowed = can(DOC_REPORT_PERMISSION[kind])
  const [days, setDays] = React.useState<number | undefined>(undefined)
  const key = useScopedKey("reports", kind, period?.dateFrom ?? null, period?.dateTo ?? null, days ?? null)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => load(kind, period as RpPeriod, kind === "pharmacy" ? days : undefined, signal), ...CACHE_CLASSES.register, enabled: allowed && period !== null })
  if (!allowed) return <EmptyState icon={BarChart3} title={`${TITLE[kind]} is not shown to your role`} subtitle="Ask an administrator if you need it." />
  if (period === null) return <EmptyState icon={BarChart3} title="Choose a valid period" subtitle="The report reads the period chosen above." />
  return (
    <div className="space-y-4" data-testid={`doc-report-${kind}`}>
      {kind === "pharmacy" && (
        <div className="no-print flex items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="expiring-days">Expiring within</label>
          <Select value={days === undefined ? "default" : String(days)} onValueChange={(v) => setDays(v === "default" ? undefined : Number(v))}>
            <SelectTrigger id="expiring-days" aria-label="Expiring within" className="h-10 w-48 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="default">The server&apos;s default</SelectItem>{EXPIRY_CHOICES.map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {q.isPending ? <div className="space-y-3" role="status" aria-label={`Loading the ${TITLE[kind]} report`}><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
        : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : <ServerDocument data={q.data} title={TITLE[kind]} exportName={`${kind}-${period.dateFrom}-${period.dateTo}`} />}
    </div>
  )
}

/** Financial Statistics > Graphs (D5; handoff 8.11): GET /reports/revenue/daily for the period, for all charges or for one kind (\`sourceType\`); drawn as bars when the answer is a daily series, else shown as sent. */
export function RevenueGraph({ period }: { period: RpPeriod | null }) {
  const { can } = useAccess()
  const [source, setSource] = React.useState<RpSourceType | undefined>(undefined)
  const allowed = can("reports.read")
  const key = useScopedKey("reports", "revenue-daily", period?.dateFrom ?? null, period?.dateTo ?? null, source ?? null)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.revenueDaily(period as RpPeriod, { sourceType: source }, signal), ...CACHE_CLASSES.register, enabled: allowed && period !== null })
  if (!allowed) return <EmptyState icon={BarChart3} title="Graphs are not shown to your role" />
  if (period === null) return <EmptyState icon={BarChart3} title="Choose a valid period" subtitle="The graph reads the period chosen above." />
  const series = q.data !== undefined ? seriesOf(q.data) : null
  return (
    <div className="space-y-4" data-testid="revenue-graph">
      <div className="no-print flex items-center gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="graph-source">Kind of charge</label>
        <Select value={source ?? "all"} onValueChange={(v) => setSource(v === "all" ? undefined : (v as RpSourceType))}>
          <SelectTrigger id="graph-source" aria-label="Kind of charge" className="h-10 w-52 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All kinds</SelectItem>{RP_SOURCE_TYPES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {q.isPending ? <Skeleton className="h-48 w-full rounded-2xl" role="status" aria-label="Loading the graph" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : (
          <>
            {series && series.length > 1 && <SeriesBars points={series} name="Revenue by day" format={(v) => (/^-?\d+\.\d{2}$/.test(v) ? showMoney(v) : v)} testId="revenue-series" />}
            <ServerDocument data={q.data} title="Daily revenue" exportName={`revenue-daily-${period.dateFrom}-${period.dateTo}`} />
          </>
        )}
    </div>
  )
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const RX_KEYS = ["page", "from", "to", "doctor", "patient", "medicine"] as const
const RX_PRIORITY = ["date", "prescribedAt", "patient", "doctor", "medicine", "medicineText", "dose", "frequency", "duration", "quantity", "instructions"] as const

/** Reports > Prescription History (D4; handoff 8.11): GET /prescriptions (encounters.read), server-paged, with dates, doctor, patient and medicine filters and a search; rows are shown as sent. */
export function PrescriptionHistory() {
  const { can } = useAccess()
  const allowed = can("encounters.read")
  const doctors = useDoctors(allowed)
  const url = useUrlFilters(RX_KEYS)
  const search = useDebouncedSearch()
  const page = pageFromUrl(url.get("page"))
  const fromRaw = url.get("from"), toRaw = url.get("to")
  const both = DATE_RE.test(fromRaw ?? "") && DATE_RE.test(toRaw ?? "") && (fromRaw as string) <= (toRaw as string)
  const doctor = doctors.items.find((d) => d.id === url.get("doctor"))?.id
  const patient = isUlid(url.get("patient") ?? "") ? (url.get("patient") as string) : undefined
  const medicine = isUlid(url.get("medicine") ?? "") ? (url.get("medicine") as string) : undefined
  const options = { page, pageSize: 10, search: search.term, doctorId: doctor, patientId: patient, medicineId: medicine, ...(both ? { dateFrom: fromRaw as string, dateTo: toRaw as string } : {}) }
  const key = useScopedKey("reports", "prescriptions", { ...options, search: search.term ?? null })
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.prescriptions(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData, enabled: allowed })
  const setFilter = (patch: Partial<Record<(typeof RX_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  if (!allowed) return <EmptyState icon={ClipboardList} title="Prescription history is not shown to your role" subtitle="It is visible to users who can read encounters." />
  const filtered = !!search.term || both || !!doctor || !!patient || !!medicine
  return (
    <div className="space-y-4" data-testid="prescription-history">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search prescriptions" placeholder="Search patient, doctor or medicine…" value={search.input} maxLength={100} autoComplete="off" className="h-10 rounded-xl pl-10" onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }} />
        </div>
        <Select value={doctor ?? "any"} onValueChange={(v) => setFilter({ doctor: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Doctor" className="h-10 w-52 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any doctor</SelectItem>{doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From<Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={fromRaw ?? ""} max={toRaw ?? undefined} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To<Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={toRaw ?? ""} min={fromRaw ?? undefined} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label>
        {(fromRaw || toRaw) && !both && <p role="alert" className="pb-2 text-sm font-semibold text-rose-700" data-testid="rx-dates-problem">Choose both dates, the start not after the end.</p>}
        {patient && <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setFilter({ patient: undefined })}>One patient only: clear</Button>}
        {medicine && <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setFilter({ medicine: undefined })}>One medicine only: clear</Button>}
        {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ from: undefined, to: undefined, doctor: undefined, patient: undefined, medicine: undefined, page: undefined }) }}>Clear filters</Button>}
      </div>
      {q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : q.isPending ? <div className="space-y-3" role="status" aria-label="Loading prescription history">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        : q.data.items.length === 0 ? <EmptyState icon={ClipboardList} title={filtered ? "No prescription matches" : "No prescriptions yet"} subtitle={filtered ? "Try different filters." : undefined} />
        : <RecordsTable rows={q.data.items} priority={RX_PRIORITY} testId="rx-rows" />}
      {q.data && (q.data.items.length > 0 || page > 1) && <Pagination page={page} pageSize={10} total={q.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="prescription lines" />}
    </div>
  )
}
