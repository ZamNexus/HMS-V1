// The last Hospital Code typed on this device, to pre-fill the sign-in form (MD section 3: while hospitals share one domain, GET /public/hospital
// answers 404, so the device remembers the code instead). A hospital code is not patient data, a credential or a token. It is the ONLY value
// the frontend keeps in localStorage.
const KEY = "hms.lastHospitalCode"

export function readLastHospitalCode(): string {
  try {
    return localStorage.getItem(KEY) ?? ""
  } catch {
    return "" // storage blocked or unavailable
  }
}

export function rememberHospitalCode(code: string): void {
  const value = code.trim()
  if (!value) return
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // storage blocked or full: pre-fill is a convenience only
  }
}
