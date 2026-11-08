// Fails (exit 1) when src/lib/api/schema.d.ts is not exactly what openapi-typescript generates from docs/openapi.json.
// NOTE: this only detects an edit to docs/openapi.json without regenerating (or a hand-edit of the generated file).
// It cannot detect that the BACKEND changed: re-pull the real spec into docs/openapi.json first (go-live step G4).
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const committedPath = path.join(root, "src/lib/api/schema.d.ts")
const dir = mkdtempSync(path.join(tmpdir(), "hms-types-"))
const fresh = path.join(dir, "schema.d.ts")

let exitCode = 0
try {
  const bin = path.join(root, "node_modules/openapi-typescript/bin/cli.js")
  const run = spawnSync(process.execPath, [bin, path.join(root, "docs/openapi.json"), "-o", fresh, "--default-non-nullable", "false"], { cwd: root, encoding: "utf8" })
  if (run.status !== 0) {
    console.error("openapi-typescript failed:\n" + (run.stderr || run.stdout))
    exitCode = 2
  } else {
    const norm = (s) => s.replace(/\r\n/g, "\n")
    if (norm(readFileSync(committedPath, "utf8")) !== norm(readFileSync(fresh, "utf8"))) {
      console.error("src/lib/api/schema.d.ts is out of date with docs/openapi.json. Run: npm run types:generate")
      exitCode = 1
    } else {
      console.log("src/lib/api/schema.d.ts matches docs/openapi.json")
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
// the PROPOSED contract's types (docs/openapi.draft.json -> src/lib/api/schema.draft.d.ts)
{
  const dir2 = mkdtempSync(path.join(tmpdir(), "hms-types-draft-"))
  try {
    const out = path.join(dir2, "schema.draft.d.ts")
    const bin = path.join(root, "node_modules/openapi-typescript/bin/cli.js")
    const run = spawnSync(process.execPath, [bin, path.join(root, "docs/openapi.draft.json"), "-o", out, "--default-non-nullable", "false"], { cwd: root, encoding: "utf8" })
    const norm = (s) => s.replace(/\r\n/g, "\n")
    if (run.status !== 0) { console.error("openapi-typescript failed on the draft:\n" + (run.stderr || run.stdout)); exitCode = 2 }
    else if (norm(readFileSync(path.join(root, "src/lib/api/schema.draft.d.ts"), "utf8")) !== norm(readFileSync(out, "utf8"))) { console.error("src/lib/api/schema.draft.d.ts is out of date with docs/openapi.draft.json. Run: npm run types:generate:draft"); exitCode = 1 }
    else console.log("src/lib/api/schema.draft.d.ts matches docs/openapi.draft.json")
  } finally { rmSync(dir2, { recursive: true, force: true }) }
}
process.exitCode = exitCode
