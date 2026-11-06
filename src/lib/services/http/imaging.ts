import type { ImagingOrdersService } from "../types"
import { callEndpoint } from "./call"
import {
  imagingOrderListQuery, imagingOrderPayload, imagingReportPayload, imagingTransitionPayload, parseImagingOrder, parseImagingOrderList,
} from "./mappers"

/**
 * Real-backend Imaging service (T3). Inert — no request is sent — until every endpoint a call needs is set in
 * ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */
export const httpImagingOrdersService: ImagingOrdersService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("imagingOrders.list", {
      query: () =>
        imagingOrderListQuery({ search: opts.search?.trim() || undefined, status: opts.status, patientId: opts.patientId, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseImagingOrderList(raw)
  },
  async get(id, signal) {
    return parseImagingOrder(await callEndpoint<unknown>("imagingOrders.get", { params: { id }, signal }))
  },
  async create(input) {
    return parseImagingOrder(await callEndpoint<unknown>("imagingOrders.create", { body: () => imagingOrderPayload(input) }))
  },
  async transition(id, to) {
    return parseImagingOrder(await callEndpoint<unknown>("imagingOrders.transition", { params: { id }, body: () => imagingTransitionPayload(to) }))
  },
  async enterReport(id, input) {
    return parseImagingOrder(await callEndpoint<unknown>("imagingOrders.enterReport", { params: { id }, body: () => imagingReportPayload(input) }))
  },
}
