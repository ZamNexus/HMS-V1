import { USERS, ROLE_LABELS } from "@/data/users"
import type { Role, User } from "@/types"
import { initials } from "@/lib/utils"
import type { RoleOption, RolesService, UserInput, UserRecord, UsersService } from "../types"
import { paginate } from "../listing"
import { mockApiError } from "./mockError"

// Mock adapters: back the screens with the in-memory demo arrays in src/data.
// They mutate those arrays in place, exactly as the screens used to. Selected
// only when NEXT_PUBLIC_HMS_DATA_SOURCE is not "api" (see ../index.ts).

function toRecord(u: User): UserRecord {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
    phone: u.phone,
    cnic: u.cnic,
    active: u.active !== false,
    lastLogin: u.lastLogin,
  }
}

function find(id: string): { idx: number; user: User } {
  const idx = USERS.findIndex((u) => String(u.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "User not found")
  return { idx, user: USERS[idx] }
}

function assertUniqueEmail(email: string, ignoreId?: number) {
  const dupe = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== ignoreId)
  if (dupe) {
    throw mockApiError(409, "CONFLICT", "Email already registered", [{ path: "email", message: "Email already registered" }])
  }
}

export const mockUsersService: UsersService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = USERS.filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABELS[u.role].toLowerCase().includes(q)
    )
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRecord), total: matches.length }
  },

  async create(input: UserInput) {
    assertUniqueEmail(input.email)
    if (!input.password) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "password", message: "Password is required" }])
    const user: User = {
      id: Math.max(0, ...USERS.map((u) => u.id)) + 1,
      name: input.name,
      email: input.email,
      password: input.password,
      role: input.role as Role,
      spec: null,
      fee: null,
      avatar: initials(input.name),
      phone: input.phone,
      cnic: input.cnic,
      active: input.active,
      lastLogin: "Never",
      joiningDate: new Date().toISOString().slice(0, 10),
    }
    USERS.push(user)
    return toRecord(user)
  },

  async update(id, input) {
    const { idx, user } = find(id)
    assertUniqueEmail(input.email, user.id)
    USERS[idx] = {
      ...user,
      name: input.name,
      email: input.email,
      role: input.role as Role,
      phone: input.phone,
      cnic: input.cnic,
      active: input.active,
      password: input.password || user.password,
    }
    return toRecord(USERS[idx])
  },

  async setActive(id, active) {
    const { idx, user } = find(id)
    USERS[idx] = { ...user, active }
    return toRecord(USERS[idx])
  },

  async sendPasswordReset(id) {
    find(id)
  },
}

export const mockRolesService: RolesService = {
  async list(): Promise<RoleOption[]> {
    return Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
  },
}
