import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { USERS } from "@/data/users"
import { DOCTORS } from "@/data/doctors"
import { ENDPOINTS, resolveEndpoint, type Endpoint, type EndpointKey } from "./endpoints"
import { NotConnectedError, errorSummary } from "./errors"
import { callEndpoint } from "./http/call"
import { httpDoctorsService } from "./http/doctors"
import { httpRolesService } from "./http/roles"
import { httpUsersService } from "./http/users"
import { mockDoctorsService } from "./mock/doctors"
import { mockRolesService, mockUsersService } from "./mock/users"
import type { DoctorInput, UserInput } from "./types"

// Unit tests. Mock-adapter tests verify the UI-facing contract only; they say
// nothing about the real backend. The HTTP-adapter tests verify that nothing is
// sent while the contract is unconfirmed.

const usersSnapshot = structuredClone(USERS)
const doctorsSnapshot = structuredClone(DOCTORS)
beforeEach(() => {
  USERS.splice(0, USERS.length, ...structuredClone(usersSnapshot))
  DOCTORS.splice(0, DOCTORS.length, ...structuredClone(doctorsSnapshot))
})
afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
})

const newUser: UserInput = { name: "Test Nurse", email: "test.nurse@example.test", role: "nurse", active: true, password: "Passw0rd!" }
const newDoctor: DoctorInput = {
  name: "Dr. Test", specialization: "ENT", qualifications: "MBBS", pmcRegNo: "PMC-0", fee: 500, phone: "0300-0000000",
  active: true, availableDays: ["Mon"], hoursFrom: "09:00", hoursTo: "17:00",
}

describe("mock users service", () => {
  it("lists records without exposing passwords and with string ids", async () => {
    const { items, total } = await mockUsersService.list()
    expect(total).toBe(USERS.length)
    expect(typeof items[0].id).toBe("string")
    expect(items[0]).not.toHaveProperty("password")
  })

  it("filters by search", async () => {
    const { items } = await mockUsersService.list({ search: "lab@citiclinic" })
    expect(items.map((u) => u.role)).toEqual(["lab_tech"])
  })

  it("creates, updates and deactivates", async () => {
    const created = await mockUsersService.create(newUser)
    expect(created.active).toBe(true)
    expect((await mockUsersService.list()).total).toBe(usersSnapshot.length + 1)

    const updated = await mockUsersService.update(created.id, { ...newUser, name: "Renamed" })
    expect(updated.name).toBe("Renamed")

    const off = await mockUsersService.setActive(created.id, false)
    expect(off.active).toBe(false)
  })

  it("rejects duplicate emails with a conflict ApiError carrying field details", async () => {
    await expect(mockUsersService.create({ ...newUser, email: USERS[0].email.toUpperCase() })).rejects.toMatchObject({
      status: 409,
      body: { details: [{ path: "email" }] },
    })
  })

  it("rejects an unknown id", async () => {
    await expect(mockUsersService.setActive("nope", false)).rejects.toBeInstanceOf(ApiError)
  })
})

describe("mock doctors service", () => {
  it("lists, creates and updates, keeping the shared DOCTORS array in sync", async () => {
    const created = await mockDoctorsService.create(newDoctor)
    expect(DOCTORS.some((d) => String(d.userId) === created.id)).toBe(true)
    const updated = await mockDoctorsService.update(created.id, { ...newDoctor, fee: 900 })
    expect(updated.fee).toBe(900)
    expect(DOCTORS.find((d) => String(d.userId) === created.id)?.fee).toBe(900)
  })

  it("validates required fields", async () => {
    await expect(mockDoctorsService.create({ ...newDoctor, name: " ", fee: 0 })).rejects.toMatchObject({
      status: 400,
      body: { details: [{ path: "name" }, { path: "fee" }] },
    })
  })
})

describe("roles", () => {
  it("mock roles come only from the mock label table", async () => {
    const roles = await mockRolesService.list()
    expect(roles.length).toBeGreaterThan(0)
    expect(roles.every((r) => r.value && r.label)).toBe(true)
  })
})

describe("endpoint table", () => {
  it("only pre-fills endpoints the API Reference documents (currently GET /auth/me)", () => {
    const filled = Object.entries(ENDPOINTS).filter(([, e]) => e !== null)
    expect(filled).toEqual([["auth.me", { method: "GET", path: "/auth/me" }]])
  })

  it("throws NotConnectedError for an unset endpoint", () => {
    expect(() => resolveEndpoint("users.list")).toThrow(NotConnectedError)
  })

  it("substitutes and encodes :id", () => {
    const table = { ...ENDPOINTS, "users.update": { method: "PATCH", path: "/users/:id" } } as Record<EndpointKey, Endpoint | null>
    expect(resolveEndpoint("users.update", { id: "a/b" }, table)).toEqual({ method: "PATCH", path: "/users/a%2Fb" })
  })

  it("requires every path parameter", () => {
    const table = { ...ENDPOINTS, "users.update": { method: "PATCH", path: "/users/:id" } } as Record<EndpointKey, Endpoint | null>
    expect(() => resolveEndpoint("users.update", {}, table)).toThrow(/"id"/)
  })
})

describe("http adapters while the contract is unconfirmed", () => {
  it("make no network request and reject with NotConnectedError", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls: Array<Promise<unknown>> = [
      httpUsersService.list(),
      httpUsersService.create(newUser),
      httpUsersService.update("1", newUser),
      httpUsersService.setActive("1", false),
      httpUsersService.sendPasswordReset("1"),
      httpRolesService.list(),
      httpDoctorsService.list(),
      httpDoctorsService.create(newDoctor),
      httpDoctorsService.update("1", newDoctor),
    ]
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never grants or invents roles when the roles endpoint is unavailable", async () => {
    await expect(httpRolesService.list()).rejects.toBeInstanceOf(NotConnectedError)
  })
})

describe("callEndpoint with a configured endpoint", () => {
  const table = {
    ...ENDPOINTS,
    "users.update": { method: "PATCH", path: "/users/:id" },
  } as Record<EndpointKey, Endpoint | null>

  it("sends the configured method/path through the shared client with the bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    setAccessToken("tok")
    await callEndpoint("users.update", { params: { id: "X1" }, body: () => ({ a: 1 }) }, table)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/users/X1")
    expect(init.method).toBe("PATCH")
    expect(init.body).toBe('{"a":1}')
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok")
    expect(init.credentials).toBe("include")
  })

  it("does not build the body or hit the network when the endpoint is unset", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const body = vi.fn()
    await expect(callEndpoint("users.create", { body }, table)).rejects.toBeInstanceOf(NotConnectedError)
    expect(body).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("errorSummary", () => {
  it("includes the backend message, field details and request id", () => {
    const err = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      requestId: "req-1",
      body: { statusCode: 400, code: "VALIDATION_FAILED", message: "Validation failed", requestId: "req-1", path: "/x", timestamp: "t", details: [{ path: "email", message: "must be an email" }] },
    })
    expect(errorSummary(err)).toBe("Validation failed — email: must be an email (Reference: req-1)")
  })

  it("explains an unconfigured endpoint", () => {
    expect(errorSummary(new NotConnectedError('endpoint "users.list"'))).toMatch(/not connected yet/i)
  })

  it("does not leak details of unknown errors", () => {
    expect(errorSummary(new Error("secret internals"))).toBe("Something went wrong. Please try again.")
  })
})
