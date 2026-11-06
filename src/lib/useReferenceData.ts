"use client"
import * as React from "react"

import {
  REFERENCE_TTL_MS, bankAccountsService, buildLookup, expenseCategoriesService, doctorsService, encountersService, guardianRelationsService, imagingOrdersService, labOrdersService, labTestsService, medicinesService, organisationsService, patientsService, wardsService,
  type BankAccountRecord, type DoctorRecord, type EncounterRecord, type ExpenseCategoryRecord, type GuardianRelationRecord, type ImagingOrderRecord, type LabOrderRecord, type LabTestRecord, type Lookup, type MedicineRecord, type OrganisationRecord, type PatientRecord, type RefId, type WardRecord,
} from "@/lib/services"
import { loadShared } from "@/lib/services/reference/cache"
import { listAll, type AllItems } from "@/lib/services/reference/listAll"
import { useResource } from "@/lib/useResource"

// Shared, asynchronous access to reference data for screens that need to resolve ids or fill a picker.
// Same contract in mock and API mode: { data, loading, error, reload } plus a lookup keyed by id.
// Ids are compared as strings (see services/reference/refId.ts), so a screen that still stores a numeric
// `doctorId` and one that stores a ULID both work; an id nothing matches simply yields `undefined`.
//
// MIGRATION RECIPE for a screen that reads DOCTORS / PANELS directly:
//   const { lookup, active, loading, error } = useDoctors()
//   lookup.get(encounter.doctorId)?.name ?? "—"      // instead of DOCTORS.find((d) => d.userId === id)?.name
//   active                                           // instead of activeDoctors()
// and render loading / error / empty states instead of assuming the data is already there.

export interface ReferenceList<T> {
  items: readonly T[]
  lookup: Lookup<T>
  /** Records with `active !== false`. */
  active: readonly T[]
  /** False if the list could not be fetched in full: lookups may then miss records that do exist. */
  complete: boolean
  loading: boolean
  error: unknown
  reload: () => void
}

const EMPTY: AllItems<never> = { items: [], total: 0, complete: true }

