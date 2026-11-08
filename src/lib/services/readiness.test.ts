import { afterEach, describe, expect, it, vi } from "vitest"
import { roleLabel } from "@/lib/auth"
import { setAccessToken } from "@/lib/api/client"
import { resolveDataSource } from "./dataSource"
import { validateDoctorForm, validateUserForm } from "./formValidation"
import { httpDoctorsService } from "./http/doctors"
import { parseCurrentUser } from "./http/mappers"
import { httpUsersService } from "./http/users"
import { authService, hasPermission } from "./identity"
import { ENDPOINTS } from "./endpoints"
import { httpRolesService } from "./http/roles"
import { DEFAULT_PAGE_SIZE, activeSuffix, paginate, viewState } from "./listing"
import { mockDoctorsService } from "./mock/doctors"
import { mockUsersService } from "./mock/users"

// All tests here are frontend-only unit tests with controlled inputs. None of
// them contacts, or says anything about, the real backend.

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe("data source selection", () => {
  it("honours an explicit choice", () => {
    expect(resolveDataSource("mock", "production")).toBe("mock")
    expect(resolveDataSource("api", "development")).toBe("api")
  })
  it("defaults to mock in development only", () => {
    expect(resolveDataSource(undefined, "development")).toBe("mock")
    expect(resolveDataSource(undefined, "test")).toBe("mock")
  })
  it("never serves demo data in production unless explicitly requested", () => {
    expect(resolveDataSource(undefined, "production")).toBe("api")
    expect(resolveDataSource("typo", "production")).toBe("api")
  })
})

describe("list state selection", () => {
  const base = { data: null, error: null, loading: false, rowCount: 0 }
  it("loading before any data", () => expect(viewState({ ...base, loading: true })).toBe("loading"))
  it("error when nothing has loaded", () => expect(viewState({ ...base, error: new Error("x") })).toBe("error"))
  it("keeps showing rows when a reload fails or is in flight", () => {
    const data = {}
    expect(viewState({ data, error: new Error("x"), loading: false, rowCount: 3 })).toBe("ready")
    expect(viewState({ data, error: null, loading: true, rowCount: 3 })).toBe("ready")
  })
  it("empty only after a successful load with zero rows", () => expect(viewState({ ...base, data: {} })).toBe("empty"))
})

describe("paging helpers", () => {
  const items = Array.from({ length: 60 }, (_, i) => i)
  it("slices 1-based pages and clamps bad pages", () => {
    expect(paginate(items, 1, 25)).toHaveLength(25)
    expect(paginate(items, 3, 25)).toEqual(items.slice(50))
    expect(paginate(items, 0, 25)[0]).toBe(0)
    expect(DEFAULT_PAGE_SIZE).toBe(25)
  })
  it("only reports an active count when every record is on screen", () => {
    const rows = [{ active: true }, { active: false }]
    expect(activeSuffix(rows, 2)).toBe(" (1 active)")
    expect(activeSuffix(rows, 40)).toBe("")
  })
  it("mock services honour page/pageSize and report the full total", async () => {
    const u = await mockUsersService.list({ page: 2, pageSize: 4 })
    expect(u.items).toHaveLength(4)
    expect(u.total).toBeGreaterThan(4)
    const d = await mockDoctorsService.list({ pageSize: 1 })
    expect(d.items).toHaveLength(1)
    expect(d.total).toBeGreaterThan(1)
  })
})

