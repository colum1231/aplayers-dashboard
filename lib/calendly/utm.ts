export type CalendlyUtm = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
}

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const satisfies readonly (keyof CalendlyUtm)[]

function isUrlLike(value: string) {
  return /^https?:\/\//i.test(value) || value.includes("utm_source=")
}

function extractUtmFromQueryString(query: string): CalendlyUtm {
  const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`)
  const out: CalendlyUtm = {}
  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value?.trim()) out[key] = value.trim()
  }
  return out
}

function extractUtmFromUrl(value: string): CalendlyUtm {
  try {
    const url = value.includes("://")
      ? new URL(value)
      : new URL(value.replace(/^\?/, ""), "https://placeholder.local")
    return extractUtmFromQueryString(url.search)
  } catch {
    const qIndex = value.indexOf("?")
    if (qIndex >= 0) return extractUtmFromQueryString(value.slice(qIndex))
    return {}
  }
}

function pickCleanerValue(
  current: string | null | undefined,
  candidate: string | null | undefined,
) {
  if (!candidate?.trim()) return current ?? null
  const next = candidate.trim()
  if (!current?.trim()) return next
  if (isUrlLike(current) && !isUrlLike(next)) return next
  return current
}

/** Calendly often stuffs the full landing-page URL into utm_source. Normalize it. */
export function normalizeCalendlyUtm(
  tracking: Record<string, unknown> | null | undefined,
): CalendlyUtm | null {
  if (!tracking) return null

  const merged: CalendlyUtm = {}

  for (const key of UTM_KEYS) {
    const raw = tracking[key]
    if (typeof raw === "string" && raw.trim()) {
      merged[key] = raw.trim()
    }
  }

  for (const value of Object.values(tracking)) {
    if (typeof value !== "string" || !value.includes("utm_")) continue
    const parsed = isUrlLike(value) ? extractUtmFromUrl(value) : extractUtmFromQueryString(value)
    for (const key of UTM_KEYS) {
      merged[key] = pickCleanerValue(merged[key], parsed[key])
    }
  }

  for (const key of UTM_KEYS) {
    const value = merged[key]
    if (value && isUrlLike(value)) {
      const parsed = extractUtmFromUrl(value)
      for (const utmKey of UTM_KEYS) {
        merged[utmKey] = pickCleanerValue(merged[utmKey], parsed[utmKey])
      }
    }
  }

  const hasAny = UTM_KEYS.some((key) => Boolean(merged[key]?.trim()))
  return hasAny ? merged : null
}

/** Compact display for the calls table. */
export function formatCalendlyUtmLabel(utm: CalendlyUtm | null | undefined): string | null {
  if (!utm) return null
  const parts: string[] = []
  if (utm.utm_source) parts.push(utm.utm_source)
  if (utm.utm_medium) parts.push(utm.utm_medium)
  if (utm.utm_content && !isNumericAdCode(utm.utm_content)) {
    parts.push(utm.utm_content)
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

export function formatCalendlyUtmSubLabel(utm: CalendlyUtm | null | undefined): string | null {
  if (!utm?.utm_content || !isNumericAdCode(utm.utm_content)) return null
  return `ad ${utm.utm_content}`
}

export function isNumericAdCode(value: string) {
  return /^\d+$/.test(value.trim())
}

export function isPaidTrafficUtm(utm: CalendlyUtm | null | undefined) {
  return utm?.utm_medium?.trim().toLowerCase() === "paid"
}
