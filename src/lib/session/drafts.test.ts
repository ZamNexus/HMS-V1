import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { clearDrafts, forgetDraft, hasDrafts, markDraftGone, markDraftLive, onSessionEnded, onSignedIn, peekDraft, releaseDraftOnUnmount, saveDraft, takeDraft } from "./drafts"

const U1 = "01HZX0000000000000000000U1"
const U2 = "01HZX0000000000000000000U2"
const root = join(__dirname, "../../..")

beforeEach(() => clearDrafts())

describe("form drafts kept in memory across a session that ends", () => {
  it("peek reads without consuming (a form may mount twice in development); take consumes once", () => {
    saveDraft(U1, "imaging-test-template:new", "Findings: ")
    expect(peekDraft(U1, "imaging-test-template:new")).toBe("Findings: ")
    expect(peekDraft(U1, "imaging-test-template:new")).toBe("Findings: ")
    expect(takeDraft(U1, "imaging-test-template:new")).toBe("Findings: ")
    expect(peekDraft(U1, "imaging-test-template:new")).toBeUndefined()
  })
  it("a different user never sees it", () => {
    saveDraft(U1, "ward-beds:new", "A-01")
    expect(peekDraft(U2, "ward-beds:new")).toBeUndefined()
  })
  it("forgetting a field removes it; an empty value is the same as forgetting", () => {
    saveDraft(U1, "k", "text")
    forgetDraft(U1, "k")
    expect(hasDrafts(U1)).toBe(false)
    saveDraft(U1, "k", "text")
    saveDraft(U1, "k", "")
    expect(hasDrafts(U1)).toBe(false)
  })
  it("a draft owned by a form that is still on screen is not restored into a new instance of the same form (a reload remounts it)", () => {
    saveDraft(U1, "visit-1-chief", "typed text")
    markDraftLive(U1, "visit-1-chief")
    expect(peekDraft(U1, "visit-1-chief")).toBeUndefined() // the new instance starts from the server's data
    markDraftGone(U1, "visit-1-chief")
    expect(peekDraft(U1, "visit-1-chief")).toBe("typed text") // once nothing owns it (a past session's), it can be restored
    markDraftLive(U1, "k2"); markDraftLive(U1, "k2"); markDraftGone(U1, "k2") // two instances: one gone, one still there
    saveDraft(U1, "k2", "x")
    expect(peekDraft(U1, "k2")).toBeUndefined()
  })
  it("a form that closes normally (saved, cancelled, navigated away) leaves nothing behind", () => {
    saveDraft(U1, "user-notes:new", "text")
    releaseDraftOnUnmount(U1, "user-notes:new")
    expect(hasDrafts(U1)).toBe(false)
  })
  it.each(["shift-ended", "session-ended", "idle"] as const)("a form that unmounts because the session ended (%s) KEEPS its text for the same user", (reason) => {
    saveDraft(U1, "user-notes:new", "text")
    onSessionEnded(reason)
    releaseDraftOnUnmount(U1, "user-notes:new")
    expect(peekDraft(U1, "user-notes:new")).toBe("text")
    onSignedIn(U1)
    expect(peekDraft(U1, "user-notes:new")).toBe("text") // restored after signing in again
  })
  it("after signing in again, a form that closes normally is released again (the involuntary-end mark is reset)", () => {
    saveDraft(U1, "k", "text")
    onSessionEnded("idle")
    onSignedIn(U1)
    releaseDraftOnUnmount(U1, "k")
    expect(hasDrafts(U1)).toBe(false)
  })
  it("an explicit sign-out (here or in another tab) drops everything; another user signing in drops it too", () => {
    saveDraft(U1, "k", "text")
    onSessionEnded("signed-out-elsewhere")
    expect(hasDrafts(U1)).toBe(false)
    saveDraft(U1, "k", "text")
    onSessionEnded("idle")
    onSignedIn(U2)
    expect(peekDraft(U1, "k")).toBeUndefined()
    expect(hasDrafts(U2)).toBe(false)
  })
})

describe("where the drafts are used", () => {
  const src = (f: string) => readFileSync(join(root, f), "utf8")
  it("the long free-text fields of Phase 4 keep their text: imaging report template, new-ward bed list, user and doctor notes", () => {
    expect(src("src/components/masterdata/ImagingTestsTab.tsx")).toContain("useDraftState(`imaging-test-template:")
    expect(src("src/components/masterdata/WardsTab.tsx")).toContain('useDraftState("ward-beds:new"')
    expect(src("src/components/admin/UsersAdmin.tsx")).toContain("useDraftState(`user-notes:")
  })
  it("drafts are memory only: no web storage anywhere in the module or the hook, and the keys name a form, never a patient", () => {
    const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") // comments say what is NOT used
    for (const f of ["src/lib/session/drafts.ts", "src/lib/session/useDraftState.ts"]) expect(code(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
  })
})
