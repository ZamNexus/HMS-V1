import type { PatientsService } from "../types"
import { callEndpoint, createAndParse } from "./call"
import { duplicateQuery, parseDuplicateMatches, parsePatient, parsePatientList, patientCreatePayload, patientListQuery, patientUpdatePayload, recordDeathPayload } from "./patientMap"

/**
 * Real-backend Patients service (handoff 8.3). Routes: GET /patients, GET /patients/duplicates, GET /patients/{id}, POST /patients,
 * PATCH /patients/{id}, POST /patients/{id}/archive and /restore, POST /patients/{id}/record-death and /revoke-death.
 * Not yet verified against a live backend.
 *
 * Every write is sent exactly once (the client never re-sends a write). Archive and restore are explicit actions with their own permission
 * (patients.archive): an edit never archives or restores as a side effect.
 */
export const httpPatientsService: PatientsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("patients.list", {
      query: () =>
        patientListQuery({
          search: opts.search, status: opts.status, page: opts.page, pageSize: opts.pageSize, gender: opts.gender, panelId: opts.panelId,
          selfPay: opts.selfPay, registeredFrom: opts.registeredFrom, registeredTo: opts.registeredTo, includeArchived: opts.includeArchived,
        }),
      signal: opts.signal,
    })
    return parsePatientList(raw)
  },

  async get(id, signal) {
    return parsePatient(await callEndpoint<unknown>("patients.get", { params: { id }, signal }))
  },

  async create(input) {
    // Exactly ONE POST /patients per call. A 2xx whose answer cannot be read becomes SavedButUnreadableError (see createAndParse). A
    // 409 POSSIBLE_DUPLICATE is not retried here: the screen shows the matches and, if staff confirm, calls again with acknowledgeDuplicates.
    return createAndParse("patients.create", { body: () => patientCreatePayload(input) }, parsePatient, "patient")
  },

  async update(id, input, base) {
    if (!base) throw new TypeError("An edit needs the record it was loaded from, so that only the changed fields are sent.")
    const body = patientUpdatePayload(input, base)
    if (Object.keys(body).length === 0) return base // nothing changed: nothing is sent
    return createAndParse("patients.update", { params: { id }, body: () => body }, (raw) => parsePatient(raw), "change")
  },

  async remove(id) {
    await callEndpoint<unknown>("patients.delete", { params: { id } }) // POST /patients/{id}/archive
  },

  async restore(id) {
    return createAndParse("patients.restore", { params: { id } }, (raw) => parsePatient(raw), "change")
  },

  async duplicates(query) {
    const q = duplicateQuery(query)
    if (!q) return [] // neither a checkable phone number nor a CNIC yet: no request
    return parseDuplicateMatches(await callEndpoint<unknown>("patients.duplicates", { query: () => q, signal: query.signal }))
  },

  async recordDeath(id, deceasedOn) {
    return createAndParse("patients.recordDeath", { params: { id }, body: () => recordDeathPayload(deceasedOn) }, (raw) => parsePatient(raw), "change")
  },

  async revokeDeath(id) {
    return createAndParse("patients.revokeDeath", { params: { id } }, (raw) => parsePatient(raw), "change")
  },
}
