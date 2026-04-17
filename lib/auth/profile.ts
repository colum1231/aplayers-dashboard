import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { profiles, type Profile } from "@/lib/db/schema"
import type { User } from "@supabase/supabase-js"

export async function getProfileByUserId(userId: string): Promise<Profile | undefined> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  return row
}

export async function ensureProfile(user: User): Promise<Profile> {
  const existing = await getProfileByUserId(user.id)
  if (existing) return existing

  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email ?? "",
      fullName: user.user_metadata?.full_name as string | undefined,
      role: "setter",
    })
    .onConflictDoNothing()

  const row = await getProfileByUserId(user.id)
  if (!row) {
    throw new Error("Failed to create profile")
  }
  return row
}
