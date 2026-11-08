"use client"
import { QueryClientProvider } from "@tanstack/react-query"
import type * as React from "react"
import { getQueryClient } from "./client"

/** Wraps the app once, above AuthProvider. All authenticated data is fetched client-side (no Server Components, Server Actions or route handlers for data). */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
}
