/** Shown under a field whose text came back after the session ended (see useDraftState). Plain text, announced politely. */
export function RestoredNote({ show, className = "" }: { show: boolean; className?: string }) {
  if (!show) return null
  return <p role="status" className={`text-xs font-medium text-amber-700 ${className}`} data-testid="draft-restored">Restored your unsaved text from before you were signed out. Check it, then save.</p>
}