describe("integration contract scope", () => {
  it("contains only operations the existing screens perform (no detail fetches, roles listing, password reset, refresh/logout)", async () => {
    expect(Object.keys(ENDPOINTS).filter((k) => !["patients.", "schedule.", "slots.", "appointments.", "visits.", "beds.", "invoices.", "account.", "charges.", "paymentsRegister.", "advances.", "credit.", "refunds.", "creditNotes.", "labApi.", "imagingApi.", "pharmacyApi.", "reportsApi.", "accountsApi.", "encounters.", "wards.", "labTests.", "ecgTests.", "labOrders.", "imagingOrders.", "medicines.", "dispensing.", "consultationInvoices.", "servicesInvoices.", "payments.", "receipts.", "expenseCategories.", "expenses.", "bankAccounts.", "bankTransactions.", "reports.", "serviceCatalog.", "dashboard.", "statistics.", "itemHistory.", "billSummary.", "organisations.", "guardianRelations.", "settings.", "wardsAdmin.", "usersAdmin.", "doctors.", "icd."].some((p) => k.startsWith(p))).sort()).toEqual(
      ["auth.me", "users.create", "users.list", "users.setActive", "users.update"]
    )
    expect(Object.keys(httpUsersService).sort()).toEqual(["create", "list", "sendPasswordReset", "setActive", "update"])
    expect(Object.keys(httpDoctorsService).sort()).toEqual(["create", "list", "update"])
  })
  it("password reset and role options report 'awaiting contract' without any request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(httpUsersService.sendPasswordReset("1")).rejects.toThrow(/not covered by the provided API documentation/)
    await expect(httpRolesService.list()).rejects.toThrow(/not covered by the provided API documentation/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("form validation", () => {
  const ok = { name: "A", email: "a@b.c", role: "x", password: "pw", confirmPassword: "pw", isNew: true }
  it("accepts a complete new user", () => expect(validateUserForm(ok)).toEqual([]))
  it("reports every missing required field, including role", () => {
    expect(validateUserForm({ ...ok, name: "", email: "", role: "" })).toEqual([
      "Full Name is required",
      "Email is required",
      "Role is required",
    ])
  })
  it("requires a password only for new users, and matching confirmation when set", () => {
    expect(validateUserForm({ ...ok, password: "", confirmPassword: "" })).toEqual(["Password is required for new users"])
    expect(validateUserForm({ ...ok, isNew: false, password: "", confirmPassword: "" })).toEqual([])
    expect(validateUserForm({ ...ok, confirmPassword: "different" })).toEqual(["Passwords do not match"])
  })
  it("validates doctors", () => {
    expect(validateDoctorForm({ name: "  ", fee: 0 })).toEqual(["Full Name is required", "Consultation Fee is required"])
    expect(validateDoctorForm({ name: "Dr", fee: 1 })).toEqual([])
  })
})

describe("current user (documented GET /auth/me) and permissions", () => {
  const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })

  it("requests GET /api/v1/auth/me through the shared client and reads only the documented permission list", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ permissions: ["a.read"], anything: "else" }))
    vi.stubGlobal("fetch", fetchMock)
    setAccessToken("tok")
    expect(await authService.me()).toEqual({ permissions: ["a.read"] }) // nothing else is read from the response
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/auth/me")
    expect(init.method).toBe("GET")
    expect(init.credentials).toBe("include")
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok")
  })

  it("propagates API failures instead of inventing an identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statusCode: 401, code: "AUTHENTICATION_REQUIRED", message: "x", requestId: "r", path: "/", timestamp: "t" }), { status: 401, headers: { "content-type": "application/json" } })))
    await expect(authService.me()).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" })
  })

  it("parseCurrentUser reads AuthUserDto.permissions and rejects anything else, so permissions stay unknown", () => {
    expect(parseCurrentUser({ permissions: ["x", "x", "y"] })).toEqual({ permissions: ["x", "y"] })
    for (const raw of [{}, null, "x", { permissions: "x" }, { permissions: [1] }]) expect(() => parseCurrentUser(raw)).toThrow(TypeError)
  })

  it("hasPermission grants only what is listed; unknown (null) grants nothing", () => {
    expect(hasPermission(null, "p")).toBe(false)
    expect(hasPermission(["p"], "p")).toBe(true)
    expect(hasPermission([], "p")).toBe(false)
  })

  it("an unset role shows no label (display only; the role never decides access)", () => {
    expect(roleLabel(null)).toBe("Role not set")
    expect(roleLabel("lab_tech")).toBe("Lab Technician")
    expect(roleLabel("radiographer")).toBe("Radiographer")
  })
})



// Pending contract confirmation: write these with real sample payloads from the
// OpenAPI spec once http/mappers.ts is implemented (see the handoff document).
describe("mapper contract tests (awaiting the OpenAPI spec)", () => {
  it.todo("parseUserList maps the documented list response (items + total)")
  it.todo("parseUser maps the documented user response, including role and active/status")
  it.todo("userPayload builds the documented create/update request body, omitting an empty password on edit")
  it.todo("userActivePayload builds the documented activate/deactivate request")
  it.todo("userListQuery / doctorListQuery build the documented search + pagination parameters")
  it.todo("parseDoctorList / parseDoctor map the documented doctor response (fee via parseMoney, id via isUlid)")
  it.todo("doctorPayload builds the documented doctor request body and does not send photoUrl as base64")
  it.todo("parseCurrentUser is replaced by the full SessionUser reader in chunk H1")
})
