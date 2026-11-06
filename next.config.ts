import type { NextConfig } from "next";

// Baseline security headers. A full Content-Security-Policy is deliberately
// left out until the backend/API origins are known (a premature CSP breaks
// API calls and Next's inline scripts); `frame-ancestors` is safe to set now.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
