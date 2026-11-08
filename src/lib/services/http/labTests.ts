import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import type { LabTestCategory } from "@/types"
import {
  API_LAB_CATEGORIES, API_SPECIMEN_TYPES,
  type LabBand, type LabParameterSpec, type LabTestInput, type LabTestListOptions, type LabTestPatch, type LabTestRecord, type LabTestsService, type ListResult,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { decimalText, moneyText } from "./serviceCatalog"
import { asObj, optDecimalString, optStr, pageQuery, parsePage, reqBool, reqEnum, reqStr, reqUlid, type Obj } from "./wire"

// Lab tests catalogue (chunk S6), connected to docs/openapi.json: GET/POST /lab-tests, PATCH /lab-tests/{id}, POST .../deactivate | reactivate.
// A measured test lists parameters (key, name, unit, decimals, normal bands "any" OR "male"+"female", critical limits); a narrative test (a culture)
// has none. PATCH `parameters` REPLACES the whole list. Money and percentages travel as decimal strings.

export type CreateLabTestBody = Schemas["CreateLabTestDto"]
export type UpdateLabTestBody = Schemas["UpdateLabTestDto"]

const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError(`Unexpected response: ${what} is not a number.`)
  return v
}

function parseBand(raw: unknown, what: string): LabBand | undefined {
  if (raw === undefined || raw === null) return undefined
  const o = asObj(raw, what)
  const band: LabBand = {}
  if (o.low !== undefined && o.low !== null) band.low = num(o.low, `${what}.low`)
  if (o.high !== undefined && o.high !== null) band.high = num(o.high, `${what}.high`)
  return band.low === undefined && band.high === undefined ? undefined : band
}

function parseSpec(raw: unknown): LabParameterSpec {
  const o = asObj(raw, "lab test parameter")
  const spec: LabParameterSpec = { key: reqStr(o, "key", "lab test parameter"), name: reqStr(o, "name", "lab test parameter") }
  const unit = optStr(o, "unit", "lab test parameter")
  if (unit) spec.unit = unit
  if (o.decimals !== undefined && o.decimals !== null) spec.decimals = num(o.decimals, "lab test parameter.decimals")
  if (o.ranges !== undefined && o.ranges !== null) {
    const r: Obj = asObj(o.ranges, "lab test parameter.ranges")
    const ranges: NonNullable<LabParameterSpec["ranges"]> = {}
    for (const k of ["any", "male", "female"] as const) {
      const band = parseBand(r[k], `lab test parameter.ranges.${k}`)
      if (band) ranges[k] = band
    }
    if (Object.keys(ranges).length > 0) spec.ranges = ranges
  }
  const critical = parseBand(o.critical, "lab test parameter.critical")
  if (critical) spec.critical = critical
  return spec
}

/** "3.5 - 5.5", "up to 5.5", "from 3.5" or "-". */
export function bandText(band: LabBand | undefined): string {
  if (!band) return "-"
  if (band.low !== undefined && band.high !== undefined) return `${band.low} - ${band.high}`
  if (band.high !== undefined) return `up to ${band.high}`
  if (band.low !== undefined) return `from ${band.low}`
  return "-"
}
const firstBand = (s: LabParameterSpec) => s.ranges?.any ?? s.ranges?.male ?? s.ranges?.female

