import { createAdminClient } from "@/lib/supabase/admin"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import type { UserRole } from "@/lib/roles"

export type TeamMemberRow = {
  id: string
  email: string
  fullName: string | null
  role: UserRole
}

export async function getTeamMembersForAdmin(): Promise<TeamMemberRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 500 })

  if (error) throw new Error(error.message)

  const profileRows = await db.select().from(profiles)
  const profileMap = new Map(profileRows.map((p) => [p.id, p]))

  return (data.users ?? []).map((u) => {
    const p = profileMap.get(u.id)
    return {
      id: u.id,
      email: u.email ?? "",
      fullName: p?.fullName ?? null,
      role: (p?.role ?? "setter") as UserRole,
    }
  })
}
