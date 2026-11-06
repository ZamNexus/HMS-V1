import type { EncountersService, WardsService } from "../types"
import { callEndpoint } from "./call"
import {
  dischargePayload, encounterListQuery, encounterPayload, parseDischargeResult, parseEncounter, parseEncounterList,
  parseWardList, wardListQuery,
} from "./mappers"

/**
 * Real-backend Encounters service. Inert (no request is sent) until every endpoint it needs is set in
 * ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */
export const httpEncountersService: EncountersService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("encounters.list", {
      query: () =>
        encounterListQuery({
          search: opts.search?.trim() || undefined, type: opts.type, dateFrom: opts.dateFrom, dateTo: opts.dateTo,
          patientId: opts.patientId, page: opts.page, pageSize: opts.pageSize,
        }),
      signal: opts.signal,
    })
    return parseEncounterList(raw)
  },

  async get(id, signal) {
    return parseEncounter(await callEndpoint<unknown>("encounters.get", { params: { id }, signal }))
  },

  async create(input) {
    return parseEncounter(await callEndpoint<unknown>("encounters.create", { body: () => encounterPayload(input) }))
  },

  async discharge(id, input) {
    return parseDischargeResult(await callEndpoint<unknown>("encounters.discharge", { params: { id }, body: () => dischargePayload(input) }))
  },
}

export const httpWardsService: WardsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("wards.list", {
      query: () => wardListQuery({ page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseWardList(raw)
  },
}
