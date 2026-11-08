import type { QueryParams } from "@/lib/api/client"
import type { ProposedSchemas } from "@/lib/api/contract"
import type { ExpenseCategoriesService, ExpenseCategoryListOptions, ExpenseCategoryRecord, ListResult } from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, pageQuery, parsePage, reqBool, reqStr, reqUlid } from "./wire"

// Expense categories (chunk S12). The handoff (8.2, 9) names the routes and permissions; the exact fields are the PROPOSED contract in
// docs/openapi.draft.json and docs/BACKEND_CONTRACT_PROPOSED.md (section 1), which the backend is to be built to match. Nothing is deleted: the
// frontend's old "remove" is POST /expense-categories/{id}/deactivate (handoff 9: "deactivate, never delete").

export type CreateExpenseCategoryBody = ProposedSchemas["CreateExpenseCategoryDto"]
export type UpdateExpenseCategoryBody = ProposedSchemas["UpdateExpenseCategoryDto"]

export function parseExpenseCategory(raw: unknown): ExpenseCategoryRecord {
  const o = asObj(raw, "expense category")
  return { id: reqUlid(o, "id", "expense category"), name: reqStr(o, "name", "expense category"), active: reqBool(o, "active", "expense category"), createdAt: reqStr(o, "createdAt", "expense category") }
}

export function parseExpenseCategoryList(raw: unknown): ListResult<ExpenseCategoryRecord> {
  return parsePage(raw, "expense categories", parseExpenseCategory)
}

export function expenseCategoryListQuery(opts: ExpenseCategoryListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, active: opts.active }
}

/** The name, trimmed, 2 to 80 characters (the same for POST and PATCH). */
export function expenseCategoryPayload(input: { name: string }): CreateExpenseCategoryBody & UpdateExpenseCategoryBody {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) throw new RangeError("The category name needs 2 to 80 characters.")
  return { name }
}

export const httpExpenseCategoriesService: ExpenseCategoriesService = {
  async list(opts = {}) {
    return parseExpenseCategoryList(await callEndpoint<unknown>("expenseCategories.list", { query: () => expenseCategoryListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("expenseCategories.create", { body: () => expenseCategoryPayload(input) }, parseExpenseCategory, "expense category")
  },
  async update(id, input) {
    return createAndParse("expenseCategories.update", { params: { id }, body: () => expenseCategoryPayload(input) }, (raw) => parseExpenseCategory(raw), "change")
  },
  async remove(id) {
    // "remove" is deactivate: the handoff never deletes
    await callEndpoint<unknown>("expenseCategories.remove", { params: { id } })
  },
  async setActive(id, active) {
    return createAndParse(active ? "expenseCategories.reactivate" : "expenseCategories.remove", { params: { id } }, (raw) => parseExpenseCategory(raw), "change")
  },
}
