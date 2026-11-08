import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import {
  API_MODALITIES, type EcgUltrasoundTestRecord, type EcgUltrasoundTestsService, type ImagingTestListOptions, type ImagingTestPatch, type ListResult,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { decimalText, moneyText } from "./serviceCatalog"
import { asObj, optDecimalString, optStr, pageQuery, parsePage, reqBool, reqEnum, reqStr, reqUlid } from "./wire"

// Imaging tests catalogue (chunk S7), connected to docs/openapi.json: GET/POST /imaging-tests, PATCH /imaging-tests/{id}, POST .../deactivate | reactivate.
// One catalogue for X-ray, ultrasound, Doppler, echocardiography, ECG, CT, MRI and other. The demo's `fee` is the API's `rate`; the demo's free-text
// `remarks` has no API field and is never sent. Money and percentages travel as decimal strings.

export type CreateImagingTestBody = Schemas["CreateImagingTestDto"]
export type UpdateImagingTestBody = Schemas["UpdateImagingTestDto"]

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/
const MAX_TEMPLATE = 5000

export function parseImagingTest(raw: unknown, dto = "ImagingTestResponseDto_Output"): EcgUltrasoundTestRecord {
  const o = asObj(raw, "imaging test")
  const rate = optDecimalString(o, "rate", "imaging test", dto)
  if (rate === undefined) throw new TypeError("Unexpected response: imaging test.rate is missing.")
  // turnaroundHours is typed "array of number" / "number or null" in the JSON (spec bug): read a number, the first of an array, null = unknown
  const tat = Array.isArray(o.turnaroundHours) ? o.turnaroundHours[0] : o.turnaroundHours
  if (tat !== null && tat !== undefined && (typeof tat !== "number" || !Number.isFinite(tat))) throw new TypeError("Unexpected response: imaging test.turnaroundHours is not a number.")
  return {
    id: reqUlid(o, "id", "imaging test"),
    code: reqStr(o, "code", "imaging test"),
    name: reqStr(o, "name", "imaging test"),
    fee: Number(rate), // for the demo-shaped screens only; API screens use feeText
    feeText: rate,
    active: reqBool(o, "active", "imaging test"),
    modality: reqEnum(o, "modality", "imaging test", API_MODALITIES),
    gstPct: Number(optDecimalString(o, "gstPct", "imaging test", dto) ?? "0"),
    discountPct: Number(optDecimalString(o, "discountPct", "imaging test", dto) ?? "0"),
    turnaroundHours: typeof tat === "number" ? tat : 0,
    reportRequired: reqBool(o, "reportRequired", "imaging test"),
    reportTemplate: optStr(o, "reportTemplate", "imaging test", dto) ?? "",
  }
}

export function parseImagingTestList(raw: unknown): ListResult<EcgUltrasoundTestRecord> {
  return parsePage(raw, "imaging tests", (item) => parseImagingTest(item, "ImagingTestPageDto_Output"))
}

export function imagingTestListQuery(opts: ImagingTestListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, modality: opts.modality || undefined, active: opts.active }
}

function checkCode(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!CODE_RE.test(upper)) throw new RangeError("Code: letters, digits and . _ - only, up to 32 characters, starting with a letter or digit.")
  return upper
}
function checkModality(modality: string | undefined): CreateImagingTestBody["modality"] {
  if (!modality || !(API_MODALITIES as readonly string[]).includes(modality)) throw new RangeError("Choose a modality.")
  return modality as CreateImagingTestBody["modality"]
}
function checkHours(hours: number): number {
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new RangeError("Turnaround must be a whole number of hours from 1 to 720.")
  return hours
}
function checkTemplate(text: string): string {
  if (text.length > MAX_TEMPLATE) throw new RangeError(`The report template can be at most ${MAX_TEMPLATE} characters.`)
  return text
}

/** POST /imaging-tests. The API creates tests active; an inactive create is a separate deactivate call. */
export function imagingTestCreatePayload(input: Omit<EcgUltrasoundTestRecord, "id">): CreateImagingTestBody {
  const body: CreateImagingTestBody = { code: checkCode(input.code), name: input.name.trim(), modality: checkModality(input.modality), rate: input.feeText !== undefined ? moneyText(input.feeText, "Fee") : decimalText(input.fee, "Fee") }
  if (!input.active) throw new RangeError("The API creates imaging tests active; deactivate is a separate call.")
  if (input.gstPct !== undefined) body.gstPct = decimalText(input.gstPct, "GST")
  if (input.discountPct !== undefined) body.discountPct = decimalText(input.discountPct, "Discount")
  if (input.turnaroundHours !== undefined) body.turnaroundHours = checkHours(input.turnaroundHours)
  if (input.reportRequired !== undefined) body.reportRequired = input.reportRequired
  if (input.reportTemplate?.trim()) body.reportTemplate = checkTemplate(input.reportTemplate)
  return body
}

/** PATCH /imaging-tests/{id}: ONLY the fields in `patch`. An emptied report template is sent as null (the API clears it). */
export function imagingTestUpdatePayload(patch: ImagingTestPatch): UpdateImagingTestBody {
  const body: UpdateImagingTestBody = {}
  if (patch.code !== undefined) body.code = checkCode(patch.code)
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new RangeError("Test name cannot be empty.")
    body.name = patch.name.trim()
  }
  if (patch.modality !== undefined) body.modality = checkModality(patch.modality)
  if (patch.feeText !== undefined) body.rate = moneyText(patch.feeText, "Fee")
  else if (patch.fee !== undefined) body.rate = decimalText(patch.fee, "Fee")
  if (patch.gstPct !== undefined) body.gstPct = decimalText(patch.gstPct, "GST")
  if (patch.discountPct !== undefined) body.discountPct = decimalText(patch.discountPct, "Discount")
  if (patch.turnaroundHours !== undefined) body.turnaroundHours = checkHours(patch.turnaroundHours)
  if (patch.reportRequired !== undefined) body.reportRequired = patch.reportRequired
  if (patch.reportTemplate !== undefined) body.reportTemplate = patch.reportTemplate.trim() === "" ? null : checkTemplate(patch.reportTemplate)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export const httpEcgUltrasoundTestsService: EcgUltrasoundTestsService = {
  async list(opts = {}) {
    return parseImagingTestList(await callEndpoint<unknown>("ecgTests.list", { query: () => imagingTestListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("ecgTests.create", { body: () => imagingTestCreatePayload(input) }, (raw) => parseImagingTest(raw), "imaging test")
  },
  async update(id, input) {
    return httpEcgUltrasoundTestsService.patch(id, { code: input.code, name: input.name, modality: input.modality, fee: input.fee, feeText: input.feeText, gstPct: input.gstPct, discountPct: input.discountPct, turnaroundHours: input.turnaroundHours, reportRequired: input.reportRequired, reportTemplate: input.reportTemplate })
  },
  async patch(id, patch) {
    return createAndParse("ecgTests.update", { params: { id }, body: () => imagingTestUpdatePayload(patch) }, (raw) => parseImagingTest(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "ecgTests.reactivate" : "ecgTests.deactivate", { params: { id } }, (raw) => parseImagingTest(raw), "change")
  },
}
