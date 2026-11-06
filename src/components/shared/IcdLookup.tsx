"use client"
import * as React from "react"
import { Search } from "lucide-react"

import { DISEASES } from "@/data/diseases"
import { dataSource } from "@/lib/services"
import type { DataSource } from "@/lib/services/dataSource"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

/**
 * ICD-10 diagnosis lookup. The list is the demo diagnosis array (the Master Data "Diagnoses" tab), which has no service and no confirmed
 * API contract. In API mode the lookup is therefore replaced by a disabled, explicitly "not connected" control: no demo diagnosis can be
 * offered or inserted into a real record. The diagnosis text field itself stays free-text and is unaffected.
 */
export function IcdLookup({ onSelect, source = dataSource }: { onSelect: (name: string, icdCode: string) => void; source?: DataSource }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const results = query.trim()
    ? DISEASES.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.icdCode.toLowerCase().includes(query.toLowerCase()))
    : DISEASES

  if (source !== "mock") {
    return (
      <button
        type="button" disabled data-testid="icd-lookup-pending"
        title="Not connected: no diagnosis (ICD-10) list contract has been provided to the frontend. Type the diagnosis instead."
        className="text-xs font-medium text-muted-foreground"
      >
        ICD-10 Lookup (not connected)
      </button>
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
