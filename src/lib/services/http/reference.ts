import { NotConnectedError } from "../errors"
import type { GuardianRelationsService, OrganisationsService } from "../types"

// Organisations and guardian relations have NO confirmed backend contract (independent resources? nested in
// patient responses? settings/catalogs?). There is deliberately no endpoint key or mapper: these report
// "awaiting the backend contract" without any request. Add keys + mappers only when the OpenAPI spec defines them.

const organisations = (what: string) => new NotConnectedError(`organisations ${what} (contract not confirmed)`)
const relations = (what: string) => new NotConnectedError(`guardian relations ${what} (contract not confirmed)`)

export const httpOrganisationsService: OrganisationsService = {
  async list() {
    throw organisations("list")
  },
  async create() {
    throw organisations("create")
  },
}

export const httpGuardianRelationsService: GuardianRelationsService = {
  async list() {
    throw relations("list")
  },
  async create() {
    throw relations("create")
  },
}
