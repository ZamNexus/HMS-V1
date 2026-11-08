// A sign-out whose POST /auth/logout could not be delivered (offline, server down) leaves the server session alive behind a signed-out screen: the
// httpOnly refresh cookie still works and a reload would sign the user straight back in. This remembers that a logout is OWED, so the next page
// load (or the browser coming back online) finishes it. The flag is a single boolean: no user, token or patient data.
const KEY = "hms.logoutPending"

export function readLogoutPending(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function writeLogoutPending(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: the owed logout cannot be remembered across a reload
  }
}
