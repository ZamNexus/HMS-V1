import { PANELS } from "@/data/organisations"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import type { GuardianRelationItem, Panel } from "@/types"
import { paginate } from "../listing"
import type { GuardianRelationRecord, GuardianRelationsService, OrganisationRecord, OrganisationsService } from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared mock arrays in place, so the master-data screen, reports and anything else that
// still reads them directly see the same records.

const toOrganisation = (p: Panel): OrganisationRecord => ({ ...p, id: String(p.id) })
const toRelation = (r: GuardianRelationItem): GuardianRelationRecord => ({ ...r, id: String(r.id) })

export const mockOrganisationsService: OrganisationsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = PANELS.filter((p) => !q || p.name.toLowerCase().includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toOrganisation), total: matches.length }
  },

  async create(input) {
    if (!input.name.trim()) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "name", message: "Name is required" }])
    const panel: Panel = { ...input, name: input.name.trim(), id: Math.max(0, ...PANELS.map((p) => p.id)) + 1 }
    PANELS.push(panel)
    return toOrganisation(panel)
  },
}

export const mockGuardianRelationsService: GuardianRelationsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = GUARDIAN_RELATIONS.filter((r) => !q || r.name.toLowerCase().includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRelation), total: matches.length }
  },

  async create(input) {
    const name = input.name.trim()
    if (!name) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "name", message: "Relation Name is required" }])
    if (GUARDIAN_RELATIONS.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      throw mockApiError(409, "CONFLICT", "Relation already exists", [{ path: "name", message: "Relation already exists" }])
    }
    const item: GuardianRelationItem = { ...input, name, id: Math.max(0, ...GUARDIAN_RELATIONS.map((r) => r.id)) + 1 }
    GUARDIAN_RELATIONS.push(item)
    return toRelation(item)
  },
}
