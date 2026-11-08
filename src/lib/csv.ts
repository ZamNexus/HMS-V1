// CSV exports are built in the browser from the JSON the API returned (MD section 8.11). Two rules:
//  - A cell that starts with = + - @ (or a tab / carriage return) would run as a formula in Excel; it is prefixed with an apostrophe.
//    A plain number such as -500 is left alone.
//  - Every page is fetched (the API allows at most 100 rows a page), up to a visible cap: an export never silently stops short.
//
// NOTE (2026-11-07): this file was overwritten by mistake while adding fetchAllPages and rebuilt from csv.test.ts and the compiled build output;
// toCSV and buildCSV behave as before (csv.test.ts passes unchanged).

const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

function cell(value: string): string {
  const safe = FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value
  return safe.includes(",") || safe.includes('"') || safe.includes("\n") ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCSV(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n")
}

/** Builds the CSV and downloads it as export-YYYY-MM-DD.csv. */
export function buildCSV(headers: string[], rows: string[][]): void {
  const blob = new Blob([toCSV(headers, rows)], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const CSV_MAX_PAGES = 50

export interface ExportResult<T> {
  rows: T[]
  /** False when the cap was reached before the last page: the file is incomplete and the screen must say so. */
  complete: boolean
  pagesFetched: number
}

/** Fetches page 1, 2, 3 … until `totalPages` is reached or `maxPages` pages were fetched. */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: readonly T[]; totalPages: number }>,
  maxPages: number = CSV_MAX_PAGES
): Promise<ExportResult<T>> {
  const rows: T[] = []
  let page = 1
  let totalPages = 1
  do {
    const res = await fetchPage(page)
    rows.push(...res.items)
    totalPages = res.totalPages
    page++
  } while (page <= totalPages && page <= maxPages)
  return { rows, complete: page > totalPages, pagesFetched: page - 1 }
}
