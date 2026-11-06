import type { ListOptions, ReportsService, ServiceCatalogService } from "../types"
import { callEndpoint } from "./call"
import {
  parseAccountsPaymentsReport, parseAccountsReceiptsReport, parseDailySummaryReport, parseDailyTransactionsReport, parseDemographicsReport, parseExpenseTrend,
  parseLabReport, parseOpdStatisticsReport, parseOrganisationBalancesReport, parsePatientAccountSummaryReport, parsePatientBalancesReport, parsePharmacyReport,
  parsePrescriptionHistoryReport, parseRevenueReport, parseServiceCatalogList, parseServiceCatalogRecord, reportQuery, serviceCatalogBody,
} from "./mappers"

/**
 * Real-backend report services (T8 / T9 and the "already covered" reports). Inert — no request is sent — until every endpoint a call
 * needs is set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec. Nothing here imports demo data.
 */

const listParams = (opts: ListOptions) => ({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize })

export const httpReportsService: ReportsService = {
  async dailySummary(opts = {}) {
    return parseDailySummaryReport(await callEndpoint<unknown>("reports.dailySummary", { query: () => reportQuery("reports.dailySummary"), signal: opts.signal }))
  },
  async dailyTransactions(filter) {
    const { signal, ...params } = filter
    return parseDailyTransactionsReport(await callEndpoint<unknown>("reports.dailyTransactions", { query: () => reportQuery("reports.dailyTransactions", params), signal }))
  },
  async opdStatistics(opts = {}) {
    return parseOpdStatisticsReport(await callEndpoint<unknown>("reports.opdStatistics", { query: () => reportQuery("reports.opdStatistics"), signal: opts.signal }))
  },
  async revenue(opts = {}) {
    return parseRevenueReport(await callEndpoint<unknown>("reports.revenue", { query: () => reportQuery("reports.revenue"), signal: opts.signal }))
  },
  async laboratory(opts = {}) {
    return parseLabReport(await callEndpoint<unknown>("reports.laboratory", { query: () => reportQuery("reports.laboratory"), signal: opts.signal }))
  },
  async pharmacy(opts = {}) {
    return parsePharmacyReport(await callEndpoint<unknown>("reports.pharmacy", { query: () => reportQuery("reports.pharmacy"), signal: opts.signal }))
  },
  async expenseTrend(opts = {}) {
    return parseExpenseTrend(await callEndpoint<unknown>("reports.expenseTrend", { query: () => reportQuery("reports.expenseTrend"), signal: opts.signal }))
  },
  async demographics(opts = {}) {
    return parseDemographicsReport(await callEndpoint<unknown>("reports.demographics", { query: () => reportQuery("reports.demographics"), signal: opts.signal }))
  },
  async patientBalances(opts = {}) {
    return parsePatientBalancesReport(await callEndpoint<unknown>("reports.patientBalances", { query: () => reportQuery("reports.patientBalances"), signal: opts.signal }))
  },
  async organisationBalances(opts = {}) {
    return parseOrganisationBalancesReport(await callEndpoint<unknown>("reports.organisationBalances", { query: () => reportQuery("reports.organisationBalances"), signal: opts.signal }))
  },
  async patientAccountSummary(opts = {}) {
    return parsePatientAccountSummaryReport(await callEndpoint<unknown>("reports.patientAccountSummary", { query: () => reportQuery("reports.patientAccountSummary"), signal: opts.signal }))
  },
  async accountsPayments(opts = {}) {
    return parseAccountsPaymentsReport(await callEndpoint<unknown>("reports.accountsPayments", { query: () => reportQuery("reports.accountsPayments", listParams(opts)), signal: opts.signal }))
  },
  async accountsReceipts(opts = {}) {
    return parseAccountsReceiptsReport(await callEndpoint<unknown>("reports.accountsReceipts", { query: () => reportQuery("reports.accountsReceipts", listParams(opts)), signal: opts.signal }))
  },
  async prescriptionHistory(opts = {}) {
    return parsePrescriptionHistoryReport(await callEndpoint<unknown>("reports.prescriptionHistory", { query: () => reportQuery("reports.prescriptionHistory", listParams(opts)), signal: opts.signal }))
  },
}

export const httpServiceCatalogService: ServiceCatalogService = {
  async list(opts = {}) {
    return parseServiceCatalogList(await callEndpoint<unknown>("serviceCatalog.list", { query: () => reportQuery("serviceCatalog.list", { ...listParams(opts), category: opts.category }), signal: opts.signal }))
  },
  async create(input) {
    return parseServiceCatalogRecord(await callEndpoint<unknown>("serviceCatalog.create", { body: () => serviceCatalogBody(input) }))
  },
  async update(id, input) {
    return parseServiceCatalogRecord(await callEndpoint<unknown>("serviceCatalog.update", { params: { id }, body: () => serviceCatalogBody(input) }))
  },
}
