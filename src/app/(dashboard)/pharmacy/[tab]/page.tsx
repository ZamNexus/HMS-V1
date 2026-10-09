import PharmacyHubPage from "./PharmacyHub"
import { PHARMACY_TABS } from "./tabs"

// Unknown tabs (e.g. /pharmacy/bogus) return a real 404 at routing time
export const dynamicParams = false

export function generateStaticParams() {
  return PHARMACY_TABS.map((tab) => ({ tab }))
}

export default function Page() {
  return <PharmacyHubPage />
}
