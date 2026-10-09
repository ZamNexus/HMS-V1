import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const PUBLIC_ROUTES = ["/", "/login", "/forgot-password"]

export function proxy(request: NextRequest) {
  const user = request.cookies.get("hms_user")
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
    "/((?!_next/static|_next/image|.*\\.(?:ico|svg|png|jpe?g|gif|webp|avif|txt|xml|webmanifest|woff2?)$).*)",
  ],
}
