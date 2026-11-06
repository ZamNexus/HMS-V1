import type { ReactNode } from "react"

import type { DataSource } from "@/lib/services/dataSource"
import { ContractPending } from "./ContractPending"

/**
 * Wraps a screen section that is still driven by the shared demo arrays directly (it has no service and no confirmed API contract).
 * In mock mode it renders its children unchanged. In API mode it renders the shared contract-pending notice INSTEAD — the children are
 * never mounted, so no demo record is displayed, no demo record can be edited as if it were real, and no "saved" toast can claim a
 * save that never reached a backend. Nothing is requested.
 *
 * `source` is passed in (the callers pass the build's `dataSource`) so both modes can be rendered on the server in a test.
 */
export function MockModeOnly({
  source, title, awaiting, testId, noun = "list", children,
}: { source: DataSource; title: string; awaiting: readonly string[]; testId: string; noun?: string; children?: ReactNode }) {
  if (source === "mock") return <>{children}</>
  return <ContractPending title={title} awaiting={awaiting} testId={testId} noun={noun} />
}
