import type { BankTransactionsService, ConsultationInvoicesService, ExpensesService, PaymentsService, ReceiptsService, ServicesInvoicesService } from "../types"
import { callEndpoint } from "./call"
import {
  bankStatementQuery, bankTransactionPayload, consultationInvoiceListQuery, consultationInvoicePayload,
  expenseListQuery, expensePayload, expenseTotalsQuery,
  parseBankStatement, parseBankTransaction, parseConsultationInvoice, parseConsultationInvoiceList, parseExpense,
  parseExpenseList, parseExpenseTotals, parsePayment, parsePaymentList, parseReceipt, parseReceiptList,
  parseServicesInvoice, parseServicesInvoiceList, paymentListQuery, paymentPayload, receiptListQuery, receiptPayload, servicesInvoiceListQuery,
  servicesInvoicePayload,
} from "./mappers"

/**
 * Real-backend Billing / Expenses / Bank services. Inert — no request is sent — until every endpoint a call needs is set in
 * ENDPOINTS and its mapper in mappers.ts is implemented from the OpenAPI spec. Nothing here imports demo data.
 */

const billingQuery = (opts: { search?: string; patientId?: string; page?: number; pageSize?: number }) => ({
  search: opts.search?.trim() || undefined, patientId: opts.patientId, page: opts.page, pageSize: opts.pageSize,
})

export const httpConsultationInvoicesService: ConsultationInvoicesService = {
  async list(opts = {}) {
    return parseConsultationInvoiceList(
      await callEndpoint<unknown>("consultationInvoices.list", { query: () => consultationInvoiceListQuery(billingQuery(opts)), signal: opts.signal })
    )
  },
  async create(input) {
    return parseConsultationInvoice(await callEndpoint<unknown>("consultationInvoices.create", { body: () => consultationInvoicePayload(input) }))
  },
}

export const httpServicesInvoicesService: ServicesInvoicesService = {
  async list(opts = {}) {
    return parseServicesInvoiceList(
      await callEndpoint<unknown>("servicesInvoices.list", { query: () => servicesInvoiceListQuery(billingQuery(opts)), signal: opts.signal })
    )
  },
  async create(input) {
    return parseServicesInvoice(await callEndpoint<unknown>("servicesInvoices.create", { body: () => servicesInvoicePayload(input) }))
  },
}

export const httpPaymentsService: PaymentsService = {
  async list(opts = {}) {
    return parsePaymentList(await callEndpoint<unknown>("payments.list", { query: () => paymentListQuery(billingQuery(opts)), signal: opts.signal }))
  },
  async create(input) {
    return parsePayment(await callEndpoint<unknown>("payments.create", { body: () => paymentPayload(input) }))
  },
}

export const httpReceiptsService: ReceiptsService = {
  async list(opts = {}) {
    return parseReceiptList(await callEndpoint<unknown>("receipts.list", { query: () => receiptListQuery(billingQuery(opts)), signal: opts.signal }))
  },
  async create(input) {
    return parseReceipt(await callEndpoint<unknown>("receipts.create", { body: () => receiptPayload(input) }))
  },
}

const listQuery = (opts: { search?: string; page?: number; pageSize?: number }) => ({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize })


export const httpExpensesService: ExpensesService = {
  async list(opts = {}) {
    return parseExpenseList(await callEndpoint<unknown>("expenses.list", { query: () => expenseListQuery(listQuery(opts)), signal: opts.signal }))
  },
  async create(input) {
    return parseExpense(await callEndpoint<unknown>("expenses.create", { body: () => expensePayload(input) }))
  },
  async totals(opts = {}) {
    return parseExpenseTotals(
      await callEndpoint<unknown>("expenses.totals", { query: () => expenseTotalsQuery({ dateFrom: opts.dateFrom, dateTo: opts.dateTo }), signal: opts.signal })
    )
  },
}


export const httpBankTransactionsService: BankTransactionsService = {
  async statement(opts = {}) {
    return parseBankStatement(await callEndpoint<unknown>("bankTransactions.statement", { query: () => bankStatementQuery(listQuery(opts)), signal: opts.signal }))
  },
  async create(input) {
    return parseBankTransaction(await callEndpoint<unknown>("bankTransactions.create", { body: () => bankTransactionPayload(input) }))
  },
}
