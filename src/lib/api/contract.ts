// Types generated from docs/openapi.json (src/lib/api/schema.d.ts, `npm run types:generate`). Never hand-write a DTO: import it from here.
// The JSON is a stale copy (170 of the 206 documented operations), so only those operations have types.
import type { components, operations, paths } from "./schema"

export type { components, operations, paths }
/** Every DTO of the contract, by its schema name. */
export type Schemas = components["schemas"]
/**
 * Types of the PROPOSED contract (src/lib/api/schema.draft.d.ts, `npm run types:generate:draft`, from docs/openapi.draft.json): routes the handoff names but
 * docs/openapi.json does not define (expense categories, bank accounts, audit entries). The backend is to be built to match it.
 */
export type ProposedSchemas = import("./schema.draft").components["schemas"]

/** Contract path keys, e.g. "/api/v1/patients/{id}". */
export type ApiPath = keyof paths

/** Request body (application/json) of an operation. */
export type RequestBodyOf<Op extends keyof operations> = operations[Op] extends { requestBody: { content: { "application/json": infer B } } } ? B : never
/** Successful (200/201) JSON response of an operation. */
export type SuccessResponseOf<Op extends keyof operations> = operations[Op] extends { responses: infer R }
  ? R extends { 200: { content: { "application/json": infer B } } }
    ? B
    : R extends { 201: { content: { "application/json": infer B } } }
      ? B
      : never
  : never
