import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // "@hms/demo" is the demo seam (src/lib/demo): the tests run against the real registry, never the production stub.
    alias: [
      { find: "@hms/demo", replacement: fileURLToPath(new URL("./src/lib/demo/registry.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
