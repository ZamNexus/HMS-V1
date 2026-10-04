import type { GuardianRelationItem } from "@/types"

export const GUARDIAN_RELATIONS: GuardianRelationItem[] = [
  { id: 1, name: "Self", active: true },
  { id: 2, name: "Father", active: true },
  { id: 3, name: "Mother", active: true },
  { id: 4, name: "Husband", active: true },
  { id: 5, name: "Wife", active: true },
  { id: 6, name: "Son", active: true },
  { id: 7, name: "Daughter", active: true },
  { id: 8, name: "Guardian", remarks: "Legal guardian, non-parent", active: true },
  { id: 9, name: "Other", active: true },
]
