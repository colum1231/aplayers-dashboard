import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { verifyCloseWebhookSignature } from "@/lib/close/verify"
import { syncCloseOpportunityToCall } from "@/lib/close/sync"
import { db } from "@/lib/db"
import { webhookLogs } from "@/lib/db/schema"

const SIGNING_KEY = process.env.CLOSE_WEBHOOK_SIGNING_KEY ?? ""

type CloseWebhookPayload = {
  event_id?: string
  subscription_id?: string
  object_type?: string
  action?: string
  object_id?: string
  changed_fields?: string[]
  data?: {
    id?: string
    lead_id?: string
    status_id?: string
    status_label?: string
  }
}

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
      provider: "close",
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
      normalizedPayload: (update.normalizedPayload as never) ?? null,
      processedAt: update.processedAt,
    })
    .where(eq(webhookLogs.id, logId))
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const sigHash = req.headers.get("close-sig-hash")
  const sigTimestamp = req.headers.get("close-sig-timestamp")

  const requestHeaders: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    if (k !== "authorization") requestHeaders[k] = v
  })

  let parsedBody: CloseWebhookPayload = {}
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    // logged below
  }

  const eventType = `${parsedBody.object_type ?? "unknown"}.${parsedBody.action ?? "unknown"}`
  const sigValid = SIGNING_KEY
    ? verifyCloseWebhookSignature(rawBody, sigHash, sigTimestamp, SIGNING_KEY)
    : false

  let logId: string
  try {
    logId = await createLog(eventType, sigValid, requestHeaders, parsedBody)
  } catch (err) {
    console.error("Failed to create Close webhook log:", err)
    logId = "unknown"
  }

  if (!SIGNING_KEY) {
    if (logId !== "unknown") {
      await updateLog(logId, {
        processingStatus: "failed",
        httpStatus: 500,
        errorMessage: "CLOSE_WEBHOOK_SIGNING_KEY not configured",
        processedAt: new Date(),
      }).catch(console.error)
    }
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
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

  if (parsedBody.object_type !== "opportunity" || parsedBody.action !== "updated") {
    await updateLog(logId, {
      processingStatus: "ignored",
      httpStatus: 200,
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ received: true, ignored: "event_type" })
  }

  const changed = parsedBody.changed_fields ?? []
  if (!changed.includes("status_id") && !changed.includes("status_label")) {
    await updateLog(logId, {
      processingStatus: "ignored",
      httpStatus: 200,
      errorMessage: "Status not in changed_fields",
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ received: true, ignored: "changed_fields" })
  }

  const opportunityId = parsedBody.data?.id ?? parsedBody.object_id
  const statusId = parsedBody.data?.status_id
  const leadId = parsedBody.data?.lead_id

  if (!opportunityId || !statusId || !leadId) {
    await updateLog(logId, {
      processingStatus: "failed",
      httpStatus: 400,
      errorMessage: "Missing opportunity id, status_id, or lead_id",
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const result = await syncCloseOpportunityToCall({
      opportunityId,
      statusId,
      leadId,
    })

    await updateLog(logId, {
      processingStatus: result.ok ? "success" : result.skipped ? "ignored" : "failed",
      httpStatus: 200,
      errorMessage: result.ok ? null : result.message,
      normalizedPayload: result,
      processedAt: new Date(),
    })

    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("Close webhook error:", err)
    await updateLog(logId, {
      processingStatus: "failed",
      httpStatus: 500,
      errorMessage: msg,
      processedAt: new Date(),
    }).catch(console.error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
