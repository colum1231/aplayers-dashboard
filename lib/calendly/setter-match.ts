import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { MANUAL_UTM_CONTENT_TO_EMAIL } from "@/lib/calendly/constants"

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeUtmContentKey(s: string): string {
  return s.trim().toLowerCase()
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

  const allProfiles = await db.select().from(profiles)
  const manualMappedEmail = MANUAL_UTM_CONTENT_TO_EMAIL[normalizeUtmContentKey(raw)]?.toLowerCase()

  if (manualMappedEmail) {
    const manualMatch = allProfiles.find((p) => p.email?.toLowerCase() === manualMappedEmail)
    return {
      setterUserId: manualMatch?.id ?? null,
      setterNameSnapshot: manualMatch?.fullName ?? raw,
      setterEmailSnapshot: manualMatch?.email ?? manualMappedEmail,
    }
  }

  const normalized = normalizeName(raw)

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
