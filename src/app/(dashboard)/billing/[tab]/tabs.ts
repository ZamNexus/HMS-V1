// The only billing tabs. Shared by the server page (static params / 404) and
// the client hub; kept out of the "use client" module so the server can read it.
export const BILLING_TABS = ["consultations", "services", "payments", "receipts", "expenses", "bank"] as const
export type BillingTab = (typeof BILLING_TABS)[number]
