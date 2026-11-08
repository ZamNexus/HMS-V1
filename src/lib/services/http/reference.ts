import type { GuardianRelationsService, OrganisationsService } from "../types"
import { callEndpoint, createAndParse } from "./call"
import {
  guardianRelationPayload, guardianRelationUpdatePayload, organisationPayload, organisationUpdatePayload, parseGuardianRelation, parseGuardianRelationList,
  parseOrganisation, parseOrganisationList, referenceListQuery,
} from "./mappers"

// Organisations = the API's "panels"; guardian relations = "guardian-relations" (Catalogs tag). Phase 5A, connected to
// docs/openapi.json; not yet verified against a live backend. Lists are NOT filtered by `active`: patients can reference an
// inactive panel and the screens need its name, so pickers that want only active ones filter in the UI.

export const httpOrganisationsService: OrganisationsService = {
  async list(opts = {}) {
    return parseOrganisationList(
      await callEndpoint<unknown>("organisations.list", {
        query: () => referenceListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
        signal: opts.signal,
      })
    )
  },
  async create(input) {
    return createAndParse("organisations.create", { body: () => organisationPayload(input) }, (raw) => parseOrganisation(raw), "panel")
  },
  async get(id, signal) {
    return parseOrganisation(await callEndpoint<unknown>("organisations.get", { params: { id }, signal }))
  },
  async update(id, patch) {
    return createAndParse("organisations.update", { params: { id }, body: () => organisationUpdatePayload(patch) }, (raw) => parseOrganisation(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "organisations.reactivate" : "organisations.deactivate", { params: { id } }, (raw) => parseOrganisation(raw), "change")
  },
}

export const httpGuardianRelationsService: GuardianRelationsService = {
  async list(opts = {}) {
    return parseGuardianRelationList(
      await callEndpoint<unknown>("guardianRelations.list", {
        query: () => referenceListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
        signal: opts.signal,
      })
    )
  },
  async create(input) {
    return createAndParse("guardianRelations.create", { body: () => guardianRelationPayload(input) }, (raw) => parseGuardianRelation(raw), "guardian relation")
  },
  async get(id, signal) {
    return parseGuardianRelation(await callEndpoint<unknown>("guardianRelations.get", { params: { id }, signal }))
  },
  async update(id, patch) {
    return createAndParse("guardianRelations.update", { params: { id }, body: () => guardianRelationUpdatePayload(patch) }, (raw) => parseGuardianRelation(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "guardianRelations.reactivate" : "guardianRelations.deactivate", { params: { id } }, (raw) => parseGuardianRelation(raw), "change")
  },
}
