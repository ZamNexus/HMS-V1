"use client"
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { ItemHistoryButton } from "@/components/shared/ItemHistoryButton"
import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { fieldErrorMap, isConflictChanged } from "@/lib/forms/fieldErrors"
import { invalidateFamily } from "@/lib/query/invalidate"
import { useScopedKey } from "@/lib/query/useScopedKey"
import {
  FISCAL_MONTHS, diffSettings, isSavedButUnreadableError, settingsFormOf, settingsService, validateSettingsForm, type SettingsForm,
} from "@/lib/services"
import { classifyCreateError, writeOutcomeUnknown, type CreateFailure } from "@/lib/services/createOutcome"
import type { HospitalSettings } from "@/lib/session/hospital"
import { useAuth } from "@/lib/auth"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { cardClass, inputClass, primaryBtnClass, selectClass } from "./catalogStyles"
import { ModuleSwitchesCard } from "./ModuleSwitchesCard"

const NOT_SET = "none"
const monthLabel = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)

/**
 * Master Data -> Clinic Settings (GET /settings via the session cache, PATCH /settings). Needs settings.write (the page only mounts it then).
 * Only the changed fields are sent, with the version that was loaded (expectedUpdatedAt). If someone else saved first (409 SETTINGS_CHANGED) the
 * typed values stay on screen under a "load latest" banner; nothing is overwritten blindly. The write is never re-sent automatically.
 */
