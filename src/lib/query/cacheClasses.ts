// Cache classes from MD section 6. A screen picks ONE class for each query; nothing else decides staleness.
//   session    /auth/me, /settings, /settings/modules: loaded once after sign-in, refreshed on sign-in and after a settings save.
//   reference  panels, relations, services, tests, wards, doctors, ICD: 10 minutes, invalidated after any Master Data write.
//   worklist   OPD queue, lab/imaging worklists, bed board, today's appointments: 15 s fresh, refetched every 30 s and on window focus.
//   dashboard  60 s fresh, refetched every 60 s.
//   record     the patient / encounter / invoice / order / dispense being worked on: always refetched, invalidated after every mutation.
//   register   /charges, /payments, /reports/*: always refetched on demand.
// Prints are never cached: use FETCH_FRESH.
export const CACHE_CLASSES = {
  session: { staleTime: Infinity, gcTime: Infinity },
  reference: { staleTime: 10 * 60_000 },
  worklist: { staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true },
  dashboard: { staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true },
  record: { staleTime: 0 },
  register: { staleTime: 0 },
} as const

export type CacheClass = keyof typeof CACHE_CLASSES

/** Print payloads (lab report, imaging report, dispense slip, receipt) are fetched fresh and not kept. */
export const FETCH_FRESH = { staleTime: 0, gcTime: 0 } as const
