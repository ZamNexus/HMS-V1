import type { DispensingService, MedicinesService } from "../types"
import { callEndpoint } from "./call"
import {
  dispenseListQuery, dispensePayload, medicineListQuery, medicinePayload, parseDispense, parseDispenseList, parseMedicine, parseMedicineList,
  stockAdjustmentPayload,
} from "./mappers"

/**
 * Real-backend Pharmacy services (T4 inventory, T5 dispensing). Inert — no request is sent — until every endpoint a call
 * needs is set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec.
 */
export const httpMedicinesService: MedicinesService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("medicines.list", {
      query: () => medicineListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseMedicineList(raw)
  },
  async create(input) {
    return parseMedicine(await callEndpoint<unknown>("medicines.create", { body: () => medicinePayload(input) }))
  },
  async update(id, input) {
    return parseMedicine(await callEndpoint<unknown>("medicines.update", { params: { id }, body: () => medicinePayload(input) }))
  },
  async adjustStock(id, input) {
    return parseMedicine(await callEndpoint<unknown>("medicines.adjustStock", { params: { id }, body: () => stockAdjustmentPayload(input) }))
  },
}

export const httpDispensingService: DispensingService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("dispensing.list", {
      query: () => dispenseListQuery({ search: opts.search?.trim() || undefined, patientId: opts.patientId, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseDispenseList(raw)
  },
  async create(input) {
    return parseDispense(await callEndpoint<unknown>("dispensing.create", { body: () => dispensePayload(input) }))
  },
}
