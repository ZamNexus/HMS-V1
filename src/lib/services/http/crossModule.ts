import { NotConnectedError } from "../errors"
import type { BillSummaryService, ItemHistoryService, NotificationsService, ServiceUsageService } from "../types"
import { callEndpoint } from "./call"
import { itemHistoryQuery, parseBillSummary, parseItemHistory, reportQuery } from "./mappers"

/**
 * Real-backend Item History (T12), bill summary (patient / encounter balance panels) and notifications. Inert — no request is sent —
 * until every endpoint a call needs is set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec. Nothing
 * here imports demo data or a mock adapter.
 */

export const httpItemHistoryService: ItemHistoryService = {
  async list(query) {
    return parseItemHistory(await callEndpoint<unknown>("itemHistory.list", { query: () => itemHistoryQuery(query), signal: query.signal }))
  },
}

// Invoice usage of a catalogue service is a mock-only demo view (see ServiceUsageEntry): no document describes it, so there is no endpoint
// key or mapper. It must never stand in for the audit log above.
export const httpServiceUsageService: ServiceUsageService = {
  async list() {
    throw new NotConnectedError("service invoice usage (contract not confirmed)")
  },
}

export const httpBillSummaryService: BillSummaryService = {
  async forPatient(patientId, opts = {}) {
    return parseBillSummary(await callEndpoint<unknown>("billSummary.patient", { params: { id: patientId }, query: () => reportQuery("billSummary.patient"), signal: opts.signal }))
  },
  async forEncounter(encounterId, opts = {}) {
    return parseBillSummary(await callEndpoint<unknown>("billSummary.encounter", { params: { id: encounterId }, query: () => reportQuery("billSummary.encounter"), signal: opts.signal }))
  },
}

// Notifications have NO confirmed backend contract (no document mentions a notification feed), so there is deliberately no endpoint key
// or mapper: this reports "awaiting the backend contract" without any request. Add a key + mapper only when the OpenAPI spec defines one.
export const httpNotificationsService: NotificationsService = {
  async list() {
    throw new NotConnectedError("notifications (contract not confirmed)")
  },
}
