import { describe, expect, it } from "vitest"
import { imagingTestCreatePayload, imagingTestListQuery, imagingTestUpdatePayload, parseImagingTest, parseImagingTestList } from "./http/imagingTests"
import { schemaOf, validate } from "./http/specValidate"

const ID = "01HZX000000000000000000300"
const WIRE = { id: ID, code: "XR-CHEST", name: "Chest X-Ray", modality: "X-Ray", rate: "1500.00", gstPct: "0.00", discountPct: "5.00", turnaroundHours: 6, reportRequired: true, reportTemplate: "Findings:", active: true, createdAt: "2026-11-07T10:00:00.000Z" }

describe("imaging tests catalogue (S7)", () => {
  it("reads a test: the demo's `fee` is the API's `rate`, as a number for display", () => {
    expect(parseImagingTest(WIRE)).toEqual({ id: ID, code: "XR-CHEST", name: "Chest X-Ray", fee: 1500, feeText: "1500.00", active: true, modality: "X-Ray", gstPct: 0, discountPct: 5, turnaroundHours: 6, reportRequired: true, reportTemplate: "Findings:" })
  })
  it("tolerates the spec defects: turnaround as an array or null, the template as an array or null", () => {
    expect(parseImagingTest({ ...WIRE, turnaroundHours: [12], reportTemplate: ["T"] })).toMatchObject({ turnaroundHours: 12, reportTemplate: "T" })
    expect(parseImagingTest({ ...WIRE, turnaroundHours: null, reportTemplate: null })).toMatchObject({ turnaroundHours: 0, reportTemplate: "" })
    expect(parseImagingTestList({ data: [WIRE], meta: { page: 1, perPage: 10, total: 14, totalPages: 2 } }).total).toBe(14)
  })
  it("refuses an unknown modality, a missing rate or a bad id", () => {
    expect(() => parseImagingTest({ ...WIRE, modality: "Laser" })).toThrow(TypeError)
    expect(() => parseImagingTest({ ...WIRE, rate: undefined })).toThrow(TypeError)
    expect(() => parseImagingTest({ ...WIRE, id: "7" })).toThrow(TypeError)
  })
  it("list query: server-side paging, search, modality, active; perPage at most 100", () => {
    expect(imagingTestListQuery({ page: 2, pageSize: 10, search: " chest ", modality: "X-Ray", active: false })).toMatchObject({ page: 2, perPage: 10, search: "chest", modality: "X-Ray", active: false })
    expect(() => imagingTestListQuery({ pageSize: 200 })).toThrow(RangeError)
  })
  it("create body matches CreateImagingTestDto (code upper-cased, decimal strings, empty template left out)", () => {
    const body = imagingTestCreatePayload({ code: "xr-hand", name: " Hand X-Ray ", fee: 900, active: true, modality: "X-Ray", gstPct: 0, discountPct: 0, turnaroundHours: 4, reportRequired: false, reportTemplate: "  " })
    expect(body).toEqual({ code: "XR-HAND", name: "Hand X-Ray", modality: "X-Ray", rate: "900.00", gstPct: "0.00", discountPct: "0.00", turnaroundHours: 4, reportRequired: false })
    expect(validate(body, schemaOf("CreateImagingTestDto"))).toEqual([])
  })
  it("refuses before any request: no modality, a bad code, hours out of range, an inactive create", () => {
    const ok = { code: "X1", name: "Xx", fee: 1, active: true, modality: "ECG" }
    expect(() => imagingTestCreatePayload({ ...ok, modality: undefined })).toThrow(/modality/i)
    expect(() => imagingTestCreatePayload({ ...ok, modality: "Laser" })).toThrow(RangeError)
    expect(() => imagingTestCreatePayload({ ...ok, code: "bad code" })).toThrow(RangeError)
    expect(() => imagingTestCreatePayload({ ...ok, turnaroundHours: 0 })).toThrow(RangeError)
    expect(() => imagingTestCreatePayload({ ...ok, active: false })).toThrow(RangeError)
  })
  it("update body is ONLY the changed fields; an emptied template is null; matches UpdateImagingTestDto", () => {
    const body = imagingTestUpdatePayload({ fee: 2000, reportTemplate: " ", reportRequired: false })
    expect(body).toEqual({ rate: "2000.00", reportTemplate: null, reportRequired: false })
    expect(validate(body, schemaOf("UpdateImagingTestDto"))).toEqual([])
    expect(() => imagingTestUpdatePayload({})).toThrow(RangeError)
    expect(() => imagingTestUpdatePayload({ name: " " })).toThrow(RangeError)
    expect(() => imagingTestUpdatePayload({ reportTemplate: "x".repeat(5001) })).toThrow(/5000/)
  })
})
