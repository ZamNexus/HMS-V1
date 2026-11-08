"use client"
import * as React from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { formatCnic, formatPhone, type DuplicateMatch } from "@/lib/services"

/**
 * Patients that share this phone number or CNIC (handoff 8.3). Two uses:
 *  - "inline": the warning when the phone or CNIC box loses focus. Advisory, never blocks;
 *  - "conflict": the answer of a refused registration (409 POSSIBLE_DUPLICATE). Staff open the existing record, restore an archived one
 *    (so the person is not registered twice), or confirm it is a different person and register anyway (sent once with acknowledgeDuplicates).
 * Names, phone numbers and CNICs are shown as text only, and the "open" link opens in a new tab so what was typed on this form is not lost.
 */
export function DuplicateMatchesPanel({
  matches, mode, canRestore, restoringId, restoredIds, onRestore, onRegisterAnyway, registering,
}: {
  matches: readonly DuplicateMatch[]
  mode: "inline" | "conflict"
  /** The user holds patients.archive, so an archived match offers Restore. */
  canRestore: boolean
  restoringId?: string | null
  restoredIds?: ReadonlySet<string>
  onRestore?: (match: DuplicateMatch) => void
  onRegisterAnyway?: () => void
  registering?: boolean
}) {
  if (matches.length === 0) return null
  return (
    <div role={mode === "conflict" ? "alert" : "status"} data-testid="duplicate-matches" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="font-bold">
          {mode === "conflict" ? "This phone number or CNIC is already registered. Check before registering again." : matches.length === 1 ? "A patient with this phone number or CNIC already exists." : `${matches.length} patients share this phone number or CNIC.`}
        </p>
      </div>
      <ul className="space-y-2">
        {matches.map((m) => {
          const restored = restoredIds?.has(m.id) ?? false
          const archived = m.archived && !restored
          return (
            <li key={m.id} data-testid={`duplicate-match-${m.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/70 p-3 ring-1 ring-amber-200">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#0D1B2E]">{m.name}</span>
                  <span className="font-mono text-xs text-[#0891B2]">{m.mrNo}</span>
                  {archived && <StatusBadge status="Inactive" />}
                  {m.deceasedOn && <StatusBadge status="Deceased" />}
                </div>
                <div className="text-xs text-slate-600">
                  {m.fatherName && <>{m.fatherName} · </>}{m.gender} · {formatPhone(m.phone)}{m.cnic ? ` · ${formatCnic(m.cnic)}` : ""}
                  {m.matchedOn.length > 0 && <> · same {m.matchedOn.join(" and ")}</>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild variant="outline" size="sm" className="rounded-lg">
                  <Link href={`/patients/${m.id}`} target="_blank" rel="noopener noreferrer">Open record</Link>
                </Button>
                {archived && canRestore && onRestore && (
                  <Button type="button" size="sm" className="rounded-lg" disabled={restoringId === m.id} onClick={() => onRestore(m)}>
                    {restoringId === m.id ? "Restoring…" : "Restore this patient"}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {matches.some((m) => m.archived) && !canRestore && <p className="text-xs">An archived record can only be restored by someone with permission to archive and restore patients.</p>}
      {mode === "conflict" && onRegisterAnyway && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3">
          <p className="text-xs">Only if you have checked and this is a different person (for example a family sharing a phone).</p>
          <Button type="button" variant="outline" className="rounded-xl border-amber-400 font-bold" disabled={registering} onClick={onRegisterAnyway}>
            {registering ? "Registering…" : "This is a different person: register anyway"}
          </Button>
        </div>
      )}
    </div>
  )
}
