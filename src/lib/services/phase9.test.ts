import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setAccessToken } from "@/lib/api/client"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { classifyCreateError } from "./createOutcome"
import {
  addTestsPayload, amendLabPayload, httpImagingApiService, httpLabApiService, imagingAmendPayload, imagingListQuery, imagingReportPayload, labListQuery, orderPayload, parseImagingOrder, parseImagingOrderList,
  parseImagingPrint, parseLabOrder, parseLabOrderList, parseLabPrint, reasonPayload, remarksPayload, resultPayload,
} from "./http/diagnostics"
import { mockImagingApiService, mockLabApiService } from "./mock/diagnostics"
import { schemaOf, validate } from "./http/specValidate"

// Phase 9 service layer (handoff 8.7 and 8.8): API-shaped lab and imaging orders with server-computed `allowedActions`. Fixtures and payloads are validated AGAINST
// docs/openapi.json first. Every write is ONE request. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const ID = (c: string) => `01HZX${c.repeat(21)}`
const ORD = ID("A"), PAT = ID("B"), ENC = ID("C"), DOC = ID("D"), SPEC = ID("E"), T1 = ID("F"), TEST = ID("G"), INV = ID("H"), CH = ID("J"), USER = ID("K"), TEST2 = ID("P")
const NOW = "2026-11-07T10:00:00.000Z"
const LENIENT = { lenientStringArrays: true } as const // the spec types several single texts as arrays (a spec bug)
const who = { id: USER, name: "Lab Tech" }
const patient = { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }
const charge = (over: Record<string, unknown> = {}) => ({ id: CH, invoiceId: INV, total: "600.00", received: "0.00", paid: false, ...over })
const param = (over: Record<string, unknown> = {}) => ({ key: "hb", name: "Haemoglobin", unit: "g/dL", value: "9.1", flag: "low", normalRange: "12.0 - 15.5", ...over })
const labTest = (over: Record<string, unknown> = {}) => ({ id: T1, testId: TEST, name: "CBC", rate: "600.00", specimenId: SPEC, status: "ordered", result: null, amendments: [], charge: charge(), cancelledAt: null, cancelledReason: null, allowedActions: ["cancel"], ...over })
const specimen = (over: Record<string, unknown> = {}) => ({ id: SPEC, specimenNo: "SPM-2026-000001", specimenType: "EDTA whole blood", status: "pending", collectedAt: null, collectedBy: null, rejectedAt: null, rejectedReason: null, replacesSpecimenId: null, allowedActions: ["collect", "reject"], ...over })
const labOrder = (over: Record<string, unknown> = {}) => ({
  id: ORD, orderNo: "LAB-2026-0007", status: "pending", priority: "routine", fulfillment: "internal", referredTo: null, patient: { ...patient, gender: "female" }, encounter: { id: ENC, encId: "OPD-2026-0012" }, doctor: { id: DOC, name: "Dr Imran" },
  referringDoctorText: null, clinicalNotes: "Fever", pathologistRemarks: null, orderedAt: NOW, deliveredAt: null, deliveredBy: null, archived: false, specimens: [specimen()], tests: [labTest()], allowedActions: ["add_test", "archive"], ...over,
})
const labRow = (over: Record<string, unknown> = {}) => ({ id: ORD, orderNo: "LAB-2026-0007", status: "pending", priority: "urgent", fulfillment: "internal", orderedAt: NOW, patient, encounter: { id: ENC, encId: "OPD-2026-0012" }, referringDoctor: "Dr Imran", tests: [{ name: "CBC", status: "ordered" }], toCollect: 1, hasCritical: false, archived: false, ...over })
const imgTest = (over: Record<string, unknown> = {}) => ({
  id: T1, testId: TEST, name: "Chest X-ray", modality: "X-Ray", rate: "800.00", status: "ordered", reportRequired: true, performedBy: null, performedAt: null, report: null, reportTemplate: "Lungs are clear.", amendments: [], charge: charge({ total: "800.00" }),
  cancelledAt: null, cancelledReason: null, allowedActions: ["cancel", "perform"], ...over,
})
const imgOrder = (over: Record<string, unknown> = {}) => ({
  id: ORD, orderNo: "XR-2026-0003", status: "pending", priority: "routine", fulfillment: "internal", referredTo: null, patient: { ...patient, gender: "female" }, encounter: null, doctor: { id: DOC, name: "Dr Imran" }, referringDoctorText: null,
  clinicalNotes: null, orderedAt: NOW, deliveredAt: null, deliveredBy: null, archived: false, tests: [imgTest()], allowedActions: ["add_test", "archive"], ...over,
})
const imgRow = (over: Record<string, unknown> = {}) => ({ id: ORD, orderNo: "XR-2026-0003", status: "pending", priority: "routine", fulfillment: "internal", orderedAt: NOW, patient, encounter: null, referringDoctor: "Dr Imran", tests: [{ name: "Chest X-ray", modality: "X-Ray", status: "ordered" }], toPerform: 1, toReport: 0, archived: false, ...over })
const page = (data: unknown[]) => ({ data, meta: { page: 1, perPage: 10, total: data.length, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/lab-orders", timestamp: NOW })
function stub(responses: Array<Response | Error>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    if (r instanceof Error) throw r
    return r.clone()
  }))
  return calls
}
const verifiedResult = { version: 1, parameters: [param()], narrative: null, enteredBy: who, enteredAt: NOW, verifiedBy: { id: DOC, name: "Dr Imran" }, verifiedAt: NOW }

