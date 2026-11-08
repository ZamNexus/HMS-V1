"use client"
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  REFERENCE_TTL_MS, bankAccountsService, buildLookup, expenseCategoriesService, doctorsService, encountersService, guardianRelationsService, imagingOrdersService, labOrdersService, labTestsService, medicinesService, organisationsService, patientsService, wardsService,
  type BankAccountRecord, type DoctorRecord, type EncounterRecord, type ExpenseCategoryRecord, type GuardianRelationRecord, type ImagingOrderRecord, type LabOrderRecord, type LabTestRecord, type Lookup, type MedicineRecord, type OrganisationRecord, type PatientRecord, type RefId, type WardRecord,
} from "@/lib/services"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { scopedKey } from "@/lib/query/scope"
import { useQueryScope, useScopedKey } from "@/lib/query/useScopedKey"
import { useQueryResource } from "@/lib/query/useQueryResource"
import { listAll, type AllItems } from "@/lib/services/reference/listAll"

// Shared, asynchronous access to reference data for screens that need to resolve ids or fill a picker. Built on React Query (src/lib/query):
// keys are [hospitalId, userId, family, ...]; a mutation made through a service invalidates its family (invalidatingService in services/index.ts).
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

/** Reference lists: 10 minutes in API mode (MD cache class "reference"); 0 in mock mode, where unmigrated screens still mutate the demo arrays directly. */
const REFERENCE_STALE_MS = REFERENCE_TTL_MS === 0 ? 0 : CACHE_CLASSES.reference.staleTime
/** Live status data that changes while people work (bed status, stock levels): the MD "worklist" freshness (15 s), no polling; 0 in mock mode. */
const LIVE_STALE_MS = REFERENCE_TTL_MS === 0 ? 0 : CACHE_CLASSES.worklist.staleTime
/** A record someone is working on is always refetched when a screen opens (MD cache class "record"). */
const RECORD_STALE_MS = CACHE_CLASSES.record.staleTime
/**
 * Row labels in a list (usePatients) are looked up one patient at a time (N+1) and are NOT a record being worked on, so they keep a short
 * cache. This goes away when the backend offers a batch lookup (CONTRACT REQUIRED) or the list endpoint carries the label.
 */
const ROW_LABEL_STALE_MS = REFERENCE_TTL_MS

/**
 * Query options for a whole-list reference query. The queryFn must NOT depend on `enabled`: options are shared by every observer of the same
 * key, so a disabled observer's queryFn could end up fetching for (or filling the shared entry for) an enabled one. `enabled` only decides
 * whether this observer starts a fetch.
 */
export function referenceListOptions<T>(key: string, fetchAll: () => Promise<AllItems<T>>, staleTime: number) {
  return { queryKey: scopedKey(key), queryFn: () => fetchAll(), staleTime }
}

function useReferenceList<T extends object>(
  key: string,
  fetchAll: () => Promise<AllItems<T>>,
  idOf: (item: T) => RefId,
  enabled: boolean,
  staleTime: number = REFERENCE_STALE_MS
): ReferenceList<T> {
  useQueryScope() // a change of user re-renders the screen, which then builds keys for the new user
  const { data, error, loading, reload } = useQueryResource<AllItems<T>>({ ...referenceListOptions(key, fetchAll, staleTime), enabled })
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
  return useQueryResource<PatientRecord | null>({
    queryKey: useScopedKey("patient", id ?? null),
    queryFn: () => (id === undefined ? Promise.resolve(null) : patientsService.get(id)),
    staleTime: RECORD_STALE_MS,
    enabled: id !== undefined,
  })
}

/** Wards with their beds (live bed status). Pass `enabled: false` when beds aren't needed (e.g. an OPD encounter). */
export function useWards(enabled = true): ReferenceList<WardRecord> {
  // live bed status: the MD "bed board" freshness, not the 10-minute reference class
  return useReferenceList("wards", fetchWards, recordId, enabled, LIVE_STALE_MS)
}

const fetchWards = () => listAll((o) => wardsService.list(o))

/** One encounter by id, shared between components and refreshed after encounter mutations. Opaque string id. */
export function useEncounter(id: string | undefined) {
  return useQueryResource<EncounterRecord | null>({
    queryKey: useScopedKey("encounter", id ?? null),
    queryFn: () => (id === undefined ? Promise.resolve(null) : encountersService.get(id)),
    staleTime: RECORD_STALE_MS,
    enabled: id !== undefined,
  })
}

/**
 * Patients for a set of ids (e.g. the rows of an encounter list), each fetched at most once through the shared
 * `patient:<id>` cache. A patient that can't be fetched is simply absent from the lookup; `failed` says so, so the
 * screen can show "—" instead of claiming the patient is unknown. Batch lookup is CONTRACT REQUIRED: until the
 * backend offers one this is one request per distinct id.
 */
export function usePatients(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",")
  const queryClient = useQueryClient()
  // family "patient" so a patient mutation also refreshes the row labels; each patient shares the entry usePatient uses
  const { data, error, loading, reload } = useQueryResource<{ items: PatientRecord[]; failed: boolean }>({
    queryKey: useScopedKey("patient", "batch", key),
    queryFn: async () => {
      const unique = key ? key.split(",") : []
      const results = await Promise.allSettled(
        unique.map((id) => queryClient.fetchQuery({ queryKey: scopedKey("patient", id), queryFn: () => patientsService.get(id), staleTime: ROW_LABEL_STALE_MS }))
      )
      return {
        items: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
        failed: results.some((r) => r.status === "rejected"),
      }
    },
    staleTime: ROW_LABEL_STALE_MS,
  })
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
  return useQueryResource<LabOrderRecord | null>({
    queryKey: useScopedKey("labOrder", id ?? null),
    queryFn: () => (id === undefined ? Promise.resolve(null) : labOrdersService.get(id)),
    staleTime: RECORD_STALE_MS,
    enabled: id !== undefined,
  })
}

/** One imaging order by id, shared between components and refreshed after imaging-order mutations. Opaque string id. */
export function useImagingOrder(id: string | undefined) {
  return useQueryResource<ImagingOrderRecord | null>({
    queryKey: useScopedKey("imagingOrder", id ?? null),
    queryFn: () => (id === undefined ? Promise.resolve(null) : imagingOrdersService.get(id)),
    staleTime: RECORD_STALE_MS,
    enabled: id !== undefined,
  })
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
  // stock levels change with every dispense: short freshness, not the 10-minute reference class
  return useReferenceList("medicines", fetchMedicines, recordId, enabled, LIVE_STALE_MS)
}
