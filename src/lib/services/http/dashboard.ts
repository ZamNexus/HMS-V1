import type { DashboardService, StatisticsService } from "../types"
import { callEndpoint } from "./call"
import {
  parseCashFlow, parseDailyCheckupRevenue, parseDashboardRevenueTrend, parseDashboardSummary, parseDashboardUpNext, parseDashboardVisits, parseStatisticsRecords,
  parseStatisticsSummary, reportQuery,
} from "./mappers"

/**
 * Real-backend Dashboard (T10) and Financial Statistics (T11) services. Inert — no request is sent — until every endpoint a call needs is
 * set in ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec. Nothing here imports demo data.
 */

export const httpDashboardService: DashboardService = {
  async summary(opts = {}) {
    return parseDashboardSummary(await callEndpoint<unknown>("dashboard.summary", { query: () => reportQuery("dashboard.summary"), signal: opts.signal }))
  },
  async weeklyVisits(opts = {}) {
    return parseDashboardVisits(await callEndpoint<unknown>("dashboard.weeklyVisits", { query: () => reportQuery("dashboard.weeklyVisits"), signal: opts.signal }))
  },
  async revenueTrend(opts = {}) {
    return parseDashboardRevenueTrend(await callEndpoint<unknown>("dashboard.revenueTrend", { query: () => reportQuery("dashboard.revenueTrend"), signal: opts.signal }))
  },
  async upNext(opts = {}) {
    return parseDashboardUpNext(await callEndpoint<unknown>("dashboard.upNext", { query: () => reportQuery("dashboard.upNext"), signal: opts.signal }))
  },
  async cashFlow(opts = {}) {
    return parseCashFlow(await callEndpoint<unknown>("dashboard.cashFlow", { query: () => reportQuery("dashboard.cashFlow"), signal: opts.signal }))
  },
}

export const httpStatisticsService: StatisticsService = {
  async summary(opts = {}) {
    return parseStatisticsSummary(await callEndpoint<unknown>("statistics.summary", { query: () => reportQuery("statistics.summary"), signal: opts.signal }))
  },
  async records(category, opts = {}) {
    return parseStatisticsRecords(await callEndpoint<unknown>("statistics.records", { query: () => reportQuery("statistics.records", { category }), signal: opts.signal }))
  },
  async dailyCheckupRevenue(opts = {}) {
    return parseDailyCheckupRevenue(await callEndpoint<unknown>("statistics.dailyCheckupRevenue", { query: () => reportQuery("statistics.dailyCheckupRevenue"), signal: opts.signal }))
  },
}
