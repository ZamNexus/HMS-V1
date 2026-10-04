import * as React from "react"
import { Search, User, X } from "lucide-react"
import { differenceInYears } from "date-fns"

import { PATIENTS } from "@/data/patients"
import { cn, initials } from "@/lib/utils"
import type { Patient } from "@/types"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

export function PatientPicker({
  value,
  onChange,
}: {
  value: Patient | null
  onChange: (patient: Patient | null) => void
}) {
  const [query, setQuery] = React.useState("")

  const results = React.useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.trim().toLowerCase()
    return PATIENTS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.mrNo.toLowerCase().includes(q) || p.phone.includes(q)
    ).slice(0, 6)
  }, [query])

  if (value) {
    const age = value.age ?? differenceInYears(new Date(), new Date(value.dob))
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-secondary bg-accent-50 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-navy-700 text-white">{initials(value.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold text-foreground">{value.name}</div>
            <div className="font-mono text-xs text-secondary">{value.mrNo}</div>
            <div className="text-xs text-muted-foreground">
              {age} · {value.gender} · {value.phone}
            </div>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
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
          className="pl-9"
          placeholder="Search by patient name, MR No. or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full space-y-1 rounded-md border border-border bg-white p-1.5 shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p)
                setQuery("")
              }}
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
                  <span className="font-mono text-secondary">{p.mrNo}</span> · {p.age} {p.gender.charAt(0)} · {p.phone}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && results.length === 0 && (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <User className="h-4 w-4" /> No matching patients found.
        </div>
      )}
    </div>
  )
}