function useReferenceList<T extends object>(
  key: string,
  fetchAll: () => Promise<AllItems<T>>,
  idOf: (item: T) => RefId,
  enabled: boolean
): ReferenceList<T> {
  const load = React.useCallback(
    () => (enabled ? loadShared(key, fetchAll, REFERENCE_TTL_MS) : Promise.resolve(EMPTY as AllItems<T>)),
    [key, fetchAll, enabled]
  )
  const { data, error, loading, reload } = useResource(load)
  return React.useMemo(() => {
    const items = data?.items ?? []
    return {
      items,
      lookup: buildLookup(items, idOf),
      active: items.filter((i) => (i as { active?: boolean }).active !== false),
      complete: data?.complete ?? true,
      loading: enabled && loading,
      error,
      reload,
    }
    // idOf is a stable module-level function at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error, loading, reload, enabled])
}

const fetchDoctors = () => listAll((o) => doctorsService.list(o))
const fetchOrganisations = () => listAll((o) => organisationsService.list(o))
const fetchGuardianRelations = () => listAll((o) => guardianRelationsService.list(o))
const doctorId = (d: DoctorRecord) => d.id
const recordId = (r: { id: string }) => r.id

/** All doctors, for name lookups and selection. Pass `enabled: false` to skip the request entirely. */
export function useDoctors(enabled = true): ReferenceList<DoctorRecord> {
  return useReferenceList("doctors", fetchDoctors, doctorId, enabled)
}

export function useOrganisations(enabled = true): ReferenceList<OrganisationRecord> {
  return useReferenceList("organisations", fetchOrganisations, recordId, enabled)
}

export function useGuardianRelations(enabled = true): ReferenceList<GuardianRelationRecord> {
  return useReferenceList("guardianRelations", fetchGuardianRelations, recordId, enabled)
}

/**
 * One patient by id, shared between components and refreshed after patient mutations.
 * `id` is an opaque string: it is passed through untouched, never converted to a number.
 * With no id (e.g. a create form) nothing is requested and `data` is null.
 */
export function usePatient(id: string | undefined) {
  const load = React.useCallback(
    (): Promise<PatientRecord | null> =>
      id === undefined ? Promise.resolve(null) : loadShared(`patient:${id}`, () => patientsService.get(id), REFERENCE_TTL_MS),
    [id]
  )
  return useResource(load)
}

/** Wards with their beds (live bed status). Pass `enabled: false` when beds aren't needed (e.g. an OPD encounter). */
export function useWards(enabled = true): ReferenceList<WardRecord> {
  return useReferenceList("wards", fetchWards, recordId, enabled)
}

const fetchWards = () => listAll((o) => wardsService.list(o))

/** One encounter by id, shared between components and refreshed after encounter mutations. Opaque string id. */
export function useEncounter(id: string | undefined) {
  const load = React.useCallback(
    (): Promise<EncounterRecord | null> =>
      id === undefined ? Promise.resolve(null) : loadShared(`encounter:${id}`, () => encountersService.get(id), REFERENCE_TTL_MS),
    [id]
  )
  return useResource(load)
}

/**
 * Patients for a set of ids (e.g. the rows of an encounter list), each fetched at most once through the shared
 * `patient:<id>` cache. A patient that can't be fetched is simply absent from the lookup; `failed` says so, so the
 * screen can show "—" instead of claiming the patient is unknown. Batch lookup is CONTRACT REQUIRED: until the
 * backend offers one this is one request per distinct id.
 */
export function usePatients(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",")
  const load = React.useCallback(async (): Promise<{ items: PatientRecord[]; failed: boolean }> => {
    const unique = key ? key.split(",") : []
    const results = await Promise.allSettled(
      unique.map((id) => loadShared(`patient:${id}`, () => patientsService.get(id), REFERENCE_TTL_MS))
    )
    return {
      items: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      failed: results.some((r) => r.status === "rejected"),
    }
  }, [key])
  const { data, error, loading, reload } = useResource(load)
  return React.useMemo(
    () => ({ lookup: buildLookup(data?.items ?? [], (p) => p.id), loading, failed: Boolean(error) || (data?.failed ?? false), reload }),
    [data, error, loading, reload]
  )
}

const fetchLabTests = () => listAll((o) => labTestsService.list(o))

/** The lab diagnostics catalog (tests, rates, parameters). Pass `enabled: false` to skip the request. */
export function useLabTests(enabled = true): ReferenceList<LabTestRecord> {
  return useReferenceList("labTests", fetchLabTests, recordId, enabled)
}

/** One lab order by id, shared between components and refreshed after lab-order mutations. Opaque string id. */
export function useLabOrder(id: string | undefined) {
  const load = React.useCallback(
    (): Promise<LabOrderRecord | null> =>
      id === undefined ? Promise.resolve(null) : loadShared(`labOrder:${id}`, () => labOrdersService.get(id), REFERENCE_TTL_MS),
    [id]
  )
  return useResource(load)
}

/** One imaging order by id, shared between components and refreshed after imaging-order mutations. Opaque string id. */
export function useImagingOrder(id: string | undefined) {
  const load = React.useCallback(
    (): Promise<ImagingOrderRecord | null> =>
      id === undefined ? Promise.resolve(null) : loadShared(`imagingOrder:${id}`, () => imagingOrdersService.get(id), REFERENCE_TTL_MS),
    [id]
  )
  return useResource(load)
}

const fetchExpenseCategories = () => listAll((o) => expenseCategoriesService.list(o))
const fetchBankAccounts = () => listAll((o) => bankAccountsService.list(o))

/** Expense heads (T6), for the expense form's category list and the Master Data tab. Refreshed after any head change. */
export function useExpenseCategories(enabled = true): ReferenceList<ExpenseCategoryRecord> {
  return useReferenceList("expenseCategories", fetchExpenseCategories, recordId, enabled)
}

/** Bank accounts (T7), for the transfer form's account list and the Master Data tab. Refreshed after any account change. */
export function useBankAccounts(enabled = true): ReferenceList<BankAccountRecord> {
  return useReferenceList("bankAccounts", fetchBankAccounts, recordId, enabled)
}

const fetchMedicines = () => listAll((o) => medicinesService.list(o))

/** The pharmacy medicine catalogue with stock (inventory screen, dispense form, header tiles). Refreshed after any stock change. */
export function useMedicines(enabled = true): ReferenceList<MedicineRecord> {
  return useReferenceList("medicines", fetchMedicines, recordId, enabled)
}
