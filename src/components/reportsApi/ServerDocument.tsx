"use client"
import * as React from "react"
import { Download, FileText } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHospital } from "@/lib/session/useHospital"
import { cellText, columnsOf, documentCsv, isRecord, kindOf, prettyKey, splitObject, tablesOf, type DocRecord } from "./docUi"

const MAX_ROWS = 200

/** Saves text as a file in the browser. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** A table of records exactly as the server sent them (see docUi.ts): the columns are the keys that arrived, the cells the values, the first rows capped. */
export function RecordsTable({ rows, priority = [], testId, renderAction }: { rows: readonly DocRecord[]; priority?: readonly string[]; testId?: string; renderAction?: (row: DocRecord, index: number) => React.ReactNode }) {
  const { settings } = useHospital()
  const tz = settings?.timezone
  const cols = React.useMemo(() => columnsOf(rows, priority), [rows, priority])
  const shown = rows.slice(0, MAX_ROWS)
  return (
    <div data-testid={testId}>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
        <Table>
          <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60">{cols.map((c, i) => <TableHead key={c} className={i === 0 ? "px-4" : undefined}>{prettyKey(c)}</TableHead>)}{renderAction && <TableHead className="pr-4 text-right"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {shown.map((r, ri) => (
              <TableRow key={ri} data-testid={testId ? `${testId}-row-${ri}` : undefined}>
                {cols.map((c, i) => <TableCell key={c} className={i === 0 ? "px-4 font-semibold" : "tabular-nums"}>{cellText(c, r[c], tz, showMoney)}</TableCell>)}
                {renderAction && <TableCell className="pr-4 text-right">{renderAction(r, ri)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > MAX_ROWS && <p className="mt-2 text-xs text-slate-500">Showing the first {MAX_ROWS} of {rows.length} rows. The CSV export has them all.</p>}
    </div>
  )
}

function Part({ name, value, depth, priority }: { name: string; value: unknown; depth: number; priority: readonly string[] }) {
  const { settings } = useHospital()
  const tz = settings?.timezone
  const kind = kindOf(value)
  if (kind === "records") return <section aria-label={prettyKey(name)} className="space-y-2"><h2 className="text-sm font-black uppercase tracking-wider text-slate-500">{prettyKey(name)}</h2><RecordsTable rows={value as DocRecord[]} priority={priority} testId={`doc-table-${name}`} /></section>
  if (kind === "object" && isRecord(value) && depth < 6) {
    const { tiles, parts } = splitObject(value)
    return (
      <section aria-label={prettyKey(name)} className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">{prettyKey(name)}</h2>
        {tiles.length > 0 && <Tiles tiles={tiles} tz={tz} />}
        {parts.map(([k, v]) => <Part key={k} name={k} value={v} depth={depth + 1} priority={priority} />)}
      </section>
    )
  }
  return <Tiles tiles={[[name, value]]} tz={tz} />
}

function Tiles({ tiles, tz }: { tiles: [string, unknown][]; tz?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-black/5" data-testid={`doc-tile-${k}`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{prettyKey(k)}</p>
          <p className="mt-1 break-words text-xl font-black tabular-nums tracking-tight text-[#0D1B2E]">{cellText(k, v, tz, showMoney)}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Shows a server answer the way it arrived: plain values as tiles, a list of records as a table, a nested object as a titled section, and the same content as a CSV file
 * (handoff 8.11). Used where the handoff names a report but not its fields. A document with nothing in it says so instead of drawing an empty page.
 */
export function ServerDocument({ data, title = "Report", exportName, priority = [] }: { data: unknown; title?: string; exportName?: string; priority?: readonly string[] }) {
  const { settings } = useHospital()
  const tz = settings?.timezone
  const tables = React.useMemo(() => tablesOf(data, title, tz, showMoney), [data, title, tz])
  const empty = data === null || data === undefined || (Array.isArray(data) && data.length === 0) || (isRecord(data) && Object.keys(data).length === 0)
  if (empty) return <EmptyState icon={FileText} title="Nothing to show for this period" />
  const exportCsv = () => downloadText(`${exportName ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`, documentCsv(tables))
  return (
    <div className="space-y-5" data-testid="server-document">
      {tables.length > 0 && (
        <div className="no-print flex justify-end">
          <Button variant="outline" className="rounded-xl font-bold" onClick={exportCsv} data-testid="export-csv"><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      )}
      {kindOf(data) === "records" ? <RecordsTable rows={data as DocRecord[]} priority={priority} testId="doc-table-root" />
        : isRecord(data) ? (() => { const { tiles, parts } = splitObject(data); return (<>{tiles.length > 0 && <Tiles tiles={tiles} tz={tz} />}{parts.map(([k, v]) => <Part key={k} name={k} value={v} depth={0} priority={priority} />)}</>) })()
        : <Tiles tiles={[["value", data]]} tz={tz} />}
    </div>
  )
}
