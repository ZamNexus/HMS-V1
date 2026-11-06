import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DOCTORS } from "@/data/doctors"
import { ENCOUNTERS } from "@/data/encounters"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { PANELS } from "@/data/organisations"
import { PATIENTS } from "@/data/patients"
import { ApiError } from "@/lib/api/client"
import { NotConnectedError } from "./errors"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { invalidatingService } from "./index"
import { mockDoctorsService } from "./mock/doctors"
import { mockPatientsService } from "./mock/patients"
import { mockGuardianRelationsService, mockOrganisationsService } from "./mock/reference"
import { toLegacyPatient } from "./patientHelpers"
import { invalidateShared, loadShared } from "./reference/cache"
import { listAll } from "./reference/listAll"
import { buildLookup } from "./reference/lookup"
import { legacyNumericId, refKey } from "./reference/refId"
import type { ListOptions, ListResult } from "./types"

// Frontend-only unit tests with controlled data. They cover the shared reference-data building blocks
// (ids, lookups, paging, shared loader, invalidation) and the mock-mode compatibility of the services the
// hooks in src/lib/useReferenceData.ts are built on. The hooks' loading/error/empty rendering is verified in a
// browser (there is no DOM test environment in this project).

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const panelsSnapshot = structuredClone(PANELS)
const relationsSnapshot = structuredClone(GUARDIAN_RELATIONS)
beforeEach(() => {
  PANELS.splice(0, PANELS.length, ...structuredClone(panelsSnapshot))
  GUARDIAN_RELATIONS.splice(0, GUARDIAN_RELATIONS.length, ...structuredClone(relationsSnapshot))
  invalidateShared()
})
afterEach(() => vi.unstubAllGlobals())

describe("id handling", () => {
  it("numbers and their string form share one key; missing ids have none", () => {
    expect(refKey(7)).toBe("7")
    expect(refKey("7")).toBe("7")
    expect(refKey(ULID)).toBe(ULID)
    expect(refKey(null)).toBeNull()
    expect(refKey(undefined)).toBeNull()
  })

  it("only canonical integers have a numeric form; nothing is coerced into NaN or a different number", () => {
    expect(legacyNumericId("12")).toBe(12)
    expect(legacyNumericId("0")).toBe(0)
    expect(legacyNumericId(12)).toBe(12)
    for (const bad of [ULID, "007", "1e3", " 7", "7 ", "-1", "1.5", "", "9007199254740993", -1, 1.5, NaN, Infinity, null, undefined]) {
      expect(legacyNumericId(bad as never), String(bad)).toBeNull()
    }
  })
})

describe("lookup", () => {
  const items = [{ id: "1", name: "A" }, { id: ULID, name: "B" }, { id: "1", name: "dup" }]
  const lookup = buildLookup(items, (i) => i.id)

  it("finds by numeric or string id, ULIDs included, and never throws for unknown ids", () => {
    expect(lookup.get(1)?.name).toBe("A")
    expect(lookup.get("1")?.name).toBe("A")
    expect(lookup.get(ULID)?.name).toBe("B")
    expect(lookup.get(2)).toBeUndefined()
    expect(lookup.get(null)).toBeUndefined()
    expect(lookup.get(undefined)).toBeUndefined()
  })
  it("first record wins on a repeated id and keeps the full list", () => {
    expect(lookup.get(1)?.name).not.toBe("dup")
    expect(lookup.items).toHaveLength(3)
  })
  it("an empty list is an empty lookup", () => {
    expect(buildLookup([], (i: { id: string }) => i.id).get("1")).toBeUndefined()
  })
})

