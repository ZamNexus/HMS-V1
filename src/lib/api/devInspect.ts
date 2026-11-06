// DEVELOPMENT-ONLY helper for discovering the shape of an API response.
//
// It reduces a value to its STRUCTURE: object keys, nesting and primitive type
// names. It never copies a value, so tokens, names, ids and any other data
// cannot end up in the output. Callers must additionally guard use with
// `process.env.NODE_ENV !== "production"` so the call (and, via a dynamic
// import, this module) is removed from production builds.

export type Shape = string | Shape[] | { [key: string]: Shape }

const MAX_DEPTH = 8

/** Returns the structure of `value` with every leaf replaced by its type name. */
export function describeShape(value: unknown, depth = 0): Shape {
  if (value === null) return "null"
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `array(${value.length})`
    // Report the first element's structure only; length is structure, not data.
    return value.length === 0 ? "array(0)" : [`array(${value.length})`, describeShape(value[0], depth + 1)]
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "object"
    const out: { [key: string]: Shape } = {}
    for (const key of Object.keys(value as object)) {
      out[key] = describeShape((value as Record<string, unknown>)[key], depth + 1)
    }
    return out
  }
  return typeof value // "string" | "number" | "boolean" | ...
}

/** Logs the structure of the login response to the browser console. */
export function logLoginResponseShape(response: unknown): void {
  // Defense in depth: callers already guard on NODE_ENV (so this module is not
  // even bundled in production), but the function also refuses to run there.
  // There is deliberately no flag, env var or query param that overrides this.
  if (process.env.NODE_ENV === "production") return
  console.info(
    "[HMS dev] POST /api/v1/auth/login response STRUCTURE (types only, no values). " +
      "Cookie names/attributes are httpOnly and not visible here: check DevTools > Application > Cookies.\n" +
      JSON.stringify(describeShape(response), null, 2)
  )
}