export function parseLabTest(raw: unknown, dto = "LabTestResponseDto_Output"): LabTestRecord {
  const o = asObj(raw, "lab test")
  const specsRaw = o.parameters
  if (!Array.isArray(specsRaw)) throw new TypeError("Unexpected response: lab test.parameters is not a list.")
  const specs = specsRaw.map(parseSpec)
  // The JSON types turnaroundHours as "array of number" / "number or null" (spec bug); read a number, the first of an array, and treat null as unknown (0).
  const tat = Array.isArray(o.turnaroundHours) ? o.turnaroundHours[0] : o.turnaroundHours
  const rate = optDecimalString(o, "rate", "lab test", dto)
  if (rate === undefined) throw new TypeError("Unexpected response: lab test.rate is missing.")
  const measured = specs.filter((s) => {
    const b = firstBand(s)
    return b && b.low !== undefined && b.high !== undefined
  })
  const lead = specs[0]
  return {
    id: reqUlid(o, "id", "lab test"),
    code: reqStr(o, "code", "lab test"),
    name: reqStr(o, "name", "lab test"),
    category: reqEnum(o, "category", "lab test", API_LAB_CATEGORIES) as LabTestCategory,
    rate: Number(rate), // for the demo-shaped screens only; API screens use rateText
    rateText: rate,
    // lossy summaries for the screens that still use the demo shape; the full definitions are in `specs`
    unit: lead?.unit ?? "-",
    normalRange: lead ? bandText(firstBand(lead)) : "-",
    turnaroundHours: tat === null || tat === undefined ? 0 : num(tat, "lab test.turnaroundHours"),
    parameters: measured.map((s) => {
      const b = firstBand(s)!
      return { parameter: s.name, unit: s.unit ?? "", normalLow: b.low!, normalHigh: b.high! }
    }),
    narrative: reqBool(o, "narrative", "lab test"),
    specimenType: reqStr(o, "specimenType", "lab test"),
    gstPct: Number(optDecimalString(o, "gstPct", "lab test", dto) ?? "0"),
    discountPct: Number(optDecimalString(o, "discountPct", "lab test", dto) ?? "0"),
    active: reqBool(o, "active", "lab test"),
    specs,
  }
}

export function parseLabTestList(raw: unknown): ListResult<LabTestRecord> {
  return parsePage(raw, "lab tests", (item) => parseLabTest(item, "LabTestPageDto_Output"))
}

export function labTestListQuery(opts: LabTestListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, category: opts.category, specimenType: opts.specimenType || undefined, active: opts.active }
}

function bandPayload(band: LabBand | undefined, what: string): LabBand | undefined {
  if (!band) return undefined
  const out: LabBand = {}
  if (band.low !== undefined) {
    if (!Number.isFinite(band.low)) throw new RangeError(`${what}: low is not a number.`)
    out.low = band.low
  }
  if (band.high !== undefined) {
    if (!Number.isFinite(band.high)) throw new RangeError(`${what}: high is not a number.`)
    out.high = band.high
  }
  if (out.low !== undefined && out.high !== undefined && out.low > out.high) throw new RangeError(`${what}: low is above high.`)
  return out.low === undefined && out.high === undefined ? undefined : out
}

type ParamBody = NonNullable<CreateLabTestBody["parameters"]>[number]
export function specsPayload(specs: readonly LabParameterSpec[]): ParamBody[] {
  if (specs.length > 60) throw new RangeError("A lab test can have at most 60 parameters.")
  const seen = new Set<string>()
  return specs.map((s, i) => {
    const key = s.key.trim(), name = s.name.trim()
    if (!key || !name) throw new RangeError(`Parameter ${i + 1}: key and name are required.`)
    if (seen.has(key.toLowerCase())) throw new RangeError(`Parameter ${i + 1}: the key "${key}" is used twice.`)
    seen.add(key.toLowerCase())
    const out: ParamBody = { key, name }
    if (s.unit?.trim()) out.unit = s.unit.trim()
    if (s.decimals !== undefined) {
      if (!Number.isInteger(s.decimals) || s.decimals < 0 || s.decimals > 6) throw new RangeError(`Parameter ${i + 1}: decimals must be a whole number from 0 to 6.`)
      out.decimals = s.decimals
    }
    if (s.ranges) {
      const hasAny = !!s.ranges.any, hasSex = !!s.ranges.male || !!s.ranges.female
      if (hasAny && hasSex) throw new RangeError(`Parameter ${i + 1}: use one normal band for everyone OR separate male and female bands, not both.`)
      if (hasSex && !(s.ranges.male && s.ranges.female)) throw new RangeError(`Parameter ${i + 1}: give both the male and the female band.`)
      const ranges: NonNullable<ParamBody["ranges"]> = {}
      for (const k of ["any", "male", "female"] as const) {
        const band = bandPayload(s.ranges[k], `Parameter ${i + 1} ${k} band`)
        if (band) ranges[k] = band
      }
      if (Object.keys(ranges).length > 0) out.ranges = ranges
    }
    const critical = bandPayload(s.critical, `Parameter ${i + 1} critical limits`)
    if (critical) out.critical = critical
    return out
  })
}

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/
function checkCategory(category: string): void {
  if (!(API_LAB_CATEGORIES as readonly string[]).includes(category)) throw new RangeError(`"${category}" is not a lab category (imaging tests are a separate catalogue).`)
}
function checkSpecimen(specimen: string | undefined): string {
  if (!specimen || !(API_SPECIMEN_TYPES as readonly string[]).includes(specimen)) throw new RangeError("Choose a specimen type.")
  return specimen
}
function checkHours(hours: number): number {
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new RangeError("Turnaround must be a whole number of hours from 1 to 720.")
  return hours
}

