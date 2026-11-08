"use client"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import {
  Users, Banknote, FlaskConical, BedDouble, ArrowUpRight, AlertTriangle, Pill,
  Activity, ArrowRight, Stethoscope, ChevronRight, CalendarCheck, type LucideIcon
} from "lucide-react"

import { useAuth } from "@/lib/auth"
import { useAccess } from "@/lib/session/useAccess"
import { dashboardContractStatus, dashboardService, dataSource, formatMoneyString, type DashboardSummaryData } from "@/lib/services"
import { loadRecentPatients } from "@/lib/services/recentPatients"
import { useMedicines } from "@/lib/useReferenceData"
import { initials, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ReportBody, useReportData } from "@/components/reports/ReportState"
import { ApiDashboard } from "@/components/dashboard/ApiDashboard"
import { DashboardListsApi } from "@/components/dashboard/DashboardListsApi"
import { LowStockBanner } from "@/components/dashboard/LowStockBanner"

// Recharts must be loaded client-side only — it accesses browser globals on init
const RechartsBarChart = dynamic(() => import("./DashboardCharts").then(m => m.PatientFlowChart), { ssr: false, loading: () => <div className="h-[280px] animate-pulse bg-slate-50 rounded-xl" /> })
const RechartsAreaChart = dynamic(() => import("./DashboardCharts").then(m => m.RevenueChart), { ssr: false, loading: () => <div className="h-[280px] animate-pulse bg-slate-50 rounded-xl" /> })

// In API mode a widget is offered only when its endpoint is configured (from the OpenAPI spec). Until then the page says so and every
// widget shows a contract-pending state: no number, chart or row on this screen is a placeholder any more. Mock mode is always connected.
const contract = dashboardContractStatus(dataSource)

const loadSummary = (signal: AbortSignal) => dashboardService.summary({ signal })
const loadVisits = (signal: AbortSignal) => dashboardService.weeklyVisits({ signal })
const loadRevenue = (signal: AbortSignal) => dashboardService.revenueTrend({ signal })
const loadUpNext = (signal: AbortSignal) => dashboardService.upNext({ signal })
// API mode: the Recently Registered widget has its own five-row query (DashboardListsApi); this demo loader must not fetch a page of 100 patients on every dashboard load.
const loadPatients = (signal: AbortSignal) => (dataSource === "api" ? Promise.resolve({ items: [], total: 0 }) : loadRecentPatients(signal))

function greet() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

