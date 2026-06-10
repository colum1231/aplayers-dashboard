import { resolveEventTypeUri } from "@/lib/calendly/constants"
import { normalizeCalendlyUtm, type CalendlyUtm } from "@/lib/calendly/utm"

export type { CalendlyUtm }

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

  const utm = normalizeCalendlyUtm(eventPayload?.tracking ?? {})

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
