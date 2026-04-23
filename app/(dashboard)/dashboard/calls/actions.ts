"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { calls, profiles } from "@/lib/db/schema"
import { isCallOutcome } from "@/lib/calls/outcomes"
import { createClient } from "@/lib/supabase/server"

type ActionResult = { ok: true } | { error: string }

async function getAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const profile = await getProfileByUserId(user.id)
  return { user, profile }
}

export async function updateCallOutcome(
  callId: string,
  outcome: string | null,
  notes?: string | null,
): Promise<ActionResult> {
  const { user, profile } = await getAuthedUser()
  if (!profile) return { error: "Profile not found" }

  // All roles can set outcome
  if (!["admin", "closer", "setter"].includes(profile.role)) {
    return { error: "Unauthorized" }
  }

  if (outcome !== null && !isCallOutcome(outcome)) {
    return { error: "Invalid outcome value" }
  }

  await db
    .update(calls)
    .set({
      outcome: outcome ?? null,
      outcomeNotes: notes?.trim() || null,
      outcomeUpdatedBy: user.id,
      outcomeUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calls.id, callId))

  revalidatePath("/dashboard/calls")
  return { ok: true }
}

export async function updateCallSetter(
  callId: string,
  setterUserId: string | null,
): Promise<ActionResult> {
  const { profile } = await getAuthedUser()
  if (!profile) return { error: "Profile not found" }

  if (!["admin", "closer", "setter"].includes(profile.role)) {
    return { error: "Unauthorized" }
  }

  let setterNameSnapshot: string | null = null
  let setterEmailSnapshot: string | null = null

  if (setterUserId) {
    const [setterProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, setterUserId))
      .limit(1)

    if (!setterProfile) return { error: "Setter not found" }

    setterNameSnapshot = setterProfile.fullName
    setterEmailSnapshot = setterProfile.email
  }

  await db
    .update(calls)
    .set({
      setterUserId: setterUserId ?? null,
      setterNameSnapshot,
      setterEmailSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, callId))

  revalidatePath("/dashboard/calls")
  return { ok: true }
}

export async function deleteCall(callId: string): Promise<ActionResult> {
  const { profile } = await getAuthedUser()
  if (!profile) return { error: "Profile not found" }

  if (profile.role !== "admin") return { error: "Only admins can delete calls" }

  await db.delete(calls).where(eq(calls.id, callId))
  revalidatePath("/dashboard/calls")
  return { ok: true }
}
