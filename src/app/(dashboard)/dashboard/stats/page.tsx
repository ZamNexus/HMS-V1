"use client"
import * as React from "react"
import { format } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import {
  DEFAULT_PAGE_SIZE, bankTransactionsService, dashboardContractStatus, dashboardService, dataSource, encountersService, formatMoneyString, isPositiveMoney, statisticsService,
  type CashFlowData, type FinancialStatisticsSummaryData, type StatisticsCategory, type StatisticsRecordsData,
} from "@/lib/services"
import { useDoctors, usePatients } from "@/lib/useReferenceData"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { ReportBody, useReportData } from "@/components/reports/ReportState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Layers } from "lucide-react"

const TABS = [
  "Summary", "Services", "Checkups", "Lab Tests", "Medicine", "X-Rays",
  "ECG/Ultrasound", "Receipts", "Payments", "Expenses", "Bank", "Graphs", "OPD/IPD",
] as const
type Tab = (typeof TABS)[number]

// In API mode a screen is offered only when its endpoint is configured (from the OpenAPI spec). Until then every tab says so and
// requests nothing: no figure here is a placeholder any more. Mock mode is always connected to its demo data.
const contract = dashboardContractStatus(dataSource)

const loadSummary = (signal: AbortSignal) => statisticsService.summary({ signal })
const loadCashFlow = (signal: AbortSignal) => dashboardService.cashFlow({ signal })
const loadDailyRevenue = (signal: AbortSignal) => statisticsService.dailyCheckupRevenue({ signal })

export default function DashboardStatsPage() {
  const [tab, setTab] = React.useState<Tab>("Summary")

  return (
    <div>
      <PageHeader title="Financial Statistics" subtitle="Dashboard Summary — replaces the desktop OPD/IPD Summary window" />

      {contract.pending && (
        <div role="status" data-testid="stats-not-connected" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-500/30">
          <p className="font-bold">Financial Statistics are not connected to the backend</p>
          <p className="mt-1">
            The API contract for the statistics and the Cash Flow (routes, parameters and response schemas) has not been provided to the frontend. In API mode no request is
            sent and no demo figure is shown; each tab says what it is awaiting. (Task List: T11 extends <code>GET /reports/revenue</code>; the Cash Flow ships in PR #17,
            which is not merged.)
          </p>
        </div>
      )}

      {/* Replaced overflow-x-auto (slider) with flex-wrap so tabs stack cleanly on mobile */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
              tab === t
                ? "bg-white text-primary shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Summary" && <SummaryTab />}
      {tab === "Services" && <RecordsTab category="Services" />}
      {tab === "Checkups" && <RecordsTab category="Checkups" />}
      {tab === "Lab Tests" && <RecordsTab category="Lab Tests" />}
      {tab === "Medicine" && <RecordsTab category="Medicine" />}
      {tab === "X-Rays" && <RecordsTab category="X-Rays" />}
      {tab === "ECG/Ultrasound" && (
        <EmptyState
          icon={Layers}
          title="ECG / Ultrasound"
          subtitle="ECG and ultrasound are ordered and charged through imaging orders (T3), so this tab can be filled from them. How imaging orders are attributed to it is not defined yet (CONTRACT REQUIRED), so nothing is listed."
        />
      )}
      {tab === "Receipts" && <RecordsTab category="Receipts" />}
      {tab === "Payments" && <RecordsTab category="Payments" />}
      {tab === "Expenses" && <RecordsTab category="Expenses" />}
      {tab === "Bank" && <BankTab />}
      {tab === "Graphs" && <GraphsTab />}
      {tab === "OPD/IPD" && <OpdIpdTab />}
    </div>
  )
}

function SummaryTab() {
  const summary = useReportData(loadSummary)
  const cashFlow = useReportData(loadCashFlow)
  return (
    <div className="space-y-6">
      <ReportBody state={summary} label="Financial statistics summary" testId="stats-summary-pending">{(s) => <SummaryTable s={s} />}</ReportBody>
      <ReportBody state={cashFlow} label="Cash Flow" testId="stats-cashflow-pending">{(c) => <CashFlowCard c={c} />}</ReportBody>
    </div>
  )
}

