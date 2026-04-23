export const CALENDLY_EVENTS = {
  INVITEE_CREATED: "invitee.created",
  INVITEE_CANCELED: "invitee.canceled",
  NO_SHOW_CREATED: "invitee_no_show.created",
  NO_SHOW_DELETED: "invitee_no_show.deleted",
} as const

export type CalendlyEventType = (typeof CALENDLY_EVENTS)[keyof typeof CALENDLY_EVENTS]

export const HANDLED_EVENTS = Object.values(CALENDLY_EVENTS) as string[]
