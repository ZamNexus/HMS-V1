// Cells starting with these are run as formulas by Excel/Sheets (CSV injection).
// Plain numbers such as "-500" are left alone so numeric columns stay numeric.
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

function neutralise(v: string): string {
  return FORMULA_START.test(v) && !PLAIN_NUMBER.test(v) ? `'${v}` : v
}

function escapeCell(raw: string): string {
  const v = neutralise(raw)
  return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v
}

/** Pure CSV text builder (no DOM), so it can be unit-tested. */
export function toCSV(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n")
}

export function buildCSV(headers: string[], rows: string[][]): void {
  const csv = toCSV(headers, rows)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