function SummaryTable({ s }: { s: FinancialStatisticsSummaryData }) {
  return (
    <Card className="shadow-sm">
      {/* Added responsive hidden classes to dense columns to prevent horizontal scrolling */}
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-semibold">Transaction Type</TableHead>
              <TableHead className="text-right font-semibold">Total Value</TableHead>
              <TableHead className="hidden text-right font-semibold md:table-cell">Count</TableHead>
              <TableHead className="hidden text-right font-semibold sm:table-cell">Cash</TableHead>
              <TableHead className="hidden text-right font-semibold sm:table-cell">Credit</TableHead>
              <TableHead className="hidden text-right font-semibold lg:table-cell">OPD</TableHead>
              <TableHead className="hidden text-right font-semibold lg:table-cell">IPD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.categories.map((r) => (
              <TableRow key={r.label} className="transition-colors hover:bg-muted/20">
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right font-medium">{formatMoneyString(r.value)}</TableCell>
                <TableCell className="hidden text-right md:table-cell text-muted-foreground">{r.count}</TableCell>
                <TableCell className="hidden text-right text-success-600 sm:table-cell">{formatMoneyString(r.cash)}</TableCell>
                <TableCell className="hidden text-right text-warning-700 sm:table-cell">{formatMoneyString(r.credit)}</TableCell>
                <TableCell className="hidden text-right lg:table-cell">{formatMoneyString(r.opd)}</TableCell>
                <TableCell className="hidden text-right lg:table-cell">{formatMoneyString(r.ipd)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold shadow-inner">
              <TableCell>Total Sales</TableCell>
              <TableCell className="text-right">{formatMoneyString(s.totalSales.value)}</TableCell>
              <TableCell className="hidden text-right md:table-cell">{s.totalSales.count}</TableCell>
              <TableCell className="hidden text-right text-success-600 sm:table-cell">{formatMoneyString(s.totalSales.cash)}</TableCell>
              <TableCell className="hidden text-right text-warning-700 sm:table-cell">{formatMoneyString(s.totalSales.credit)}</TableCell>
              <TableCell className="hidden text-right lg:table-cell">{formatMoneyString(s.totalSales.opd)}</TableCell>
              <TableCell className="hidden text-right lg:table-cell">{formatMoneyString(s.totalSales.ipd)}</TableCell>
            </TableRow>
            {([["Payments", s.payments], ["Receipts", s.receipts], ["Expenses", s.expenses], ["Banks", s.banks]] as const).map(([label, row]) => (
              <TableRow key={label}>
                <TableCell className="text-muted-foreground">{label}</TableCell>
                <TableCell className="text-right font-medium">{formatMoneyString(row.value)}</TableCell>
                <TableCell className="hidden text-right md:table-cell text-muted-foreground">{row.count}</TableCell>
                <TableCell colSpan={4} className="hidden sm:table-cell" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// The Cash Flow lines are the demo screen's; the Task List documents only that cash expenses come out of one cash drawer per hospital
// (opening amount set once, worked out day by day) and that cash deposits / withdrawals link to the day close. The backend owns every
// value here — including the opening amount — so nothing is derived on this screen.
function CashFlowCard({ c }: { c: CashFlowData }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">Cash Flow</h3>
        <div className="mb-6 grid grid-cols-2 gap-4 text-center sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-gradient-to-br from-white to-muted/20 p-4 shadow-sm">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening</div>
            <div data-testid="cashflow-opening" className="text-2xl font-extrabold text-foreground">{formatMoneyString(c.opening)}</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-gradient-to-br from-white to-muted/20 p-4 shadow-sm">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Closing</div>
            <div data-testid="cashflow-closing" className="text-2xl font-extrabold text-foreground">{formatMoneyString(c.closing)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-white shadow-sm overflow-hidden">
            <div className="bg-success-50/50 border-b border-border/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-success-700">Cash-In</div>
            <div className="space-y-2.5 p-4 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Sale</span><span className="font-medium">{formatMoneyString(c.cashIn.cashSales)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Receipts</span><span className="font-medium">{formatMoneyString(c.cashIn.cashReceipts)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Drawn From Bank</span><span className="font-medium">{formatMoneyString(c.cashIn.drawnFromBank)}</span></div>
              <div className="flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total Cash In</span><span data-testid="cashflow-in" className="text-success-600">{formatMoneyString(c.cashIn.total)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-white shadow-sm overflow-hidden">
            <div className="bg-danger-50/50 border-b border-border/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger-700">Cash-Out</div>
            <div className="space-y-2.5 p-4 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Expenses</span><span className="font-medium">{formatMoneyString(c.cashOut.cashExpenses)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Payments</span><span className="font-medium">{formatMoneyString(c.cashOut.cashPayments)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Deposit In Bank</span><span className="font-medium">{formatMoneyString(c.cashOut.depositInBank)}</span></div>
              <div className="flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total Cash Out</span><span data-testid="cashflow-out" className="text-danger-600">{formatMoneyString(c.cashOut.total)}</span></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RecordsTab({ category }: { category: StatisticsCategory }) {
  const load = React.useCallback((signal: AbortSignal) => statisticsService.records(category, { signal }), [category])
  const state = useReportData(load)
  return <ReportBody state={state} label={`${category} statistics`} testId="stats-records-pending">{(r) => <CategoryTable r={r} />}</ReportBody>
}

function CategoryTable({ r }: { r: StatisticsRecordsData }) {
  const patients = usePatients(r.rows.flatMap((x) => (x.patientId === null ? [] : [x.patientId])))
  if (r.rows.length === 0) return <EmptyState icon={Layers} title="No records for this category" />
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="hidden sm:table-cell font-semibold">ID</TableHead>
              <TableHead className="hidden md:table-cell font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Patient / Description</TableHead>
              <TableHead className="text-right font-semibold">Amount</TableHead>
              <TableHead className="font-semibold text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.rows.map((row) => (
              <TableRow key={row.id} className="transition-colors hover:bg-muted/20">
                <TableCell className="hidden sm:table-cell font-mono text-[13px] text-muted-foreground">{row.id}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{format(new Date(row.date), "dd MMM yyyy")}</TableCell>
                <TableCell className="font-medium text-foreground">
                  {row.patientId === null ? row.description ?? "—" : patients.lookup.get(row.patientId)?.name ?? (patients.loading ? "…" : "—")}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">{formatMoneyString(row.amount)}</TableCell>
                <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// The bank statement is the Phase 4H statement service: its running balance is the backend's, never derived here.
function BankTab() {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback((signal: AbortSignal) => bankTransactionsService.statement({ page, pageSize: DEFAULT_PAGE_SIZE, signal }), [page])
  const state = useReportData(load)
  return (
    <ReportBody state={state} label="Bank statement" testId="stats-bank-pending">
      {(s) => (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="hidden sm:table-cell font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="text-right font-semibold">Debit</TableHead>
                  <TableHead className="text-right font-semibold">Credit</TableHead>
                  <TableHead className="hidden md:table-cell text-right font-semibold">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.items.map(({ transaction: t, balance }) => (
                  <TableRow key={t.id} className="transition-colors hover:bg-muted/20">
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell className="text-right text-danger-600 font-medium">{isPositiveMoney(t.debit) ? formatMoneyString(t.debit) : "—"}</TableCell>
                    <TableCell className="text-right text-success-600 font-medium">{isPositiveMoney(t.credit) ? formatMoneyString(t.credit) : "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-right font-bold">{formatMoneyString(balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {s.total > DEFAULT_PAGE_SIZE && <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={s.total} onPageChange={setPage} itemLabel="transactions" />}
          </CardContent>
        </Card>
      )}
    </ReportBody>
  )
}

function GraphsTab() {
  const state = useReportData(loadDailyRevenue)
  return (
    <ReportBody state={state} label="Daily checkup revenue" testId="stats-graph-pending" noun="chart">
      {(points) => {
        // Display only: the chart library needs numbers; every value comes from the service as a money string.
        const dailyRevenue = points.map((p) => ({ date: format(new Date(p.date), "dd MMM"), value: Number(p.amount) }))
        return (
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-base font-semibold text-foreground">Daily Checkup Revenue</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRevenue} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "#64748B" }} dy={10} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={60} tick={{ fill: "#64748B" }} />
                  <Tooltip
                    cursor={{ fill: "#F8FAFC" }}
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: "13px" }}
                    formatter={(v) => [formatCurrency(Number(v)), "Revenue"]}
                  />
                  <Bar dataKey="value" fill="#1CC0CE" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )
      }}
    </ReportBody>
  )
}

// The encounter list is the Phase 4D encounter service (its own contract, CONTRACT REQUIRED); in API mode it reports "not connected".
function OpdIpdTab() {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback((signal: AbortSignal) => encountersService.list({ page, pageSize: DEFAULT_PAGE_SIZE, signal }), [page])
  const state = useReportData(load)
  return <ReportBody state={state} label="OPD/IPD encounters" testId="stats-opdipd-pending">{(l) => <EncounterTable items={l.items} total={l.total} page={page} onPage={setPage} />}</ReportBody>
}

function EncounterTable({ items, total, page, onPage }: { items: Awaited<ReturnType<typeof encountersService.list>>["items"]; total: number; page: number; onPage: (p: number) => void }) {
  const patients = usePatients(items.map((e) => e.patientId))
  const doctors = useDoctors()
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Encounter ID</TableHead><TableHead>Patient</TableHead><TableHead>Type</TableHead>
            <TableHead>Doctor</TableHead><TableHead className="text-right">Net Total</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-secondary">{e.encId}</TableCell>
                <TableCell>{patients.lookup.get(e.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
                <TableCell><StatusBadge status={e.type} /></TableCell>
                <TableCell>{doctors.lookup.get(e.doctorId)?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(e.netTotal)}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {total > DEFAULT_PAGE_SIZE && <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} onPageChange={onPage} itemLabel="encounters" />}
      </CardContent>
    </Card>
  )
}
