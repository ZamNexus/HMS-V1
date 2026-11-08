// Test helper: validates a value against a schema in docs/openapi.json. It is how the Phase 5 tests prove that fixtures and
// request payloads are what the specification says, instead of what the mapper author remembers. Covers the keywords the spec
// actually uses (type incl. type arrays, nullable, enum, pattern, min/max, items, properties, required, additionalProperties,
// allOf/oneOf/anyOf, $ref). Not a general JSON-Schema implementation and never imported by app code.
import { readFileSync } from "node:fs"
import path from "node:path"

type Schema = Record<string, unknown>
interface Spec {
  paths: Record<string, Record<string, { parameters?: { name: string; in: string; required?: boolean }[]; requestBody?: { content: Record<string, { schema: Schema }> }; responses?: Record<string, { content?: Record<string, { schema: Schema }> }> }>>
  components: { schemas: Record<string, Schema> }
}

const cache: Partial<Record<"openapi" | "draft", Spec>> = {}
/** `draft` is docs/openapi.draft.json: the PROPOSED contract for routes docs/openapi.json lacks. */
export function spec(source: "openapi" | "draft" = "openapi"): Spec {
  cache[source] ??= JSON.parse(readFileSync(path.resolve(process.cwd(), source === "draft" ? "docs/openapi.draft.json" : "docs/openapi.json"), "utf8")) as Spec
  return cache[source]!
}

export function schemaOf(name: string, source: "openapi" | "draft" = "openapi"): Schema {
  const s = spec(source).components.schemas[name]
  if (!s) throw new Error(`No schema named ${name}`)
  return s
}

export function operation(method: string, p: string) {
  const op = spec().paths[p]?.[method.toLowerCase()]
  if (!op) throw new Error(`No operation ${method} ${p}`)
  return op
}

export interface ValidateOptions {
  /**
   * docs/openapi.json declares some nullable string fields of the DETAIL DTOs (patient fatherName, cnic, city, email, ...) as
   * `array of string` while the list DTO declares the same fields `string | null`. With this on, `string | null` is accepted where the
   * spec says `array of string` and nothing else is relaxed.
   */
  lenientStringArrays?: boolean
  /** Where `$ref`s resolve: docs/openapi.json (default) or docs/openapi.draft.json (the PROPOSED contract). */
  source?: "openapi" | "draft"
}

export function validate(value: unknown, schema: Schema, opts: ValidateOptions = {}, at = "$"): string[] {
  const errs: string[] = []
  const root = spec(opts.source).components.schemas
  const go = (v: unknown, s: Schema, p: string): void => {
    if (typeof s.$ref === "string") return go(v, root[(s.$ref as string).split("/").pop() as string], p)
    if (v === null && s.nullable === true) return // `allOf: [$ref]` + `nullable: true` (OpenAPI 3.0): null is allowed before the parts are checked
    if (Array.isArray(s.allOf)) { for (const part of s.allOf as Schema[]) go(v, part, p); }
    if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) {
      const alts = (s.oneOf ?? s.anyOf) as Schema[]
      if (!alts.some((a) => validate(v, a, opts, p).length === 0)) errs.push(`${p}: matches none of the alternatives`)
      return
    }
    if (v === null) {
      const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string]
      if (s.nullable === true || types.includes("null") || (Array.isArray(s.enum) && (s.enum as unknown[]).includes(null))) return
      if (opts.lenientStringArrays && s.type === "array" && (s.items as Schema | undefined)?.type === "string") return
      errs.push(`${p}: null is not allowed`)
      return
    }
    if (Array.isArray(s.enum) && !(s.enum as unknown[]).includes(v)) { errs.push(`${p}: not one of the enum values`); return }
    const types = (Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : []).filter((t) => t !== "null")
    if (opts.lenientStringArrays && types[0] === "array" && (s.items as Schema | undefined)?.type === "string" && typeof v === "string") return
    if (types.length > 0) {
      const ok = types.some((t) =>
        t === "string" ? typeof v === "string"
        : t === "integer" ? Number.isInteger(v)
        : t === "number" ? typeof v === "number"
        : t === "boolean" ? typeof v === "boolean"
        : t === "array" ? Array.isArray(v)
        : t === "object" ? typeof v === "object" && !Array.isArray(v)
        : false)
      if (!ok) { errs.push(`${p}: expected ${types.join("|")}`); return }
    }
    if (typeof v === "string") {
      if (typeof s.pattern === "string" && !new RegExp(s.pattern as string).test(v)) errs.push(`${p}: does not match the pattern`)
      if (typeof s.minLength === "number" && v.length < (s.minLength as number)) errs.push(`${p}: shorter than ${s.minLength}`)
      if (typeof s.maxLength === "number" && v.length > (s.maxLength as number)) errs.push(`${p}: longer than ${s.maxLength}`)
    }
    if (typeof v === "number") {
      if (typeof s.minimum === "number" && v < (s.minimum as number)) errs.push(`${p}: below ${s.minimum}`)
      if (typeof s.maximum === "number" && v > (s.maximum as number)) errs.push(`${p}: above ${s.maximum}`)
    }
    if (Array.isArray(v) && s.items) v.forEach((item, i) => go(item, s.items as Schema, `${p}[${i}]`))
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      const props = (s.properties ?? {}) as Record<string, Schema>
      for (const k of (s.required ?? []) as string[]) if (!(k in o)) errs.push(`${p}.${k}: required but missing`)
      for (const [k, val] of Object.entries(o)) {
        if (props[k]) { if (val !== undefined) go(val, props[k], `${p}.${k}`) }
        else if (s.additionalProperties === false) errs.push(`${p}.${k}: not allowed (additionalProperties is false)`)
      }
    }
  }
  go(value, schema, at)
  return errs
}
