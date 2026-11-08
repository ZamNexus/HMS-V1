import type { QueryParams } from "@/lib/api/client"
import type { ProposedSchemas } from "@/lib/api/contract"
import { NotConnectedError } from "../errors"
import type { BankAccountInput, BankAccountListOptions, BankAccountPatch, BankAccountRecord, BankAccountsService, ListResult } from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optStr, pageQuery, parsePage, reqBool, reqStr, reqUlid } from "./wire"

// Bank accounts (chunk S13). The handoff (8.2, 9) gives the routes, the permissions (GET needs accounts.read, changes need catalogs.write) and the
// create body { bankName, accountTitle, accountNo, branch? }; the remaining fields are the PROPOSED contract in docs/openapi.draft.json and
// docs/BACKEND_CONTRACT_PROPOSED.md (section 2), which the backend is to be built to match.

export type CreateBankAccountBody = ProposedSchemas["CreateBankAccountDto"]
export type UpdateBankAccountBody = ProposedSchemas["UpdateBankAccountDto"]

const ACCOUNT_NO_RE = /^[A-Za-z0-9][A-Za-z0-9 -]*$/

export function parseBankAccount(raw: unknown): BankAccountRecord {
  const o = asObj(raw, "bank account")
  return {
    id: reqUlid(o, "id", "bank account"),
    bankName: reqStr(o, "bankName", "bank account"),
    accountTitle: reqStr(o, "accountTitle", "bank account"),
    accountNo: reqStr(o, "accountNo", "bank account"),
    branch: optStr(o, "branch", "bank account") ?? "",
    active: reqBool(o, "active", "bank account"),
  }
}

export function parseBankAccountList(raw: unknown): ListResult<BankAccountRecord> {
  return parsePage(raw, "bank accounts", parseBankAccount)
}

export function bankAccountListQuery(opts: BankAccountListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, active: opts.active }
}

function text(label: string, value: string, min: number, max: number): string {
  const v = value.trim()
  if (v.length < min || v.length > max) throw new RangeError(`${label} needs ${min} to ${max} characters.`)
  return v
}
function accountNo(value: string): string {
  const v = text("The account number", value, 4, 34)
  if (!ACCOUNT_NO_RE.test(v)) throw new RangeError("The account number can hold letters, digits, spaces and hyphens only.")
  return v
}

/** POST /bank-accounts. The API creates accounts active; an inactive create is a separate deactivate call. */
export function bankAccountCreatePayload(input: BankAccountInput): CreateBankAccountBody {
  if (input.active === false) throw new NotConnectedError("creating an inactive bank account (the API creates accounts active; deactivate is a separate call)")
  const body: CreateBankAccountBody = { bankName: text("The bank name", input.bankName, 2, 80), accountTitle: text("The account title", input.accountTitle, 2, 120), accountNo: accountNo(input.accountNo) }
  if (input.branch.trim()) body.branch = text("The branch", input.branch, 1, 120)
  return body
}

/** PATCH /bank-accounts/{id}: ONLY the fields in `patch`; an emptied branch is sent as null (clears it). */
export function bankAccountUpdatePayload(patch: BankAccountPatch): UpdateBankAccountBody {
  const body: UpdateBankAccountBody = {}
  if (patch.bankName !== undefined) body.bankName = text("The bank name", patch.bankName, 2, 80)
  if (patch.accountTitle !== undefined) body.accountTitle = text("The account title", patch.accountTitle, 2, 120)
  if (patch.accountNo !== undefined) body.accountNo = accountNo(patch.accountNo)
  if (patch.branch !== undefined) body.branch = patch.branch.trim() === "" ? null : text("The branch", patch.branch, 1, 120)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

export const httpBankAccountsService: BankAccountsService = {
  async list(opts = {}) {
    return parseBankAccountList(await callEndpoint<unknown>("bankAccounts.list", { query: () => bankAccountListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("bankAccounts.create", { body: () => bankAccountCreatePayload(input) }, parseBankAccount, "bank account")
  },
  async update(id, input) {
    return httpBankAccountsService.patch(id, { bankName: input.bankName, accountTitle: input.accountTitle, accountNo: input.accountNo, branch: input.branch })
  },
  async patch(id, patch) {
    return createAndParse("bankAccounts.update", { params: { id }, body: () => bankAccountUpdatePayload(patch) }, (raw) => parseBankAccount(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "bankAccounts.reactivate" : "bankAccounts.deactivate", { params: { id } }, (raw) => parseBankAccount(raw), "change")
  },
}
