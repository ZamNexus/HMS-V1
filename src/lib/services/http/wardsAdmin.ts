import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { API_WARD_TYPES, type WardAdminListOptions, type WardAdminRecord, type WardAdminService, type WardBedRecord, type WardCreateInput, type WardPatch, type ListResult } from "../types"
import { callEndpoint, createAndParse } from "./call"
import { moneyText } from "./serviceCatalog"
import { asObj, optDecimalString, pageQuery, parsePage, reqBool, reqEnum, reqInt, reqStr, reqUlid } from "./wire"

// Wards and beds setup (chunk S8), connected to docs/openapi.json: /wards (list, detail, create with beds, patch, deactivate | reactivate),
// /wards/{id}/beds (add a bed), /beds/{id} (rename) and /beds/{id}/deactivate | reactivate. A bed is "available", "occupied" (derived by the server)
// or "maintenance" (set elsewhere, chunk E13); nothing here sets those. Money is a decimal string.

export type CreateWardBody = Schemas["CreateWardDto"]
export type UpdateWardBody = Schemas["UpdateWardDto"]

const BED_STATES = ["available", "occupied", "maintenance"] as const

export function parseBed(raw: unknown): WardBedRecord {
  const o = asObj(raw, "bed")
  return { id: reqUlid(o, "id", "bed"), bedNo: reqStr(o, "bedNo", "bed"), state: reqEnum(o, "state", "bed", BED_STATES), active: reqBool(o, "active", "bed") }
}

export function parseWard(raw: unknown, dto = "WardDetailDto_Output"): WardAdminRecord {
  const o = asObj(raw, "ward")
  const rate = optDecimalString(o, "dailyRate", "ward", dto)
  if (rate === undefined) throw new TypeError("Unexpected response: ward.dailyRate is missing.")
  const ward: WardAdminRecord = {
    id: reqUlid(o, "id", "ward"),
    name: reqStr(o, "name", "ward"),
    type: reqEnum(o, "type", "ward", API_WARD_TYPES),
    dailyRate: rate,
    active: reqBool(o, "active", "ward"),
    bedCount: reqInt(o, "bedCount", "ward"),
    occupiedCount: reqInt(o, "occupiedCount", "ward"),
    availableCount: reqInt(o, "availableCount", "ward"),
  }
  if (o.beds !== undefined) {
    if (!Array.isArray(o.beds)) throw new TypeError("Unexpected response: ward.beds is not a list.")
    ward.beds = o.beds.map(parseBed)
  }
  return ward
}

export function parseWardPage(raw: unknown): ListResult<WardAdminRecord> {
  return parsePage(raw, "wards", (item) => parseWard(item, "WardPageDto_Output"))
}

export function wardListQuery(opts: WardAdminListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, type: opts.type, active: opts.active }
}

function checkName(name: string): string {
  const n = name.trim()
  if (n.length < 2 || n.length > 80) throw new RangeError("Ward name needs 2 to 80 characters.")
  return n
}
function checkType(type: string): CreateWardBody["type"] {
  if (!(API_WARD_TYPES as readonly string[]).includes(type)) throw new RangeError("Choose a ward type.")
  return type as CreateWardBody["type"]
}

/** A bed number: 1 to 20 characters once trimmed. */
export function checkBedNo(bedNo: string): string {
  const n = bedNo.trim()
  if (n.length < 1 || n.length > 20) throw new RangeError("A bed number needs 1 to 20 characters.")
  return n
}

/** POST /wards: the ward and all its beds in ONE call. Bed numbers are unique within the ward (compared ignoring case). */
export function wardCreatePayload(input: WardCreateInput): CreateWardBody {
  const beds = input.beds.map(checkBedNo)
  if (beds.length > 200) throw new RangeError("A ward can be created with at most 200 beds.")
  const seen = new Set<string>()
  for (const b of beds) {
    if (seen.has(b.toLowerCase())) throw new RangeError(`The bed number "${b}" is used twice.`)
    seen.add(b.toLowerCase())
  }
  return { name: checkName(input.name), type: checkType(input.type), dailyRate: moneyText(input.dailyRate, "Daily rate"), beds }
}

/** PATCH /wards/{id}: ONLY the fields in `patch`. */
export function wardUpdatePayload(patch: WardPatch): UpdateWardBody {
  const body: UpdateWardBody = {}
  if (patch.name !== undefined) body.name = checkName(patch.name)
  if (patch.type !== undefined) body.type = checkType(patch.type)
  if (patch.dailyRate !== undefined) body.dailyRate = moneyText(patch.dailyRate, "Daily rate")
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export const httpWardAdminService: WardAdminService = {
  async list(opts = {}) {
    return parseWardPage(await callEndpoint<unknown>("wardsAdmin.list", { query: () => wardListQuery(opts), signal: opts.signal }))
  },
  async get(id, signal) {
    return parseWard(await callEndpoint<unknown>("wardsAdmin.get", { params: { id }, signal }))
  },
  async create(input) {
    return createAndParse("wardsAdmin.create", { body: () => wardCreatePayload(input) }, (raw) => parseWard(raw), "ward")
  },
  async update(id, patch) {
    return createAndParse("wardsAdmin.update", { params: { id }, body: () => wardUpdatePayload(patch) }, (raw) => parseWard(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "wardsAdmin.reactivate" : "wardsAdmin.deactivate", { params: { id } }, (raw) => parseWard(raw), "change")
  },
  async addBed(wardId, bedNo) {
    return createAndParse("wardsAdmin.bedAdd", { params: { id: wardId }, body: () => ({ bedNo: checkBedNo(bedNo) }) }, (raw) => parseBed(raw), "bed")
  },
  async renameBed(bedId, bedNo) {
    return createAndParse("wardsAdmin.bedUpdate", { params: { id: bedId }, body: () => ({ bedNo: checkBedNo(bedNo) }) }, (raw) => parseBed(raw), "change")
  },
  async setBedActive(bedId, active) {
    return createAndParse(active ? "wardsAdmin.bedReactivate" : "wardsAdmin.bedDeactivate", { params: { id: bedId } }, (raw) => parseBed(raw), "change")
  },
}
