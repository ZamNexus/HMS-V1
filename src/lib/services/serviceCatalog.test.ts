import { describe, expect, it } from "vitest"
import { NotConnectedError } from "./errors"
import { decimalText, moneyText, parseServiceCatalogList, parseServiceCatalogRecord, serviceCreatePayload, serviceListQuery, serviceUpdatePayload } from "./http/serviceCatalog"
import { schemaOf, validate } from "./http/specValidate"

const ID = "01HZX000000000000000000100"
const WIRE = { id: ID, code: "CONS-01", name: "Consultation", category: "Procedure", rate: "1250.50", gstPct: "5.00", discountPct: "0.00", active: true, createdAt: "2026-11-07T10:00:00.000Z" }

describe("services catalogue (S5)", () => {
  it("reads a service: money and percentages are decimal strings turned into numbers for display", () => {
    expect(parseServiceCatalogRecord(WIRE)).toEqual({ id: ID, code: "CONS-01", name: "Consultation", category: "Procedure", rate: 1250.5, rateText: "1250.50", gstPct: 5, discountPct: 0, active: true })
    expect(validate(WIRE, schemaOf("ServiceResponseDto_Output"), { lenientStringArrays: true })).toEqual([]) // the JSON types text fields as arrays (known spec defect)
  })
  it("refuses a service with a missing or non-decimal rate, or a bad id", () => {
    expect(() => parseServiceCatalogRecord({ ...WIRE, rate: undefined })).toThrow(TypeError)
    expect(() => parseServiceCatalogRecord({ ...WIRE, rate: "12,5" })).toThrow(TypeError)
    expect(() => parseServiceCatalogRecord({ ...WIRE, id: "12" })).toThrow(TypeError)
  })
  it("reads a page", () => {
    const page = parseServiceCatalogList({ data: [WIRE], meta: { page: 1, perPage: 10, total: 31, totalPages: 4 } })
    expect(page.total).toBe(31)
    expect(page.items).toHaveLength(1)
  })

  it("list query: server-side paging, search, category and active (never fetch-all), perPage at most 100", () => {
    expect(serviceListQuery({ page: 2, pageSize: 10, search: " cons ", category: "Procedure", active: false })).toEqual({ page: 2, perPage: 10, search: "cons", category: "Procedure", active: false })
    expect(serviceListQuery({})).toEqual({ page: undefined, perPage: undefined, search: undefined, category: undefined, active: undefined })
    expect(() => serviceListQuery({ page: 1, pageSize: 500 })).toThrow(RangeError)
  })

  it("exact money text: typed amounts are normalised with string handling only, so no float can change them (even beyond 2^53)", () => {
    expect(moneyText("1250.5", "Rate")).toBe("1250.50")
    expect(moneyText(" 1250 ", "Rate")).toBe("1250.00")
    expect(moneyText("12345678901234567.80", "Rate")).toBe("12345678901234567.80")
    expect(moneyText("0.10", "Rate")).toBe("0.10")
    for (const bad of ["", "-1", "1.234", "1,5", "abc", "1e3"]) expect(() => moneyText(bad, "Rate"), bad).toThrow(RangeError)
    // the text wins over the demo-shaped number when both are given
    expect(serviceCreatePayload({ code: "", name: "Dressing", category: "", rate: 0.30000000000000004, rateText: "300.10", active: true }).rate).toBe("300.10")
    expect(serviceUpdatePayload({ rateText: "12345678901234567.8" }).rate).toBe("12345678901234567.80")
  })
  it("money is an exact decimal string with at most 2 decimals", () => {
    expect(decimalText(1250.5, "Rate")).toBe("1250.50")
    expect(decimalText(0, "Rate")).toBe("0.00")
    expect(() => decimalText(-1, "Rate")).toThrow(RangeError)
    expect(() => decimalText(1.005, "Rate")).toThrow(RangeError)
    expect(() => decimalText(Number.NaN, "Rate")).toThrow(RangeError)
  })

  it("create body matches CreateServiceDto; an empty code is left out so the system chooses one", () => {
    const body = serviceCreatePayload({ code: " cons-02 ", name: " Dressing ", category: "Procedure", rate: 300, gstPct: 0, discountPct: 10, active: true })
    expect(body).toEqual({ code: "cons-02", name: "Dressing", category: "Procedure", rate: "300.00", gstPct: "0.00", discountPct: "10.00" })
    expect(serviceCreatePayload({ code: "", name: "Dressing", category: "", rate: 300, active: true })).toEqual({ name: "Dressing", rate: "300.00" })
    const valid = serviceCreatePayload({ code: "CONS-02", name: "Dressing", category: "Procedure", rate: 300, active: true })
    expect(validate(valid, schemaOf("CreateServiceDto"))).toEqual([])
  })
  it("the API creates services active: an inactive create is refused before any request", () => {
    expect(() => serviceCreatePayload({ code: "X", name: "Xx", category: "c", rate: 1, active: false })).toThrow(NotConnectedError)
  })

  it("update body is ONLY the changed fields and matches UpdateServiceDto; required fields are never sent empty", () => {
    const body = serviceUpdatePayload({ rate: 1500, name: " New name " })
    expect(body).toEqual({ rate: "1500.00", name: "New name" })
    expect(validate(body, schemaOf("UpdateServiceDto"))).toEqual([])
    expect(() => serviceUpdatePayload({})).toThrow(RangeError)
    expect(() => serviceUpdatePayload({ code: " " })).toThrow(RangeError)
    expect(() => serviceUpdatePayload({ name: "" })).toThrow(RangeError)
    expect(() => serviceUpdatePayload({ category: "" })).toThrow(RangeError)
  })
})
