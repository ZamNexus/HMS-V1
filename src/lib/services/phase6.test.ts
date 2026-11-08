import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { ACTION_LABEL, STATUS_LABEL, addDays, dateFilterQuery, time12, visibleActions } from "@/components/appointments/appointmentUi"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import {
  APPOINTMENT_ACTIONS, appointmentListQuery, bookPayload, cancelPayload, freeSlotTimes, httpAppointmentsService, httpDoctorScheduleService, parseAppointment, parseAppointmentList, parseSchedule,
  parseSlots, reschedulePayload, schedulePayload, slotsQuery,
} from "./http/appointments"
import { mockAppointmentsService, mockDoctorScheduleService } from "./mock/appointments"
import { operation, schemaOf, validate } from "./http/specValidate"
import { classifyCreateError } from "./createOutcome"
import type { AppointmentAction } from "./types"

// Phase 6 (appointments and doctor schedules, handoff 8.4). Fixtures and request bodies are validated AGAINST docs/openapi.json first. Nothing here
// contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const A = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const PAT = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const DOC = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const USER = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const NOW = "2026-11-07T10:00:00.000Z"
const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const LENIENT = { lenientStringArrays: true } as const

const appt = (over: Record<string, unknown> = {}) => ({
  id: A, appointmentNo: "APT-2026-0012", status: "requested", date: "2026-11-09", time: "09:30", startsAt: "2026-11-09T04:30:00.000Z", endsAt: "2026-11-09T04:45:00.000Z", durationMinutes: 15,
  patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan", phone: "+923001234567" }, doctor: { id: DOC, name: "Dr Imran" }, notes: null, outsideSchedule: false, encounter: null,
  bookedAt: NOW, bookedBy: { id: USER, name: "Front Desk" }, confirmedAt: null, confirmedBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, noShowAt: null, noShowBy: null,
  allowedActions: ["confirm", "reschedule", "cancel"], ...over,
})
const page = (data: unknown[], total = data.length) => ({ data, meta: { page: 1, perPage: 10, total, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/appointments", timestamp: NOW })
function stub(responses: Array<Response>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    return responses[Math.min(i++, responses.length - 1)].clone()
  }))
  return calls
}

