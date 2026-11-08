import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { NotConnectedError } from "../errors"
import type { ListResult, ServiceCatalogInput, ServiceCatalogListOptions, ServiceCatalogPatch, ServiceCatalogRecord, ServiceCatalogService } from "../types"
import { normalizeMoneyInput } from "../moneyMath"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optDecimalString, pageQuery, parsePage, reqBool, reqStr, reqUlid } from "./wire"

// Services catalogue (chunk S5), connected to docs/openapi.json: GET/POST /services, PATCH /services/{id}, POST /services/{id}/deactivate | reactivate.
// The API keeps no local (Urdu) name, remarks or barcode flag, so those demo-only fields are never sent and come back undefined.
// Money and percentages travel as decimal strings; the screens keep numbers for display and this file converts at the edge.

export type CreateServiceBody = Schemas["CreateServiceDto"]
export type UpdateServiceBody = Schemas["UpdateServiceDto"]

/** A number as the exact decimal string the API takes: at least zero, at most 2 decimals ("1250.50"). Never a float formatted by the browser. */
export function decimalText(value: number, label: string): string {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be zero or more.`)
  if (Math.round(value * 100) / 100 !== value) throw new RangeError(`${label} can have at most 2 decimal places.`)
  return value.toFixed(2)
}

/**
 * Money typed into a form or read from the API ("1500", "1500.5", "1500.00") -> the exact two-decimal text the API takes ("1500.00"). It never goes
 * through a JavaScript number, so no rounding can enter. Refuses a negative amount or a third decimal.
 */
export function moneyText(text: string, label: string): string {
  const normal = normalizeMoneyInput(text)
  if (normal === null || normal.startsWith("-")) throw new RangeError(`${label} must be zero or more, with at most 2 decimal places.`)
  return normal
}

export function parseServiceCatalogRecord(raw: unknown, dto = "ServiceResponseDto_Output"): ServiceCatalogRecord {
  const o = asObj(raw, "service")
  const rate = optDecimalString(o, "rate", "service", dto)
  if (rate === undefined) throw new TypeError("Unexpected response: service.rate is missing.")
  return {
    id: reqUlid(o, "id", "service"),
    code: reqStr(o, "code", "service"),
    name: reqStr(o, "name", "service"),
    category: reqStr(o, "category", "service"),
    rate: Number(rate), // for the demo-shaped screens only; API screens use rateText
    rateText: rate,
    gstPct: Number(optDecimalString(o, "gstPct", "service", dto) ?? "0"),
    discountPct: Number(optDecimalString(o, "discountPct", "service", dto) ?? "0"),
    active: reqBool(o, "active", "service"),
  }
}

export function parseServiceCatalogList(raw: unknown): ListResult<ServiceCatalogRecord> {
  return parsePage(raw, "services", (item) => parseServiceCatalogRecord(item, "ServicePageDto_Output"))
}

export function serviceListQuery(opts: ServiceCatalogListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, category: opts.category || undefined, active: opts.active }
}

/** POST /services. The API creates services active; an inactive one is a separate deactivate call. */
export function serviceCreatePayload(input: ServiceCatalogInput): CreateServiceBody {
  if (!input.active) throw new NotConnectedError("creating an inactive service (the API creates services active; deactivate is a separate call)")
  const body: CreateServiceBody = { name: input.name.trim(), rate: input.rateText !== undefined ? moneyText(input.rateText, "Rate") : decimalText(input.rate, "Rate") }
  if (input.code.trim()) body.code = input.code.trim()
  if (input.category.trim()) body.category = input.category.trim()
  if (input.gstPct !== undefined) body.gstPct = decimalText(input.gstPct, "GST")
  if (input.discountPct !== undefined) body.discountPct = decimalText(input.discountPct, "Discount")
  return body
}

/** PATCH /services/{id}: ONLY the fields in `patch`. A required field is never sent empty. */
export function serviceUpdatePayload(patch: ServiceCatalogPatch): UpdateServiceBody {
  const body: UpdateServiceBody = {}
  if (patch.code !== undefined) {
    if (!patch.code.trim()) throw new RangeError("Code cannot be empty.")
    body.code = patch.code.trim()
  }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new RangeError("Service name cannot be empty.")
    body.name = patch.name.trim()
  }
  if (patch.category !== undefined) {
    if (!patch.category.trim()) throw new RangeError("Category cannot be empty.")
    body.category = patch.category.trim()
  }
  if (patch.rateText !== undefined) body.rate = moneyText(patch.rateText, "Rate")
  else if (patch.rate !== undefined) body.rate = decimalText(patch.rate, "Rate")
  if (patch.gstPct !== undefined) body.gstPct = decimalText(patch.gstPct, "GST")
  if (patch.discountPct !== undefined) body.discountPct = decimalText(patch.discountPct, "Discount")
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export const httpServiceCatalogService: ServiceCatalogService = {
  async list(opts = {}) {
    return parseServiceCatalogList(await callEndpoint<unknown>("serviceCatalog.list", { query: () => serviceListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("serviceCatalog.create", { body: () => serviceCreatePayload(input) }, (raw) => parseServiceCatalogRecord(raw), "service")
  },
  async update(id, input) {
    return httpServiceCatalogService.patch(id, { code: input.code, name: input.name, category: input.category, rate: input.rate, rateText: input.rateText, gstPct: input.gstPct, discountPct: input.discountPct })
  },
  async patch(id, patch) {
    return createAndParse("serviceCatalog.update", { params: { id }, body: () => serviceUpdatePayload(patch) }, (raw) => parseServiceCatalogRecord(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "serviceCatalog.reactivate" : "serviceCatalog.deactivate", { params: { id } }, (raw) => parseServiceCatalogRecord(raw), "change")
  },
}
