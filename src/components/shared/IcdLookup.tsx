"use client"
import * as React from "react"
import { Search } from "lucide-react"

import { demo } from "@hms/demo"
import { dataSource } from "@/lib/services"
import type { DataSource } from "@/lib/services/dataSource"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { IcdApiLookupBody } from "./IcdApiLookup"

/**
 * ICD-10 diagnosis lookup. In API mode it searches the server's shared, read-only ICD-10 list (GET /icd-codes: a diagnosis name or a code prefix,
 * debounced, nothing requested until the popover opens), so only real codes can be inserted. In mock mode it searches the demo diagnosis array
 * (the Master Data "Diagnoses" tab). The diagnosis text field itself stays free-text and is unaffected.
 */
export function IcdLookup({ onSelect, source = dataSource }: {
  /** `icdCodeId` is the ICD-10 record's id from GET /icd-codes (API mode only): handoff 8.5 sends a diagnosis as { icdCodeId?, text?, isPrimary }. */
  onSelect: (name: string, icdCode: string, icdCodeId?: string) => void
  source?: DataSource
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  // The demo list is only touched on the mock side: in API mode the seam is the production stub, which throws on any read.
  const demoDiseases = source === "api" ? [] : demo.data.DISEASES
  const results = query.trim()
    ? demoDiseases.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.icdCode.toLowerCase().includes(query.toLowerCase()))
    : demoDiseases

  if (source === "api") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="text-xs font-medium text-secondary hover:underline">ICD-10 Lookup</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          {open && <IcdApiLookupBody onPick={(d) => { onSelect(d.name, d.code, d.id); setOpen(false) }} />}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-xs font-medium text-secondary hover:underline">
          ICD-10 Lookup
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-8 pl-8 text-xs"
            placeholder="Search diagnosis or ICD code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {results.length === 0 && <p className="p-2 text-xs text-muted-foreground">No matches found.</p>}
          {results.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                onSelect(d.name, d.icdCode)
                setOpen(false)
                setQuery("")
              }}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">{d.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-secondary">{d.icdCode}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
