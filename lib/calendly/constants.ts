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
}

/**
 * Only Calendly event type URIs listed here will be persisted to calls.
 * Add your allowed URIs here.
 */
export const ALLOWED_CALENDLY_EVENT_TYPE_URIS: string[] = [
  "https://api.calendly.com/event_types/22191c24-27e1-47e3-82a7-5f94c081b4f3",
]
