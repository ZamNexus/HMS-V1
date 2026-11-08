import { NotConnectedError } from "../errors"
import type { ImagingApiService, LabApiService } from "../types"

// The demo keeps the prototype's single-record lab and imaging screens (mock/lab.ts, mock/imaging.ts); these API-shaped services have no demo data, so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own lab and imaging screens)`) }

export const mockLabApiService: LabApiService = {
  list: none("lab orders"), get: none("lab orders"), create: none("lab orders"), addTests: none("lab tests"), cancelTest: none("lab tests"), collect: none("specimens"), reject: none("specimens"),
  enterResult: none("results"), verify: none("verification"), amend: none("amendments"), writeRemarks: none("remarks"), deliver: none("delivery"), report: none("the lab report"),
  archive: none("lab orders"), restore: none("lab orders"), testDefinition: none("test definitions"),
}
export const mockImagingApiService: ImagingApiService = {
  list: none("imaging orders"), get: none("imaging orders"), create: none("imaging orders"), addTests: none("imaging tests"), cancelTest: none("imaging tests"), perform: none("imaging"),
  writeReport: none("imaging reports"), sign: none("signing"), amend: none("amendments"), deliver: none("delivery"), report: none("the imaging report"), archive: none("imaging orders"), restore: none("imaging orders"),
}