describe("listAll", () => {
  const source = Array.from({ length: 250 }, (_, i) => i)
  const pager = (calls: ListOptions[] = []) => async (o: ListOptions): Promise<ListResult<number>> => {
    calls.push(o)
    const start = ((o.page ?? 1) - 1) * (o.pageSize ?? 100)
    return { items: source.slice(start, start + (o.pageSize ?? 100)), total: source.length }
  }

  it("collects every page and reports complete", async () => {
    const calls: ListOptions[] = []
    const res = await listAll(pager(calls), { pageSize: 100 })
    expect(res.items).toEqual(source)
    expect(res).toMatchObject({ total: 250, complete: true })
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3])
  })
  it("makes one call for a small list and handles an empty list", async () => {
    const calls: ListOptions[] = []
    expect((await listAll(pager(calls), { pageSize: 500 })).items).toHaveLength(250)
    expect(calls).toHaveLength(1)
    expect(await listAll(async () => ({ items: [], total: 0 }))).toEqual({ items: [], total: 0, complete: true })
  })
  it("reports incomplete when the page cap is hit or the backend under-delivers, instead of looping forever", async () => {
    expect((await listAll(pager(), { pageSize: 10, maxPages: 3 })).complete).toBe(false)
    const stuck = vi.fn(async (): Promise<ListResult<number>> => ({ items: [], total: 5 }))
    expect(await listAll(stuck)).toMatchObject({ items: [], complete: false })
    expect(stuck).toHaveBeenCalledTimes(1)
  })
  it("propagates failures", async () => {
    await expect(listAll(async () => { throw new NotConnectedError("x") })).rejects.toBeInstanceOf(NotConnectedError)
  })
})

