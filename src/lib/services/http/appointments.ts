import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { isUlid } from "@/lib/api/convert"
import type {
  AppointmentAction, AppointmentActorRef, AppointmentBookInput, AppointmentListOptions, AppointmentRecord, AppointmentReschedulePatch, AppointmentStatus,
  AppointmentsService, DoctorScheduleService, ListResult, ScheduleInput, ScheduleRecord, SlotRecord, SlotsResult, WeekDay,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optStr, pageQuery, parsePage, reqEnum, reqBool, reqDate, reqInt, reqStr, reqUlid, type Obj } from "./wire"

// Appointments and doctor schedules (handoff 8.4; docs/openapi.json AppointmentResponseDto / AppointmentPageDto / SlotsResponseDto / ScheduleResponseDto,
// BookAppointmentDto / RescheduleAppointmentDto / CancelAppointmentDto / SetScheduleDto). Dates are YYYY-MM-DD and times HH:MM in the HOSPITAL's zone.

export const WEEK_DAYS: readonly WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ["requested", "confirmed", "completed", "cancelled", "no_show"]
/** The order the buttons are shown in. */
export const APPOINTMENT_ACTIONS: readonly AppointmentAction[] = ["confirm", "reschedule", "cancel", "no_show", "check_in"]
export const APPOINTMENT_LIMITS = { notes: 500, reason: { min: 3, max: 300 }, search: 100, slotMinutes: { min: 5, max: 240 } } as const

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

function reqTime(o: Obj, key: string, what: string): string {
  const v = reqStr(o, key, what)
  if (!TIME_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not an HH:MM time.`)
  return v
}
function reqInstant(o: Obj, key: string, what: string): string {
  const v = reqStr(o, key, what)
  if (Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a date-time.`)
  return v
}
function optInstant(o: Obj, key: string, what: string): string | null {
  return o[key] === null || o[key] === undefined ? null : reqInstant(o, key, what)
}
function actorOf(o: Obj, key: string, what: string): AppointmentActorRef | null {
  const raw = o[key]
  if (raw === null || raw === undefined) return null
  const a = asObj(raw, `${what}.${key}`)
  return { id: reqUlid(a, "id", `${what}.${key}`), name: reqStr(a, "name", `${what}.${key}`) }
}

// ── Reading ──

export function parseAppointment(raw: unknown, what = "appointment", dto = "AppointmentResponseDto_Output"): AppointmentRecord {
  const o = asObj(raw, what)
  const patient = asObj(o.patient, `${what}.patient`)
  const doctor = asObj(o.doctor, `${what}.doctor`)
  const enc = o.encounter === null || o.encounter === undefined ? null : asObj(o.encounter, `${what}.encounter`)
  if (!Array.isArray(o.allowedActions)) throw new TypeError(`Unexpected response: ${what}.allowedActions is not an array.`)
  // an action this build does not know is simply not offered (a newer backend may add some)
  const allowed = APPOINTMENT_ACTIONS.filter((a) => (o.allowedActions as unknown[]).includes(a))
  return {
    id: reqUlid(o, "id", what),
    appointmentNo: reqStr(o, "appointmentNo", what),
    status: reqEnum(o, "status", what, APPOINTMENT_STATUSES),
    date: reqDate(o, "date", what),
    time: reqTime(o, "time", what),
    startsAt: reqInstant(o, "startsAt", what),
    endsAt: reqInstant(o, "endsAt", what),
    durationMinutes: reqInt(o, "durationMinutes", what),
    patient: { id: reqUlid(patient, "id", `${what}.patient`), mrNo: reqStr(patient, "mrNo", `${what}.patient`), name: reqStr(patient, "name", `${what}.patient`), phone: reqStr(patient, "phone", `${what}.patient`) },
    doctor: { id: reqUlid(doctor, "id", `${what}.doctor`), name: reqStr(doctor, "name", `${what}.doctor`) },
    notes: optStr(o, "notes", what, dto) ?? "",
    outsideSchedule: reqBool(o, "outsideSchedule", what),
    encounter: enc ? { id: reqUlid(enc, "id", `${what}.encounter`), encId: reqStr(enc, "encId", `${what}.encounter`) } : null,
    bookedAt: reqInstant(o, "bookedAt", what),
    bookedBy: actorOf(o, "bookedBy", what),
    confirmedAt: optInstant(o, "confirmedAt", what),
    confirmedBy: actorOf(o, "confirmedBy", what),
    cancelledAt: optInstant(o, "cancelledAt", what),
    cancelledBy: actorOf(o, "cancelledBy", what),
    cancelReason: optStr(o, "cancelReason", what, dto) ?? null,
    noShowAt: optInstant(o, "noShowAt", what),
    noShowBy: actorOf(o, "noShowBy", what),
    allowedActions: allowed,
  }
}

