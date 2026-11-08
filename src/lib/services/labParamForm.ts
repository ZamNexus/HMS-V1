// Lab test parameter editor (chunk S6): the text-box shape of one parameter, conversion to/from the API's definition, and the checks run before
// anything is sent. Pure functions. The server stays the authority (it also rejects clashing parameters, upside-down bands and critical limits
// inside a normal band); these only catch what is obviously wrong and say which row.
import type { LabBand, LabParameterSpec } from "./types"

export type RangeMode = "none" | "any" | "sex"

/** Every box as typed ("" = empty). */
export interface ParamRow {
  key: string
  name: string
  unit: string
  decimals: string
  mode: RangeMode
  anyLow: string
  anyHigh: string
  maleLow: string
  maleHigh: string
  femaleLow: string
  femaleHigh: string
  critLow: string
  critHigh: string
}

export const emptyRow = (): ParamRow => ({
  key: "", name: "", unit: "", decimals: "", mode: "any", anyLow: "", anyHigh: "", maleLow: "", maleHigh: "", femaleLow: "", femaleHigh: "", critLow: "", critHigh: "",
})

const text = (n: number | undefined) => (n === undefined ? "" : String(n))

export function rowFromSpec(s: LabParameterSpec): ParamRow {
  const sex = !!(s.ranges?.male || s.ranges?.female)
  return {
    key: s.key, name: s.name, unit: s.unit ?? "", decimals: text(s.decimals),
    mode: sex ? "sex" : s.ranges?.any ? "any" : "none",
    anyLow: text(s.ranges?.any?.low), anyHigh: text(s.ranges?.any?.high),
    maleLow: text(s.ranges?.male?.low), maleHigh: text(s.ranges?.male?.high),
    femaleLow: text(s.ranges?.female?.low), femaleHigh: text(s.ranges?.female?.high),
    critLow: text(s.critical?.low), critHigh: text(s.critical?.high),
  }
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/
const parse = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v.trim()))
const band = (low: string, high: string): LabBand | undefined => {
  const b: LabBand = {}
  const l = parse(low), h = parse(high)
  if (l !== undefined) b.low = l
  if (h !== undefined) b.high = h
  return l === undefined && h === undefined ? undefined : b
}

/** The definition to send. Call only on rows that passed `validateRows`. */
export function specFromRow(r: ParamRow): LabParameterSpec {
  const spec: LabParameterSpec = { key: r.key.trim(), name: r.name.trim() }
  if (r.unit.trim()) spec.unit = r.unit.trim()
  if (r.decimals.trim() !== "") spec.decimals = Number(r.decimals.trim())
  if (r.mode === "any") {
    const any = band(r.anyLow, r.anyHigh)
    if (any) spec.ranges = { any }
  } else if (r.mode === "sex") {
    const male = band(r.maleLow, r.maleHigh), female = band(r.femaleLow, r.femaleHigh)
    if (male || female) spec.ranges = { ...(male && { male }), ...(female && { female }) }
  }
  const critical = band(r.critLow, r.critHigh)
  if (critical) spec.critical = critical
  return spec
}

/** { rowIndex: message } for rows that cannot be sent. Empty = fine. */
export function validateRows(rows: readonly ParamRow[]): Record<number, string> {
  const found: Record<number, string> = {}
  if (rows.length > 60) found[60] = "A lab test can have at most 60 parameters"
  const seen = new Map<string, number>()
  rows.forEach((r, i) => {
    const key = r.key.trim().toLowerCase()
    if (!r.key.trim() || !r.name.trim()) { found[i] = "Key and name are required"; return }
    if (seen.has(key)) { found[i] = `The key "${r.key.trim()}" is already used in row ${seen.get(key)! + 1}`; return }
    seen.set(key, i)
    const nums: [string, string][] = [["decimals", r.decimals], ["normal low", r.anyLow], ["normal high", r.anyHigh], ["male low", r.maleLow], ["male high", r.maleHigh], ["female low", r.femaleLow], ["female high", r.femaleHigh], ["critical low", r.critLow], ["critical high", r.critHigh]]
    for (const [label, v] of nums) {
      if (v.trim() !== "" && !NUMBER_RE.test(v.trim())) { found[i] = `${label}: enter a number`; return }
    }
    if (r.decimals.trim() !== "" && (!Number.isInteger(Number(r.decimals)) || Number(r.decimals) < 0 || Number(r.decimals) > 6)) { found[i] = "Decimals: a whole number from 0 to 6"; return }
    const upside = (label: string, b: LabBand | undefined) => (b && b.low !== undefined && b.high !== undefined && b.low > b.high ? `${label}: low is above high` : null)
    const any = r.mode === "any" ? band(r.anyLow, r.anyHigh) : undefined
    const male = r.mode === "sex" ? band(r.maleLow, r.maleHigh) : undefined
    const female = r.mode === "sex" ? band(r.femaleLow, r.femaleHigh) : undefined
    const crit = band(r.critLow, r.critHigh)
    const problem = upside("Normal range", any) ?? upside("Male range", male) ?? upside("Female range", female) ?? upside("Critical limits", crit)
    if (problem) { found[i] = problem; return }
    if (r.mode === "sex" && (!male || !female)) { found[i] = "Give both the male and the female range, or choose one range for everyone"; return }
    if (any && crit) {
      if (crit.low !== undefined && any.low !== undefined && crit.low > any.low) { found[i] = "The critical low limit must be below the normal range"; return }
      if (crit.high !== undefined && any.high !== undefined && crit.high < any.high) { found[i] = "The critical high limit must be above the normal range"; return }
    }
  })
  return found
}

/** "Hb: 12 - 16 (F), 13 - 17 (M)" style one-line summary for the list. */
export function rangeSummary(s: LabParameterSpec): string {
  const fmt = (b?: LabBand) => (!b ? "" : b.low !== undefined && b.high !== undefined ? `${b.low}-${b.high}` : b.high !== undefined ? `≤${b.high}` : b.low !== undefined ? `≥${b.low}` : "")
  if (s.ranges?.any) return fmt(s.ranges.any)
  const parts = [s.ranges?.male && `M ${fmt(s.ranges.male)}`, s.ranges?.female && `F ${fmt(s.ranges.female)}`].filter(Boolean)
  return parts.join(", ")
}
