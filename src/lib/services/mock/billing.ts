import { NotConnectedError } from "../errors"
import type { BillingService } from "../types"

// The demo has no invoices, accounts or payments of this shape (its billing screens keep their own prototype records), so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own billing screens)`) }

export const mockBillingService: BillingService = {
  createInvoice: none("invoices"), addCharges: none("charges"), discountInvoice: none("discounts"), voidInvoice: none("voiding an invoice"), voidCharge: none("voiding a charge"),
  recordPayment: none("payments"), recordAdvance: none("advances"), applyCredit: none("applying credit"), refund: none("refunds"), creditNote: none("credit notes"), getReceipt: none("receipts"),
  listPayments: none("the payments register"), listCharges: none("the charges register"),
  listInvoices: none("invoices"), getInvoice: none("invoices"), invoiceForEncounter: none("the visit's bill"), patientAccount: none("the patient's account"), panelAccount: none("the panel's account"),
}
