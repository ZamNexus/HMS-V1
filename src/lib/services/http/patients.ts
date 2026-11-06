import type { PatientsService } from "../types"
import { callEndpoint } from "./call"
import { parsePatient, parsePatientList, patientListQuery, patientPayload } from "./mappers"

/**
 * Real-backend Patients service. Inert (no request is sent) until every endpoint it needs is set in
 * ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */
export const httpPatientsService: PatientsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("patients.list", {
      query: () =>
        patientListQuery({ search: opts.search?.trim() || undefined, status: opts.status, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parsePatientList(raw)
  },

  async get(id, signal) {
    return parsePatient(await callEndpoint<unknown>("patients.get", { params: { id }, signal }))
  },

  async create(input) {
    return parsePatient(await callEndpoint<unknown>("patients.create", { body: () => patientPayload(input) }))
  },

  async update(id, input) {
    return parsePatient(await callEndpoint<unknown>("patients.update", { params: { id }, body: () => patientPayload(input) }))
  },

  async remove(id) {
    await callEndpoint<unknown>("patients.delete", { params: { id } })
  },
}
