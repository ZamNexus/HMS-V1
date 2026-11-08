/**
 * Lets only one run of an async action be in flight at a time; a second call made while one is running is ignored (returns undefined).
 * Used for create buttons: `disabled={saving}` only takes effect after React re-renders, so a fast double click (or a second
 * submit path such as "Save & OPD Ticket") could otherwise send two create requests and make a duplicate record.
 */
export function createSingleFlight(config: { holdOnError?: (err: unknown) => boolean } = {}) {
  let busy = false
  let blocked = false
  /**
   * `holdOnSuccess`: after the action SUCCEEDS stay busy for good (until the screen is left). A create is followed by a navigation or a refetch; the
   * button must not come back to life in between, or a fast second click would create a second record. A failure always releases.
   */
  const run = async function run<T>(action: () => Promise<T>, options: { holdOnSuccess?: boolean } = {}): Promise<T | undefined> {
    if (busy) return undefined
    busy = true
    let held = false
    try {
      const result = await action()
      held = options.holdOnSuccess === true
      return result
    } catch (err) {
      // `holdOnError`: the write got no usable answer, so the server MAY have saved it (handoff 7: don't resend, reload the record). Stay busy for good: only a new form starts again.
      if (config.holdOnError?.(err)) { held = true; blocked = true }
      throw err
    } finally {
      if (!held) busy = false
    }
  }
  return Object.assign(run, { isBlocked: () => blocked })
}