export function parseAppointmentList(raw: unknown): ListResult<AppointmentRecord> {
  return parsePage(raw, "appointments", (item) => parseAppointment(item, "appointments[]", "AppointmentPageDto_Output"))
}

export function parseSlots(raw: unknown): SlotsResult {
  const o = asObj(raw, "slots")
  if (!Array.isArray(o.slots)) throw new TypeError("Unexpected response: slots.slots is not an array.")
  return {
    doctorId: reqUlid(o, "doctorId", "slots"),
    date: reqDate(o, "date", "slots"),
    slotMinutes: reqInt(o, "slotMinutes", "slots"),
    slots: o.slots.map((s, i): SlotRecord => {
      const w = `slots.slots[${i}]`
      const slot = asObj(s, w)
      return { time: reqTime(slot, "time", w), startsAt: reqInstant(slot, "startsAt", w), state: reqEnum(slot, "state", w, ["free", "booked", "passed"]) }
    }),
  }
}

/**
 * GET /doctors/{id}/schedule. `from` / `to` are null until a schedule has been set. The spec types them "array of string" in this answer (a spec
 * bug, like the other single-text fields); a plain string, null or a one-element array is accepted.
 */
export function parseSchedule(raw: unknown): ScheduleRecord {
  const o = asObj(raw, "schedule")
  if (!Array.isArray(o.days)) throw new TypeError("Unexpected response: schedule.days is not an array.")
  const days = o.days.map((d) => {
    if (typeof d !== "string" || !(WEEK_DAYS as readonly string[]).includes(d)) throw new TypeError("Unexpected response: schedule.days has an unknown day.")
    return d as WeekDay
  })
  const time = (key: "from" | "to"): string | null => {
    const v = optStr(o, key, "schedule", "ScheduleResponseDto_Output")
    if (v === undefined || v === "") return null
    if (!TIME_RE.test(v)) throw new TypeError(`Unexpected response: schedule.${key} is not an HH:MM time.`)
    return v
  }
  return { doctorId: reqUlid(o, "doctorId", "schedule"), days, from: time("from"), to: time("to"), slotMinutes: reqInt(o, "slotMinutes", "schedule") }
}

// ── Requests ──

export function appointmentListQuery(p: Pick<AppointmentListOptions, "page" | "pageSize" | "search" | "date" | "dateFrom" | "dateTo" | "doctorId" | "patientId" | "status">): QueryParams {
  const search = p.search?.trim()
  if (search && search.length > APPOINTMENT_LIMITS.search) throw new RangeError("The search text can be at most 100 characters.")
  for (const d of [p.date, p.dateFrom, p.dateTo]) if (d !== undefined && !DATE_RE.test(d)) throw new TypeError("Dates must be YYYY-MM-DD.")
  for (const id of [p.doctorId, p.patientId]) if (id !== undefined && !isUlid(id)) throw new TypeError("The doctor or patient id is not a valid backend id.")
  if (p.status !== undefined && !APPOINTMENT_STATUSES.includes(p.status)) throw new TypeError("Unknown appointment status.")
  return { ...pageQuery(p.page, p.pageSize), search: search || undefined, date: p.date, dateFrom: p.dateFrom, dateTo: p.dateTo, doctorId: p.doctorId, patientId: p.patientId, status: p.status }
}

export function slotsQuery(date: string): QueryParams {
  if (!DATE_RE.test(date)) throw new TypeError("The date must be YYYY-MM-DD.")
  return { date }
}

export type ScheduleBody = Schemas["SetScheduleDto"]
/**
 * PUT /doctors/{id}/schedule replaces the WHOLE weekly schedule. `days: []` takes the doctor off appointments (from / to / slotMinutes are still
 * required by the contract and are sent as given). With days chosen the window must hold at least one slot.
 */
export function schedulePayload(input: ScheduleInput): ScheduleBody {
  const days = [...new Set(input.days)]
  for (const d of days) if (!WEEK_DAYS.includes(d)) throw new TypeError("Unknown day of the week.")
  if (!TIME_RE.test(input.from) || !TIME_RE.test(input.to)) throw new TypeError("The hours must be HH:MM.")
  const { min, max } = APPOINTMENT_LIMITS.slotMinutes
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes < min || input.slotMinutes > max) throw new RangeError(`The slot length must be a whole number from ${min} to ${max} minutes.`)
  if (days.length > 0) {
    if (minutesOf(input.from) >= minutesOf(input.to)) throw new RangeError("The closing time must be after the opening time.")
    if (minutesOf(input.to) - minutesOf(input.from) < input.slotMinutes) throw new RangeError("The hours are shorter than one slot.")
  }
  return { days: WEEK_DAYS.filter((d) => days.includes(d)), from: input.from, to: input.to, slotMinutes: input.slotMinutes }
}

