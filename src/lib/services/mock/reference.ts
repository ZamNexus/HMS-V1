import { PANELS } from "@/data/organisations"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import type { GuardianRelationItem, Panel } from "@/types"
import { paginate } from "../listing"
import type { GuardianRelationRecord, GuardianRelationsService, OrganisationRecord, OrganisationsService } from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared mock arrays in place, so the master-data screen, reports and anything else that
// still reads them directly see the same records.
// Same rules as the backend: names are unique (409 PANEL_NAME_TAKEN / GUARDIAN_RELATION_TAKEN), nothing is deleted (deactivate / reactivate),
// an update changes only the fields it is given.

const toOrganisation = (p: Panel): OrganisationRecord => ({ ...p, id: String(p.id), discountPct: p.discountPct ?? 0, billingMode: p.billingMode ?? "patient_pays" })
const toRelation = (r: GuardianRelationItem): GuardianRelationRecord => ({ ...r, id: String(r.id) })

function findPanel(id: string): Panel {
  const panel = PANELS.find((p) => String(p.id) === id)
  if (!panel) throw mockApiError(404, "NOT_FOUND", "Panel not found")
  return panel
}
function findRelation(id: string): GuardianRelationItem {
  const item = GUARDIAN_RELATIONS.find((r) => String(r.id) === id)
  if (!item) throw mockApiError(404, "NOT_FOUND", "Guardian relation not found")
  return item
}

export const mockOrganisationsService: OrganisationsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = PANELS.filter((p) => !q || p.name.toLowerCase().includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toOrganisation), total: matches.length }
  },

  async create(input) {
    const name = input.name.trim()
    if (!name) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "name", message: "Name is required" }])
    if (PANELS.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw mockApiError(409, "PANEL_NAME_TAKEN", "A panel with this name already exists")
    const panel: Panel = { ...input, name, id: Math.max(0, ...PANELS.map((p) => p.id)) + 1 }
    PANELS.push(panel)
    return toOrganisation(panel)
  },

  async get(id) {
    return toOrganisation(findPanel(id))
  },

  async update(id, patch) {
    const panel = findPanel(id)
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (name.length < 2) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "name", message: "Name must be at least 2 characters" }])
      if (PANELS.some((p) => p.id !== panel.id && p.name.toLowerCase() === name.toLowerCase())) throw mockApiError(409, "PANEL_NAME_TAKEN", "A panel with this name already exists")
      panel.name = name
    }
    if (patch.type !== undefined) panel.type = patch.type
    if (patch.contactPerson !== undefined) panel.contactPerson = patch.contactPerson.trim()
    if (patch.phone !== undefined) panel.phone = patch.phone.trim()
    if (patch.commissionPct !== undefined) panel.commissionPct = patch.commissionPct
    if (patch.discountPct !== undefined) panel.discountPct = patch.discountPct
    if (patch.billingMode !== undefined) panel.billingMode = patch.billingMode
    return toOrganisation(panel)
  },

  async setActive(id, active) {
    const panel = findPanel(id)
    panel.active = active
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
      throw mockApiError(409, "GUARDIAN_RELATION_TAKEN", "Relation already exists", [{ path: "name", message: "Relation already exists" }])
    }
    const item: GuardianRelationItem = { ...input, name, id: Math.max(0, ...GUARDIAN_RELATIONS.map((r) => r.id)) + 1 }
    GUARDIAN_RELATIONS.push(item)
    return toRelation(item)
  },

  async get(id) {
    return toRelation(findRelation(id))
  },

  async update(id, patch) {
    const item = findRelation(id)
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (name.length < 2) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "name", message: "Name must be at least 2 characters" }])
      if (GUARDIAN_RELATIONS.some((r) => r.id !== item.id && r.name.toLowerCase() === name.toLowerCase())) throw mockApiError(409, "GUARDIAN_RELATION_TAKEN", "Relation already exists")
      item.name = name
    }
    if (patch.remarks !== undefined) item.remarks = patch.remarks.trim() || undefined
    return toRelation(item)
  },

  async setActive(id, active) {
    const item = findRelation(id)
    item.active = active
    return toRelation(item)
  },
}
