"use client"
import { useQuery } from "@tanstack/react-query"

import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { bedBoardService } from "@/lib/services"

/**
 * The live bed board (GET /wards/occupancy, needs ipd.read). A worklist: another desk may admit into a bed at any moment, so it is 15 s fresh and
 * refreshed every 30 s while a screen shows it. The board, the admission form's bed picker and the transfer dialog all read this one query.
 */
export function useBedBoard(enabled = true) {
  const key = useScopedKey("bedBoard")
  return useQuery({ queryKey: key, queryFn: ({ signal }) => bedBoardService.occupancy(signal), ...CACHE_CLASSES.worklist, enabled })
}