export type BookBody = Schemas["BookAppointmentDto"]
/** POST /appointments body. `time` must be a free slot start (the screen picks it from the slot grid; the server answers NOT_A_SLOT otherwise). */
export function bookPayload(input: AppointmentBookInput): BookBody {
  if (!isUlid(input.patientId) || !isUlid(input.doctorId)) throw new TypeError("The patient or doctor id is not a valid backend id.")
  if (!DATE_RE.test(input.date)) throw new TypeError("The date must be YYYY-MM-DD.")
  if (!TIME_RE.test(input.time)) throw new TypeError("The time must be HH:MM.")
  const body: BookBody = { patientId: input.patientId, doctorId: input.doctorId, date: input.date, time: input.time }
  const notes = input.notes?.trim()
  if (notes) {
    if (notes.length > APPOINTMENT_LIMITS.notes) throw new RangeError("The notes can be at most 500 characters.")
    body.notes = notes
  }
  if (input.confirmed === true) body.confirmed = true
  return body
}

export type RescheduleBody = Schemas["RescheduleAppointmentDto"]
/** PATCH /appointments/{id}: only what changes. A new date or doctor needs a new time (it must be a slot start of that doctor on that day). */
export function reschedulePayload(patch: AppointmentReschedulePatch): RescheduleBody {
  const body: RescheduleBody = {}
  if (patch.doctorId !== undefined) {
    if (!isUlid(patch.doctorId)) throw new TypeError("The doctor id is not a valid backend id.")
    body.doctorId = patch.doctorId
  }
  if (patch.date !== undefined) {
    if (!DATE_RE.test(patch.date)) throw new TypeError("The date must be YYYY-MM-DD.")
    body.date = patch.date
  }
  if (patch.time !== undefined) {
    if (!TIME_RE.test(patch.time)) throw new TypeError("The time must be HH:MM.")
    body.time = patch.time
  }
  if (patch.notes !== undefined) {
    if (patch.notes.trim().length > APPOINTMENT_LIMITS.notes) throw new RangeError("The notes can be at most 500 characters.")
    body.notes = patch.notes.trim()
  }
  if ((body.date !== undefined || body.doctorId !== undefined) && body.time === undefined) throw new RangeError("Choose a free time when the day or the doctor changes.")
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to change.")
  return body
}

export type CancelBody = Schemas["CancelAppointmentDto"]
export function cancelPayload(reason: string): CancelBody {
  const r = reason.trim()
  const { min, max } = APPOINTMENT_LIMITS.reason
  if (r.length < min || r.length > max) throw new RangeError(`The reason needs ${min} to ${max} characters.`)
  return { reason: r }
}

/** Starts of the free slots only: the times a booking or a reschedule may use. */
export function freeSlotTimes(slots: readonly SlotRecord[]): string[] {
  return slots.filter((s) => s.state === "free").map((s) => s.time)
}

// ── Services ──

export const httpAppointmentsService: AppointmentsService = {
  async list(opts = {}) {
    return parseAppointmentList(await callEndpoint<unknown>("appointments.list", { query: () => appointmentListQuery(opts), signal: opts.signal }))
  },
  async get(id, signal) {
    return parseAppointment(await callEndpoint<unknown>("appointments.get", { params: { id }, signal }))
  },
  async book(input) {
    // exactly ONE POST per call; a 2xx whose answer cannot be read is "saved" (SavedButUnreadableError), never re-sent
    return createAndParse("appointments.book", { body: () => bookPayload(input) }, (raw) => parseAppointment(raw), "appointment")
  },
  async reschedule(id, patch) {
    return createAndParse("appointments.reschedule", { params: { id }, body: () => reschedulePayload(patch) }, (raw) => parseAppointment(raw), "change")
  },
  async confirm(id) {
    return createAndParse("appointments.confirm", { params: { id } }, (raw) => parseAppointment(raw), "change")
  },
  async cancel(id, reason) {
    return createAndParse("appointments.cancel", { params: { id }, body: () => cancelPayload(reason) }, (raw) => parseAppointment(raw), "change")
  },
  async noShow(id) {
    return createAndParse("appointments.noShow", { params: { id } }, (raw) => parseAppointment(raw), "change")
  },
}

export const httpDoctorScheduleService: DoctorScheduleService = {
  async get(doctorId, signal) {
    return parseSchedule(await callEndpoint<unknown>("schedule.get", { params: { id: doctorId }, signal }))
  },
  async set(doctorId, input) {
    return createAndParse("schedule.set", { params: { id: doctorId }, body: () => schedulePayload(input) }, (raw) => parseSchedule(raw), "change")
  },
  async slots(doctorId, date, signal) {
    return parseSlots(await callEndpoint<unknown>("slots.list", { params: { id: doctorId }, query: () => slotsQuery(date), signal }))
  },
}
