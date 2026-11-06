import type { DoctorsService } from "../types"
import { callEndpoint } from "./call"
import { doctorListQuery, doctorPayload, parseDoctor, parseDoctorList } from "./mappers"

/** Real-backend Doctors service. Inert until ENDPOINTS and mappers.ts are filled in from the OpenAPI spec. */
export const httpDoctorsService: DoctorsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("doctors.list", {
      query: () => doctorListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseDoctorList(raw)
  },

  async create(input) {
    const raw = await callEndpoint<unknown>("doctors.create", { body: () => doctorPayload(input) })
    return parseDoctor(raw)
  },

  async update(id, input) {
    const raw = await callEndpoint<unknown>("doctors.update", { params: { id }, body: () => doctorPayload(input) })
    return parseDoctor(raw)
  },
}
