import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { doctorProfilePayload, doctorProfileUpdatePayload, parseUserAdmin, parseUserAdminPage, parseUserCreated, userCreatePayload, userListQuery, userUpdatePayload } from "./http/usersAdmin"
import { schemaOf, validate } from "./http/specValidate"

const ID = "01HZX000000000000000000500"
const LENIENT = { lenientStringArrays: true }
const WIRE = {
  id: ID, username: "dr.khan", email: "khan@example.org", name: "Dr Khan", phone: null, cnic: null, address: null, city: "Lahore", joiningDate: "2024-03-01", role: "doctor", active: true,
  mustChangePassword: false, locked: false, lastLoginAt: "2026-11-06T09:30:00.000Z", createdAt: "2026-01-01T00:00:00.000Z",
  doctorProfile: { specialization: "Cardiology", qualifications: "MBBS", pmcRegNo: "12345-P", consultationFee: "1500.00", commissionPct: "30.00", photoUrl: null, notes: null },
}

describe("staff users admin (S9): reading", () => {
  it("reads a user with a doctor profile (the fee stays an exact string, nulls -> null/empty)", () => {
    const u = parseUserAdmin(WIRE)
    expect(u).toMatchObject({ id: ID, username: "dr.khan", email: "khan@example.org", phone: null, role: "doctor", active: true, locked: false, lastLoginAt: "2026-11-06T09:30:00.000Z" })
    expect(u.doctorProfile).toEqual({ specialization: "Cardiology", qualifications: "MBBS", pmcRegNo: "12345-P", consultationFee: "1500.00", commissionPct: 30, photoUrl: null, notes: "" })
    expect(parseUserAdmin({ ...WIRE, role: "receptionist", doctorProfile: null }).doctorProfile).toBeNull()
    expect(parseUserAdmin({ ...WIRE, role: "super_admin", doctorProfile: null }).role).toBe("super_admin")
  })
  it("refuses an unknown role, a bad id or a missing flag", () => {
    expect(() => parseUserAdmin({ ...WIRE, role: "janitor" })).toThrow(TypeError)
    expect(() => parseUserAdmin({ ...WIRE, id: "1" })).toThrow(TypeError)
    expect(() => parseUserAdmin({ ...WIRE, locked: undefined })).toThrow(TypeError)
  })
  it("reads a page, and a create answer = the user + the temporary password", () => {
    expect(parseUserAdminPage({ data: [WIRE], meta: { page: 1, perPage: 10, total: 23, totalPages: 3 } }).total).toBe(23)
    const created = parseUserCreated({ user: WIRE, temporaryPassword: "Tmp-1234-abcd" })
    expect(created.temporaryPassword).toBe("Tmp-1234-abcd")
    expect(created.user.username).toBe("dr.khan")
    expect(() => parseUserCreated({ user: WIRE })).toThrow(TypeError)
    expect(() => parseUserCreated({ user: WIRE, temporaryPassword: "" })).toThrow(TypeError)
  })
  it("list query: server-side paging, search, role, active; perPage at most 100", () => {
    expect(userListQuery({ page: 2, pageSize: 10, search: " khan ", role: "doctor", active: false })).toMatchObject({ page: 2, perPage: 10, search: "khan", role: "doctor", active: false })
    expect(() => userListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})

describe("staff users admin (S9): writing", () => {
  it("create body has NO password; a doctor carries a profile; matches CreateUserDto", () => {
    const body = userCreatePayload({ username: " Dr.Khan ", name: " Dr Khan ", role: "doctor", email: "khan@example.org", city: "Lahore", doctorProfile: { consultationFee: "1500", commissionPct: 30, specialization: "Cardiology" } })
    expect(body).toEqual({ username: "dr.khan", name: "Dr Khan", role: "doctor", email: "khan@example.org", city: "Lahore", doctorProfile: { consultationFee: "1500.00", commissionPct: "30.00", specialization: "Cardiology" } })
    expect("password" in body).toBe(false)
    expect(validate(body, schemaOf("CreateUserDto"), LENIENT)).toEqual([])
  })
  it("refuses before any request: bad username, unknown or platform role, a doctor without a profile, a profile on a non-doctor, bad email/date", () => {
    const ok = { username: "nurse.a", name: "Nurse A", role: "nurse" }
    expect(() => userCreatePayload({ ...ok, username: "A B" })).toThrow(RangeError)
    expect(() => userCreatePayload({ ...ok, role: "super_admin" })).toThrow(RangeError)
    expect(() => userCreatePayload({ ...ok, role: "doctor" })).toThrow(/doctor profile/)
    expect(() => userCreatePayload({ ...ok, doctorProfile: { consultationFee: "1" } })).toThrow(/Only a doctor/)
    expect(() => userCreatePayload({ ...ok, email: "nope" })).toThrow(RangeError)
    expect(() => userCreatePayload({ ...ok, joiningDate: "01/02/2024" })).toThrow(RangeError)
  })
  it("update body is ONLY the changed fields; null clears an optional field; matches UpdateUserDto", () => {
    const body = userUpdatePayload({ phone: "0300", city: null, role: "nurse", joiningDate: " " })
    expect(body).toEqual({ phone: "0300", city: null, role: "nurse", joiningDate: null })
    expect(validate(userUpdatePayload({ phone: "0300", role: "nurse" }), schemaOf("UpdateUserDto"), LENIENT)).toEqual([])
    expect(() => userUpdatePayload({})).toThrow(RangeError)
    expect(() => userUpdatePayload({ name: "x" })).toThrow(RangeError)
    expect(userUpdatePayload({ doctorProfile: { consultationFee: "2000" } })).toEqual({ doctorProfile: { consultationFee: "2000.00" } })
  })
  it("a doctor profile needs a fee with at most 2 decimals", () => {
    expect(() => doctorProfilePayload({ consultationFee: "1.234" })).toThrow(RangeError)
    expect(doctorProfilePayload({ consultationFee: "0" })).toEqual({ consultationFee: "0.00" })
  })
})

describe("doctor profile edit (S10): PATCH /users/{id}/doctor-profile (handoff 8.1 and 9)", () => {
  it("sends ONLY the changed fields as exact decimal strings and matches UpdateDoctorProfileDto", () => {
    const body = doctorProfileUpdatePayload({ consultationFee: "2500.5", commissionPct: 0, specialization: " " })
    expect(body).toEqual({ consultationFee: "2500.50", commissionPct: "0.00", specialization: "" })
    expect(validate(body, schemaOf("UpdateDoctorProfileDto"))).toEqual([])
    expect(() => doctorProfileUpdatePayload({})).toThrow(RangeError)
    expect(() => doctorProfileUpdatePayload({ consultationFee: "1.234" })).toThrow(RangeError)
    expect(() => doctorProfileUpdatePayload({ pmcRegNo: "x".repeat(41) })).toThrow(RangeError)
  })
  it("the user dialog sends an existing doctor's profile changes through that endpoint, never inside PATCH /users/{id}", () => {
    const src = readFileSync(join(__dirname, "../../components/admin/UsersAdmin.tsx"), "utf8")
    expect(src).toContain("userAdminService.updateDoctorProfile(")
    // the full profile is attached to PATCH /users/{id} only when the user has none yet (a role change to doctor)
    expect(src).toContain("if (profile && !current.doctorProfile) patch.doctorProfile = profile")
  })
})

describe("staff users admin (S9): the temporary password is never kept", () => {
  const source = readFileSync(join(__dirname, "../../components/admin/UsersAdmin.tsx"), "utf8")
  it("the screen never writes a password to storage, the URL, the query cache or a log", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/)
    expect(source).not.toMatch(/setQueryData|router\.(push|replace)|history\.(push|replace)State/)
  })
  it("the service layer never logs or caches it either", () => {
    const svc = readFileSync(join(__dirname, "http/usersAdmin.ts"), "utf8")
    expect(svc).not.toMatch(/console\.|localStorage|sessionStorage|setQueryData/)
  })
})
