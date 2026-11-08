"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import { setMoneyCurrency } from "@/lib/services/moneyMath"
import { useAuth } from "@/lib/auth"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { parseModules, parseSettings, type HospitalSettings } from "./hospital"
import type { ModuleSwitches } from "./permissions"

/**
 * The hospital's settings and department switches, loaded once after sign-in (cache class "session": never stale during the session; refreshed
 * by invalidating the "settings" family after the admin saves Clinic Settings). Not requested while a temporary password must still be changed
 * (every other route answers 403 PASSWORD_CHANGE_REQUIRED then); it loads as soon as that is done.
 */
export function useHospital(): {
  settings: HospitalSettings | null
  modules: ModuleSwitches
  loading: boolean
  error: unknown
  reload: () => void
} {
  const { user } = useAuth()
  const enabled = !!user && !user.mustChangePassword
  const settingsKey = useScopedKey("settings")
  const modulesKey = useScopedKey("settings", "modules")
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: async ({ signal }) => {
      const parsed = parseSettings(await api.get<unknown>("/settings", { signal }))
      setMoneyCurrency(parsed.currencyCode) // money text everywhere (showMoney, formatMoneyString) follows the hospital's currency, set before any screen reads the settings
      return parsed
    },
    enabled,
    ...CACHE_CLASSES.session,
  })
  const modules = useQuery({
    queryKey: modulesKey,
    queryFn: async ({ signal }) => parseModules(await api.get<unknown>("/settings/modules", { signal })),
    enabled,
    ...CACHE_CLASSES.session,
  })
  const { refetch: refetchSettings } = settings
  const { refetch: refetchModules } = modules
  const reload = React.useCallback(() => {
    void refetchSettings()
    void refetchModules()
  }, [refetchSettings, refetchModules])
  return {
    settings: settings.data ?? null,
    modules: modules.data ?? null,
    loading: enabled && (settings.isPending || modules.isPending),
    error: settings.error ?? modules.error,
    reload,
  }
}
