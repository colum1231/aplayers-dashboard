import crypto from "crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { calls, webhookLogs } from "@/lib/db/schema"
import {
  ALLOWED_CALENDLY_EVENT_TYPE_URIS,
  CALENDLY_EVENTS,
  HANDLED_EVENTS,
} from "@/lib/calendly/constants"
import { normalizeInviteeCanceled, normalizeInviteeCreated } from "@/lib/calendly/normalize"
import { matchSetterFromUtm } from "@/lib/calendly/setter-match"

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? ""

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!SIGNING_KEY) {
    console.warn("CALENDLY_WEBHOOK_SIGNING_KEY not set — skipping verification")
    return true
  }
  if (!header) return false

  try {
    const timestampPart = header.split(",").find((p) => p.startsWith("t="))
    const sigPart = header.split(",").find((p) => p.startsWith("v1="))
    if (!timestampPart || !sigPart) return false

    const timestamp = timestampPart.slice(2)
    const provided = sigPart.slice(3)

    // Replay attack window: 5 minutes
    const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10))
    if (age > 300) return false

    const expected = crypto
      .createHmac("sha256", SIGNING_KEY)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex")

    if (provided.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

type LogUpdate = {
  processingStatus: "received" | "ignored" | "success" | "failed"
  httpStatus: number
  callId?: string | null
  errorMessage?: string | null
  normalizedPayload?: unknown
  processedAt: Date
}

async function createLog(
  eventType: string,
  signatureValid: boolean,
  requestHeaders: Record<string, string>,
  requestBody: unknown,
): Promise<string> {
  const [row] = await db
    .insert(webhookLogs)
    .values({
      provider: "calendly",
      eventType,
      processingStatus: "received",
      signatureValid,
      requestHeaders,
      requestBody,
    })
    .returning({ id: webhookLogs.id })
  return row.id
}

async function updateLog(logId: string, update: LogUpdate) {
  await db
    .update(webhookLogs)
    .set({
      processingStatus: update.processingStatus,
      httpStatus: update.httpStatus,
      callId: update.callId ?? null,
      errorMessage: update.errorMessage ?? null,
      normalizedPayload: update.normalizedPayload as never ?? null,
      processedAt: update.processedAt,
    })
    .where(eq(webhookLogs.id, logId))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getScheduledEventTypeUri(eventPayload: any): string | null {
  return (eventPayload?.scheduled_event?.event_type as string | undefined) ?? null
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const rawBody = await req.text()
  const sigHeader = req.headers.get("Calendly-Webhook-Signature")

  // Parse headers for logging (exclude sensitive values)
  const requestHeaders: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    if (k !== "authorization") requestHeaders[k] = v
  })

  let parsedBody: { event?: string; payload?: unknown } = {}
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    // malformed — log below
  }

  const eventType = (parsedBody.event as string) ?? "unknown"
  const sigValid = verifySignature(rawBody, sigHeader)

  let logId: string
  try {
    logId = await createLog(eventType, sigValid, requestHeaders, parsedBody)
  } catch (err) {
    console.error("Failed to create webhook log:", err)
    // Don't fail the whole request over a logging issue
    logId = "unknown"
  }

  if (!sigValid) {
    if (logId !== "unknown") {
      await updateLog(logId, {
        processingStatus: "failed",
        httpStatus: 401,
        errorMessage: "Invalid or missing signature",
        processedAt: new Date(),
      }).catch(console.error)
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // Ignore events we don't handle
  if (!HANDLED_EVENTS.includes(eventType)) {
    await updateLog(logId, {
      processingStatus: "ignored",
      httpStatus: 200,
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ received: true, event: eventType })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventPayload = parsedBody.payload as any

  try {
    const requiresEventTypeFilter =
      eventType === CALENDLY_EVENTS.INVITEE_CREATED || eventType === CALENDLY_EVENTS.INVITEE_CANCELED

    if (requiresEventTypeFilter && ALLOWED_CALENDLY_EVENT_TYPE_URIS.length > 0) {
      const eventTypeUri = getScheduledEventTypeUri(eventPayload)
      if (!eventTypeUri || !ALLOWED_CALENDLY_EVENT_TYPE_URIS.includes(eventTypeUri)) {
        await updateLog(logId, {
          processingStatus: "ignored",
          httpStatus: 200,
          errorMessage: `Ignored event_type URI: ${eventTypeUri ?? "missing"}`,
          processedAt: new Date(),
        }).catch(console.error)
        return NextResponse.json({ received: true, ignored: "event_type_uri" })
      }
    }

    // ── invitee.created ────────────────────────────────────────────────────
    if (eventType === CALENDLY_EVENTS.INVITEE_CREATED) {
      const normalized = normalizeInviteeCreated(eventPayload)
      if (!normalized || !normalized.scheduledStartAt) {
        await updateLog(logId, {
          processingStatus: "failed",
          httpStatus: 400,
          errorMessage: "Missing required fields (start_time)",
          processedAt: new Date(),
        })
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      }

      const setter = await matchSetterFromUtm(normalized.utm?.utm_content)

      const [row] = await db
        .insert(calls)
        .values({
          calendlyEventUri: normalized.calendlyEventUri,
          calendlyInviteeUri: normalized.calendlyInviteeUri,
          eventTypeUri: normalized.eventTypeUri,
          eventTypeName: normalized.eventTypeName,
          scheduledStartAt: normalized.scheduledStartAt,
          scheduledEndAt: normalized.scheduledEndAt ?? undefined,
          status: "scheduled",
          inviteeName: normalized.inviteeName,
          inviteeEmail: normalized.inviteeEmail,
          utm: normalized.utm as never,
          setterUserId: setter.setterUserId ?? undefined,
          setterNameSnapshot: setter.setterNameSnapshot,
          setterEmailSnapshot: setter.setterEmailSnapshot,
          answers: normalized.answers as never,
          rawEvent: parsedBody as never,
        })
        .onConflictDoUpdate({
          target: calls.calendlyInviteeUri,
          set: {
            eventTypeUri: normalized.eventTypeUri,
            eventTypeName: normalized.eventTypeName,
            scheduledStartAt: normalized.scheduledStartAt,
            scheduledEndAt: normalized.scheduledEndAt ?? undefined,
            status: "scheduled",
            inviteeName: normalized.inviteeName,
            inviteeEmail: normalized.inviteeEmail,
            utm: normalized.utm as never,
            setterUserId: setter.setterUserId ?? undefined,
            setterNameSnapshot: setter.setterNameSnapshot,
            setterEmailSnapshot: setter.setterEmailSnapshot,
            answers: normalized.answers as never,
            rawEvent: parsedBody as never,
            updatedAt: new Date(),
          },
        })
        .returning({ id: calls.id })

      await updateLog(logId, {
        processingStatus: "success",
        httpStatus: 200,
        callId: row?.id ?? null,
        normalizedPayload: normalized,
        processedAt: new Date(),
      })
      return NextResponse.json({ received: true, callId: row?.id })
    }

    // ── invitee.canceled ───────────────────────────────────────────────────
    if (eventType === CALENDLY_EVENTS.INVITEE_CANCELED) {
      const normalized = normalizeInviteeCanceled(eventPayload)
      if (!normalized || !normalized.calendlyInviteeUri) {
        await updateLog(logId, {
          processingStatus: "failed",
          httpStatus: 400,
          errorMessage: "Missing invitee URI",
          processedAt: new Date(),
        })
        return NextResponse.json({ error: "Missing invitee URI" }, { status: 400 })
      }

      const [row] = await db
        .update(calls)
        .set({
          status: "canceled",
          canceledAt: normalized.canceledAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(calls.calendlyInviteeUri, normalized.calendlyInviteeUri))
        .returning({ id: calls.id })

      await updateLog(logId, {
        processingStatus: row ? "success" : "ignored",
        httpStatus: 200,
        callId: row?.id ?? null,
        normalizedPayload: normalized,
        processedAt: new Date(),
      })
      return NextResponse.json({ received: true, callId: row?.id ?? null })
    }

    // ── invitee_no_show.created ────────────────────────────────────────────
    if (eventType === CALENDLY_EVENTS.NO_SHOW_CREATED) {
      // Payload: { uri: no_show_uri, invitee: invitee_uri, created_at }
      const inviteeUri = eventPayload?.invitee as string | undefined
      if (!inviteeUri) {
        await updateLog(logId, {
          processingStatus: "failed",
          httpStatus: 400,
          errorMessage: "Missing invitee URI in no_show payload",
          processedAt: new Date(),
        })
        return NextResponse.json({ error: "Missing invitee URI" }, { status: 400 })
      }

      const [row] = await db
        .update(calls)
        .set({ status: "no_show", updatedAt: new Date() })
        .where(eq(calls.calendlyInviteeUri, inviteeUri))
        .returning({ id: calls.id })

      await updateLog(logId, {
        processingStatus: row ? "success" : "ignored",
        httpStatus: 200,
        callId: row?.id ?? null,
        processedAt: new Date(),
      })
      return NextResponse.json({ received: true, callId: row?.id ?? null })
    }

    // ── invitee_no_show.deleted ────────────────────────────────────────────
    if (eventType === CALENDLY_EVENTS.NO_SHOW_DELETED) {
      const inviteeUri = eventPayload?.invitee as string | undefined
      if (!inviteeUri) {
        await updateLog(logId, {
          processingStatus: "failed",
          httpStatus: 400,
          errorMessage: "Missing invitee URI in no_show.deleted payload",
          processedAt: new Date(),
        })
        return NextResponse.json({ error: "Missing invitee URI" }, { status: 400 })
      }

      const [row] = await db
        .update(calls)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(calls.calendlyInviteeUri, inviteeUri))
        .returning({ id: calls.id })

      await updateLog(logId, {
        processingStatus: row ? "success" : "ignored",
        httpStatus: 200,
        callId: row?.id ?? null,
        processedAt: new Date(),
      })
      return NextResponse.json({ received: true, callId: row?.id ?? null })
    }

    // Shouldn't reach here (HANDLED_EVENTS guard above), but just in case
    await updateLog(logId, {
      processingStatus: "ignored",
      httpStatus: 200,
      processedAt: new Date(),
    })
    return NextResponse.json({ received: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("Calendly webhook error:", err)
    await updateLog(logId, {
      processingStatus: "failed",
      httpStatus: 500,
      errorMessage: msg,
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