// ─── PREMIUM KPI TILE ────────────────────────────────────────────
function KpiTile({
  label, value, icon: Icon, iconColor, bgStyle, trend, pending, onClick,
}: {
  label: string; value: string; icon: LucideIcon; iconColor: string; bgStyle: string; trend?: string; pending?: boolean; onClick?: () => void
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 transition-all duration-300 group",
        onClick ? "cursor-pointer hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1CC0CE]" : ""
      )}
      onClick={onClick}
      {...(onClick && {
        role: "button",
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() }
        },
      })}
    >
      <div className={cn("absolute -right-6 -top-6 rounded-full p-10 transition-transform group-hover:scale-110", bgStyle)}>
        <Icon className={cn("h-10 w-10 opacity-20", iconColor)} strokeWidth={1.5} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-[14px]", bgStyle)}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
        </div>
        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">{label}</div>
        <div data-testid="kpi-value" className="text-3xl font-black text-[#0D1B2E] tracking-tight">{value}</div>
        {pending && <div className="mt-2 text-[11px] font-bold text-amber-700">Not connected — awaiting the backend contract</div>}
        {!pending && trend && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <ArrowUpRight className="h-2.5 w-2.5" />
            </span>
            <span>{trend}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** The demo's home screen (mock mode only): it computes from the prototype's arrays. API mode uses ApiDashboard. */
function MockDashboardPage() {
  const { user } = useAuth()
  const { can, canAny, modules } = useAccess()
  const router = useRouter()
  const summary = useReportData(loadSummary)
  const visits = useReportData(loadVisits)
  const revenue = useReportData(loadRevenue)
  const upNext = useReportData(loadUpNext)
  const patients = useReportData(loadPatients)
  // stock is asked for only when the user may read pharmacy data AND the pharmacy module is on (otherwise the call would be refused)
  const medicines = useMedicines(dataSource !== "api" && can("pharmacy.read") && modules?.pharmacy === true) // API mode has its own banner: the server says what is low (LowStockBanner)
  if (!user) return null

  // Stock alert: from the pharmacy service's medicine list (the same list the inventory screen uses). Nothing is shown while that list is
  // unavailable — the banner and the tiles say why; an absent alert is never a claim that stock is fine.
  const lowStock = medicines.error ? [] : medicines.items.filter((m) => m.stock < m.reorderLevel)
  const criticalStock = lowStock.filter((m) => m.stock === 0)
  const recentPatients = patients.data
    ? [...patients.data.items].sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime()).slice(0, 5)
    : []

  // Each part of the dashboard follows the user's permissions (never the role). The single GET /dashboard (chunk D1) will replace these with
  // "render the sections that come back".
  const showRevenue = can("reports.read")
  const canAddPatient = can("patients.write")

  // A tile's value comes from the summary service; while it is not connected it reads "—" (never 0), while loading "…".
  const tile = (pick: (s: DashboardSummaryData) => string) => (summary.data ? pick(summary.data) : summary.pending || summary.error ? "—" : "…")
  const note = (key: keyof NonNullable<DashboardSummaryData["notes"]>) => summary.data?.notes?.[key]
  const pending = summary.pending

  return (
    <div className="space-y-8 pb-10 max-w-[90rem] mx-auto animate-in fade-in duration-500">

      {contract.pending && (
        <div role="status" data-testid="dashboard-not-connected" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-500/30">
          <p className="font-bold">The Dashboard is not connected to the backend</p>
          <p className="mt-1">
            The API contract for the dashboard summary (the tiles and charts — routes, parameters and response schemas) has not been provided to the frontend. In API
            mode no tile or chart request is sent and no demo figure is shown: each tile reads “—” and each chart says what it is awaiting. Today&apos;s appointments and
            the newest patients below come from their own lists and are live.
          </p>
        </div>
      )}

      {/* ─── PREMIUM HERO BANNER ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[#0A1B33] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 h-full w-full opacity-10 pointer-events-none">
          <svg className="absolute h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>
        <div className="absolute -top-[50%] -right-[10%] h-[200%] w-[60%] rounded-full bg-gradient-to-bl from-[#1CC0CE]/20 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center bg-white/10 rounded-lg p-1.5 backdrop-blur-sm">
                <CalendarCheck className="h-4 w-4 text-[#1CC0CE]" />
              </span>
              <span className="font-bold tracking-widest text-[11px] uppercase text-[#1CC0CE]">{format(new Date(), "EEEE, MMMM do, yyyy")}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              {greet()}, <span className="text-[#1CC0CE]">{user.name.replace(/^Dr\.\s|^Nurse\s/, "").split(" ")[0]}</span>
            </h1>
            <p data-testid="hero-text" className="mt-2 text-slate-300 text-sm font-medium max-w-2xl">
              Here is what&apos;s happening at Citi Clinic today.
              {summary.data && (
                <> You have <strong className="text-white bg-white/10 px-2 py-0.5 rounded-md mx-1">{summary.data.todaysPatients}</strong> OPD patients and <strong className="text-white bg-white/10 px-2 py-0.5 rounded-md mx-1">{summary.data.pendingLabReports}</strong> pending lab reports.</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap shrink-0 gap-3 mt-2 lg:mt-0">
            {showRevenue && (
              <Button asChild variant="outline" className="rounded-xl h-11 px-5 font-bold bg-white/5 border-white/10 text-white hover:bg-white/10 backdrop-blur-sm"><Link href={"/dashboard/stats"}>
                <Activity className="h-4 w-4 mr-2" /> Financial Stats
              </Link></Button>
            )}
            {canAddPatient && (
              <Button asChild className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-black shadow-lg shadow-[#0F2A4D]/30 ring-1 ring-white/10"><Link href={"/patients/new"}>
                Register Patient <ArrowRight className="h-4 w-4 ml-2 text-white/70" />
              </Link></Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── ALERTS ────────────────────────────────────────────────────── */}
      {dataSource === "api" && <LowStockBanner />}
      {dataSource !== "api" && lowStock.length > 0 && can("pharmacy.read") && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[1.5rem] bg-rose-50 p-5 ring-1 ring-rose-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-black text-rose-900 text-base">Critical Inventory Alert</h2>
              <p className="text-sm font-semibold text-rose-600 mt-0.5">
                {lowStock.slice(0, 3).map((m) => `${m.name} (${m.stock})`).join(" • ")}
                {criticalStock.length > 0 && ` • ${criticalStock.length} items completely out of stock`}
              </p>
            </div>
          </div>
          <Button asChild className="rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 shadow-sm h-11 px-6"><Link href={"/pharmacy/inventory"}>
            Restock Inventory
          </Link></Button>
        </div>
      )}

      {/* ─── KPI ROW ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {can("pharmacy.dispense") && (
          <>
            <KpiTile label="Dispensed Today" value={tile((s) => String(s.dispensedToday))} pending={pending} icon={Pill} bgStyle="bg-emerald-50" iconColor="text-emerald-600" trend={note("dispensedToday")} />
            <KpiTile label="Low Stock Items" value={tile((s) => String(s.lowStockItems))} pending={pending} icon={AlertTriangle} bgStyle="bg-rose-50" iconColor="text-rose-600" onClick={() => router.push("/pharmacy/inventory")} />
          </>
        )}
        {can("diagnostics.enter_results") && (
          <>
            <KpiTile label="Pending Orders" value={tile((s) => String(s.pendingOrders))} pending={pending} icon={FlaskConical} bgStyle="bg-amber-50" iconColor="text-amber-600" />
            <KpiTile label="Completed Today" value={tile((s) => String(s.completedToday))} pending={pending} icon={Users} bgStyle="bg-emerald-50" iconColor="text-emerald-600" />
          </>
        )}
        {canAny("encounters.read", "encounters.check_in") && (
          <>
            <KpiTile
              label="Today's Patients"
              value={tile((s) => String(s.todaysPatients))}
              pending={pending}
              icon={Users}
              bgStyle="bg-[#1CC0CE]/10"
              iconColor="text-[#0891B2]"
              trend={note("todaysPatients")}
            />
            {can("encounters.write") && (
              <KpiTile label="My Patients" value={tile((s) => String(s.myPatients))} pending={pending} icon={Stethoscope} bgStyle="bg-[#1CC0CE]/10" iconColor="text-[#0891B2]" />
            )}
            {showRevenue && (
              <KpiTile label="Revenue Today" value={tile((s) => formatMoneyString(s.revenueToday))} pending={pending} icon={Banknote} bgStyle="bg-emerald-50" iconColor="text-emerald-600" trend={note("revenueToday")} />
            )}
            <KpiTile label="Pending Lab Reports" value={tile((s) => String(s.pendingLabReports))} pending={pending} icon={FlaskConical} bgStyle="bg-amber-50" iconColor="text-amber-600" />
            <KpiTile label="Admitted (IPD)" value={tile((s) => String(s.admittedIpd))} pending={pending} icon={BedDouble} bgStyle="bg-indigo-50" iconColor="text-indigo-600" trend={note("admittedIpd")} />
          </>
        )}
      </div>

      {/* ─── CHARTS ROW ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Patient Flow This Week</h2>
            {visits.data && <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">Total {visits.data.total} visits over the last 7 days</p>}
          </div>
          <ReportBody state={visits} label="Weekly patient visits" testId="dashboard-visits-pending" noun="chart">{(v) => <RechartsBarChart points={v.points} />}</ReportBody>
        </div>

        {showRevenue ? (
          <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Revenue Trajectory</h2>
              <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">Cash flow across all departments</p>
            </div>
            <ReportBody state={revenue} label="Revenue trend" testId="dashboard-revenue-pending" noun="chart">{(r) => <RechartsAreaChart points={r} />}</ReportBody>
          </div>
        ) : null}
      </div>

      {/* ─── BOTTOM ROW ────────────────────────────────────────────────── */}
      {dataSource === "api" && <DashboardListsApi />}
      {dataSource !== "api" && canAny("appointments.read", "patients.read") && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          {/* APPOINTMENTS TABLE */}
          <div className="lg:col-span-2 rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Up Next</h2>
                <p className="text-sm font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Today&apos;s scheduled appointments</p>
              </div>
              <Button variant="ghost" className="text-[#0891B2] font-black hover:bg-[#1CC0CE]/10 rounded-xl px-4 hidden sm:flex">
                View Full Schedule <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <ReportBody state={upNext} label="Today's schedule" testId="dashboard-upnext-pending" noun="schedule">
              {(rows) => (
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Time</th>
                        <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Patient</th>
                        <th className="hidden py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 sm:table-cell">Doctor</th>
                        <th className="hidden py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 md:table-cell">Type</th>
                        <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {rows.map((a) => (
                        <tr
                          key={a.time + a.patientName}
                          className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0 group"
                          onClick={() => a.patientId && router.push(`/patients/${a.patientId}`)}
                        >
                          <td className="py-4 px-6 font-mono font-bold text-[#0D1B2E]">{a.time}</td>
                          <td className="py-4 px-6">
                            {a.patientId ? (
                              <Link
                                href={`/patients/${a.patientId}`}
                                onClick={(ev) => ev.stopPropagation()}
                                className="block font-bold text-[#0D1B2E] group-hover:text-[#0891B2] transition-colors focus-visible:outline-none focus-visible:text-[#0891B2] focus-visible:underline"
                              >
                                {a.patientName}
                              </Link>
                            ) : (
                              <div className="font-bold text-[#0D1B2E]">{a.patientName}</div>
                            )}
                            <div className="font-mono text-[11px] font-semibold text-slate-400 sm:hidden mt-0.5">{a.mrNo}</div>
                          </td>
                          <td className="hidden py-4 px-6 font-bold text-slate-600 sm:table-cell">{a.doctorName}</td>
                          <td className="hidden py-4 px-6 md:table-cell">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500 tracking-wide uppercase">
                              {a.type}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <StatusBadge status={a.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportBody>
          </div>

          {/* RECENT PATIENTS */}
          <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 flex flex-col overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100">
              <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Recently Registered</h2>
            </div>
            <div className="p-4 space-y-2 flex-1 bg-slate-50/50">
              <ReportBody state={patients} label="Recently registered patients" testId="dashboard-recent-pending" noun="list">
                {() => (
                  <>
                    {recentPatients.map((p) => (
                      <Link
                        key={p.id}
                        href={`/patients/${p.id}`}
                        className="flex items-center gap-4 rounded-2xl p-3 bg-white ring-1 ring-slate-100 transition-all duration-300 hover:shadow-md hover:ring-black/5 group"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-slate-100 text-[#0D1B2E] shadow-inner font-black text-sm group-hover:bg-[#0F2A4D] group-hover:text-white transition-colors">
                          {initials(p.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-black text-[#0D1B2E] group-hover:text-[#0891B2] transition-colors">{p.name}</div>
                          <div className="font-mono text-[11px] font-bold text-slate-400 mt-0.5">{p.mrNo}</div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] font-bold text-slate-400">
                          <div>{formatDistanceToNow(new Date(p.registrationDate), { addSuffix: true })}</div>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
              </ReportBody>
            </div>
            <div className="p-4 bg-white border-t border-slate-100">
              <Button variant="ghost" className="w-full rounded-xl font-black text-[#0F2A4D] hover:bg-slate-50 h-11" asChild>
                <Link href="/patients">View All Patients</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/** API mode: one GET /dashboard draws the tiles and charts (D1). The demo keeps its own screen. */
export default function DashboardPage() {
  return dataSource === "api" ? <ApiDashboard /> : <MockDashboardPage />
}
