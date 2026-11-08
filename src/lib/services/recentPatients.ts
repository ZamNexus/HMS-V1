import { patientsService } from "./index"

/**
 * The dashboard's "Recently registered patients" widget: ONE page of up to 100 patients (the API sorts newest first by default and the
 * widget sorts and keeps five itself). Fetching every patient on each dashboard load would be dozens of requests on a real database.
 */
export const RECENT_PATIENTS_PAGE_SIZE = 100
export const loadRecentPatients = (signal?: AbortSignal) => patientsService.list({ page: 1, pageSize: RECENT_PATIENTS_PAGE_SIZE, signal })