describe("shared loader", () => {
  it("shares one in-flight request between concurrent callers", async () => {
    const loader = vi.fn(async () => "v")
    const [a, b] = await Promise.all([loadShared("k", loader, 0), loadShared("k", loader, 0)])
    expect([a, b]).toEqual(["v", "v"])
    expect(loader).toHaveBeenCalledTimes(1)
  })
  it("reuses a settled result within the TTL and reloads after it", async () => {
    let t = 1000
    const loader = vi.fn(async () => "v")
    await loadShared("k", loader, 100, () => t)
    t += 50
    await loadShared("k", loader, 100, () => t)
    expect(loader).toHaveBeenCalledTimes(1)
    t += 100
    await loadShared("k", loader, 100, () => t)
    expect(loader).toHaveBeenCalledTimes(2)
  })
  it("with TTL 0 (mock mode) every settled result is reloaded", async () => {
    const loader = vi.fn(async () => "v")
    await loadShared("k", loader, 0)
    await loadShared("k", loader, 0)
    expect(loader).toHaveBeenCalledTimes(2)
  })
  it("never caches a failure, so retry really retries", async () => {
    const loader = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok")
    await expect(loadShared("k", loader, 60_000)).rejects.toThrow("boom")
    await expect(loadShared("k", loader, 60_000)).resolves.toBe("ok")
    expect(loader).toHaveBeenCalledTimes(2)
  })
  it("invalidates by key prefix only", async () => {
    const a = vi.fn(async () => "a")
    const b = vi.fn(async () => "b")
    await loadShared("patient:1", a, 60_000)
    await loadShared("doctors", b, 60_000)
    invalidateShared("patient")
    await loadShared("patient:1", a, 60_000)
    await loadShared("doctors", b, 60_000)
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe("invalidatingService", () => {
  it("drops cached data after a successful mutation, not after reads or failures", async () => {
    const svc = { read: async () => 1, write: async () => "ok", fail: async () => { throw new Error("no") } }
    const wrapped = invalidatingService(svc, "thing", ["write", "fail"])
    const loader = vi.fn(async () => "v")

    await loadShared("thing", loader, 60_000)
    await wrapped.read()
    await loadShared("thing", loader, 60_000)
    expect(loader).toHaveBeenCalledTimes(1) // reads leave the cache alone

    await expect(wrapped.fail()).rejects.toThrow("no")
    await loadShared("thing", loader, 60_000)
    expect(loader).toHaveBeenCalledTimes(1) // failed mutation leaves it alone

    await expect(wrapped.write()).resolves.toBe("ok")
    await loadShared("thing", loader, 60_000)
    expect(loader).toHaveBeenCalledTimes(2) // successful mutation invalidates
  })
})

describe("doctor lookup compatibility (mock mode)", () => {
  it("resolves every doctor id stored in legacy encounters, by number, to the same name the old lookup gave", async () => {
    const lookup = buildLookup((await mockDoctorsService.list({ pageSize: 1000 })).items, (d) => d.id)
    for (const e of ENCOUNTERS) {
      expect(lookup.get(e.doctorId)?.name).toBe(DOCTORS.find((d) => d.userId === e.doctorId)?.name)
    }
    expect(lookup.get(e0DoctorId())).toBeDefined()
  })
  it("a ULID or unknown id yields undefined, never a wrong doctor", async () => {
    const lookup = buildLookup((await mockDoctorsService.list({ pageSize: 1000 })).items, (d) => d.id)
    expect(lookup.get(ULID)).toBeUndefined()
    expect(lookup.get(123456789)).toBeUndefined()
  })
  it("'active' selection matches the old activeDoctors()", async () => {
    const { items } = await mockDoctorsService.list({ pageSize: 1000 })
    expect(items.filter((d) => d.active).map((d) => d.id)).toEqual(DOCTORS.filter((d) => d.active !== false).map((d) => String(d.userId)))
  })
  function e0DoctorId() {
    return ENCOUNTERS[0].doctorId
  }
})

describe("patient compatibility (mock mode)", () => {
  it("every mock patient bridges back to exactly the legacy Patient the old code used (PatientPicker output)", async () => {
    const { items } = await mockPatientsService.list({ pageSize: 1000 })
    expect(items).toHaveLength(PATIENTS.length)
    for (const rec of items) {
      const legacy = toLegacyPatient(rec)
      expect(legacy).toEqual(PATIENTS.find((p) => p.id === legacy.id))
      expect(typeof legacy.id).toBe("number")
    }
  })
  it("a ULID patient or organisation can never be pushed into a legacy numeric-id screen", async () => {
    const [rec] = (await mockPatientsService.list({ pageSize: 1 })).items
    expect(() => toLegacyPatient({ ...rec, id: ULID })).toThrow()
    expect(() => toLegacyPatient({ ...rec, panelId: ULID })).toThrow()
  })
})

describe("organisations and guardian relations", () => {
  it("map the shared mock arrays to string-id records", async () => {
    const orgs = await mockOrganisationsService.list()
    expect(orgs.total).toBe(PANELS.length)
    expect(orgs.items[0]).toMatchObject({ id: String(PANELS[0].id), name: PANELS[0].name, type: PANELS[0].type, active: true })
    const rels = await mockGuardianRelationsService.list()
    expect(rels.items.map((r) => r.name)).toEqual(GUARDIAN_RELATIONS.map((r) => r.name))
    expect(typeof rels.items[0].id).toBe("string")
  })
  it("create adds to the shared arrays (other screens still read them) and returns the string id", async () => {
    const org = await mockOrganisationsService.create({ name: " New Panel ", type: "Corporate", contactPerson: "", phone: "", commissionPct: 0, active: true })
    expect(org.name).toBe("New Panel")
    expect(PANELS.at(-1)).toMatchObject({ id: Number(org.id), name: "New Panel" })
    const rel = await mockGuardianRelationsService.create({ name: "Uncle", active: true })
    expect(GUARDIAN_RELATIONS.at(-1)).toMatchObject({ id: Number(rel.id), name: "Uncle" })
  })
  it("validates like the old dialogs and rejects a duplicate relation", async () => {
    await expect(mockOrganisationsService.create({ name: " ", type: "Other", contactPerson: "", phone: "", commissionPct: 0, active: true })).rejects.toMatchObject({ status: 400 })
    await expect(mockGuardianRelationsService.create({ name: "father", active: true })).rejects.toMatchObject({ status: 409 })
    await expect(mockGuardianRelationsService.create({ name: " ", active: true })).rejects.toBeInstanceOf(ApiError)
  })
  it("the HTTP adapters have no contract: every call reports it and sends no request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpOrganisationsService.list(),
      httpOrganisationsService.create({ name: "x", type: "Other", contactPerson: "", phone: "", commissionPct: 0, active: true }),
      httpGuardianRelationsService.list(),
      httpGuardianRelationsService.create({ name: "x", active: true }),
    ]
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
