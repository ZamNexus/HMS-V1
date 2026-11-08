import { QueryClient } from "@tanstack/react-query"

// One QueryClient for the browser. Rules (MD section 6): client-side fetching only; never persisted (no persistQueryClient, nothing in
// localStorage); no optimistic updates for money, stock or clinical data (nothing here writes to the cache before the server answers).
// Retries: the API client already retries a failed GET twice (F2) and never retries a write, so React Query must not retry on top of that.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, gcTime: 5 * 60_000 },
      mutations: { retry: false },
    },
  })
}

let browserClient: QueryClient | null = null

/** The shared client. On the server a fresh one is returned every time, so nothing is ever shared between users. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return createQueryClient()
  browserClient ??= createQueryClient()
  return browserClient
}

/** Sign-out and user change: drop everything. */
export function clearQueryCache(): void {
  browserClient?.clear()
}
