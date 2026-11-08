import { MODULE_NAMES, parseSettings, type HospitalSettings } from "@/lib/session/hospital"
import type { ModuleName } from "@/lib/session/permissions"
import { callEndpoint, createAndParse } from "./call"
import { asObj, reqBool, reqEnum } from "./wire"
import { settingsUpdatePayload, type SettingsPatch } from "../settingsHelpers"

// Clinic Settings (S1) and department switches (S2), connected to docs/openapi.json; not yet verified against a live backend.
// Reading (GET /settings, GET /settings/modules) is done once per session by src/lib/session/useHospital.ts.

export interface ModuleState {
  module: ModuleName
  enabled: boolean
  /** ISO instant the module was last switched on, or null. */
  enabledAt: string | null
}

export function parseModuleState(raw: unknown): ModuleState {
  const o = asObj(raw, "module state")
  const enabledAt = o.enabledAt
  if (enabledAt !== null && enabledAt !== undefined && typeof enabledAt !== "string") throw new TypeError("Unexpected response: module state.enabledAt is not a date.")
  return { module: reqEnum(o, "module", "module state", MODULE_NAMES), enabled: reqBool(o, "enabled", "module state"), enabledAt: (enabledAt as string | null | undefined) ?? null }
}

export interface SettingsService {
  /** PATCH /settings with ONLY the changed fields and the loaded version; resolves to the saved settings. Never re-sent. */
  update(patch: SettingsPatch, expectedUpdatedAt: string): Promise<HospitalSettings>
  /** POST /settings/modules/{module}/enable | disable. */
  setModule(module: ModuleName, enabled: boolean): Promise<ModuleState>
}

export const httpSettingsService: SettingsService = {
  async update(patch, expectedUpdatedAt) {
    return createAndParse("settings.update", { body: () => settingsUpdatePayload(patch, expectedUpdatedAt) }, (raw) => parseSettings(raw), "clinic settings")
  },
  async setModule(module, enabled) {
    return createAndParse(enabled ? "settings.moduleEnable" : "settings.moduleDisable", { params: { module } }, (raw) => parseModuleState(raw), "change")
  },
}
