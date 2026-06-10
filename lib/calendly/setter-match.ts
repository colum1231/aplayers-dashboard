import { db } from "@/lib/db"
import { profiles, type Profile } from "@/lib/db/schema"
import {
  CALENDLY_EVENT_TYPES,
  MANUAL_UTM_CONTENT_TO_EMAIL,
} from "@/lib/calendly/constants"
import {
  type CalendlyUtm,
  isNumericAdCode,
  isPaidTrafficUtm,
} from "@/lib/calendly/utm"

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

function matchFromEmail(profiles: Profile[], email: string, fallbackName?: string): SetterMatchResult {
  const normalizedEmail = email.toLowerCase()
  const match = profiles.find((p) => p.email?.toLowerCase() === normalizedEmail)
  return {
    setterUserId: match?.id ?? null,
    setterNameSnapshot: match?.fullName ?? fallbackName ?? null,
    setterEmailSnapshot: match?.email ?? normalizedEmail,
  }
}

function matchFromNameHint(profiles: Profile[], hint: string): Profile | undefined {
  const normalized = normalizeName(hint)
  if (!normalized) return undefined

  return profiles.find((p) => {
    if (!p.fullName) return false
    const name = normalizeName(p.fullName)
    return name === normalized || name.includes(normalized) || normalized.includes(name)
  })
}

function matchFromEventTypeUri(
  profiles: Profile[],
  eventTypeUri: string | null | undefined,
): SetterMatchResult | null {
  if (!eventTypeUri) return null

  if (eventTypeUri === CALENDLY_EVENT_TYPES.BRUNO) {
    const bruno = matchFromNameHint(profiles, "bruno")
    if (bruno) {
      return {
        setterUserId: bruno.id,
        setterNameSnapshot: bruno.fullName,
        setterEmailSnapshot: bruno.email,
      }
    }
    const mapped = MANUAL_UTM_CONTENT_TO_EMAIL.bruno
    if (mapped) return matchFromEmail(profiles, mapped, "Bruno")
  }

  return null
}

function matchFromUtmContent(
  profiles: Profile[],
  utm: CalendlyUtm | null | undefined,
): SetterMatchResult | null {
  const raw = utm?.utm_content?.trim()
  if (!raw) return null

  // Paid ad rotation codes like "4" are not setter names — skip auto-match.
  if (isPaidTrafficUtm(utm) && isNumericAdCode(raw)) {
    return null
  }

  const manualMappedEmail = MANUAL_UTM_CONTENT_TO_EMAIL[normalizeUtmContentKey(raw)]?.toLowerCase()
  if (manualMappedEmail) {
    return matchFromEmail(profiles, manualMappedEmail, raw)
  }

  const match = matchFromNameHint(profiles, raw)
  if (match) {
    return {
      setterUserId: match.id,
      setterNameSnapshot: match.fullName,
      setterEmailSnapshot: match.email,
    }
  }

  // Preserve unknown text codes for manual review, but not bare numeric ad ids.
  if (!isNumericAdCode(raw)) {
    return {
      setterUserId: null,
      setterNameSnapshot: raw,
      setterEmailSnapshot: null,
    }
  }

  return null
}

export async function matchSetterForCall({
  utm,
  eventTypeUri,
  profiles: profilesOverride,
}: {
  utm?: CalendlyUtm | null
  eventTypeUri?: string | null
  profiles?: Profile[]
}): Promise<SetterMatchResult> {
  const allProfiles = profilesOverride ?? (await db.select().from(profiles))

  const fromEventType = matchFromEventTypeUri(allProfiles, eventTypeUri)
  if (fromEventType?.setterUserId) return fromEventType

  const fromUtm = matchFromUtmContent(allProfiles, utm)
  if (fromUtm) return fromUtm

  return fromEventType ?? { setterUserId: null, setterNameSnapshot: null, setterEmailSnapshot: null }
}

/** @deprecated Use matchSetterForCall */
export async function matchSetterFromUtm(
  utmContent: string | null | undefined,
): Promise<SetterMatchResult> {
  return matchSetterForCall({ utm: { utm_content: utmContent ?? null } })
}
