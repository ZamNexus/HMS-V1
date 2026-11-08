import { NotConnectedError } from "../errors"
import type { PharmacyApiService } from "../types"

// The demo keeps the prototype's single-record pharmacy screens (mock/pharmacy.ts); this API-shaped service has no demo data, so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own pharmacy screens)`) }

export const mockPharmacyApiService: PharmacyApiService = {
  listMedicines: none("medicines"), getMedicine: none("medicines"), createMedicine: none("medicines"), updateMedicine: none("medicines"), setMedicineActive: none("medicines"), receiveStock: none("stock"),
  writeOff: none("stock"), adjust: none("stock"), movements: none("the stock card"), prescription: none("prescriptions"), dispense: none("dispensing"), listDispenses: none("dispensing"), getDispense: none("dispensing"),
  slip: none("the dispense slip"), returnLine: none("returns"),
}
