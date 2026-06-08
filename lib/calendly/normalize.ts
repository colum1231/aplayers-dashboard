import { resolveEventTypeUri } from "@/lib/calendly/constants"

// Normalizes Calendly v2 webhook payload into a shape we can store.
// Payload structure: { event: string, payload: { ... } }

export type CalendlyUtm = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
}

export type NormalizedCalendlyInvitee = {
  calendlyEventUri: string
  calendlyInviteeUri: string | null
  eventTypeUri: string | null
  eventTypeName: string | null
  scheduledStartAt: Date
  scheduledEndAt: Date | null
  canceledAt: Date | null
  inviteeName: string | null
  inviteeEmail: string | null
  utm: CalendlyUtm | null
  answers: unknown[] | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInviteeCreated(eventPayload: any): NormalizedCalendlyInvitee | null {
  const scheduledEvent = eventPayload?.scheduled_event
  const startTime = scheduledEvent?.start_time
  if (!startTime) return null

  const tracking = eventPayload?.tracking ?? {}
  const utm: CalendlyUtm = {
    utm_source: tracking.utm_source ?? null,
    utm_medium: tracking.utm_medium ?? null,
    utm_campaign: tracking.utm_campaign ?? null,
    utm_content: tracking.utm_content ?? null,
    utm_term: tracking.utm_term ?? null,
  }

  return {
    calendlyEventUri: scheduledEvent?.uri ?? "",
    calendlyInviteeUri: eventPayload?.uri ?? null,
    eventTypeUri: resolveEventTypeUri(scheduledEvent?.event_type),
    eventTypeName: scheduledEvent?.name ?? null,
    scheduledStartAt: new Date(startTime),
    scheduledEndAt: scheduledEvent?.end_time ? new Date(scheduledEvent.end_time) : null,
    canceledAt: null,
    inviteeName: eventPayload?.name ?? null,
    inviteeEmail: eventPayload?.email ?? null,
    utm,
    answers: eventPayload?.questions_and_answers ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInviteeCanceled(eventPayload: any): NormalizedCalendlyInvitee | null {
  const scheduledEvent = eventPayload?.scheduled_event
  const startTime = scheduledEvent?.start_time
  if (!startTime) return null

  const canceledAt = eventPayload?.cancellation?.canceled_at
    ? new Date(eventPayload.cancellation.canceled_at)
    : null

  return {
    calendlyEventUri: scheduledEvent?.uri ?? "",
    calendlyInviteeUri: eventPayload?.uri ?? null,
    eventTypeUri: resolveEventTypeUri(scheduledEvent?.event_type),
    eventTypeName: scheduledEvent?.name ?? null,
    scheduledStartAt: new Date(startTime),
    scheduledEndAt: scheduledEvent?.end_time ? new Date(scheduledEvent.end_time) : null,
    canceledAt,
    inviteeName: eventPayload?.name ?? null,
    inviteeEmail: eventPayload?.email ?? null,
    utm: null,
    answers: null,
  }
}
