"use client"
import * as React from "react"

/** True while the browser reports a connection. Unknown (server render, no navigator) counts as online. */
export function useOnline(): boolean {
  return React.useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify)
      window.addEventListener("offline", notify)
      return () => {
        window.removeEventListener("online", notify)
        window.removeEventListener("offline", notify)
      }
    },
    () => navigator.onLine,
    () => true
  )
}

/** Persistent banner while offline. Writes are refused by the API client until the connection is back (F2). */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="alert" data-testid="offline-banner" className="fixed inset-x-0 top-0 z-[100] bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
      You are offline. Changes cannot be saved until the connection is back.
    </div>
  )
}
