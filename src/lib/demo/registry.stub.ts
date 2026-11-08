// What "@hms/demo" is in a production build for the real API (next.config.ts). It carries no sample data. Every access throws, so a code path that reaches for demo data in API
// mode fails loudly instead of showing invented records; the guarded call sites (dataSource === "mock") never get here. The type of `demo` comes from ./registry.ts (tsconfig paths).
export const demo: never = new Proxy({}, {
  get(_target, property) {
    throw new Error(`The demo data is not part of this build (read demo.${String(property)}). Build with NEXT_PUBLIC_HMS_DATA_SOURCE=mock for the demo.`)
  },
}) as never
