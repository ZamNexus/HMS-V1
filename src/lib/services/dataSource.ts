export type DataSource = "mock" | "api"

/**
 * Production builds use the real API unless mock is requested explicitly, so a
 * missing env var can never silently serve demo data to real users. Development
 * defaults to mock so the UI can be built before the backend is ready.
 * There is no runtime fallback from "api" to mock: backend failures are shown.
 */
export function resolveDataSource(configured: string | undefined, nodeEnv: string | undefined): DataSource {
  if (configured === "mock" || configured === "api") return configured
  return nodeEnv === "production" ? "api" : "mock"
}
