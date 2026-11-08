import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { doctorListQuery, parseDoctorList, parseDoctorSummary } from "./http/doctorPicker"
import { httpDoctorsService } from "./http/doctors"
import { NotConnectedError } from "./errors"

const ID = "01HZX000000000000000000600"
const WIRE = { id: ID, name: "Dr Khan", specialization: "Cardiology", qualifications: "MBBS, FCPS", consultationFee: "1500.00" }

describe("doctors (S10): the picker list is GET /doctors", () => {
  it("reads an active doctor: fee as a number, the user id as the doctor id, nothing invented for phone / days / hours", () => {
    expect(parseDoctorSummary(WIRE)).toEqual({ id: ID, name: "Dr Khan", specialization: "Cardiology", qualifications: "MBBS, FCPS", pmcRegNo: "", fee: 1500, feeText: "1500.00", phone: "", active: true, availableDays: [], hoursFrom: "", hoursTo: "" })
  })
  it("a null specialization or qualifications is empty text; a missing fee or bad id is refused", () => {
    expect(parseDoctorSummary({ ...WIRE, specialization: null, qualifications: null })).toMatchObject({ specialization: "", qualifications: "" })
    expect(() => parseDoctorSummary({ ...WIRE, consultationFee: undefined })).toThrow(TypeError)
    expect(() => parseDoctorSummary({ ...WIRE, id: "7" })).toThrow(TypeError)
  })
  it("reads a page; the list query is server-side paging + search, perPage at most 100", () => {
    expect(parseDoctorList({ data: [WIRE], meta: { page: 1, perPage: 100, total: 1, totalPages: 1 } }).items).toHaveLength(1)
    expect(doctorListQuery({ page: 1, pageSize: 100, search: " khan " })).toMatchObject({ page: 1, perPage: 100, search: "khan" })
    expect(() => doctorListQuery({ pageSize: 500 })).toThrow(RangeError)
  })
  it("creating or editing a doctor through the doctor record stays refused: a doctor is a staff user", async () => {
    const input = { name: "N", specialization: "", qualifications: "", pmcRegNo: "", fee: 1, phone: "1", active: true, availableDays: [], hoursFrom: "", hoursTo: "" }
    await expect(httpDoctorsService.create(input)).rejects.toBeInstanceOf(NotConnectedError)
    await expect(httpDoctorsService.update("1", input)).rejects.toBeInstanceOf(NotConnectedError)
  })
  it("the Doctors screen manages doctors only through the staff-user service", () => {
    const src = readFileSync(join(__dirname, "../../components/admin/DoctorsAdmin.tsx"), "utf8")
    expect(src).toContain('role: "doctor"')
    expect(src).toContain('lockRole="doctor"')
    expect(src).not.toMatch(/doctorsService\.(create|update)/)
  })
})
