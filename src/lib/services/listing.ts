// Small pure helpers shared by the list screens (and unit-tested without React).

export const DEFAULT_PAGE_SIZE = 25

/** Which of the four mutually exclusive states a list screen should render. */
export type ViewState = "error" | "loading" | "empty" | "ready"

/**
 * Previously loaded rows stay visible during a reload (`data` is kept), so an
 * error or spinner only replaces the table when there is nothing to show.
 */
export function viewState(s: { data: unknown | null; error: unknown; loading: boolean; rowCount: number }): ViewState {
  if (s.error && !s.data) return "error"
  if (s.loading && !s.data) return "loading"
  return s.rowCount === 0 ? "empty" : "ready"
}

/** 1-based page slice, used by the mock adapters to mimic server-side paging. */
export function paginate<T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): T[] {
  const p = Math.max(1, Math.floor(page))
  return items.slice((p - 1) * pageSize, p * pageSize)
}

/** Header suffix like "(7 active)"; only truthful when every record is on screen. */
export function activeSuffix(rows: { active: boolean }[], total: number): string {
  return rows.length === total ? ` (${rows.filter((r) => r.active).length} active)` : ""
}
