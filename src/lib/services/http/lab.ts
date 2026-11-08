import type { LabOrdersService } from "../types"
import { callEndpoint } from "./call"
import {
  labOrderListQuery, labOrderPayload, labResultsPayload,
  labTransitionPayload, parseLabOrder, parseLabOrderList,
} from "./mappers"

/**
 * Real-backend Laboratory services (T1 catalog, T2 orders). Inert — no request is sent — until every endpoint a call
 * needs is set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */


export const httpLabOrdersService: LabOrdersService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("labOrders.list", {
      query: () =>
        labOrderListQuery({ search: opts.search?.trim() || undefined, status: opts.status, patientId: opts.patientId, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseLabOrderList(raw)
  },
  async get(id, signal) {
    return parseLabOrder(await callEndpoint<unknown>("labOrders.get", { params: { id }, signal }))
  },
  async create(input) {
    return parseLabOrder(await callEndpoint<unknown>("labOrders.create", { body: () => labOrderPayload(input) }))
  },
  async transition(id, to) {
    return parseLabOrder(await callEndpoint<unknown>("labOrders.transition", { params: { id }, body: () => labTransitionPayload(to) }))
  },
  async enterResults(id, input) {
    return parseLabOrder(await callEndpoint<unknown>("labOrders.enterResults", { params: { id }, body: () => labResultsPayload(input) }))
  },
}
