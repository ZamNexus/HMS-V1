"use client"
import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Banknote, BedDouble, FlaskConical, LayoutDashboard, Pill, ScanLine, Stethoscope, Users } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { SeriesBars } from "@/components/reportsApi/SeriesBars"
import { ServerDocument } from "@/components/reportsApi/ServerDocument"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { reportsApiService, type DashboardApiData } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospitalToday } from "@/lib/usePatientToday"
import { DashboardListsApi } from "./DashboardListsApi"
import { LowStockBanner } from "./LowStockBanner"

const num = (n: number | null): string => (n === null ? "—" : n.toLocaleString("en-PK"))

function Tile({ label, value, sub, icon: Icon, testId, href }: { label: string; value: string; sub?: string; icon: React.ElementType; testId: string; href?: string }) {
  const body = (
    <div className="relative h-full overflow-hidden rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
      <Icon className="absolute -right-2 -top-2 h-16 w-16 text-slate-100" strokeWidth={1.5} aria-hidden />
      <p className="relative text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="relative mt-1 text-3xl font-black tracking-tight tabular-nums text-[#0D1B2E]" data-testid={`${testId}-value`}>{value}</p>
      {sub && <p className="relative mt-2 text-xs font-semibold text-slate-500" data-testid={`${testId}-sub`}>{sub}</p>}
    </div>
  )
  return <div data-testid={testId}>{href ? <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1CC0CE]">{body}</Link> : body}</div>
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

/** The tiles and charts of GET /dashboard (D1): only the sections the server sent (a section is null for a user who may not see it). */
function Sections({ d }: { d: DashboardApiData }) {
  const { visits, admitted, lab, imaging, pharmacy, revenue, patientFlow } = d
  const none = !visits && !admitted && !lab && !imaging && !pharmacy && !revenue && !patientFlow
  if (none) return <EmptyState icon={LayoutDashboard} title="No figures are shown to your role" subtitle="The lists below show what you can open." />
  return (
    <div className="space-y-6" data-testid="dashboard-sections">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {visits && <Tile testId="tile-visits" icon={Users} label="Today's visits" value={num(visits.today)} sub={visits.yesterday !== null ? `${num(visits.yesterday)} yesterday` : undefined} />}
        {visits && visits.mine !== null && <Tile testId="tile-mine" icon={Stethoscope} label="My patients" value={num(visits.mine)} />}
        {admitted && <Tile testId="tile-admitted" icon={BedDouble} label="Admitted (IPD)" value={num(admitted.total)} sub={`Male ${num(admitted.male)} · Female ${num(admitted.female)} · Other ${num(admitted.other)}`} href="/encounters?type=ipd" />}
        {lab && <Tile testId="tile-lab-pending" icon={FlaskConical} label="Pending lab orders" value={num(lab.pending)} sub={`${num(lab.doneToday)} done today`} href="/lab/orders" />}
        {imaging && <Tile testId="tile-imaging-pending" icon={ScanLine} label="Pending imaging" value={num(imaging.pending)} sub={`${num(imaging.doneToday)} done today`} href="/imaging/orders" />}
        {pharmacy && <Tile testId="tile-dispensed" icon={Pill} label="Dispensed today" value={num(pharmacy.dispensedToday)} sub={pharmacy.dispensedYesterday !== null ? `${num(pharmacy.dispensedYesterday)} yesterday` : undefined} href="/pharmacy/history" />}
        {pharmacy && <Tile testId="tile-low-stock" icon={Pill} label="Low stock items" value={num(pharmacy.lowStock)} href="/pharmacy/inventory" />}
        {revenue && <Tile testId="tile-revenue" icon={Banknote} label="Revenue today" value={revenue.today === null ? "—" : showMoney(revenue.today)} sub={revenue.yesterday !== null ? `${showMoney(revenue.yesterday)} yesterday` : undefined} />}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {revenue?.last7Days && revenue.last7Days.length > 0 && (
          <section aria-label="Revenue, last 7 days" className="space-y-2"><h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Revenue, last 7 days</h2>
            <SeriesBars points={revenue.last7Days} name="Revenue, last 7 days" format={(v) => (/^-?\d+\.\d{2}$/.test(v) ? showMoney(v) : v)} testId="chart-revenue" /></section>
        )}
        {patientFlow?.last7Days && patientFlow.last7Days.length > 0 && (
          <section aria-label="Patient flow, last 7 days" className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Patient flow, last 7 days{patientFlow.total !== null ? ` · ${num(patientFlow.total)} in all` : ""}</h2>
            <SeriesBars points={patientFlow.last7Days} name="Patient flow, last 7 days" testId="chart-flow" /></section>
        )}
      </div>
    </div>
  )
}

/** The hospital's cash for today (accounts.read; handoff 8.10, GET /reports/cash-flow?date=<today>), shown as the server sent it. */
function CashFlowCard() {
  const { can } = useAccess()
  const today = useHospitalToday()
  const allowed = can("accounts.read")
  const key = useScopedKey("reports", "cash-flow-today", today)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.cashFlow({ date: today as string }, signal), ...CACHE_CLASSES.dashboard, enabled: allowed && today !== null })
  if (!allowed) return null
  return (
    <section aria-label="Cash flow today" className="space-y-3 rounded-[1.5rem] bg-white p-6 ring-1 ring-black/5" data-testid="cash-flow-card">
      <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Cash flow today</h2>
      {q.isPending ? <Skeleton className="h-20 w-full rounded-xl" role="status" aria-label="Loading the cash flow" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <ServerDocument data={q.data} title="Cash flow" exportName="cash-flow" />}
    </section>
  )
}

/**
 * The home screen in API mode (D1; handoff 8.11). ONE call, GET /dashboard, polled every 60 seconds, draws every tile and chart; a section the server leaves null (the user may not see it)
 * is not drawn. Today's appointments and the newest patients come from their own lists, the stock alert from the medicine list, and the cash flow from the accounts report.
 */
export function ApiDashboard() {
  const { user } = useAuth()
  const key = useScopedKey("dashboard", "all")
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.dashboard(signal), ...CACHE_CLASSES.dashboard })
  return (
    <div className="mx-auto max-w-[90rem] space-y-8 pb-10" data-testid="dashboard-api">
      <div className="rounded-[1.5rem] bg-[#0F2A4D] p-8 text-white">
        <h1 className="text-3xl font-black tracking-tight">{greeting()}{user?.name ? `, ${user.name}` : ""}</h1>
        <p className="mt-1 text-sm font-medium text-slate-300">Here is the clinic today.</p>
      </div>
      {q.isPending ? <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading the dashboard">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 w-full rounded-[1.5rem]" />)}</div>
        : q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : <Sections d={q.data as DashboardApiData} />}
      <LowStockBanner />
      <CashFlowCard />
      <DashboardListsApi />
    </div>
  )
}
