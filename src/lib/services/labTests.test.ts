import { describe, expect, it } from "vitest"
import { bandText, labTestCreatePayload, labTestListQuery, labTestUpdatePayload, parseLabTest, parseLabTestList, specsPayload } from "./http/labTests"
import { schemaOf, validate } from "./http/specValidate"
import { emptyRow, rangeSummary, rowFromSpec, specFromRow, validateRows, type ParamRow } from "./labParamForm"
import type { LabParameterSpec } from "./types"

const ID = "01HZX000000000000000000200"
const HB: LabParameterSpec = { key: "hb", name: "Haemoglobin", unit: "g/dL", decimals: 1, ranges: { male: { low: 13, high: 17 }, female: { low: 12, high: 16 } }, critical: { low: 7, high: 20 } }
const WIRE = { id: ID, code: "CBC", name: "Complete Blood Count", category: "Haematology", specimenType: "EDTA whole blood", rate: "800.00", gstPct: "0.00", discountPct: "0.00", turnaroundHours: 4, narrative: false, parameters: [HB], active: true, createdAt: "2026-11-07T10:00:00.000Z" }
const LENIENT = { lenientStringArrays: true }

describe("lab tests catalogue (S6): reading", () => {
  it("reads a test with its parameters (ranges by sex, critical limits) and keeps the full definition", () => {
    const t = parseLabTest(WIRE)
    expect(t).toMatchObject({ id: ID, code: "CBC", category: "Haematology", specimenType: "EDTA whole blood", rate: 800, turnaroundHours: 4, narrative: false, active: true })
    expect(t.specs).toEqual([HB])
    expect(t.unit).toBe("g/dL")
    expect(t.normalRange).toBe("13 - 17") // the first band: the demo shape is only a summary
  })
  it("a narrative test has no parameters; a null or array turnaround (spec defect) does not break the list", () => {
    const n = parseLabTest({ ...WIRE, narrative: true, parameters: [], turnaroundHours: [48] })
    expect(n.specs).toEqual([])
    expect(n.turnaroundHours).toBe(48)
    expect(parseLabTest({ ...WIRE, turnaroundHours: null }).turnaroundHours).toBe(0)
    expect(parseLabTestList({ data: [WIRE], meta: { page: 1, perPage: 10, total: 21, totalPages: 3 } }).total).toBe(21)
  })
  it("refuses an unknown category, a missing rate or a parameter without a key", () => {
    expect(() => parseLabTest({ ...WIRE, category: "Radiology" })).toThrow(TypeError)
    expect(() => parseLabTest({ ...WIRE, rate: undefined })).toThrow(TypeError)
    expect(() => parseLabTest({ ...WIRE, parameters: [{ name: "x" }] })).toThrow(TypeError)
  })
  it("formats bands", () => {
    expect(bandText({ low: 1, high: 2 })).toBe("1 - 2")
    expect(bandText({ high: 5 })).toBe("up to 5")
    expect(bandText(undefined)).toBe("-")
    expect(rangeSummary(HB)).toBe("M 13-17, F 12-16")
  })
  it("list query: server-side paging/search/category/active, perPage at most 100", () => {
    expect(labTestListQuery({ page: 2, pageSize: 10, search: " cbc ", category: "Haematology", active: true })).toMatchObject({ page: 2, perPage: 10, search: "cbc", category: "Haematology", active: true })
    expect(() => labTestListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})

describe("lab tests catalogue (S6): writing", () => {
  const input = { code: "cbc", name: " Complete Blood Count ", category: "Haematology" as const, rate: 800, turnaroundHours: 4, specimenType: "EDTA whole blood", gstPct: 0, discountPct: 0, narrative: false, specs: [HB] }
  it("create body matches CreateLabTestDto (code upper-cased, decimal strings, parameters as given)", () => {
    const body = labTestCreatePayload(input)
    expect(body).toMatchObject({ code: "CBC", name: "Complete Blood Count", rate: "800.00", gstPct: "0.00", turnaroundHours: 4, narrative: false })
    expect(validate(body, schemaOf("CreateLabTestDto"))).toEqual([])
  })
  it("refuses before any request: no specimen, an imaging category, a bad code, hours out of range, a narrative test with parameters", () => {
    expect(() => labTestCreatePayload({ ...input, specimenType: undefined })).toThrow(/specimen/i)
    expect(() => labTestCreatePayload({ ...input, category: "Radiology" })).toThrow(/imaging/)
    expect(() => labTestCreatePayload({ ...input, code: "bad code" })).toThrow(RangeError)
    expect(() => labTestCreatePayload({ ...input, turnaroundHours: 0 })).toThrow(RangeError)
    expect(() => labTestCreatePayload({ ...input, turnaroundHours: 721 })).toThrow(RangeError)
    expect(() => labTestCreatePayload({ ...input, narrative: true })).toThrow(/narrative/i)
  })
  it("update body is ONLY the changed fields; the parameter list goes whole", () => {
    const body = labTestUpdatePayload({ rate: 900, specs: [HB] })
    expect(Object.keys(body).sort()).toEqual(["parameters", "rate"])
    expect(body.rate).toBe("900.00")
    expect(validate(body, schemaOf("UpdateLabTestDto"))).toEqual([])
    expect(() => labTestUpdatePayload({})).toThrow(RangeError)
    expect(labTestUpdatePayload({ specs: [] }).parameters).toEqual([])
  })
  it("parameters: keys unique, a band is either for everyone or male + female, low not above high, at most 60", () => {
    expect(() => specsPayload([{ key: "a", name: "A" }, { key: "A", name: "B" }])).toThrow(/twice/)
    expect(() => specsPayload([{ key: "a", name: "A", ranges: { any: { low: 1, high: 2 }, male: { low: 1, high: 2 } } }])).toThrow(/OR/)
    expect(() => specsPayload([{ key: "a", name: "A", ranges: { male: { low: 1, high: 2 } } }])).toThrow(/both/)
    expect(() => specsPayload([{ key: "a", name: "A", ranges: { any: { low: 5, high: 2 } } }])).toThrow(/above/)
    expect(() => specsPayload(Array.from({ length: 61 }, (_, i) => ({ key: `k${i}`, name: `N${i}` })))).toThrow(/60/)
    expect(validate({ code: "X", name: "Xx", category: "Serology", specimenType: "Serum", rate: "1.00", parameters: specsPayload([HB]) }, schemaOf("CreateLabTestDto"))).toEqual([])
    void LENIENT
  })
})

describe("lab test parameter editor rows (S6)", () => {
  it("a row round-trips to the definition and back", () => {
    const row = rowFromSpec(HB)
    expect(row.mode).toBe("sex")
    expect(specFromRow(row)).toEqual(HB)
    expect(rowFromSpec({ key: "k", name: "N" }).mode).toBe("none")
    expect(specFromRow({ ...emptyRow(), key: " na ", name: " Sodium ", mode: "any", anyLow: "135", anyHigh: "145" })).toEqual({ key: "na", name: "Sodium", ranges: { any: { low: 135, high: 145 } } })
  })
  it("catches the obvious mistakes and says which row", () => {
    const ok = rowFromSpec(HB)
    const bad = (over: Partial<ParamRow>) => validateRows([ok, { ...ok, key: "k2", name: "Other", ...over }])
    expect(validateRows([ok])).toEqual({})
    expect(bad({ key: "HB" })[1]).toMatch(/already used in row 1/)
    expect(bad({ name: "" })[1]).toMatch(/required/)
    expect(bad({ maleLow: "x" })[1]).toMatch(/enter a number/)
    expect(bad({ decimals: "9" })[1]).toMatch(/0 to 6/)
    expect(bad({ maleLow: "20", maleHigh: "10" })[1]).toMatch(/low is above high/)
    expect(bad({ femaleLow: "", femaleHigh: "" })[1]).toMatch(/both the male and the female/)
    expect(bad({ mode: "any", anyLow: "10", anyHigh: "20", critLow: "12" })[1]).toMatch(/below the normal range/)
    expect(bad({ mode: "any", anyLow: "10", anyHigh: "20", critHigh: "15" })[1]).toMatch(/above the normal range/)
    expect(Object.keys(validateRows(Array.from({ length: 61 }, (_, i) => ({ ...emptyRow(), key: `k${i}`, name: `N${i}` }))))).toContain("60")
  })
})
