import { ApiError } from "@/lib/api/client"

/** ApiError shaped like a backend validation/conflict failure, for the mock adapters only. */
export function mockApiError(status: number, code: string, message: string, details?: { path: string; message: string }[]) {
  return new ApiError({
    status,
    code,
    message,
    body: { statusCode: status, code, message, requestId: null, path: "mock", timestamp: new Date().toISOString(), details },
  })
}
