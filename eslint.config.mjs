import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React Compiler advisories. They flag patterns ported as-is from the
  // prototype on `main` (form resets in effects, Date.now() in render,
  // mutating the in-memory data modules). Rewriting them risks behaviour
  // drift from the prototype, so surface them as warnings, not errors.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The API-mode browser suites and their test backends (plain Node scripts, see e2e-api/README.md).
    "e2e-api/**",
    // Generated from docs/openapi.json by `npm run types:generate`.
    "src/lib/api/schema.d.ts",
  ]),
]);

export default eslintConfig;
