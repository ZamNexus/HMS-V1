import { NotConnectedError } from "../errors"
import type { AccountsApiService } from "../types"

// The demo keeps the prototype's own expense and bank screens (mock/finance.ts); this API-shaped service has no demo data, so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own screens)`) }

export const mockAccountsApiService: AccountsApiService = {
  listExpenses: none("expenses"), getExpense: none("expenses"), createExpense: none("expenses"), updateExpense: none("expenses"), voidExpense: none("expenses"),
  bankBalances: none("bank balances"), bankStatement: none("the bank statement"), createBankTransaction: none("bank entries"), getBankTransaction: none("bank entries"), voidBankTransaction: none("bank entries"),
  drawerOpening: none("the cash drawer"), setDrawerOpening: none("the cash drawer"),
}
