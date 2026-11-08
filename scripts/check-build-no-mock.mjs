// Go-live check (Phase 12, G4): does the production build still carry the prototype's demo data? Scans the client bundle (.next/static) for names and numbers that exist only in
// src/data/*. Run after `npm run build`:  npm run check:build     (exit 1 when any marker is found; STRICT=0 prints and exits 0, for a report only)
//
// The demo data is reachable only through the "@hms/demo" seam; next.config.ts replaces the seam with a stub in every API build (src/lib/demo/registry.stub.ts), so this check must find nothing in
// an API production build. On a build made with NEXT_PUBLIC_HMS_DATA_SOURCE=mock it DOES find the markers (that is how the check is known to be able to fail). It scans the CLIENT bundle only.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const MARKERS = ["Ayesha Khan", "Habib Bank", "Meezan", "PAY-2024", "RCT-2024", "MR-2024", "Augmentin", "Panadol"]
const files = []
const walk = (dir) => { for (const e of readdirSync(dir)) { const p = path.join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|css|html)$/.test(e)) files.push(p) } }
try { walk(path.join(root, ".next/static")) } catch { console.error("No .next/static: run `npm run build` first."); process.exit(2) }

const hits = new Map()
for (const f of files) {
  const text = readFileSync(f, "utf8")
  for (const m of MARKERS) if (text.includes(m)) { const k = path.relative(root, f).replace(/\\/g, "/"); hits.set(k, [...(hits.get(k) ?? []), m]) }
}
if (hits.size === 0) { console.log(`No demo-data markers in ${files.length} client files.`); process.exit(0) }
console.log(`Demo data is in the client bundle (${hits.size} file${hits.size === 1 ? "" : "s"}):`)
for (const [f, ms] of hits) console.log(`  ${f}: ${ms.join(", ")}`)
process.exit(process.env.STRICT === "0" ? 0 : 1)
