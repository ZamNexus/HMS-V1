// `hms_ui_session` is a FRONTEND-ONLY UI HINT, NOT AUTHENTICATION. It is a plain JavaScript-set cookie (not httpOnly) that anyone can create or
// delete in their browser, with no identity or token in it. Its only use is letting the Next proxy (src/proxy.ts) send visibly signed-out
// visitors to /login instead of rendering a page shell. It proves nothing and protects no data. The real credentials are the access token in
// memory (src/lib/api/client.ts) and the httpOnly refresh cookie, and only the backend decides whether a request is allowed.
//
// It is NOT called "hms_session": that is the name of the backend's httpOnly refresh cookie (path /api/v1/auth). Two cookies with one name would
// both ride along on /api/v1/auth/refresh and break it.
export const SESSION_HINT_COOKIE = "hms_ui_session"
/** The cookie name the backend uses for the refresh credential. The frontend never reads or writes it. */
export const BACKEND_SESSION_COOKIE = "hms_session"

export function writeSessionHint(on: boolean): void {
  if (typeof document === "undefined") return
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  // Session cookie (no max-age): it dies with the browser session.
  document.cookie = on
    ? `${SESSION_HINT_COOKIE}=1; path=/; SameSite=Lax${secure}`
    : `${SESSION_HINT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}
