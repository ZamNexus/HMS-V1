// The only pharmacy tabs. Shared by the server page (static params / 404) and
// the client hub; kept out of the "use client" module so the server can read it.
export const PHARMACY_TABS = ["inventory", "dispense", "history"] as const
export type PharmacyTab = (typeof PHARMACY_TABS)[number]
