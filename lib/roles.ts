import type { Profile } from "@/lib/db/schema"

export const USER_ROLES = ["admin", "closer", "setter"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  closer: "Closer",
  setter: "Setter",
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
}

export function roleLabel(role: Profile["role"] | UserRole | null | undefined) {
  if (!role) return "—"
  return ROLE_LABELS[role] ?? role
}
