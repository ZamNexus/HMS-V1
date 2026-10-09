import { RoleGate } from "@/components/layout/RoleGate"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["admin"]}>{children}</RoleGate>
}
