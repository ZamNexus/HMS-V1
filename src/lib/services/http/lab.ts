import type { EcgUltrasoundTestsService, LabOrdersService, LabTestsService } from "../types"
import { callEndpoint } from "./call"
import {
  ecgTestListQuery, ecgTestPayload, labOrderListQuery, labOrderPayload, labResultsPayload, labTestListQuery, labTestPayload,
  labTransitionPayload, parseEcgTest, parseEcgTestList, parseLabOrder, parseLabOrderList, parseLabTest, parseLabTestList,
} from "./mappers"

/**
 * Real-backend Laboratory services (T1 catalog, T2 orders). Inert — no request is sent — until every endpoint a call
 * needs is set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */
export const httpLabTestsService: LabTestsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("labTests.list", {
      query: () => labTestListQuery({ search: opts.search?.trim() || undefined, category: opts.category, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseLabTestList(raw)
  },
  async create(input) {
    return parseLabTest(await callEndpoint<unknown>("labTests.create", { body: () => labTestPayload(input) }))
  },
  async update(id, input) {
    return parseLabTest(await callEndpoint<unknown>("labTests.update", { params: { id }, body: () => labTestPayload(input) }))
  },
}

export const httpEcgUltrasoundTestsService: EcgUltrasoundTestsService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("ecgTests.list", {
      query: () => ecgTestListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseEcgTestList(raw)
  },
  async create(input) {
    return parseEcgTest(await callEndpoint<unknown>("ecgTests.create", { body: () => ecgTestPayload(input) }))
  },
  async update(id, input) {
    return parseEcgTest(await callEndpoint<unknown>("ecgTests.update", { params: { id }, body: () => ecgTestPayload(input) }))
  },
}

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
