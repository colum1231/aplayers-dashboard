"use server"

import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { calls, profiles } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"

function parseDateTime(dateRaw: string, timeRaw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return null
  if (!/^\d{2}:\d{2}$/.test(timeRaw)) return null
  const parsed = new Date(`${dateRaw}T${timeRaw}:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export async function createManualCall(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getProfileByUserId(user.id)
  if (!profile || !["admin", "closer", "setter"].includes(profile.role)) {
    redirect("/dashboard")
  }

  const inviteeName = String(formData.get("inviteeName") ?? "").trim()
  const inviteeEmail = String(formData.get("inviteeEmail") ?? "").trim().toLowerCase()
  const scheduledDate = String(formData.get("scheduledDate") ?? "").trim()
  const scheduledTime = String(formData.get("scheduledTime") ?? "").trim()
  const setterUserId = String(formData.get("setterUserId") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim()

  if (!inviteeName || !inviteeEmail || !scheduledDate || !scheduledTime) {
    redirect("/dashboard/data-input/calls?error=missing_fields")
  }

  const scheduledStartAt = parseDateTime(scheduledDate, scheduledTime)
  if (!scheduledStartAt) {
    redirect("/dashboard/data-input/calls?error=invalid_datetime")
  }

  let setterNameSnapshot: string | null = null
  let setterEmailSnapshot: string | null = null
  let resolvedSetterUserId: string | null = null

  if (setterUserId) {
    const [setterProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, setterUserId))
      .limit(1)

    if (!setterProfile) {
      redirect("/dashboard/data-input/calls?error=invalid_setter")
    }

    resolvedSetterUserId = setterProfile.id
    setterNameSnapshot = setterProfile.fullName
    setterEmailSnapshot = setterProfile.email
  }

  await db.insert(calls).values({
    source: "manual",
    calendlyEventUri: null,
    calendlyInviteeUri: null,
    eventTypeName: "Manual entry",
    scheduledStartAt,
    status: "scheduled",
    inviteeName,
    inviteeEmail,
    setterUserId: resolvedSetterUserId,
    setterNameSnapshot,
    setterEmailSnapshot,
    outcomeNotes: notes || null,
    rawEvent: {
      manualInput: true,
      capturedByUserId: user.id,
    },
  })

  redirect("/dashboard/data-input/calls?success=1")
}
