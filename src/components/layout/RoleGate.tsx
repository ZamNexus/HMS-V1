import type { ReactNode } from "react"

import { useAuth } from "@/lib/auth"
import type { Role } from "@/types"
import { Forbidden } from "@/pages/Forbidden"

export function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !allow.includes(user.role)) return <Forbidden />
  return <>{children}</>
}
