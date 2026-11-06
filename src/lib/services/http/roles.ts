import { NotConnectedError } from "../errors"
import type { RolesService } from "../types"

/**
 * Real-backend roles source. The provided documentation describes no roles listing, so there is
 * no endpoint or mapper: this reports "awaiting contract" and the role picker shows that
 * instead of inventing roles. Add an endpoint key + mapper only if the OpenAPI spec defines one.
 */
export const httpRolesService: RolesService = {
  async list() {
    throw new NotConnectedError("role options (not covered by the provided API documentation)")
  },
}
