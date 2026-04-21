import { headers } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

import { db } from "@/lib/db"
import { payments } from "@/lib/db/schema"

const stripe = new Stripe(process.env.STRIPE_READ_ONLY_API_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const sig = (await headers()).get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 })
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true })
  }

  const pi = event.data.object as Stripe.PaymentIntent

  try {
    const record = await buildPaymentRecord(pi)
    await db
      .insert(payments)
      .values(record)
      .onConflictDoUpdate({
        target: payments.stripePaymentIntentId,
        set: {
          amount: record.amount,
          currency: record.currency,
          status: record.status,
          customerEmail: record.customerEmail,
          customerName: record.customerName,
          productName: record.productName,
          productId: record.productId,
          priceId: record.priceId,
          stripeCustomerId: record.stripeCustomerId,
          metadata: record.metadata,
          paymentDate: record.paymentDate,
        },
      })
  } catch (err) {
    console.error("Failed to upsert payment:", err)
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function buildPaymentRecord(pi: Stripe.PaymentIntent) {
  let customerEmail: string | null = null
  let customerName: string | null = null
  let productName: string | null = null
  let productId: string | null = null
  let priceId: string | null = null

  // try to get checkout session data
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: pi.id,
      limit: 1,
    })
    const session = sessions.data[0]

    if (session) {
      customerEmail = session.customer_details?.email ?? null
      customerName = session.customer_details?.name ?? null

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 1,
        expand: ["data.price.product"],
      })
      const item = lineItems.data[0]
      if (item) {
        priceId = item.price?.id ?? null
        const product = item.price?.product
        if (product && typeof product !== "string" && !product.deleted) {
          productName = product.name
          productId = product.id
        }
      }
    }
  } catch {
    // non-fatal — checkout session may not exist for all PIs
  }

  return {
    stripePaymentIntentId: pi.id,
    amount: pi.amount_received,
    currency: pi.currency,
    status: pi.status,
    customerEmail,
    customerName,
    productName,
    productId,
    priceId,
    stripeCustomerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? null),
    metadata: pi.metadata as Record<string, string>,
    paymentDate: new Date(pi.created * 1000),
  }
}
