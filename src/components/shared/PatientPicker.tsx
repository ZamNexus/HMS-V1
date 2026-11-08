"use client"
import * as React from "react"
import { Search, User, X } from "lucide-react"

import { errorSummary, formatPatientAge, patientsService, toLegacyPatient, type PatientRecord } from "@/lib/services"
import { usePickerOptions } from "@/lib/query/usePickerOptions"
import { usePatientToday } from "@/lib/usePatientToday"
import { cn, initials } from "@/lib/utils"
import type { Patient } from "@/types"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

type Shown = Pick<Patient, "name" | "mrNo" | "gender" | "phone" | "dob"> & { age?: number }

/**
 * Shared search-and-select UI. `onSelect` may return an error message to refuse the selection (used by the
 * legacy wrapper when a patient has no numeric legacy id).
 */
function PatientPickerBase({
  selected, onSelect, onClear, id,
}: {
  selected: Shown | null
  onSelect: (record: PatientRecord) => string | void
  onClear: () => void
  id?: string
}) {
  const [selectError, setSelectError] = React.useState("")
  const today = usePatientToday()

  // The list endpoint with perPage=6: searched from 2 characters after a 300 ms pause, the previous request aborted (handoff 6). Live patients
  // only (archived ones are left out by default). The search text stays in this component, never in the address bar.
  const picker = usePickerOptions("patient", async ({ search, perPage, signal }) =>
    search ? (await patientsService.list({ search, pageSize: perPage, signal })).items : []
  )
  const query = picker.input
  const term = picker.searching ? query.trim() : null
  const results = picker.searching ? picker.options : []
  const loading = picker.loading
  const error = picker.error

  const choose = (record: PatientRecord) => {
    const refusal = onSelect(record)
    if (refusal) {
      setSelectError(refusal)
      return
    }
    picker.onInputChange("")
    setSelectError("")
  }

  if (selected) {
    const age = today === null ? "—" : formatPatientAge({ dob: selected.dob }, today)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-secondary bg-accent-50 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-navy-700 text-white">{initials(selected.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold text-foreground">{selected.name}</div>
            <div className="font-mono text-xs text-secondary">{selected.mrNo}</div>
            <div className="text-xs text-muted-foreground">
              {age} · {selected.gender} · {selected.phone}
            </div>
          </div>
        </div>
        <Button aria-label="Clear selected patient" type="button" variant="ghost" size="icon" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className="pl-9"
          placeholder="Search by patient name, MR No. or phone..."
          value={query}
          onChange={(e) => picker.onInputChange(e.target.value)}
        />
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full space-y-1 rounded-md border border-border bg-white p-1.5 shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent-50"
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-navy-100 text-navy-700 text-xs">{initials(p.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono text-secondary">{p.mrNo}</span> · {today === null ? "—" : formatPatientAge(p, today)} {p.gender.charAt(0)} · {p.phone}{p.deceasedOn ? " · Deceased" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {term && loading && results.length === 0 && (
        <div role="status" className="mt-1.5 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Searching…</div>
      )}
      {term && Boolean(error) && (
        <div role="alert" className="mt-1.5 rounded-md border border-dashed border-red-200 p-3 text-xs text-red-600">
          Couldn&apos;t search patients: {errorSummary(error)}
        </div>
      )}
      {selectError && (
        <div role="alert" className="mt-1.5 rounded-md border border-dashed border-red-200 p-3 text-xs text-red-600">{selectError}</div>
      )}
      {term && !loading && !error && results.length === 0 && !selectError && (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <User className="h-4 w-4" /> No matching patients found.
        </div>
      )}
    </div>
  )
}

/**
 * For screens that have been migrated to string ids: selects a PatientRecord, whatever its id format
 * (ULID or numeric string). Prefer this for any new or migrated form.
 */
export function PatientRecordPicker({
  value, onChange, id,
}: {
  value: PatientRecord | null
  onChange: (patient: PatientRecord | null) => void
  id?: string
}) {
  return <PatientPickerBase selected={value} onSelect={(r) => { onChange(r) }} onClear={() => onChange(null)} id={id} />
}

/**
 * Legacy picker for screens that still use numeric-id `Patient` (billing, lab, imaging, pharmacy…). Emits the
 * legacy `Patient` (numeric id) because those screens are not migrated yet. A patient whose id has no faithful
 * numeric form (e.g. a real ULID) is refused with a message instead of passing an invalid id along.
 */
export function PatientPicker({
  value,
  onChange,
  id,
}: {
  value: Patient | null
  onChange: (patient: Patient | null) => void
  /** Id for the search input, so a <Label htmlFor> can point at it */
  id?: string
}) {
  return (
    <PatientPickerBase
      selected={value}
      onSelect={(record) => {
        try {
          onChange(toLegacyPatient(record))
        } catch (err) {
          return err instanceof Error ? err.message : "This patient can't be selected here."
        }
      }}
      onClear={() => onChange(null)}
      id={id}
    />
  )
}
