"use client"
import * as React from "react"
import { writeOutcomeUnknown } from "@/lib/services/createOutcome"
import { createSingleFlight } from "@/lib/singleFlight"
import { toast } from "@/components/ui/use-toast"

/**
 * One submit at a time. `pending` disables the button from the click until the answer; `run` ignores a second call made meanwhile (a double click,
 * Enter pressed again, a second "Save and …" button), because `disabled` only takes effect after React re-renders and this backend has no
 * idempotency: a second POST /payments makes a second payment. Pass `{ holdOnSuccess: true }` for a create that is followed by a navigation or
 * refetch, so the button is not live again in between.
 * After a write that got NO usable answer (network failure, timeout, 502/503/504) the server may have saved it, and the handoff says not to resend:
 * `blocked` turns true, every later `run` on this form is refused with a notice, and only closing the form and checking the list starts again.
 */
export function useSubmitGuard() {
  const [pending, setPending] = React.useState(false)
  const [blocked, setBlocked] = React.useState(false)
  const flight = React.useMemo(() => createSingleFlight({ holdOnError: writeOutcomeUnknown }), [])
  const run = React.useCallback(
    <T,>(action: () => Promise<T>, options: { holdOnSuccess?: boolean } = {}) => {
      if (flight.isBlocked()) {
        toast({ variant: "destructive", title: "Not sent again", description: "The earlier attempt got no answer, so it may have been saved. Close this window and check the list before doing it again." })
        return Promise.resolve(undefined)
      }
      return flight(async () => {
        setPending(true)
        let succeeded = false
        try {
          const result = await action()
          succeeded = true
          return result
        } catch (err) {
          if (writeOutcomeUnknown(err)) setBlocked(true)
          throw err
        } finally {
          // with holdOnSuccess the button stays disabled after a success (the screen is about to navigate away)
          if (!(succeeded && options.holdOnSuccess)) setPending(false)
        }
      }, options)
    },
    [flight]
  )
  return { pending, run, blocked }
}
