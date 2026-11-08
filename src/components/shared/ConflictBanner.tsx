import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shown after a 409 *_CHANGED (PATIENT_CHANGED, ENCOUNTER_CHANGED, SETTINGS_CHANGED, ...): someone else saved first. It keeps what the user typed
 * on screen (the form is not reset) and offers to load the current version, so nothing is lost and nothing is overwritten blindly.
 */
export function ConflictBanner({ what, onReload, requestId }: { what: string; onReload: () => void; requestId?: string | null }) {
  return (
    <div role="alert" data-testid="conflict-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        <span className="font-bold">Someone else changed this {what}.</span> Your changes have not been saved. Load the latest version, check it, then apply your changes again.
        {requestId && <span className="ml-2 text-[11px] opacity-80">Support reference: <span className="font-mono">{requestId}</span></span>}
      </p>
      <Button type="button" variant="outline" onClick={onReload} className="h-10">
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Load latest
      </Button>
    </div>
  )
}
