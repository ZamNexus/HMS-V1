import type { NextConfig } from "next";
import path from "node:path";
import { resolveDataSource } from "./src/lib/services/dataSource";

// The demo seam. "@hms/demo" is the one module that reaches the prototype's sample data and in-memory services (src/lib/demo/registry.ts). A build that talks to the real API
// (every production build unless NEXT_PUBLIC_HMS_DATA_SOURCE=mock is set explicitly) gets the stub in its place, so the sample records are not part of the client bundle at all.
// The rule is the app's own (resolveDataSource), not a second copy of it. `npm run check:build` is the proof.
const demoIncluded = resolveDataSource(process.env.NEXT_PUBLIC_HMS_DATA_SOURCE, process.env.NODE_ENV) === "mock";
const demoStub = "./src/lib/demo/registry.stub.ts";

// Baseline security headers. The Content-Security-Policy is NOT here: it carries a per-request nonce, so it is built in src/proxy.ts (src/lib/csp.ts).
// X-Frame-Options stays as the belt to the policy's `frame-ancestors 'none'` (and covers responses the proxy does not match).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Browsers ignore HSTS over plain HTTP (e.g. localhost). No includeSubDomains
  // or preload: those would also bind sibling subdomains of the deploy domain.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

// Backend origin the `/api/*` proxy forwards to. Server-side only: it is read
// here at build/start time and never exposed to the browser (no NEXT_PUBLIC_
// prefix). Set it in `.env.local` (see `.env.example`):
//   dev backend   https://zamnexus-hms-api-dev-3aa783b02dad.herokuapp.com
//   local backend http://localhost:3000
function resolveBackendUrl(): string {
  const raw = process.env.BACKEND_URL?.trim();
  if (!raw) {
    throw new Error("BACKEND_URL is not set. Copy .env.example to .env.local and set the backend origin.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BACKEND_URL is not a valid absolute URL: "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`BACKEND_URL must be http(s), got "${url.protocol}"`);
  }
  return url.origin;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: demoIncluded ? {} : { resolveAlias: { "@hms/demo": demoStub } },
  webpack(config) {
    if (!demoIncluded) config.resolve.alias = { ...config.resolve.alias, "@hms/demo": path.resolve(__dirname, demoStub) };
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Same-origin proxy to the backend. The browser only ever talks to this app,
  // so the backend's CORS allow-list (http://localhost:3000 in development)
  // does not apply to browser requests, and the httpOnly refresh cookie stays
  // first-party. Paths are forwarded unchanged (`/api/v1/x` -> `<backend>/api/v1/x`).
  // `/health` is served by the backend at the root (not under `/api`), so it is
  // proxied on its own to make the documented health check reachable.
  async rewrites() {
    const backend = resolveBackendUrl();
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/health", destination: `${backend}/health` },
    ];
  },
};

export default nextConfig;
