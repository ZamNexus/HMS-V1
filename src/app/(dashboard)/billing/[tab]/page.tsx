import BillingHubPage from "./BillingHub"
import { BILLING_TABS } from "./tabs"

// Unknown tabs (e.g. /billing/bogus) return a real 404 at routing time
export const dynamicParams = false

export function generateStaticParams() {
  return BILLING_TABS.map((tab) => ({ tab }))
}

export default function Page() {
  return <BillingHubPage />
}