describe("fixtures are what the specification says", () => {
  it("an appointment, a page, a slot day and a schedule validate against their schemas", () => {
    expect(validate(appt(), schemaOf("AppointmentResponseDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([appt(), appt({ status: "completed", encounter: { id: PAT, encId: "OPD-2026-0007" }, allowedActions: [] })]), schemaOf("AppointmentPageDto_Output"), LENIENT)).toEqual([])
    expect(validate({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [{ time: "09:00", startsAt: "2026-11-09T04:00:00.000Z", state: "free" }] }, schemaOf("SlotsResponseDto_Output"))).toEqual([])
    expect(validate({ doctorId: DOC, days: ["mon", "wed"], from: "09:00", to: "17:00", slotMinutes: 15 }, schemaOf("ScheduleResponseDto_Output"), LENIENT)).toEqual([])
  })
})

describe("reading appointments", () => {
  it("maps an appointment: notes, actors, the visit, every status, and the allowed actions in a fixed order", () => {
    const r = parseAppointment(appt({ allowedActions: ["cancel", "confirm", "reschedule"] }))
    expect(r).toMatchObject({ id: A, appointmentNo: "APT-2026-0012", status: "requested", date: "2026-11-09", time: "09:30", durationMinutes: 15, notes: "", outsideSchedule: false, encounter: null, bookedBy: { id: USER, name: "Front Desk" }, confirmedBy: null })
    expect(r.allowedActions).toEqual(["confirm", "reschedule", "cancel"]) // the fixed order, whatever order the server used
    for (const status of ["requested", "confirmed", "completed", "cancelled", "no_show"]) expect(parseAppointment(appt({ status })).status).toBe(status)
    const done = parseAppointment(appt({ status: "completed", encounter: { id: PAT, encId: "OPD-2026-0007" }, allowedActions: [] }))
    expect(done.encounter).toEqual({ id: PAT, encId: "OPD-2026-0007" })
    const cancelled = parseAppointment(appt({ status: "cancelled", cancelledAt: NOW, cancelledBy: { id: USER, name: "Front Desk" }, cancelReason: "Patient asked", allowedActions: [] }))
    expect(cancelled).toMatchObject({ cancelReason: "Patient asked", cancelledBy: { name: "Front Desk" } })
  })
  it("an action this build does not know is simply not offered", () => {
    expect(parseAppointment(appt({ allowedActions: ["confirm", "teleport"] })).allowedActions).toEqual(["confirm"])
  })
  it("rejects malformed data loudly instead of rendering blanks", () => {
    expect(() => parseAppointment(appt({ id: "7" }))).toThrow(/id/)
    expect(() => parseAppointment(appt({ status: "maybe" }))).toThrow(/status/)
    expect(() => parseAppointment(appt({ time: "9.30" }))).toThrow(/time/)
    expect(() => parseAppointment(appt({ date: "09/11/2026" }))).toThrow(/date/)
    expect(() => parseAppointment(appt({ startsAt: "soon" }))).toThrow(/startsAt/)
    expect(() => parseAppointment(appt({ allowedActions: "confirm" }))).toThrow(/allowedActions/)
    expect(() => parseAppointment(appt({ patient: null }))).toThrow(/patient/)
    expect(() => parseAppointment(appt({ outsideSchedule: "no" }))).toThrow(/outsideSchedule/)
  })
  it("reads a page with the server's total", () => {
    const res = parseAppointmentList(page([appt()], 31))
    expect(res.total).toBe(31)
    expect(res.items).toHaveLength(1)
  })
  it("slots: free, booked and passed; a day with none is an empty list", () => {
    const s = parseSlots({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [
      { time: "09:00", startsAt: "2026-11-09T04:00:00.000Z", state: "free" }, { time: "09:15", startsAt: "2026-11-09T04:15:00.000Z", state: "booked" }, { time: "08:45", startsAt: "2026-11-09T03:45:00.000Z", state: "passed" },
    ] })
    expect(s.slots.map((x) => x.state)).toEqual(["free", "booked", "passed"])
    expect(freeSlotTimes(s.slots)).toEqual(["09:00"])
    expect(parseSlots({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [] }).slots).toEqual([])
    expect(() => parseSlots({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [{ time: "9", startsAt: NOW, state: "free" }] })).toThrow(/time/)
    expect(() => parseSlots({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [{ time: "09:00", startsAt: NOW, state: "open" }] })).toThrow(/state/)
  })
  it("schedule: days as mon..sun; from / to null until set; the spec's array typing for from / to is tolerated", () => {
    expect(parseSchedule({ doctorId: DOC, days: ["mon", "fri"], from: "09:00", to: "17:00", slotMinutes: 20 })).toEqual({ doctorId: DOC, days: ["mon", "fri"], from: "09:00", to: "17:00", slotMinutes: 20 })
    expect(parseSchedule({ doctorId: DOC, days: [], from: null, to: null, slotMinutes: 15 })).toMatchObject({ days: [], from: null, to: null })
    expect(parseSchedule({ doctorId: DOC, days: ["tue"], from: ["10:00"], to: ["14:00"], slotMinutes: 15 })).toMatchObject({ from: "10:00", to: "14:00" })
    expect(() => parseSchedule({ doctorId: DOC, days: ["monday"], from: null, to: null, slotMinutes: 15 })).toThrow(/day/)
    expect(() => parseSchedule({ doctorId: DOC, days: [], from: "9am", to: null, slotMinutes: 15 })).toThrow(/from/)
  })
})

describe("requests", () => {
  it("the list sends only documented parameters; refuses what the contract cannot take", () => {
    const documented = new Set(operation("get", "/api/v1/appointments").parameters!.map((p) => p.name))
    const q = appointmentListQuery({ page: 2, pageSize: 10, search: " ali ", date: "2026-11-09", dateFrom: "2026-11-01", dateTo: "2026-11-30", doctorId: DOC, patientId: PAT, status: "confirmed" })
    for (const k of Object.keys(q)) expect(documented.has(k), `${k} is not a documented query parameter`).toBe(true)
    expect(q).toMatchObject({ page: 2, perPage: 10, search: "ali", date: "2026-11-09", doctorId: DOC, patientId: PAT, status: "confirmed" })
    expect(() => appointmentListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => appointmentListQuery({ search: "x".repeat(101) })).toThrow(RangeError)
    expect(() => appointmentListQuery({ date: "09/11" })).toThrow(TypeError)
    expect(() => appointmentListQuery({ doctorId: "3" })).toThrow(TypeError)
    expect(() => appointmentListQuery({ status: "maybe" as never })).toThrow(TypeError)
    expect(slotsQuery("2026-11-09")).toEqual({ date: "2026-11-09" })
    expect(() => slotsQuery("tomorrow")).toThrow(TypeError)
  })
  it("schedule body validates against SetScheduleDto; days:[] is allowed; a day is sent once, in week order", () => {
    const body = schedulePayload({ days: ["fri", "mon", "mon"], from: "09:00", to: "17:00", slotMinutes: 15 })
    expect(body).toEqual({ days: ["mon", "fri"], from: "09:00", to: "17:00", slotMinutes: 15 })
    expect(validate(body, schemaOf("SetScheduleDto"))).toEqual([])
    const off = schedulePayload({ days: [], from: "09:00", to: "17:00", slotMinutes: 15 })
    expect(off.days).toEqual([])
    expect(validate(off, schemaOf("SetScheduleDto"))).toEqual([])
  })
  it("the schedule is refused before any request when it cannot work", () => {
    const ok = { days: ["mon"] as const, from: "09:00", to: "17:00", slotMinutes: 15 }
    expect(() => schedulePayload({ ...ok, days: [...ok.days], from: "17:00", to: "09:00" })).toThrow(RangeError)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], from: "09:00", to: "09:00" })).toThrow(RangeError)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], from: "09:00", to: "09:10", slotMinutes: 15 })).toThrow(/shorter than one slot/)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], slotMinutes: 4 })).toThrow(RangeError)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], slotMinutes: 241 })).toThrow(RangeError)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], slotMinutes: 12.5 })).toThrow(RangeError)
    expect(() => schedulePayload({ ...ok, days: [...ok.days], from: "9:00" })).toThrow(TypeError)
    expect(() => schedulePayload({ ...ok, days: ["funday" as never] })).toThrow(TypeError)
  })
  it("booking body validates against BookAppointmentDto; empty notes are left out; 'confirmed' only when true", () => {
    const body = bookPayload({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30", notes: "  first visit ", confirmed: true })
    expect(body).toEqual({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30", notes: "first visit", confirmed: true })
    expect(validate(body, schemaOf("BookAppointmentDto"))).toEqual([])
    const plain = bookPayload({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30", notes: "  ", confirmed: false })
    expect(plain).toEqual({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30" })
    expect(() => bookPayload({ patientId: "1", doctorId: DOC, date: "2026-11-09", time: "09:30" })).toThrow(TypeError)
    expect(() => bookPayload({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "9:30" })).toThrow(TypeError)
    expect(() => bookPayload({ patientId: PAT, doctorId: DOC, date: "09-11-2026", time: "09:30" })).toThrow(TypeError)
    expect(() => bookPayload({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30", notes: "x".repeat(501) })).toThrow(RangeError)
  })
  it("reschedule sends only what changes; a new day or doctor needs a new time; nothing to change is refused", () => {
    expect(reschedulePayload({ time: "10:00" })).toEqual({ time: "10:00" })
    expect(reschedulePayload({ date: "2026-11-10", time: "10:00", doctorId: DOC, notes: " moved " })).toEqual({ date: "2026-11-10", time: "10:00", doctorId: DOC, notes: "moved" })
    expect(validate(reschedulePayload({ date: "2026-11-10", time: "10:00" }), schemaOf("RescheduleAppointmentDto"))).toEqual([])
    expect(() => reschedulePayload({ date: "2026-11-10" })).toThrow(/free time/)
    expect(() => reschedulePayload({ doctorId: DOC })).toThrow(/free time/)
    expect(() => reschedulePayload({})).toThrow(/Nothing to change/)
    expect(() => reschedulePayload({ time: "25:00" })).toThrow(TypeError)
  })
  it("cancel needs a reason of 3 to 300 characters and validates against CancelAppointmentDto", () => {
    expect(cancelPayload("  Patient asked  ")).toEqual({ reason: "Patient asked" })
    expect(validate(cancelPayload("Patient asked"), schemaOf("CancelAppointmentDto"))).toEqual([])
    expect(() => cancelPayload("no")).toThrow(RangeError)
    expect(() => cancelPayload("x".repeat(301))).toThrow(RangeError)
  })
})

describe("HTTP adapters: exact requests", () => {
  it("list: GET /api/v1/appointments with the filters", async () => {
    const calls = stub([json(page([appt()], 1))])
    const res = await httpAppointmentsService.list({ date: "2026-11-09", doctorId: DOC, status: "requested", page: 1, pageSize: 10, search: "ali" })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: "GET", url: `/api/v1/appointments?page=1&perPage=10&search=ali&date=2026-11-09&doctorId=${DOC}&status=requested` })
    expect(res.total).toBe(1)
  })
  it("slots and schedule: GET /doctors/{id}/slots?date=, GET and PUT /doctors/{id}/schedule", async () => {
    const calls = stub([json({ doctorId: DOC, date: "2026-11-09", slotMinutes: 15, slots: [] }), json({ doctorId: DOC, days: ["mon"], from: "09:00", to: "17:00", slotMinutes: 15 }), json({ doctorId: DOC, days: ["mon"], from: "09:00", to: "17:00", slotMinutes: 20 })])
    await httpDoctorScheduleService.slots(DOC, "2026-11-09")
    await httpDoctorScheduleService.get(DOC)
    await httpDoctorScheduleService.set(DOC, { days: ["mon"], from: "09:00", to: "17:00", slotMinutes: 20 })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET /api/v1/doctors/${DOC}/slots?date=2026-11-09`, `GET /api/v1/doctors/${DOC}/schedule`, `PUT /api/v1/doctors/${DOC}/schedule`])
    expect(calls[2].body).toEqual({ days: ["mon"], from: "09:00", to: "17:00", slotMinutes: 20 })
  })
  it("book: exactly ONE POST /appointments; 409 SLOT_TAKEN keeps its code and is not re-sent", async () => {
    const calls = stub([json(errorBody(409, "SLOT_TAKEN", "Another appointment holds that time."), 409)])
    const err = await httpAppointmentsService.book({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30" }).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: "SLOT_TAKEN" })
    expect(classifyCreateError(err)).toMatchObject({ kind: "failed", code: "SLOT_TAKEN", heading: "That time was just taken", message: "Another appointment holds that time." })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/appointments" })
  })
  it("book: PATIENT_ALREADY_BOOKED, NOT_A_SLOT, SLOT_PASSED, DOCTOR_UNAVAILABLE, PATIENT_DECEASED each reach the screen with their code (one request each)", async () => {
    for (const [status, code] of [[409, "PATIENT_ALREADY_BOOKED"], [422, "NOT_A_SLOT"], [422, "SLOT_PASSED"], [422, "DOCTOR_UNAVAILABLE"], [422, "PATIENT_DECEASED"], [422, "PATIENT_ARCHIVED"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused"), status)])
      await expect(httpAppointmentsService.book({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30" })).rejects.toMatchObject({ status, code })
      expect(calls).toHaveLength(1)
      const out = classifyCreateError(new ApiError({ status, code, message: "refused" }))
      expect(out).toMatchObject({ kind: "failed", code })
      expect((out as { heading: string }).heading).not.toBe("Could not save") // each of these has its own heading
    }
  })
  it("a booked answer that cannot be read is 'saved', not a failure to retry", async () => {
    const calls = stub([new Response("<html>created</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err = await httpAppointmentsService.book({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30" }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err).kind).toBe("saved-unreadable")
    expect(calls).toHaveLength(1)
  })
  it("confirm and no-show POST with no body; cancel and reschedule carry theirs; each is sent once", async () => {
    const calls = stub([json(appt({ status: "confirmed" })), json(appt({ status: "no_show", allowedActions: [] })), json(appt({ status: "cancelled", allowedActions: [] })), json(appt({ time: "10:00" }))])
    await httpAppointmentsService.confirm(A)
    await httpAppointmentsService.noShow(A)
    await httpAppointmentsService.cancel(A, "Patient asked")
    await httpAppointmentsService.reschedule(A, { time: "10:00" })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/appointments/${A}/confirm`, `POST /api/v1/appointments/${A}/no-show`, `POST /api/v1/appointments/${A}/cancel`, `PATCH /api/v1/appointments/${A}`])
    expect(calls[0].body).toBeUndefined()
    expect(calls[1].body).toBeUndefined()
    expect(calls[2].body).toEqual({ reason: "Patient asked" })
    expect(calls[3].body).toEqual({ time: "10:00" })
  })
  it("a failed state change is never re-sent (APPOINTMENT_CHANGED, APPOINTMENT_NOT_OPEN, APPOINTMENT_NOT_TODAY)", async () => {
    for (const [status, code] of [[409, "APPOINTMENT_CHANGED"], [422, "APPOINTMENT_NOT_OPEN"], [422, "APPOINTMENT_NOT_TODAY"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused"), status)])
      await expect(httpAppointmentsService.confirm(A)).rejects.toMatchObject({ status, code })
      expect(calls).toHaveLength(1)
    }
  })
})

describe("the buttons are exactly the allowed actions", () => {
  const allSubsets = (): AppointmentAction[][] => {
    const out: AppointmentAction[][] = []
    for (let mask = 0; mask < 1 << APPOINTMENT_ACTIONS.length; mask++) out.push(APPOINTMENT_ACTIONS.filter((_, i) => mask & (1 << i)))
    return out
  }
  const permsSets: Array<readonly string[]> = [[], ["appointments.read"], ["appointments.write"], ["appointments.write", "encounters.check_in"], ["encounters.check_in"]]
  it("property: for every allowed-set and every permission set, no button is shown that the API did not allow, and a button needs its permission", () => {
    for (const allowed of allSubsets()) {
      for (const perms of permsSets) {
        const shown = visibleActions({ allowedActions: allowed }, (p) => perms.includes(p))
        for (const a of shown) expect(allowed, `${a} shown though not allowed`).toContain(a)
        for (const a of allowed) {
          const needs = a === "check_in" ? "encounters.check_in" : "appointments.write"
          expect(shown.includes(a), `${a} with ${perms.join(",") || "no permissions"}`).toBe(perms.includes(needs))
        }
        expect(shown).toEqual(APPOINTMENT_ACTIONS.filter((a) => shown.includes(a))) // the fixed order
      }
    }
  })
  it("a completed or cancelled appointment offers nothing", () => {
    expect(visibleActions(parseAppointment(appt({ status: "completed", allowedActions: [] })), () => true)).toEqual([])
    expect(visibleActions(parseAppointment(appt({ status: "cancelled", allowedActions: [] })), () => true)).toEqual([])
  })
  it("every status and action has a label", () => {
    for (const a of APPOINTMENT_ACTIONS) expect(ACTION_LABEL[a]).toBeTruthy()
    for (const s of ["requested", "confirmed", "completed", "cancelled", "no_show"] as const) expect(STATUS_LABEL[s]).toBeTruthy()
  })
})

describe("display helpers", () => {
  it("time12 and addDays use calendar arithmetic only", () => {
    expect(time12("00:00")).toBe("12:00 AM")
    expect(time12("09:30")).toBe("9:30 AM")
    expect(time12("12:15")).toBe("12:15 PM")
    expect(time12("17:45")).toBe("5:45 PM")
    expect(time12("soon")).toBe("soon")
    expect(addDays("2026-11-07", 1)).toBe("2026-11-08")
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
  it("the day choice becomes today (default), one day, upcoming (from today on) or no date filter", () => {
    expect(dateFilterQuery(undefined, "2026-11-07")).toEqual({ date: "2026-11-07" })
    expect(dateFilterQuery("2026-11-09", "2026-11-07")).toEqual({ date: "2026-11-09" })
    expect(dateFilterQuery("upcoming", "2026-11-07")).toEqual({ dateFrom: "2026-11-07" })
    expect(dateFilterQuery("all", "2026-11-07")).toEqual({})
    expect(dateFilterQuery("garbage", "2026-11-07")).toEqual({ date: "2026-11-07" })
  })
})

describe("wiring", () => {
  it("endpoint table: the handoff's routes", () => {
    expect(ENDPOINTS["schedule.get"]).toEqual({ method: "GET", path: "/doctors/:id/schedule" })
    expect(ENDPOINTS["schedule.set"]).toEqual({ method: "PUT", path: "/doctors/:id/schedule" })
    expect(ENDPOINTS["slots.list"]).toEqual({ method: "GET", path: "/doctors/:id/slots" })
    expect(ENDPOINTS["appointments.list"]).toEqual({ method: "GET", path: "/appointments" })
    expect(ENDPOINTS["appointments.book"]).toEqual({ method: "POST", path: "/appointments" })
    expect(ENDPOINTS["appointments.reschedule"]).toEqual({ method: "PATCH", path: "/appointments/:id" })
    expect(ENDPOINTS["appointments.confirm"]).toEqual({ method: "POST", path: "/appointments/:id/confirm" })
    expect(ENDPOINTS["appointments.cancel"]).toEqual({ method: "POST", path: "/appointments/:id/cancel" })
    expect(ENDPOINTS["appointments.noShow"]).toEqual({ method: "POST", path: "/appointments/:id/no-show" })
  })
  it("the demo has no appointments: every call says so, no data is invented", async () => {
    await expect(mockAppointmentsService.list()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockAppointmentsService.book({ patientId: PAT, doctorId: DOC, date: "2026-11-09", time: "09:30" })).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockDoctorScheduleService.slots(DOC, "2026-11-09")).rejects.toBeInstanceOf(NotConnectedError)
  })
  it("writes refresh the slot grid and the lists; a new schedule also refreshes the schedule and the appointments", () => {
    const src = read("src/lib/services/index.ts")
    expect(src).toContain('"appointments", ["book", "reschedule", "confirm", "cancel", "noShow"]')
    expect(src).toContain('"slots",\n  ["book", "reschedule", "cancel", "noShow"]')
    expect(src).toMatch(/"schedule", \["set"\]\), "slots", \["set"\]\),\s*"appointments",\s*\["set"\]/)
  })
  it("the screen: a worklist (15 s, polled), filters in the address bar but never the search, booking only with appointments.write, buttons only from allowedActions", () => {
    const screen = read("src/components/appointments/AppointmentsScreen.tsx")
    expect(screen).toContain("...CACHE_CLASSES.worklist")
    expect(screen).toContain('const URL_KEYS = ["page", "date", "doctor", "status"] as const')
    expect(screen).not.toMatch(/url\.set\(\{[^}]*search/)
    expect(screen).toContain('can("appointments.write")')
    expect(screen).toContain("useDebouncedSearch()")
    const actions = read("src/components/appointments/AppointmentActions.tsx")
    expect(actions).toContain("visibleActions(appointment, can)")
    expect(actions).toContain("<CheckInFromAppointmentDialog") // check-in is a real action since Phase 7 (AP5): POST /encounters/opd with the appointment's id
    const grid = read("src/components/appointments/SlotGrid.tsx")
    expect(grid).toContain("disabled={!isFree}") // only a free slot can be chosen
    expect(grid).toContain("...CACHE_CLASSES.worklist")
    const book = read("src/components/appointments/BookAppointmentDialog.tsx")
    expect(book).toContain('invalidateFamily("slots")') // SLOT_TAKEN reloads the grid
    const page = read("src/app/(dashboard)/appointments/page.tsx")
    expect(page).toContain('dataSource !== "api"')
    expect(page).toContain("React.Suspense")
  })
  it("the schedule editor sits on the Doctors screen: looking needs doctors.read, changing needs users.write", () => {
    const dlg = read("src/components/admin/DoctorScheduleDialog.tsx")
    expect(dlg).toContain('can("users.write")')
    expect(dlg).toContain("doctorScheduleService.set(")
    const doctors = read("src/components/admin/DoctorsAdmin.tsx")
    expect(doctors).toContain('can("doctors.read")')
    expect(doctors).toContain("<DoctorScheduleDialog")
  })
})
