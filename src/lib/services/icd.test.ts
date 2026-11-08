import { describe, expect, it } from "vitest"
import { icdListQuery, parseIcdCode, parseIcdPage } from "./http/icd"
import { schemaOf, validate } from "./http/specValidate"

const ID = "01HZX000000000000000000700"
const WIRE = { id: ID, code: "J18.9", name: "Pneumonia, unspecified organism", category: "Respiratory" }

describe("ICD-10 lookup (S11)", () => {
  it("reads a code; a null category is null", () => {
    expect(parseIcdCode(WIRE)).toEqual({ id: ID, code: "J18.9", name: "Pneumonia, unspecified organism", category: "Respiratory" })
    expect(parseIcdCode({ ...WIRE, category: null }).category).toBeNull()
    expect(validate({ data: [WIRE], meta: { page: 1, perPage: 8, total: 1, totalPages: 1 } }, schemaOf("IcdCodePageDto_Output"), { lenientStringArrays: true })).toEqual([])
  })
  it("refuses a code without a code, name or a valid id", () => {
    expect(() => parseIcdCode({ ...WIRE, code: undefined })).toThrow(TypeError)
    expect(() => parseIcdCode({ ...WIRE, name: 5 })).toThrow(TypeError)
    expect(() => parseIcdCode({ ...WIRE, id: "x" })).toThrow(TypeError)
  })
  it("reads a page", () => {
    expect(parseIcdPage({ data: [WIRE], meta: { page: 1, perPage: 8, total: 80, totalPages: 10 } })).toEqual({ items: [parseIcdCode(WIRE)], total: 80 })
  })
  it("list query: server-side search (name or code prefix, trimmed, at most 100 characters) and paging, perPage at most 100", () => {
    expect(icdListQuery({ search: " J18 ", page: 2, pageSize: 8 })).toEqual({ page: 2, perPage: 8, search: "J18" })
    expect(icdListQuery({ search: "  " })).toMatchObject({ search: undefined })
    expect(() => icdListQuery({ search: "x".repeat(101) })).toThrow(RangeError)
    expect(() => icdListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})
