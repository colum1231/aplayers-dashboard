import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export type SetterMatchResult = {
  setterUserId: string | null
  setterNameSnapshot: string | null
  setterEmailSnapshot: string | null
}

/**
 * Attempts to match utm_content to a profile by fullName (normalized).
 * Always preserves name snapshot from utm_content even if no profile match.
 */
export async function matchSetterFromUtm(
  utmContent: string | null | undefined,
): Promise<SetterMatchResult> {
  const raw = utmContent?.trim()
  if (!raw) {
    return { setterUserId: null, setterNameSnapshot: null, setterEmailSnapshot: null }
  }

  const normalized = normalizeName(raw)
  const allProfiles = await db.select().from(profiles)

  const match = allProfiles.find((p) => {
    if (!p.fullName) return false
    return normalizeName(p.fullName) === normalized
  })

  return {
    setterUserId: match?.id ?? null,
    setterNameSnapshot: match?.fullName ?? raw,
    setterEmailSnapshot: match?.email ?? null,
  }
}
