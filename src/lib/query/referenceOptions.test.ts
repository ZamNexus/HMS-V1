import { QueryObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { referenceListOptions } from "@/lib/useReferenceData"
import { createQueryClient } from "./client"
import { setQueryScope } from "./scope"

// Review finding: options are shared by every observer of one key. A queryFn that depended on a hook's own \`enabled\` flag could make a refetch
// triggered by an ENABLED observer return the empty placeholder of a DISABLED one and store it in the shared 10-minute entry.
afterEach(() => setQueryScope(null))

describe("referenceListOptions", () => {
  it("a disabled observer sharing a key with an enabled one never replaces the real list with an empty one", async () => {
    setQueryScope({ hospitalId: "01HOSPITALAAAAAAAAAAAAAAAA", userId: "01USERAAAAAAAAAAAAAAAAAAAA" })
    const qc = createQueryClient()
    const real = { items: [{ id: "1", name: "Zam Insurance" }], total: 1, complete: true }
    const fetchAll = vi.fn(async () => real)
    const options = referenceListOptions("organisations", fetchAll, 600_000)

    const enabled = new QueryObserver(qc, { ...options, enabled: true })
    const disabled = new QueryObserver(qc, { ...options, enabled: false }) // e.g. useOrganisations(false) mounted beside useOrganisations()
    const stopA = enabled.subscribe(() => {})
    const stopB = disabled.subscribe(() => {})
    await enabled.refetch()
    expect(enabled.getCurrentResult().data).toEqual(real)

    // a mutation invalidates the family; the refetch is run with whichever observer's options the query holds
    await qc.invalidateQueries({ queryKey: options.queryKey })
    await disabled.refetch() // reload() on the disabled hook
    expect(qc.getQueryData(options.queryKey)).toEqual(real)
    expect(fetchAll.mock.calls.length).toBeGreaterThanOrEqual(2)
    stopA()
    stopB()
  })

  it("keys are scoped to the signed-in user, so two users never share an entry", () => {
    setQueryScope({ hospitalId: "01HOSPITALAAAAAAAAAAAAAAAA", userId: "01USERAAAAAAAAAAAAAAAAAAAA" })
    const a = referenceListOptions("organisations", async () => ({ items: [], total: 0, complete: true }), 1).queryKey
    setQueryScope({ hospitalId: "01HOSPITALAAAAAAAAAAAAAAAA", userId: "01USERBBBBBBBBBBBBBBBBBBBB" })
    const b = referenceListOptions("organisations", async () => ({ items: [], total: 0, complete: true }), 1).queryKey
    expect(a).not.toEqual(b)
  })
})
