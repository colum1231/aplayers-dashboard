"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { isUserRole, type UserRole } from "@/lib/roles"
import { createClient } from "@/lib/supabase/server"
import { appOrigin, createAdminClient } from "@/lib/supabase/admin"

type TeamActionResult = { ok: true } | { error: string }
type InviteMemberResult =
  | { ok: true; existing: boolean }
  | { error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not signed in", user: null, profile: null }
  }
  const profile = await getProfileByUserId(user.id)
  if (profile?.role !== "admin") {
    return { error: "Only admins can manage the team", user, profile }
  }
  return { error: null, user, profile }
}

function invalidInput(message: string): { error: string } {
  return { error: message }
}

function revalidateTeam() {
  revalidatePath("/dashboard/settings")
}

async function upsertProfile(id: string, email: string, role: UserRole) {
  await db
    .insert(profiles)
    .values({ id, email, role })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { email, role, updatedAt: new Date() },
    })
}

export async function updateMemberRole(
  memberId: string,
  nextRole: string
): Promise<TeamActionResult> {
  if (!isUserRole(nextRole)) {
    return invalidInput("Invalid role")
  }

  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  await db
    .update(profiles)
    .set({ role: nextRole as UserRole, updatedAt: new Date() })
    .where(eq(profiles.id, memberId))

  revalidateTeam()
  return { ok: true }
}

export async function inviteTeamMember(
  email: string,
  role: string
): Promise<InviteMemberResult> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes("@")) {
    return invalidInput("Valid email required")
  }
  if (!isUserRole(role)) {
    return invalidInput("Invalid role")
  }

  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const admin = createAdminClient()
  const setPasswordUrl = `${appOrigin()}/set-password`

  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: setPasswordUrl,
  })

  if (error) {
    const alreadyExists =
      error.status === 422 || error.message.toLowerCase().includes("already")

    if (!alreadyExists) return { error: error.message }

    // Existing user — update role then send password reset
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, trimmed))
      .limit(1)

    if (existingProfile) {
      await upsertProfile(existingProfile.id, trimmed, role as UserRole)
    }

    const supabase = await createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      {
        redirectTo: setPasswordUrl,
      }
    )
    if (resetError) return { error: resetError.message }

    revalidateTeam()
    return { ok: true, existing: true }
  }

  if (data.user) {
    await upsertProfile(data.user.id, trimmed, role as UserRole)
  }
  revalidateTeam()
  return { ok: true, existing: false }
}

export async function deleteTeamMember(memberId: string): Promise<TeamActionResult> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  if (!gate.user) return { error: "Not signed in" }
  if (memberId === gate.user.id) {
    return { error: "You cannot delete your own account" }
  }

  const admin = createAdminClient()
  await db.delete(profiles).where(eq(profiles.id, memberId))
  const { error } = await admin.auth.admin.deleteUser(memberId)
  if (error) {
    return { error: error.message }
  }
  revalidateTeam()
  return { ok: true }
}
