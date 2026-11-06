import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const PUBLIC_ROUTES = ["/", "/login", "/forgot-password"]

export function proxy(request: NextRequest) {
  // `hms_session` is a forgeable, JavaScript-set UI hint (see src/lib/auth.tsx), NOT authentication.
  // This redirect is a convenience for signed-out visitors; it does not protect any data.
  const user = request.cookies.get("hms_session")
  const isPublic = PUBLIC_ROUTES.includes(request.nextUrl.pathname)
  
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Skip Next internals and static files served from public/ (icons, images,
  // robots.txt, …) so signed-out visitors can still load them.
  matcher: [
    // `/api/*` and `/health` are rewritten to the backend (see next.config.ts),
    // which authenticates its own requests. The demo-cookie redirect must not
    // intercept them, or an authentication error from the backend would become an HTML redirect.
    "/((?!api(?:/|$)|health$|_next/static|_next/image|.*\\.(?:ico|svg|png|jpe?g|gif|webp|avif|txt|xml|webmanifest|woff2?)$).*)",
  ],
}
