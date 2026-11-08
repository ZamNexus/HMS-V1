// Content-Security-Policy (Phase 12, G2). Built per request in src/proxy.ts with a fresh nonce, so only the scripts Next.js itself emits (they carry the nonce) can run; an injected
// <script> from a data field would be refused. Pure so the policy is unit-tested; the proxy only wires it.
//
//  - default-src 'self': everything comes from this origin. The browser never talks to the backend directly (the /api proxy in next.config.ts), so connect-src is 'self' too.
//  - script-src: 'self' + the nonce + 'strict-dynamic' (scripts a nonced script loads are trusted). No 'unsafe-inline', no 'unsafe-eval' in production.
//  - style-src 'self' 'unsafe-inline': the server-rendered HTML carries inline style="" attributes (Radix, Tailwind), which a nonce cannot cover; scripts are the dangerous part.
//  - img-src 'self' data: blob: + the storage host(s) that serve photos (CSP_IMG_SRC), if any.
//  - frame-ancestors 'none' (also X-Frame-Options: DENY), object-src 'none', base-uri 'self', form-action 'self'.
//  - upgrade-insecure-requests only where the site is served over HTTPS (CSP_UPGRADE_INSECURE_REQUESTS=true): over plain http://localhost it would break every asset.

export interface CspOptions {
  nonce: string
  /** next dev: React needs eval for its debugging and the dev server's hot reload uses a websocket. */
  dev?: boolean
  /** Extra image origins (space or comma separated), for example the object-storage host that serves patient photos. */
  imgExtra?: string
  upgradeInsecure?: boolean
}

/** Only plain origins (scheme + host) are accepted from the environment, so a mistake in the setting cannot widen the policy to a wildcard or inject a directive. */
export function safeOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(s))
}

export function buildCsp({ nonce, dev = false, imgExtra, upgradeInsecure = false }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("The CSP nonce must be at least 16 URL-safe base64 characters.")
  const img = ["'self'", "data:", "blob:", ...safeOrigins(imgExtra)]
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgradeInsecure ? ["upgrade-insecure-requests"] : []),
  ]
  return directives.join("; ")
}

/** A fresh, unguessable nonce (128 bits, base64). Works in the proxy's runtime and in tests. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