/** POST /lab-tests. The API creates tests active. */
export function labTestCreatePayload(input: LabTestInput): CreateLabTestBody {
  const code = input.code.trim().toUpperCase()
  if (!CODE_RE.test(code)) throw new RangeError("Code: letters, digits and . _ - only, up to 32 characters, starting with a letter or digit.")
  checkCategory(input.category)
  const body: CreateLabTestBody = {
    code, name: input.name.trim(), category: input.category as CreateLabTestBody["category"], specimenType: checkSpecimen(input.specimenType) as CreateLabTestBody["specimenType"], rate: input.rateText !== undefined ? moneyText(input.rateText, "Rate") : decimalText(input.rate, "Rate"),
  }
  body.turnaroundHours = checkHours(input.turnaroundHours)
  if (input.gstPct !== undefined) body.gstPct = decimalText(input.gstPct, "GST")
  if (input.discountPct !== undefined) body.discountPct = decimalText(input.discountPct, "Discount")
  if (input.narrative !== undefined) body.narrative = input.narrative
  if (input.specs !== undefined) {
    if (input.narrative && input.specs.length > 0) throw new RangeError("A narrative test has no parameters.")
    body.parameters = specsPayload(input.specs)
  }
  return body
}

/** PATCH /lab-tests/{id}: ONLY the fields in `patch`; `specs` replaces the whole parameter list. */
export function labTestUpdatePayload(patch: LabTestPatch): UpdateLabTestBody {
  const body: UpdateLabTestBody = {}
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase()
    if (!CODE_RE.test(code)) throw new RangeError("Code: letters, digits and . _ - only, up to 32 characters, starting with a letter or digit.")
    body.code = code
  }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new RangeError("Test name cannot be empty.")
    body.name = patch.name.trim()
  }
  if (patch.category !== undefined) {
    checkCategory(patch.category)
    body.category = patch.category as UpdateLabTestBody["category"]
  }
  if (patch.specimenType !== undefined) body.specimenType = checkSpecimen(patch.specimenType) as UpdateLabTestBody["specimenType"]
  if (patch.rateText !== undefined) body.rate = moneyText(patch.rateText, "Rate")
  else if (patch.rate !== undefined) body.rate = decimalText(patch.rate, "Rate")
  if (patch.gstPct !== undefined) body.gstPct = decimalText(patch.gstPct, "GST")
  if (patch.discountPct !== undefined) body.discountPct = decimalText(patch.discountPct, "Discount")
  if (patch.turnaroundHours !== undefined) body.turnaroundHours = checkHours(patch.turnaroundHours)
  if (patch.narrative !== undefined) body.narrative = patch.narrative
  if (patch.specs !== undefined) body.parameters = specsPayload(patch.specs)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export const httpLabTestsService: LabTestsService = {
  async list(opts = {}) {
    return parseLabTestList(await callEndpoint<unknown>("labTests.list", { query: () => labTestListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("labTests.create", { body: () => labTestCreatePayload(input) }, (raw) => parseLabTest(raw), "lab test")
  },
  async update(id, input) {
    return httpLabTestsService.patch(id, { code: input.code, name: input.name, category: input.category, rate: input.rate, rateText: input.rateText, turnaroundHours: input.turnaroundHours, specimenType: input.specimenType, gstPct: input.gstPct, discountPct: input.discountPct, narrative: input.narrative, specs: input.specs })
  },
  async patch(id, patch) {
    return createAndParse("labTests.update", { params: { id }, body: () => labTestUpdatePayload(patch) }, (raw) => parseLabTest(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "labTests.reactivate" : "labTests.deactivate", { params: { id } }, (raw) => parseLabTest(raw), "change")
  },
}
