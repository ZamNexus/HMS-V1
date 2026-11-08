import { NotConnectedError } from "../errors"
import type { BedBoardService, VisitsService } from "../types"

// The demo keeps the prototype's single-record encounter wizard (see mock/encounters.ts); these API-shaped services have no demo data, so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own encounter screens)`) }

export const mockVisitsService: VisitsService = {
  list: none("visits"), get: none("visits"), forPatient: none("visits"), checkInOpd: none("check-in"), admit: none("admission"), correctCheckIn: none("check-in correction"),
  vitals: none("vitals"), recordVitals: none("vitals"), saveClinicalRecord: none("the clinical record"), close: none("closing a visit"), notes: none("progress notes"),
  addNote: none("progress notes"), transfer: none("transfers"), discharge: none("discharge"), cancel: none("cancelling a visit"), reopen: none("reopening a visit"),
  archive: none("archiving a visit"), restore: none("restoring a visit"),
}
export const mockBedBoardService: BedBoardService = { occupancy: none("the bed board"), setMaintenance: none("bed maintenance") }
