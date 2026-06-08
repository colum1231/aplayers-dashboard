import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { payments, webhookLogs } from "@/lib/db/schema"
import {
  buildPaymentFromWhopInvoice,
  buildPaymentFromWhopPayment,
  type WhopInvoice,
  type WhopPayment,
  type WhopWebhookEnvelope,
} from "@/lib/whop/normalize"
import { whopsdk } from "@/lib/whop/sdk"

const HANDLED_EVENTS = ["invoice.paid", "payment.succeeded"] as const

type LogUpdate = {
  processingStatus: "received" | "ignored" | "success" | "failed"
  httpStatus: number
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
      provider: "whop",
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
      errorMessage: update.errorMessage ?? null,
      normalizedPayload: (update.normalizedPayload as never) ?? null,
      processedAt: update.processedAt,
    })
    .where(eq(webhookLogs.id, logId))
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const requestHeaders: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    if (k !== "authorization") requestHeaders[k] = v
  })

  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("WHOP_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  let envelope: WhopWebhookEnvelope | { id: string; type: string; timestamp: string; data: unknown }
  let sigValid = false

  try {
    const unwrapped = whopsdk.webhooks.unwrap(rawBody, { headers: requestHeaders })
    sigValid = true
    envelope = {
      id: unwrapped.id,
      type: unwrapped.type,
      timestamp: unwrapped.timestamp,
      data: unwrapped.data,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature"
    let logId = "unknown"
    try {
      let parsed: { type?: string } = {}
      try {
        parsed = JSON.parse(rawBody)
      } catch {
        // ignore
      }
      logId = await createLog(parsed.type ?? "unknown", false, requestHeaders, parsed)
      await updateLog(logId, {
        processingStatus: "failed",
        httpStatus: 401,
        errorMessage: msg,
        processedAt: new Date(),
      })
    } catch (logErr) {
      console.error("Failed to log invalid Whop webhook:", logErr)
    }
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  let logId: string
  try {
    logId = await createLog(envelope.type, sigValid, requestHeaders, envelope)
  } catch (err) {
    console.error("Failed to create webhook log:", err)
    logId = "unknown"
  }

  if (!HANDLED_EVENTS.includes(envelope.type as (typeof HANDLED_EVENTS)[number])) {
    if (logId !== "unknown") {
      await updateLog(logId, {
        processingStatus: "ignored",
        httpStatus: 200,
        processedAt: new Date(),
      }).catch(console.error)
    }
    return NextResponse.json({ received: true, event: envelope.type })
  }

  try {
    const record =
      envelope.type === "payment.succeeded"
        ? buildPaymentFromWhopPayment(envelope.data as WhopPayment)
        : envelope.type === "invoice.paid"
          ? buildPaymentFromWhopInvoice(envelope.data as WhopInvoice)
          : null

    if (!record) {
      if (logId !== "unknown") {
        await updateLog(logId, {
          processingStatus: "ignored",
          httpStatus: 200,
          errorMessage: `Unhandled event type: ${envelope.type}`,
          processedAt: new Date(),
        }).catch(console.error)
      }
      return NextResponse.json({ received: true, event: envelope.type })
    }

    await db
      .insert(payments)
      .values(record)
      .onConflictDoUpdate({
        target: payments.whopInvoiceId,
        set: {
          amount: record.amount,
          currency: record.currency,
          status: record.status,
          source: record.source,
          paymentType: record.paymentType,
          customerEmail: record.customerEmail,
          customerName: record.customerName,
          productName: record.productName,
          productId: record.productId,
          priceId: record.priceId,
          whopUserId: record.whopUserId,
          metadata: record.metadata,
          paymentDate: record.paymentDate,
        },
      })

    if (logId !== "unknown") {
      await updateLog(logId, {
        processingStatus: "success",
        httpStatus: 200,
        normalizedPayload: record,
        processedAt: new Date(),
      })
    }

    return NextResponse.json({
      received: true,
      event: envelope.type,
      whopId: record.whopInvoiceId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("Whop webhook error:", err)
    if (logId !== "unknown") {
      await updateLog(logId, {
        processingStatus: "failed",
        httpStatus: 500,
        errorMessage: msg,
        processedAt: new Date(),
      }).catch(console.error)
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
