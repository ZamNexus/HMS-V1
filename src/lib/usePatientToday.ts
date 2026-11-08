"use client"
import { dataSource, localToday } from "@/lib/services"
import { useHospital } from "@/lib/session/useHospital"

/**
 * "Today" on the HOSPITAL's calendar (GET /settings `today`), for ages and date limits. Null while the settings load or failed to load, so a
 * caller shows "—" rather than an age computed from the browser's clock. Only the demo (mock mode, no settings) uses the browser's date.
 */
export function usePatientToday(): string | null {
  const { settings } = useHospital()
  return settings?.today ?? (dataSource === "mock" ? localToday() : null)
}

/** The hospital's date for screens that are not about a patient's age (appointments). */
export const useHospitalToday = usePatientToday

/** "34 yrs" / "~45 yrs" / "—" (the hospital's date is not known yet). */
export function ageLabel(format: (today: string) => string, today: string | null): string {
  return today === null ? "—" : format(today)
}
