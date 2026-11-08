import type { DoctorsService } from "../types"
import { callEndpoint } from "./call"
import { doctorPayload, parseDoctor } from "./mappers"
import { doctorListQuery, parseDoctorList } from "./doctorPicker"

/**
 * Real-backend Doctors service. `list` is connected (GET /doctors, the active-doctor picker). `create` / `update` stay inert: a doctor is a staff user with a
 * doctor profile, managed by userAdminService (Admin > Doctors and Admin > Users), not through a separate doctor record.
 */
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
