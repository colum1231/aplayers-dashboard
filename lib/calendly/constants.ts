export const CALENDLY_EVENTS = {
  INVITEE_CREATED: "invitee.created",
  INVITEE_CANCELED: "invitee.canceled",
  NO_SHOW_CREATED: "invitee_no_show.created",
  NO_SHOW_DELETED: "invitee_no_show.deleted",
} as const

export type CalendlyEventType =
  (typeof CALENDLY_EVENTS)[keyof typeof CALENDLY_EVENTS]

export const HANDLED_EVENTS = Object.values(CALENDLY_EVENTS) as string[]

/**
 * Manual mapping from tracking.utm_content -> profile email.
 * This lookup is applied before automatic name matching.
 */
export const MANUAL_UTM_CONTENT_TO_EMAIL: Record<string, string> = {
  matthew: "matthew@theaplayersclub.com",
  hayla: "hayla.adam0@gmail.com",
  derry: "derryg99@icloud.com",
}

/** Calendly event types that should create/update call records. */
export const CALENDLY_EVENT_TYPES = {
  PRIMARY: "https://api.calendly.com/event_types/22191c24-27e1-47e3-82a7-5f94c081b4f3",
  BRUNO: "https://api.calendly.com/event_types/c1d82396-4ffb-4011-b0d6-a732186cae30",
  ROUND_ROBIN: "https://api.calendly.com/event_types/11b0a952-33d7-4b54-aa69-d8469cb7e9c6",
} as const

export const ALLOWED_CALENDLY_EVENT_TYPE_URIS: string[] = Object.values(CALENDLY_EVENT_TYPES)

/** Calendly may send event_type as a URI string or an expanded object. */
export function resolveEventTypeUri(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (value && typeof value === "object" && "uri" in value) {
    const uri = (value as { uri?: unknown }).uri
    if (typeof uri === "string") {
      const trimmed = uri.trim()
      return trimmed || null
    }
  }

  return null
}

export function isAllowedCalendlyEventType(eventTypeUri: string | null | undefined): boolean {
  if (!eventTypeUri) return false
  if (ALLOWED_CALENDLY_EVENT_TYPE_URIS.length === 0) return true
  return ALLOWED_CALENDLY_EVENT_TYPE_URIS.includes(eventTypeUri)
}
