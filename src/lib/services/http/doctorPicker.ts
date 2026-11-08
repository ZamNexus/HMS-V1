import type { QueryParams } from "@/lib/api/client"
import type { DoctorRecord, ListResult, WeekDay } from "../types"
import { WEEK_DAYS } from "./appointments"
import { asObj, optDecimalString, optStr, pageQuery, parsePage, reqStr, reqUlid } from "./wire"

// Doctor picker (chunk S10): GET /doctors returns the ACTIVE doctors as { id, name, specialization, qualifications, consultationFee }; the id is the
// doctor's staff-user id. The API has no phone, working days or hours here (the weekly schedule is chunk AP1), so those fields come back empty
// and nothing may treat "no days" as "never available". Handoff 8.11 says each doctor row MAY also carry its weekly `schedule` ({ days, from, to, slotMinutes }, the same
// answer as GET /doctors/{id}/schedule) for the Lists report's Available Days column; docs/openapi.json does not list it, so it is read when it is there and ignored when it
// is absent or malformed (never an error).

const DAY_LABEL: Record<WeekDay, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export function scheduleFields(raw: unknown): Pick<DoctorRecord, "availableDays" | "hoursFrom" | "hoursTo"> {
  const none = { availableDays: [] as string[], hoursFrom: "", hoursTo: "" }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return none
  const s = raw as Record<string, unknown>
  if (!Array.isArray(s.days)) return none
  const days = WEEK_DAYS.filter((d) => (s.days as unknown[]).includes(d)) // in week order, only the days the API names
  const from = typeof s.from === "string" && HHMM.test(s.from) ? s.from : ""
  const to = typeof s.to === "string" && HHMM.test(s.to) ? s.to : ""
  return { availableDays: days.map((d) => DAY_LABEL[d]), hoursFrom: from && to ? from : "", hoursTo: from && to ? to : "" }
}

export function doctorListQuery(params: { search?: string; page?: number; pageSize?: number }): QueryParams {
  return { ...pageQuery(params.page, params.pageSize), search: params.search?.trim() || undefined }
}

export function parseDoctorSummary(raw: unknown, dto = "DoctorPageDto_Output"): DoctorRecord {
  const o = asObj(raw, "doctor")
  const fee = optDecimalString(o, "consultationFee", "doctor", dto)
  if (fee === undefined) throw new TypeError("Unexpected response: doctor.consultationFee is missing.")
  return {
    id: reqUlid(o, "id", "doctor"),
    name: reqStr(o, "name", "doctor"),
    specialization: optStr(o, "specialization", "doctor", dto) ?? "",
    qualifications: optStr(o, "qualifications", "doctor", dto) ?? "",
    pmcRegNo: "",
    fee: Number(fee), // for the demo-shaped screens only
    feeText: fee,
    phone: "",
    active: true, // GET /doctors lists active doctors only
    ...scheduleFields(o.schedule),
  }
}

export function parseDoctorList(raw: unknown): ListResult<DoctorRecord> {
  return parsePage(raw, "doctors", (item) => parseDoctorSummary(item))
}
