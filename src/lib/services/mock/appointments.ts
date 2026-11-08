import { NotConnectedError } from "../errors"
import type { AppointmentsService, DoctorScheduleService } from "../types"

// The demo has no appointments and no doctor schedules (the screen is a placeholder in demo mode), so every call says so instead of inventing data.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo has none)`) }

export const mockAppointmentsService: AppointmentsService = {
  list: none("appointments"), get: none("appointments"), book: none("appointments"), reschedule: none("appointments"),
  confirm: none("appointments"), cancel: none("appointments"), noShow: none("appointments"),
}
export const mockDoctorScheduleService: DoctorScheduleService = {
  get: none("doctor schedules"), set: none("doctor schedules"), slots: none("appointment slots"),
}
