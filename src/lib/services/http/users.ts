import { NotConnectedError } from "../errors"
import type { UsersService } from "../types"
import { callEndpoint } from "./call"
import { parseUser, parseUserList, userActivePayload, userListQuery, userPayload } from "./mappers"

/** Real-backend Users service. Inert until ENDPOINTS and mappers.ts are filled in from the OpenAPI spec. */
export const httpUsersService: UsersService = {
  async list(opts = {}) {
    const raw = await callEndpoint<unknown>("users.list", {
      query: () => userListQuery({ search: opts.search?.trim() || undefined, page: opts.page, pageSize: opts.pageSize }),
      signal: opts.signal,
    })
    return parseUserList(raw)
  },

  async create(input) {
    const raw = await callEndpoint<unknown>("users.create", { body: () => userPayload(input) })
    return parseUser(raw)
  },

  async update(id, input) {
    const raw = await callEndpoint<unknown>("users.update", { params: { id }, body: () => userPayload(input) })
    return parseUser(raw)
  },

  async setActive(id, active) {
    const raw = await callEndpoint<unknown>("users.setActive", { params: { id }, body: () => userActivePayload(active) })
    return parseUser(raw)
  },

  async sendPasswordReset() {
    // No endpoint key on purpose: password reset is not covered by the provided documentation.
    throw new NotConnectedError("password reset (not covered by the provided API documentation)")
  },
}
