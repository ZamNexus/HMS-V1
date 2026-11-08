// Runs the API-mode browser suites against a production build (`npm run build` first), one after the other, each in its own browser, against stateful TEST BACKENDS
// (e2e-api/fakes): no real backend is contacted, nothing is stubbed that the app would not have to answer on a real server, and every request and response the fake handles is
// validated against docs/openapi.json (or docs/openapi.draft.json for the proposed routes). BACKEND_URL points at a name that can never resolve.
//
//   npm run build && npm run test:browser                 (all suites)
//   npm run test:browser -- --only phase8-billing,phase9-lab-imaging
//   E2E_CHANNEL=msedge npm run test:browser               (use an installed Edge/Chrome instead of Playwright's Chromium)
import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const SUITES = [
  "phase4-settings", "phase4-itemhistory", "phase5-patients", "phase6-appointments", "phase7-encounters", "phase8-billing", "phase9-lab-imaging", "phase10-pharmacy",
  "phase11-reports", "phase12-print", "phase12-a11y", "phase13-accounts", "phase13-dashboard-reports",
]

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const only = flag("--only")?.split(",").map((s) => s.trim()).filter(Boolean)
const port = Number(flag("--port") ?? process.env.E2E_PORT ?? 3111)
const chosen = only ? SUITES.filter((s) => only.includes(s)) : SUITES
if (only && chosen.length !== only.length) { console.error(`Unknown suite in --only. Known: ${SUITES.join(", ")}`); process.exit(2) }

const env = { ...process.env, BACKEND_URL: "https://hms-backend.invalid" }
delete env.NEXT_PUBLIC_HMS_DATA_SOURCE // the build decides; a production build serves the API

const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" })
const stopServer = () => {
  if (!server.pid) return
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" })
  else server.kill("SIGKILL")
}
process.on("exit", stopServer)
process.on("SIGINT", () => { stopServer(); process.exit(130) })

async function waitReady() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://localhost:${port}/login`); if (r.status === 200) return true } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function runSuite(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, "e2e-api/suites", `${name}.js`), `http://localhost:${port}`], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (d) => { out += d })
    child.stderr.on("data", (d) => { out += d })
    child.on("close", (code) => resolve({ name, out, code }))
  })
}

if (!(await waitReady())) { console.error(`The production server did not come up on port ${port}. Did you run \`npm run build\`?`); stopServer(); process.exit(2) }
let failed = 0
for (const name of chosen) {
  const { out, code } = await runSuite(name)
  const lines = out.split("\n")
  const pass = lines.filter((l) => l.startsWith("PASS")).length
  const fail = lines.filter((l) => l.startsWith("FAIL")).length
  const scriptError = lines.find((l) => l.startsWith("SCRIPT ERROR"))
  console.log(`== ${name}: PASS ${pass}  FAIL ${fail}${scriptError || code !== 0 ? "  (the suite itself stopped: " + (scriptError ?? `exit ${code}`).slice(0, 200) + ")" : ""}`)
  for (const l of lines.filter((l) => l.startsWith("FAIL"))) console.log("   " + l.slice(0, 400))
  if (fail > 0 || scriptError || code !== 0 || pass === 0) failed++
}
stopServer()
console.log(failed === 0 ? `\nAll ${chosen.length} browser suites passed.` : `\n${failed} of ${chosen.length} browser suites failed.`)
process.exit(failed === 0 ? 0 : 1)