export function ClinicSettingsTab() {
  const uid = React.useId()
  const { toast } = useToast()
  const qc = useQueryClient()
  const settingsKey = useScopedKey("settings")
  const { settings, loading, error, reload } = useHospital()
  const { user } = useAuth()
  const { pending, run } = useSubmitGuard()
  const [values, setValues] = React.useState<SettingsForm | null>(null)
  const [problems, setProblems] = React.useState<Record<string, string>>({})
  const [failure, setFailure] = React.useState<Extract<CreateFailure, { kind: "failed" }> | null>(null)
  const [conflict, setConflict] = React.useState<{ requestId: string | null } | null>(null)

  // A new loaded version (first load, own save, "Load latest") replaces the form; a background change never overwrites typing because the
  // settings are not refetched on focus (cache class "session").
  const [seededVersion, setSeededVersion] = React.useState<string | null>(null)
  if (settings && settings.updatedAt !== seededVersion) {
    // state adjusted during render (React's pattern for "reset when an input changes"): no extra frame with stale values
    setSeededVersion(settings.updatedAt)
    setValues(settingsFormOf(settings))
    setProblems({})
    setFailure(null)
    setConflict(null)
  }

  if (error && !settings) return <ErrorState error={error} onRetry={reload} />
  if (loading || !settings || !values) {
    return <div className={cn(cardClass, "max-w-3xl space-y-4 p-8")} data-testid="clinic-settings-loading"><Skeleton className="h-8 w-48" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
  }

  const original = settingsFormOf(settings)
  const changes = diffSettings(original, values)
  const dirty = Object.keys(changes).length > 0
  const set = (field: keyof SettingsForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setValues((v) => (v ? { ...v, [field]: value } : v))
    setProblems((p) => (p[field] ? { ...p, [field]: "" } : p))
  }

  async function save(current: HospitalSettings, form: SettingsForm) {
    const found = validateSettingsForm(form)
    setProblems(found as Record<string, string>)
    if (Object.keys(found).length > 0) return
    const patch = diffSettings(settingsFormOf(current), form)
    if (Object.keys(patch).length === 0) {
      toast({ title: "Nothing changed" })
      return
    }
    setFailure(null)
    setConflict(null)
    await run(async () => {
      try {
        const saved = await settingsService.update(patch, current.updatedAt)
        qc.setQueryData(settingsKey, saved) // the form re-seeds from the saved version
        toast({ title: "Clinic settings saved" })
      } catch (err) {
        // The server may have applied it (answer unreadable / never arrived): read the settings again so the screen shows the truth.
        if (isSavedButUnreadableError(err) || writeOutcomeUnknown(err)) void invalidateFamily("settings")
        if (isConflictChanged(err)) {
          setConflict({ requestId: isApiError(err) ? err.requestId : null })
          return
        }
        const result = classifyCreateError(err)
        if (result.kind === "saved-unreadable") {
          toast({ title: "Saved. Refreshing the settings." })
          return
        }
        const fromServer: Record<string, string> = {}
        for (const [path, message] of Object.entries(fieldErrorMap(err))) fromServer[path] = message
        if (result.code === "CURRENCY_LOCKED") fromServer.currencyCode = result.message
        if (result.code === "TIMEZONE_LOCKED") fromServer.timezone = result.message
        setProblems((prev) => ({ ...prev, ...fromServer }))
        setFailure(result)
      }
    })
  }

  async function loadLatest() {
    await invalidateFamily("settings")
    if (qc.getQueryState(settingsKey)?.status === "error") {
      toast({ variant: "destructive", title: "Could not load the latest settings", description: "Check your connection and try again." })
      return
    }
    const latest = qc.getQueryData<HospitalSettings>(settingsKey)
    if (!latest) return
    setValues(settingsFormOf(latest))
    setProblems({})
    setFailure(null)
    setConflict(null)
  }

  const text = (field: keyof SettingsForm, label: string, opts: { span?: boolean; rtl?: boolean; hint?: string; placeholder?: string } = {}) => (
    <div className={cn("space-y-1.5", opts.span && "sm:col-span-2")}>
      <Label htmlFor={`${uid}-${field}`} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
      <Input id={`${uid}-${field}`} className={inputClass} dir={opts.rtl ? "rtl" : undefined} value={values[field]} placeholder={opts.placeholder} aria-invalid={problems[field] ? true : undefined} onChange={set(field)} />
      {opts.hint && <p className="text-[11px] text-slate-500">{opts.hint}</p>}
      {problems[field] && <p role="alert" className="text-xs text-red-600">{problems[field]}</p>}
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6" data-testid="clinic-settings-tab">
      <div className={cn(cardClass, "p-8")}>
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-xl font-black text-[#0D1B2E]">Clinic Settings</h3>
          {user && <ItemHistoryButton subject="clinicSettings" id={user.hospital.id} label="Clinic Settings" />}
        </div>
        <p className="mb-6 text-sm text-slate-500">
          Hospital code <span className="font-mono font-bold text-slate-700" data-testid="hospital-code">{settings.hospitalCode}</span>
          <span className="mx-2">·</span>Today at the hospital <span className="font-bold text-slate-700">{settings.today}</span>
        </p>
        {conflict && <div className="mb-6"><ConflictBanner what="clinic settings" requestId={conflict.requestId} onReload={() => void loadLatest()} /></div>}
        <form className="space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); void save(settings, values) }}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {text("nameEn", "Clinic Name (English)")}
            {text("nameUr", "Clinic Name (Urdu)", { rtl: true })}
            {text("address", "Address", { span: true })}
            {text("phone", "Phone")}
            {text("email", "Email")}
            {text("tagline", "Tagline", { span: true })}
            <div className="sm:col-span-2 border-t border-slate-100 pt-4">{text("printHeader", "Print Header", { span: true })}</div>
            {text("currencyCode", "Currency", { hint: "Three-letter code, e.g. PKR. Locked once anything has been billed." })}
            {text("timezone", "Time Zone", { hint: "e.g. Asia/Karachi. Locked once visits exist." })}
            {text("defaultCity", "Default City")}
            {text("defaultCountry", "Default Country")}
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-fiscalYearStart`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Financial Year Start</Label>
              <Select value={values.fiscalYearStart || NOT_SET} onValueChange={(v) => setValues((cur) => (cur ? { ...cur, fiscalYearStart: v === NOT_SET ? "" : v } : cur))}>
                <SelectTrigger id={`${uid}-fiscalYearStart`} className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>Not set</SelectItem>
                  {FISCAL_MONTHS.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
              {problems.fiscalYearStart && <p role="alert" className="text-xs text-red-600">{problems.fiscalYearStart}</p>}
            </div>
          </div>
          {failure && <CreateErrorNote failure={failure} />}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
            <Button type="submit" className={cn(primaryBtnClass, "h-12 w-full md:w-auto")} disabled={pending || !dirty}>{pending ? "Saving…" : "Save Settings"}</Button>
            <Button type="button" variant="ghost" className="h-12 rounded-xl font-bold" disabled={pending || !dirty} onClick={() => { setValues(settingsFormOf(settings)); setProblems({}); setFailure(null) }}>Discard changes</Button>
          </div>
        </form>
      </div>
      <ModuleSwitchesCard />
    </div>
  )
}
