import { describe, expect, it } from "vitest"
import { parseBedNumbers } from "@/components/masterdata/WardsTab"
import { checkBedNo, parseBed, parseWard, parseWardPage, wardCreatePayload, wardListQuery, wardUpdatePayload } from "./http/wardsAdmin"
import { schemaOf, validate } from "./http/specValidate"

const ID = "01HZX000000000000000000400"
const BED = { id: "01HZX000000000000000000401", bedNo: "A-01", state: "available", active: true }
const WIRE = { id: ID, name: "Ward A", type: "general", dailyRate: "3500.00", active: true, bedCount: 2, occupiedCount: 1, availableCount: 1, createdAt: "2026-11-07T10:00:00.000Z" }

describe("wards and beds setup (S8)", () => {
  it("reads a ward (money stays an exact string) and, on the detail, its beds", () => {
    expect(parseWard(WIRE)).toEqual({ id: ID, name: "Ward A", type: "general", dailyRate: "3500.00", active: true, bedCount: 2, occupiedCount: 1, availableCount: 1 })
    expect(parseWard({ ...WIRE, beds: [BED, { ...BED, id: "01HZX000000000000000000402", bedNo: "A-02", state: "occupied", active: false }] }).beds).toHaveLength(2)
    expect(parseBed(BED)).toEqual(BED)
    expect(parseWardPage({ data: [WIRE], meta: { page: 1, perPage: 10, total: 11, totalPages: 2 } }).total).toBe(11)
  })
  it("refuses an unknown ward type or bed state, a missing rate, or beds that are not a list", () => {
    expect(() => parseWard({ ...WIRE, type: "vip" })).toThrow(TypeError)
    expect(() => parseWard({ ...WIRE, dailyRate: undefined })).toThrow(TypeError)
    expect(() => parseWard({ ...WIRE, beds: "A-01" })).toThrow(TypeError)
    expect(() => parseBed({ ...BED, state: "broken" })).toThrow(TypeError)
    expect(() => parseWard({ ...WIRE, bedCount: 1.5 })).toThrow(TypeError)
  })
  it("list query: server-side paging, search, type, active; perPage at most 100", () => {
    expect(wardListQuery({ page: 2, pageSize: 10, search: " icu ", type: "icu", active: true })).toMatchObject({ page: 2, perPage: 10, search: "icu", type: "icu", active: true })
    expect(() => wardListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
  it("create body is the ward AND its beds in one call; matches CreateWardDto", () => {
    const body = wardCreatePayload({ name: " Ward B ", type: "private", dailyRate: "5000", beds: [" B-01 ", "B-02"] })
    expect(body).toEqual({ name: "Ward B", type: "private", dailyRate: "5000.00", beds: ["B-01", "B-02"] })
    expect(validate(body, schemaOf("CreateWardDto"))).toEqual([])
    expect(wardCreatePayload({ name: "Ward C", type: "icu", dailyRate: "1", beds: [] }).beds).toEqual([])
  })
  it("refuses before any request: short name, unknown type, duplicate or too long bed numbers, more than 200 beds", () => {
    const ok = { name: "Ward", type: "general" as const, dailyRate: "1", beds: [] as string[] }
    expect(() => wardCreatePayload({ ...ok, name: "A" })).toThrow(RangeError)
    expect(() => wardCreatePayload({ ...ok, type: "vip" as never })).toThrow(RangeError)
    expect(() => wardCreatePayload({ ...ok, beds: ["A1", "a1"] })).toThrow(/twice/)
    expect(() => wardCreatePayload({ ...ok, beds: ["x".repeat(21)] })).toThrow(RangeError)
    expect(() => wardCreatePayload({ ...ok, beds: Array.from({ length: 201 }, (_, i) => `B${i}`) })).toThrow(/200/)
    expect(() => checkBedNo("  ")).toThrow(RangeError)
  })
  it("update body is ONLY the changed fields and matches UpdateWardDto", () => {
    const body = wardUpdatePayload({ dailyRate: "4000" })
    expect(body).toEqual({ dailyRate: "4000.00" })
    expect(validate(body, schemaOf("UpdateWardDto"))).toEqual([])
    expect(() => wardUpdatePayload({})).toThrow(RangeError)
  })
  it("bed bodies match CreateBedDto / UpdateBedDto", () => {
    expect(validate({ bedNo: checkBedNo(" A-1 ") }, schemaOf("CreateBedDto"))).toEqual([])
    expect(validate({ bedNo: checkBedNo("B-2") }, schemaOf("UpdateBedDto"))).toEqual([])
  })
  it("the bed box accepts one number per line or commas, drops blanks", () => {
    expect(parseBedNumbers("A-01\nA-02, A-03 ,\n\n  A-04  ")).toEqual(["A-01", "A-02", "A-03", "A-04"])
    expect(parseBedNumbers("")).toEqual([])
  })
})
