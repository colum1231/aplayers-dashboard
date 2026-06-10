"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { calls, profiles } from "@/lib/db/schema"
import { CLOSED_OUTCOMES, isCallOutcome } from "@/lib/calls/outcomes"
import { enqueueCallToCloseSync } from "@/lib/close/sync"
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

  const [existingCall] = await db
    .select({ status: calls.status })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1)

  if (!existingCall) return { error: "Call not found" }

  const isClosedOutcome =
    outcome !== null && (CLOSED_OUTCOMES as readonly string[]).includes(outcome)

  let nextStatus: "scheduled" | "canceled" | "completed" | "no_show" | undefined
  if (outcome === "no_show") {
    nextStatus = "no_show"
  } else if (isClosedOutcome) {
    nextStatus = "completed"
  } else if (existingCall.status === "completed" || existingCall.status === "no_show") {
    nextStatus = "scheduled"
  }

  await db
    .update(calls)
    .set({
      outcome: outcome ?? null,
      outcomeNotes: notes?.trim() || null,
      outcomeUpdatedBy: user.id,
      outcomeUpdatedAt: new Date(),
      ...(nextStatus ? { status: nextStatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(calls.id, callId))

  enqueueCallToCloseSync(callId)
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

export async function deleteCall(formData: FormData) {
  const callId = String(formData.get("callId") ?? "").trim()
  if (!callId) return

  const { profile } = await getAuthedUser()
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard/calls")
  }

  await db.delete(calls).where(eq(calls.id, callId))
  revalidatePath("/dashboard/calls")
}
