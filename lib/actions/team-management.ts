"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { isUserRole, type UserRole } from "@/lib/roles"
import { createClient } from "@/lib/supabase/server"
import { appOrigin, createAdminClient } from "@/lib/supabase/admin"

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

function revalidateTeam() {
  revalidatePath("/dashboard/settings")
}

export async function updateMemberRole(memberId: string, nextRole: string) {
  if (!isUserRole(nextRole)) {
    return { error: "Invalid role" }
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

async function upsertProfile(id: string, email: string, role: UserRole) {
  await db
    .insert(profiles)
    .values({
      id,
      email,
      role,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email,
        role,
        updatedAt: new Date(),
      },
    })
}

export async function inviteTeamMember(email: string, role: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes("@")) {
    return { error: "Valid email required" }
  }
  if (!isUserRole(role)) {
    return { error: "Invalid role" }
  }

  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: `${appOrigin()}/login`,
  })
  if (error) {
    return { error: error.message }
  }
  if (data.user) {
    await upsertProfile(data.user.id, trimmed, role)
  }
  revalidateTeam()
  return { ok: true }
}

export async function createTeamMember(email: string, password: string, role: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes("@")) {
    return { error: "Valid email required" }
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" }
  }
  if (!isUserRole(role)) {
    return { error: "Invalid role" }
  }

  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: trimmed,
    password,
    email_confirm: true,
  })
  if (error) {
    return { error: error.message }
  }
  if (data.user) {
    await upsertProfile(data.user.id, trimmed, role)
  }
  revalidateTeam()
  return { ok: true }
}

export async function deleteTeamMember(memberId: string) {
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
