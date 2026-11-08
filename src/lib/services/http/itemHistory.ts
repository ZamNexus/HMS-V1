import type { QueryParams } from "@/lib/api/client"
import { isUlid } from "@/lib/api/convert"
import type { ItemHistoryEntry, ItemHistoryQuery, ItemHistoryService, ItemHistorySubject, ListResult } from "../types"
import { callEndpoint } from "./call"
import { asObj, pageQuery, parsePage, reqStr, reqUlid } from "./wire"

// Item History (chunk D8): GET /audit-entries?entityType=&entityId= (handoff 8.12, 9; permission audit.read; newest first, paged). The entity types are
// the handoff's list; the entry fields (action values, the format of `changes`, null actor = system) are the PROPOSED contract in
// docs/openapi.draft.json and docs/BACKEND_CONTRACT_PROPOSED.md (section 3). Every value is shown as plain text.

/** The handoff's `entityType` per record kind (8.12). */
export const AUDIT_ENTITY_TYPE: Readonly<Record<ItemHistorySubject, string>> = {
  serviceCatalogItem: "service_catalog_item", labTest: "lab_test", imagingTest: "imaging_test", medicine: "medicine", panel: "panel",
  guardianRelation: "guardian_relation", expenseCategory: "expense_category", bankAccount: "bank_account", ward: "ward", bed: "bed",
  user: "user", doctor: "doctor", clinicSettings: "clinic_settings",
}

export const HISTORY_PAGE_SIZE = 100

export function itemHistoryQuery(query: Pick<ItemHistoryQuery, "subject" | "id" | "page" | "pageSize">): QueryParams {
  const entityType = AUDIT_ENTITY_TYPE[query.subject]
  if (!entityType) throw new TypeError("Unknown record kind for the item history.")
  if (!isUlid(query.id)) throw new TypeError("The item history needs the record's backend id.")
  return { entityType, entityId: query.id, ...pageQuery(query.page, query.pageSize ?? HISTORY_PAGE_SIZE) }
}

/** "dailyRate" -> "Daily rate". */
export function fieldLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function valueText(v: unknown): string {
  if (v === null || v === undefined) return "(empty)"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "string") return v === "" ? "(empty)" : v
  if (typeof v === "number") return String(v)
  return "(see record)" // the contract sends scalars only; anything else is never rendered as markup
}

const ACTION_LABEL: Record<string, string> = { created: "Created", updated: "Updated", deactivated: "Deactivated", reactivated: "Reactivated" }

export function parseAuditEntry(raw: unknown): ItemHistoryEntry {
  const o = asObj(raw, "audit entry")
  const action = reqStr(o, "action", "audit entry")
  let actor: string | null = "System" // null = a change the system made
  if (o.actor !== null && o.actor !== undefined) actor = reqStr(asObj(o.actor, "audit entry.actor"), "name", "audit entry.actor")
  let details = ""
  if (o.changes !== null && o.changes !== undefined) {
    const changes = asObj(o.changes, "audit entry.changes")
    details = Object.entries(changes)
      .map(([field, change]) => {
        const c = asObj(change, `audit entry.changes.${field}`)
        return `${fieldLabel(field)}: ${valueText(c.from)} → ${valueText(c.to)}`
      })
      .join("\n")
  }
  return { id: reqUlid(o, "id", "audit entry"), at: reqStr(o, "occurredAt", "audit entry"), action: ACTION_LABEL[action] ?? action, actor, details }
}

export function parseAuditPage(raw: unknown): ListResult<ItemHistoryEntry> {
  return parsePage(raw, "audit entries", parseAuditEntry)
}

export const httpItemHistoryService: ItemHistoryService = {
  async list(query) {
    return parseAuditPage(await callEndpoint<unknown>("itemHistory.list", { query: () => itemHistoryQuery(query), signal: query.signal }))
  },
}
