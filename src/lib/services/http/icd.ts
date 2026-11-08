import type { QueryParams } from "@/lib/api/client"
import type { IcdCodeRecord, IcdListOptions, IcdService, ListResult } from "../types"
import { callEndpoint } from "./call"
import { asObj, optStr, pageQuery, parsePage, reqStr, reqUlid } from "./wire"

// ICD-10 diagnosis lookup (chunk S11), connected to docs/openapi.json: GET /icd-codes (catalogs.read). The list is the same for every hospital, loaded
// by operations and never edited through the API, so this service has no write call. The search matches a diagnosis name or a code prefix.

export const ICD_SEARCH_MAX = 100

export function parseIcdCode(raw: unknown, dto = "IcdCodePageDto_Output"): IcdCodeRecord {
  const o = asObj(raw, "ICD-10 code")
  return { id: reqUlid(o, "id", "ICD-10 code"), code: reqStr(o, "code", "ICD-10 code"), name: reqStr(o, "name", "ICD-10 code"), category: optStr(o, "category", "ICD-10 code", dto) ?? null }
}

export function parseIcdPage(raw: unknown): ListResult<IcdCodeRecord> {
  return parsePage(raw, "ICD-10 codes", (item) => parseIcdCode(item))
}

export function icdListQuery(opts: IcdListOptions): QueryParams {
  const search = opts.search?.trim()
  if (search && search.length > ICD_SEARCH_MAX) throw new RangeError(`The search can be at most ${ICD_SEARCH_MAX} characters.`)
  return { ...pageQuery(opts.page, opts.pageSize), search: search || undefined }
}

export const httpIcdService: IcdService = {
  async list(opts = {}) {
    return parseIcdPage(await callEndpoint<unknown>("icd.list", { query: () => icdListQuery(opts), signal: opts.signal }))
  },
}
