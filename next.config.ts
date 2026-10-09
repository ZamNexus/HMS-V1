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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