describe("fixtures are what the specification says", () => {
  it("lab and imaging details, list rows and print payloads validate against their schemas", () => {
    expect(validate(labOrder(), schemaOf("LabOrderResponseDto_Output"), LENIENT)).toEqual([])
    expect(validate(labOrder({ status: "completed", tests: [labTest({ status: "verified", result: verifiedResult, allowedActions: ["amend"], amendments: [{ version: 2, reason: "Typing error", amendedBy: who, amendedAt: NOW, previous: { parameters: [{ name: "Haemoglobin", unit: "g/dL", value: "9.0", flag: "low", normalRange: "12.0 - 15.5" }], narrative: null } }] })], allowedActions: ["deliver", "write_remarks"] }), schemaOf("LabOrderResponseDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([labRow(), labRow({ hasCritical: true, id: ID("M") })]), schemaOf("LabOrderPageDto_Output"), LENIENT)).toEqual([])
    expect(validate(imgOrder(), schemaOf("ImagingOrderResponseDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([imgRow()]), schemaOf("ImagingOrderPageDto_Output"), LENIENT)).toEqual([])
  })
})

describe("parsing", () => {
  it("a lab order keeps every level's allowedActions, the specimen numbers and the charge; texts as sent", () => {
    const o = parseLabOrder(labOrder())
    expect(o.allowedActions).toEqual(["add_test", "archive"])
    expect(o.specimens[0]).toMatchObject({ specimenNo: "SPM-2026-000001", specimenType: "EDTA whole blood", allowedActions: ["collect", "reject"] })
    expect(o.tests[0]).toMatchObject({ name: "CBC", rate: "600.00", status: "ordered", allowedActions: ["cancel"], charge: { total: "600.00", paid: false } })
    expect(o.patient).toMatchObject({ gender: "female", mrNo: "MR-2026-0042" })
    expect(o.clinicalNotes).toBe("Fever")
  })
  it("an action the backend adds later is ignored, never shown as a button", () => {
    const o = parseLabOrder(labOrder({ allowedActions: ["add_test", "teleport"], specimens: [specimen({ allowedActions: ["collect", "freeze"] })], tests: [labTest({ allowedActions: ["cancel", "levitate"] })] }))
    expect(o.allowedActions).toEqual(["add_test"])
    expect(o.specimens[0].allowedActions).toEqual(["collect"])
    expect(o.tests[0].allowedActions).toEqual(["cancel"])
  })
  it("a result is final only with verifiedAt; flags (incl. critical and none) and amendments with what they replaced are kept", () => {
    const o = parseLabOrder(labOrder({ tests: [
      labTest({ status: "entered", result: { ...verifiedResult, verifiedBy: null, verifiedAt: null, parameters: [param({ flag: "critical" }), param({ key: "wbc", name: "WBC", flag: null, normalRange: null, unit: null, value: "7" })] } }),
      labTest({ id: ID("N"), status: "verified", result: { ...verifiedResult, version: 2 }, amendments: [{ version: 2, reason: "Typing error", amendedBy: who, amendedAt: NOW, previous: { parameters: [{ name: "Haemoglobin", unit: "g/dL", value: "9.0", flag: "low", normalRange: null }], narrative: null } }] }),
    ] }))
    expect(o.tests[0].result?.verifiedAt).toBeNull()
    expect(o.tests[0].result?.parameters.map((p) => p.flag)).toEqual(["critical", null])
    expect(o.tests[1].result?.verifiedAt).toBe(NOW)
    expect(o.tests[1].amendments[0]).toMatchObject({ version: 2, reason: "Typing error", previous: { parameters: [{ value: "9.0" }] } })
  })
  it("the spec bug is tolerated: single texts typed as arrays arrive as a string, null or a one-element array", () => {
    const a = parseLabOrder(labOrder({ referredTo: ["Chughtai Lab"], referringDoctorText: ["Dr Outside"], clinicalNotes: [], pathologistRemarks: ["Consistent with anaemia"] }))
    expect(a).toMatchObject({ referredTo: "Chughtai Lab", referringDoctorText: "Dr Outside", clinicalNotes: null, pathologistRemarks: "Consistent with anaemia" })
  })
  it("rows keep the worklist counts and the critical flag; an unknown status or a missing field is refused", () => {
    const l = parseLabOrderList(page([labRow({ hasCritical: true, toCollect: 2 })]))
    expect(l.total).toBe(1)
    expect(l.items[0]).toMatchObject({ hasCritical: true, toCollect: 2, priority: "urgent" })
    expect(() => parseLabOrder(labOrder({ status: "finished" }))).toThrow()
    expect(() => parseLabOrder({ ...labOrder(), specimens: undefined })).toThrow()
    expect(() => parseLabOrderList(page([labRow({ toCollect: undefined })]))).toThrow()
    expect(() => parseLabOrder(labOrder({ tests: [labTest({ rate: 600 })] }))).toThrow(/decimal/)
  })
  it("an imaging order keeps report, signature, template, reportRequired and amendments", () => {
    const o = parseImagingOrder(imgOrder({ status: "completed", tests: [
      imgTest({ status: "verified", performedBy: who, performedAt: NOW, report: { version: 2, narrative: "Normal.", writtenBy: who, writtenAt: NOW, signedBy: { id: DOC, name: "Dr Imran" }, signedAt: NOW }, allowedActions: ["amend"], amendments: [{ version: 2, reason: "Wrong side", amendedBy: who, amendedAt: NOW, previousNarrative: "Left" }] }),
      imgTest({ id: ID("N"), name: "ECG tracing", modality: "ECG", reportRequired: false, status: "performed", performedBy: who, performedAt: NOW, reportTemplate: null, allowedActions: [] }),
    ] }))
    expect(o.tests[0]).toMatchObject({ reportTemplate: "Lungs are clear.", report: { signedAt: NOW }, amendments: [{ previousNarrative: "Left" }] })
    expect(o.tests[1]).toMatchObject({ reportRequired: false, status: "performed", allowedActions: [] })
    expect(parseImagingOrderList(page([imgRow()])).items[0]).toMatchObject({ toPerform: 1, toReport: 0 })
  })
  it("print payloads keep verified/signed results only, with what is pending", () => {
    const hospital = { name: "City Hospital", address: null, phone: null, email: null, printHeader: null }
    const patientP = { mrNo: "MR-2026-0042", name: "Ayesha Khan", gender: "female", dateOfBirth: "1990-05-17", dateOfBirthEstimated: false }
    const lab = parseLabPrint({ hospital, orderNo: "LAB-2026-0007", priority: "routine", orderedAt: NOW, deliveredAt: null, patient: patientP, encounterNo: ["OPD-2026-0012"], referringDoctor: "Dr Imran", clinicalNotes: [], pathologistRemarks: [],
      specimens: [{ specimenNo: "SPM-2026-000001", specimenType: "Serum", collectedAt: NOW }], tests: [{ name: "CBC", amended: false, amendments: [], parameters: [{ name: "Haemoglobin", unit: "g/dL", value: "9.1", flag: "low", normalRange: "12.0 - 15.5" }], narrative: null, enteredBy: "Lab Tech", verifiedBy: "Dr Imran", verifiedAt: NOW }], pending: ["LFT"], complete: false })
    expect(lab).toMatchObject({ encounterNo: "OPD-2026-0012", pending: ["LFT"], complete: false })
    expect(lab.tests[0].parameters[0].flag).toBe("low")
    const img = parseImagingPrint({ hospital, orderNo: "XR-2026-0003", priority: "routine", orderedAt: NOW, deliveredAt: null, patient: patientP, encounterNo: [], referringDoctor: "Dr Imran", clinicalNotes: [],
      reports: [{ name: "Chest X-ray", modality: "X-Ray", narrative: "Normal.", amended: false, amendments: [], performedBy: "Lab Tech", performedAt: NOW, signedBy: "Dr Imran", signedAt: NOW }], unreported: [{ name: "USG", modality: "Ultrasound", performedBy: "Lab Tech", performedAt: NOW }], pending: [], complete: false })
    expect(img.reports).toHaveLength(1)
    expect(img.unreported[0].name).toBe("USG")
  })
})

describe("payloads are what the specification's DTOs say", () => {
  it("every payload validates against its DTO", () => {
    const tests = [{ testId: TEST }, { testId: TEST2, discount: { type: "percent" as const, value: "10" } }]
    expect(validate(orderPayload({ patientId: PAT, encounterId: ENC, doctorId: DOC, priority: "urgent", clinicalNotes: "Fever", tests }), schemaOf("CreateLabOrderDto"))).toEqual([])
    expect(validate(orderPayload({ patientId: PAT, referringDoctorText: "Dr Outside", priority: "routine", referredTo: "Chughtai Lab", tests: [{ testId: TEST }] }), schemaOf("CreateImagingOrderDto"))).toEqual([])
    expect(validate(addTestsPayload(tests), schemaOf("AddLabTestsDto"))).toEqual([])
    expect(validate(addTestsPayload(tests), schemaOf("AddImagingTestsDto"))).toEqual([])
    expect(validate(reasonPayload("Patient refused"), schemaOf("CancelLabTestDto"))).toEqual([])
    expect(validate(reasonPayload("Haemolysed"), schemaOf("RejectSpecimenDto"))).toEqual([])
    expect(validate(reasonPayload("Placed in error"), schemaOf("ArchiveLabOrderDto"))).toEqual([])
    expect(validate(resultPayload({ parameters: [{ key: "hb", value: "9.1" }] }), schemaOf("EnterResultDto"))).toEqual([])
    expect(validate(resultPayload({ narrative: "Smear shows microcytic cells." }), schemaOf("EnterResultDto"))).toEqual([])
    expect(validate(amendLabPayload({ parameters: [{ key: "hb", value: "9.0" }], reason: "Typing error" }), schemaOf("AmendResultDto"))).toEqual([])
    expect(validate(remarksPayload("Consistent with anaemia"), schemaOf("LabRemarksDto"))).toEqual([])
    expect(validate(remarksPayload(null), schemaOf("LabRemarksDto"))).toEqual([])
    expect(validate(imagingReportPayload("Lungs are clear."), schemaOf("WriteImagingReportDto"))).toEqual([])
    expect(validate(imagingAmendPayload("Right-sided effusion.", "Wrong side"), schemaOf("AmendImagingReportDto"))).toEqual([])
  })
  it("the outside doctor and the ordering doctor are exclusive; optional texts are left out unless typed", () => {
    expect(orderPayload({ patientId: PAT, priority: "routine", tests: [{ testId: TEST }] })).toEqual({ patientId: PAT, priority: "routine", tests: [{ testId: TEST }] })
    expect(() => orderPayload({ patientId: PAT, doctorId: DOC, referringDoctorText: "Dr Outside", priority: "routine", tests: [{ testId: TEST }] })).toThrow(/not both/)
  })
  it("input the server would refuse is refused first: no tests, too many, the same test twice, bad ids, a bad priority, short reasons, empty or double results", () => {
    expect(() => orderPayload({ patientId: PAT, priority: "routine", tests: [] })).toThrow(/at least one/)
    expect(() => orderPayload({ patientId: PAT, priority: "routine", tests: Array.from({ length: 31 }, (_, i) => ({ testId: ID(String.fromCharCode(65 + (i % 20))) + String(i).padStart(0, "0") })) })).toThrow(RangeError)
    expect(() => orderPayload({ patientId: PAT, priority: "routine", tests: [{ testId: TEST }, { testId: TEST }] })).toThrow(/twice/)
    expect(() => orderPayload({ patientId: "nope", priority: "routine", tests: [{ testId: TEST }] })).toThrow(RangeError)
    expect(() => orderPayload({ patientId: PAT, priority: "stat" as never, tests: [{ testId: TEST }] })).toThrow(RangeError)
    expect(() => orderPayload({ patientId: PAT, priority: "routine", tests: [{ testId: TEST, discount: { type: "percent", value: "0" } }] })).toThrow(RangeError)
    expect(() => reasonPayload("no")).toThrow(RangeError)
    expect(() => reasonPayload("x".repeat(501))).toThrow(RangeError)
    expect(() => resultPayload({})).toThrow(/not both and not neither/)
    expect(() => resultPayload({ parameters: [{ key: "hb", value: "9" }], narrative: "x" })).toThrow(/not both/)
    expect(() => resultPayload({ parameters: [{ key: "hb", value: "" }] })).toThrow(RangeError)
    expect(() => resultPayload({ parameters: [{ key: "hb", value: "1" }, { key: "hb", value: "2" }] })).toThrow(/twice/)
    expect(() => imagingReportPayload("   ")).toThrow(RangeError)
    expect(() => imagingAmendPayload("Right.", "ab")).toThrow(RangeError)
    expect(() => remarksPayload("x".repeat(2001))).toThrow(RangeError)
  })
  it("list queries send only what is set, mark the worklists, and refuse bad values", () => {
    expect(labListQuery({ page: 1, pageSize: 10, toCollect: true, sort: "priority:desc", status: "in_progress", search: " ayesha " })).toEqual({ page: 1, perPage: 10, toCollect: true, sort: "priority:desc", status: "in_progress", search: "ayesha" })
    expect(imagingListQuery({ modality: "Ultrasound", toPerform: true, toReport: true, includeArchived: true })).toEqual({ page: undefined, perPage: undefined, modality: "Ultrasound", toPerform: true, toReport: true, includeArchived: true })
    expect(() => labListQuery({ status: "done" as never })).toThrow(RangeError)
    expect(() => labListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => imagingListQuery({ modality: "PET" as never })).toThrow(RangeError)
    expect(() => labListQuery({ dateFrom: "2026-11-07", dateTo: "2026-11-01" })).toThrow(RangeError)
  })
})

describe("HTTP adapters: exact requests, ONE per write", () => {
  it("every lab call is its own request with the documented method and path", async () => {
    const calls = stub([
      json(page([labRow()])), json(labOrder()), json(labOrder(), 201), json(labOrder(), 201), json(labOrder()), json(labOrder()), json(labOrder()), json(labOrder()), json(labOrder()), json(labOrder()), json(labOrder()), json(labOrder()),
      json(labOrder()), json(labOrder()), json({ id: TEST, code: "CBC", name: "CBC", category: "Haematology", specimenType: "EDTA whole blood", rate: "600.00", gstPct: "0", discountPct: "0", turnaroundHours: 4, narrative: false, parameters: [], active: true, createdAt: NOW }),
    ])
    await httpLabApiService.list({ page: 1, pageSize: 10, toCollect: true })
    await httpLabApiService.get(ORD)
    await httpLabApiService.create({ patientId: PAT, priority: "routine", tests: [{ testId: TEST }] })
    await httpLabApiService.addTests(ORD, [{ testId: TEST2 }])
    await httpLabApiService.cancelTest(ORD, T1, "Patient refused")
    await httpLabApiService.collect(ORD, SPEC)
    await httpLabApiService.reject(ORD, SPEC, "Haemolysed")
    await httpLabApiService.enterResult(ORD, T1, { parameters: [{ key: "hb", value: "9.1" }] })
    await httpLabApiService.verify(ORD, T1)
    await httpLabApiService.amend(ORD, T1, { narrative: "Corrected.", reason: "Typing error" })
    await httpLabApiService.writeRemarks(ORD, "Consistent with anaemia")
    await httpLabApiService.deliver(ORD)
    await httpLabApiService.archive(ORD, "Placed in error")
    await httpLabApiService.restore(ORD)
    await httpLabApiService.testDefinition(TEST)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/v1/lab-orders?page=1&perPage=10&toCollect=true", `GET /api/v1/lab-orders/${ORD}`, "POST /api/v1/lab-orders", `POST /api/v1/lab-orders/${ORD}/tests`, `POST /api/v1/lab-orders/${ORD}/tests/${T1}/cancel`,
      `POST /api/v1/lab-orders/${ORD}/specimens/${SPEC}/collect`, `POST /api/v1/lab-orders/${ORD}/specimens/${SPEC}/reject`, `PUT /api/v1/lab-orders/${ORD}/tests/${T1}/result`, `POST /api/v1/lab-orders/${ORD}/tests/${T1}/verify`,
      `POST /api/v1/lab-orders/${ORD}/tests/${T1}/amend`, `PUT /api/v1/lab-orders/${ORD}/remarks`, `POST /api/v1/lab-orders/${ORD}/deliver`, `POST /api/v1/lab-orders/${ORD}/archive`, `POST /api/v1/lab-orders/${ORD}/restore`, `GET /api/v1/lab-tests/${TEST}`,
    ])
    expect(calls[7].body).toEqual({ parameters: [{ key: "hb", value: "9.1" }] })
    expect(calls[8].body).toBeUndefined() // verify has no body
    expect(calls[5].body).toBeUndefined() // collect has no body
  })
  it("every imaging call is its own request with the documented method and path", async () => {
    const calls = stub([json(page([imgRow()])), json(imgOrder()), json(imgOrder(), 201), json(imgOrder(), 201), json(imgOrder()), json(imgOrder()), json(imgOrder()), json(imgOrder()), json(imgOrder()), json(imgOrder()), json(imgOrder()), json(imgOrder())])
    await httpImagingApiService.list({ toReport: true, modality: "X-Ray" })
    await httpImagingApiService.get(ORD)
    await httpImagingApiService.create({ patientId: PAT, priority: "urgent", tests: [{ testId: TEST }] })
    await httpImagingApiService.addTests(ORD, [{ testId: TEST2 }])
    await httpImagingApiService.cancelTest(ORD, T1, "Patient refused")
    await httpImagingApiService.perform(ORD, T1)
    await httpImagingApiService.writeReport(ORD, T1, "Lungs are clear.")
    await httpImagingApiService.sign(ORD, T1)
    await httpImagingApiService.amend(ORD, T1, "Right-sided effusion.", "Wrong side")
    await httpImagingApiService.deliver(ORD)
    await httpImagingApiService.archive(ORD, "Placed in error")
    await httpImagingApiService.restore(ORD)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/v1/imaging-orders?modality=X-Ray&toReport=true", `GET /api/v1/imaging-orders/${ORD}`, "POST /api/v1/imaging-orders", `POST /api/v1/imaging-orders/${ORD}/tests`, `POST /api/v1/imaging-orders/${ORD}/tests/${T1}/cancel`,
      `POST /api/v1/imaging-orders/${ORD}/tests/${T1}/perform`, `PUT /api/v1/imaging-orders/${ORD}/tests/${T1}/report`, `POST /api/v1/imaging-orders/${ORD}/tests/${T1}/sign`, `POST /api/v1/imaging-orders/${ORD}/tests/${T1}/amend`,
      `POST /api/v1/imaging-orders/${ORD}/deliver`, `POST /api/v1/imaging-orders/${ORD}/archive`, `POST /api/v1/imaging-orders/${ORD}/restore`,
    ])
    expect(calls[6].body).toEqual({ narrative: "Lungs are clear." })
  })
  it("a refusal keeps its code and is sent exactly once; a network drop is never re-sent; an accepted but unreadable create is 'saved'", async () => {
    for (const [status, code] of [[422, "VERIFIER_IS_ENTERER"], [422, "SPECIMEN_NOT_COLLECTED"], [422, "RESULT_VERIFIED"], [422, "TEST_HAS_RESULT"], [422, "ORDER_NOT_COMPLETE"], [422, "ORDER_IS_REFERRAL"], [403, "FORBIDDEN"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused"), status)])
      await expect(httpLabApiService.verify(ORD, T1)).rejects.toMatchObject({ status, code })
      expect(calls, code).toHaveLength(1)
    }
    const dropped = stub([new TypeError("Failed to fetch")])
    await expect(httpLabApiService.collect(ORD, SPEC)).rejects.toBeTruthy()
    expect(dropped).toHaveLength(1)
    const unreadable = stub([new Response("<html>ok</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err = await httpLabApiService.create({ patientId: PAT, priority: "routine", tests: [{ testId: TEST }] }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err).kind).toBe("saved-unreadable")
    expect(unreadable).toHaveLength(1)
  })
  it("a bad value is refused before any request", async () => {
    const calls = stub([json(labOrder())])
    await expect(httpLabApiService.cancelTest(ORD, T1, "no")).rejects.toBeInstanceOf(RangeError)
    await expect(httpLabApiService.verify("nope", T1)).rejects.toBeInstanceOf(RangeError)
    await expect(httpLabApiService.enterResult(ORD, T1, {})).rejects.toBeInstanceOf(RangeError)
    await expect(httpImagingApiService.writeReport(ORD, T1, "  ")).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
})

describe("wiring", () => {
  it("the 29 new keys are the documented routes; the demo's old keys stay unset", () => {
    expect(ENDPOINTS["labApi.enterResult"]).toEqual({ method: "PUT", path: "/lab-orders/:id/tests/:testId/result" })
    expect(ENDPOINTS["labApi.collect"]).toEqual({ method: "POST", path: "/lab-orders/:id/specimens/:specimenId/collect" })
    expect(ENDPOINTS["labApi.remarks"]).toEqual({ method: "PUT", path: "/lab-orders/:id/remarks" })
    expect(ENDPOINTS["labApi.testDefinition"]).toEqual({ method: "GET", path: "/lab-tests/:id" })
    expect(ENDPOINTS["imagingApi.writeReport"]).toEqual({ method: "PUT", path: "/imaging-orders/:id/tests/:testId/report" })
    expect(ENDPOINTS["imagingApi.sign"]).toEqual({ method: "POST", path: "/imaging-orders/:id/tests/:testId/sign" })
    expect(Object.keys(ENDPOINTS).filter((k) => /^(labApi|imagingApi)\./.test(k) && ENDPOINTS[k as keyof typeof ENDPOINTS])).toHaveLength(29)
    for (const k of ["labOrders.list", "labOrders.transition", "imagingOrders.list", "imagingOrders.enterReport"] as const) expect(ENDPOINTS[k]).toBeNull()
  })
  it("every lab and imaging write also refreshes the bill, the hub lists, the accounts and the registers (tests post or void charges)", () => {
    const src = read("src/lib/services/index.ts")
    expect(src).toContain('["labApi", "invoice", "invoices", "account", "charges"]')
    expect(src).toContain('["imagingApi", "invoice", "invoices", "account", "charges"]')
  })
  it("the demo has no API-shaped orders: every call says so, with no request", async () => {
    const calls = stub([json({})])
    await expect(mockLabApiService.list()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockImagingApiService.sign("a", "b")).rejects.toBeInstanceOf(NotConnectedError)
    expect(calls).toHaveLength(0)
  })
})
