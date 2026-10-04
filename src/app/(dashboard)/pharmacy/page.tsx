import { redirect } from "next/navigation"

export default function PharmacyIndexPage() {
  redirect("/pharmacy/inventory")
}
