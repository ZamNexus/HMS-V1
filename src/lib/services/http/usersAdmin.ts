import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import {
  API_USER_ROLES, type DoctorProfileInput, type DoctorProfileRecord, type ListResult, type UserAdminListOptions, type UserAdminRecord, type UserAdminService, type UserCreateInput, type UserCreated,
  type DoctorProfilePatch, type UserPatch,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { decimalText, moneyText } from "./serviceCatalog"
import { asObj, optDecimalString, optStr, pageQuery, parsePage, reqBool, reqStr, reqUlid } from "./wire"

// Staff users (chunk S9), connected to docs/openapi.json: GET/POST /users, PATCH /users/{id}, POST .../deactivate | reactivate | reset-password |
// sign-out-everywhere. The API GENERATES a temporary password (create and reset return it once; nothing here stores or logs it). A user of role
// "doctor" carries a doctor profile. Optional text clears with null on PATCH.

export type CreateUserBody = Schemas["CreateUserDto"]
export type UpdateUserBody = Schemas["UpdateUserDto"]
export type UpdateDoctorProfileBody = Schemas["UpdateDoctorProfileDto"]

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KNOWN_ROLES = [...API_USER_ROLES, "super_admin"] as readonly string[]

function parseDoctorProfile(raw: unknown, dto: string): DoctorProfileRecord | null {
  if (raw === null || raw === undefined) return null
  const o = asObj(raw, "doctor profile")
  const fee = optDecimalString(o, "consultationFee", "doctor profile", dto)
  if (fee === undefined) throw new TypeError("Unexpected response: doctor profile.consultationFee is missing.")
  const commission = optDecimalString(o, "commissionPct", "doctor profile", dto)
  return {
    specialization: optStr(o, "specialization", "doctor profile", dto) ?? "",
    qualifications: optStr(o, "qualifications", "doctor profile", dto) ?? "",
    pmcRegNo: optStr(o, "pmcRegNo", "doctor profile", dto) ?? "",
    consultationFee: fee,
    commissionPct: commission === undefined ? null : Number(commission),
    photoUrl: optStr(o, "photoUrl", "doctor profile", dto) ?? null,
    notes: optStr(o, "notes", "doctor profile", dto) ?? "",
  }
}

export function parseUserAdmin(raw: unknown, dto = "UserResponseDto_Output"): UserAdminRecord {
  const o = asObj(raw, "user")
  const role = reqStr(o, "role", "user")
  if (!KNOWN_ROLES.includes(role)) throw new TypeError("Unexpected response: user.role is not one of the documented roles.")
  return {
    id: reqUlid(o, "id", "user"),
    username: reqStr(o, "username", "user"),
    email: optStr(o, "email", "user", dto) ?? null,
    name: reqStr(o, "name", "user"),
    phone: optStr(o, "phone", "user", dto) ?? null,
    cnic: optStr(o, "cnic", "user", dto) ?? null,
    address: optStr(o, "address", "user", dto) ?? null,
    city: optStr(o, "city", "user", dto) ?? null,
    joiningDate: optStr(o, "joiningDate", "user", dto) ?? null,
    role,
    active: reqBool(o, "active", "user"),
    mustChangePassword: reqBool(o, "mustChangePassword", "user"),
    locked: reqBool(o, "locked", "user"),
    lastLoginAt: optStr(o, "lastLoginAt", "user", dto) ?? null,
    createdAt: reqStr(o, "createdAt", "user"),
    doctorProfile: parseDoctorProfile(o.doctorProfile, dto),
  }
}

export function parseUserAdminPage(raw: unknown): ListResult<UserAdminRecord> {
  return parsePage(raw, "users", (item) => parseUserAdmin(item, "UserPageDto_Output"))
}

/** POST /users answer: the user and the temporary password. The password is returned to the caller only. */
export function parseUserCreated(raw: unknown): UserCreated {
  const o = asObj(raw, "created user")
  const temporaryPassword = reqStr(o, "temporaryPassword", "created user")
  if (temporaryPassword === "") throw new TypeError("Unexpected response: created user.temporaryPassword is empty.")
  return { user: parseUserAdmin(o.user, "UserWithTemporaryPasswordDto_Output"), temporaryPassword }
}

export function userListQuery(opts: UserAdminListOptions): QueryParams {
  return { ...pageQuery(opts.page, opts.pageSize), search: opts.search?.trim() || undefined, role: opts.role || undefined, active: opts.active }
}

function checkUsername(u: string): string {
  const v = u.trim().toLowerCase()
  if (!USERNAME_RE.test(v)) throw new RangeError("Username: 3 to 32 characters, lower-case letters, digits and . _ - only.")
  return v
}
function checkRole(role: string): CreateUserBody["role"] {
  if (!(API_USER_ROLES as readonly string[]).includes(role)) throw new RangeError("Choose a role.")
  return role as CreateUserBody["role"]
}
function checkName(name: string): string {
  const v = name.trim()
  if (v.length < 2 || v.length > 120) throw new RangeError("Name needs 2 to 120 characters.")
  return v
}
function checkEmail(email: string): string {
  const v = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new RangeError("Enter a valid email address.")
  return v
}
function checkDate(d: string): string {
  const v = d.trim()
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new RangeError("Joining date must be a date (YYYY-MM-DD).")
  return v
}
function maxLen(label: string, value: string, max: number): string {
  const v = value.trim()
  if (v.length > max) throw new RangeError(`${label} can be at most ${max} characters.`)
  return v
}

export function doctorProfilePayload(p: DoctorProfileInput): NonNullable<CreateUserBody["doctorProfile"]> {
  const out: NonNullable<CreateUserBody["doctorProfile"]> = { consultationFee: moneyText(p.consultationFee, "Consultation fee") }
  if (p.specialization?.trim()) out.specialization = maxLen("Specialization", p.specialization, 120)
  if (p.qualifications?.trim()) out.qualifications = maxLen("Qualifications", p.qualifications, 300)
  if (p.pmcRegNo?.trim()) out.pmcRegNo = maxLen("PMC registration number", p.pmcRegNo, 40)
  if (p.commissionPct !== undefined) out.commissionPct = decimalText(p.commissionPct, "Commission")
  if (p.notes?.trim()) out.notes = maxLen("Notes", p.notes, 1000)
  return out
}

/** PATCH /users/{id}/doctor-profile: ONLY the fields in `patch` (a cleared text box is sent as ""; the fee and commission as exact decimal strings). */
export function doctorProfileUpdatePayload(p: DoctorProfilePatch): UpdateDoctorProfileBody {
  const body: UpdateDoctorProfileBody = {}
  if (p.specialization !== undefined) body.specialization = maxLen("Specialization", p.specialization, 120)
  if (p.qualifications !== undefined) body.qualifications = maxLen("Qualifications", p.qualifications, 300)
  if (p.pmcRegNo !== undefined) body.pmcRegNo = maxLen("PMC registration number", p.pmcRegNo, 40)
  if (p.consultationFee !== undefined) body.consultationFee = moneyText(p.consultationFee, "Consultation fee")
  if (p.commissionPct !== undefined) body.commissionPct = decimalText(p.commissionPct, "Commission")
  if (p.notes !== undefined) body.notes = maxLen("Notes", p.notes, 1000)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body
}

/** POST /users. No password: the server generates a temporary one. A doctor needs a profile (with a fee). */
export function userCreatePayload(input: UserCreateInput): CreateUserBody {
  const body: CreateUserBody = { username: checkUsername(input.username), role: checkRole(input.role), name: checkName(input.name) }
  if (input.email?.trim()) body.email = checkEmail(input.email)
  if (input.phone?.trim()) body.phone = maxLen("Phone", input.phone, 30)
  if (input.cnic?.trim()) body.cnic = maxLen("CNIC", input.cnic, 20)
  if (input.address?.trim()) body.address = maxLen("Address", input.address, 300)
  if (input.city?.trim()) body.city = maxLen("City", input.city, 80)
  if (input.joiningDate?.trim()) body.joiningDate = checkDate(input.joiningDate)
  if (input.role === "doctor" && !input.doctorProfile) throw new RangeError("A doctor needs a doctor profile with a consultation fee.")
  if (input.doctorProfile) {
    if (input.role !== "doctor") throw new RangeError("Only a doctor has a doctor profile.")
    body.doctorProfile = doctorProfilePayload(input.doctorProfile)
  }
  return body
}

/** PATCH /users/{id}: ONLY the fields in `patch`; `null` clears an optional field. */
export function userUpdatePayload(patch: UserPatch): UpdateUserBody {
  const body: Record<string, unknown> = {}
  if (patch.username !== undefined) body.username = checkUsername(patch.username)
  if (patch.role !== undefined) body.role = checkRole(patch.role)
  if (patch.name !== undefined) body.name = checkName(patch.name)
  const optionalText = { phone: 30, cnic: 20, address: 300, city: 80 } as const
  for (const k of Object.keys(optionalText) as (keyof typeof optionalText)[]) {
    const v = patch[k]
    if (v === undefined) continue
    body[k] = v === null || v.trim() === "" ? null : maxLen(k, v, optionalText[k])
  }
  if (patch.email !== undefined) body.email = patch.email === null || patch.email.trim() === "" ? null : checkEmail(patch.email)
  if (patch.joiningDate !== undefined) body.joiningDate = patch.joiningDate === null || patch.joiningDate.trim() === "" ? null : checkDate(patch.joiningDate)
  if (patch.doctorProfile !== undefined) body.doctorProfile = doctorProfilePayload(patch.doctorProfile)
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to update.")
  return body as UpdateUserBody
}

export const httpUserAdminService: UserAdminService = {
  async list(opts = {}) {
    return parseUserAdminPage(await callEndpoint<unknown>("usersAdmin.list", { query: () => userListQuery(opts), signal: opts.signal }))
  },
  async create(input) {
    return createAndParse("usersAdmin.create", { body: () => userCreatePayload(input) }, parseUserCreated, "user")
  },
  async update(id, patch) {
    return createAndParse("usersAdmin.update", { params: { id }, body: () => userUpdatePayload(patch) }, (raw) => parseUserAdmin(raw), "change")
  },
  async updateDoctorProfile(id, patch) {
    return createAndParse("usersAdmin.doctorProfile", { params: { id }, body: () => doctorProfileUpdatePayload(patch) }, (raw) => parseUserAdmin(raw), "change")
  },
  async setActive(id, active) {
    return createAndParse(active ? "usersAdmin.reactivate" : "usersAdmin.deactivate", { params: { id } }, (raw) => parseUserAdmin(raw), "change")
  },
  async resetPassword(id) {
    const o = asObj(await callEndpoint<unknown>("usersAdmin.resetPassword", { params: { id } }), "temporary password")
    const temporaryPassword = reqStr(o, "temporaryPassword", "temporary password")
    if (temporaryPassword === "") throw new TypeError("Unexpected response: temporary password is empty.")
    return temporaryPassword
  },
  async signOutEverywhere(id) {
    await callEndpoint<unknown>("usersAdmin.signOutEverywhere", { params: { id } })
  },
}
