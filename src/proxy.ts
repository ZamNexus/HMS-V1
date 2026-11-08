import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { buildCsp, makeNonce } from "@/lib/csp"
import { SESSION_HINT_COOKIE } from "@/lib/session/hint"

const PUBLIC_ROUTES = ["/", "/login", "/forgot-password"]

/** The Content-Security-Policy for this request (G2): a fresh nonce Next.js puts on its own scripts, read from the request header it parses while rendering. */
function withCsp(request: NextRequest): { requestHeaders: Headers; csp: string } {
  const nonce = makeNonce()
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    imgExtra: process.env.CSP_IMG_SRC,
    upgradeInsecure: process.env.CSP_UPGRADE_INSECURE_REQUESTS === "true",
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  return { requestHeaders, csp }
}

export function proxy(request: NextRequest) {
  const { requestHeaders, csp } = withCsp(request)
  // `hms_ui_session` is a forgeable, JavaScript-set UI hint (see src/lib/session/hint.ts), NOT authentication, and NOT the backend's httpOnly
  // `hms_session` refresh cookie. This redirect is a convenience for signed-out visitors; it does not protect any data.
  const user = request.cookies.get(SESSION_HINT_COOKIE)
  const isPublic = PUBLIC_ROUTES.includes(request.nextUrl.pathname)
  
  if (!user && !isPublic) {
    const redirect = NextResponse.redirect(new URL("/login", request.url))
    redirect.headers.set("Content-Security-Policy", csp)
    return redirect
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  // Skip Next internals and static files served from public/ (icons, images,
  // robots.txt, …) so signed-out visitors can still load them.
  matcher: [
    // `/api/*` and `/health` are rewritten to the backend (see next.config.ts),
    // which authenticates its own requests. The demo-cookie redirect must not
    // intercept them, or an authentication error from the backend would become an HTML redirect.
    // Prefetches carry no page to nonce, so they are skipped (Next's own CSP guide does the same).
    {
      source: "/((?!api(?:/|$)|health$|_next/static|_next/image|.*\\.(?:ico|svg|png|jpe?g|gif|webp|avif|txt|xml|webmanifest|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
