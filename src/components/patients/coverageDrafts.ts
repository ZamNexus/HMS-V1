import type { PatientCoverage } from "@/lib/services"

// What a patient is covered by (handoff 8.3): at most one PRIMARY and one SECONDARY panel, each with member details. Sending `coverages` replaces
// the whole set, `[]` meaning self-pay. The form edits two slots; these helpers turn them into that set and back. Pure, so they are unit-tested.

export const NO_PANEL = "none"

/** What the form holds for one slot. Everything is text; `panelId` is NO_PANEL when the slot is empty. */
export interface CoverageDraft {
  panelId: string
  /** The organisation's name as the record carries it, so an inactive organisation (not in the picker's list) is still named. */
  panelName?: string
  memberNo: string
  principalMemberName: string
  principalRelation: string
  validFrom: string
  validTo: string
}
export interface CoverageDrafts { primary: CoverageDraft; secondary: CoverageDraft }

export const emptyDraft = (): CoverageDraft => ({ panelId: NO_PANEL, memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" })

const draftOf = (c: PatientCoverage | undefined): CoverageDraft =>
  c ? { panelId: c.panelId, panelName: c.panelName, memberNo: c.memberNo, principalMemberName: c.principalMemberName, principalRelation: c.principalRelation, validFrom: c.validFrom, validTo: c.validTo } : emptyDraft()

/** The two slots from a record's coverages. When a record has only the single `panelId` (older shape) it is the primary one. */
export function draftsOf(record: { panelId: string | null; coverages?: readonly PatientCoverage[] } | null): CoverageDrafts {
  if (!record) return { primary: emptyDraft(), secondary: emptyDraft() }
  if (record.coverages) {
    return { primary: draftOf(record.coverages.find((c) => c.priority === "primary")), secondary: draftOf(record.coverages.find((c) => c.priority === "secondary")) }
  }
  return { primary: record.panelId ? { ...emptyDraft(), panelId: record.panelId } : emptyDraft(), secondary: emptyDraft() }
}

/** The set to send. A secondary without a primary is dropped (the form does not allow it, and the contract has no such thing). */
export function coveragesOf(drafts: CoverageDrafts): PatientCoverage[] {
  const out: PatientCoverage[] = []
  const take = (d: CoverageDraft, priority: "primary" | "secondary") => {
    if (d.panelId === NO_PANEL) return
    out.push({ panelId: d.panelId, priority, memberNo: d.memberNo, principalMemberName: d.principalMemberName, principalRelation: d.principalRelation, validFrom: d.validFrom, validTo: d.validTo })
  }
  take(drafts.primary, "primary")
  if (drafts.primary.panelId !== NO_PANEL) take(drafts.secondary, "secondary")
  return out
}

/** A problem with the two slots as text, or null. Dates must not run backwards; the two organisations must differ. */
export function coverageProblem(drafts: CoverageDrafts): string | null {
  if (drafts.secondary.panelId !== NO_PANEL && drafts.primary.panelId === NO_PANEL) return "Choose the primary organisation before a secondary one"
  if (drafts.primary.panelId !== NO_PANEL && drafts.primary.panelId === drafts.secondary.panelId) return "The primary and secondary organisation must be different"
  for (const [label, d] of [["Primary", drafts.primary], ["Secondary", drafts.secondary]] as const) {
    if (d.panelId === NO_PANEL) continue
    if (d.validFrom && d.validTo && d.validFrom > d.validTo) return `${label} organisation: "valid from" must not be after "valid to"`
  }
  return null
}
