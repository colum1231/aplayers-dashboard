import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import { inArray } from "drizzle-orm"
import postgres from "postgres"
import Stripe from "stripe"

import * as schema from "../lib/db/schema.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const apiKey = process.env.STRIPE_READ_ONLY_API_KEY
if (!apiKey) {
  console.error("STRIPE_READ_ONLY_API_KEY not set in .env.local")
  process.exit(1)
}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error("DATABASE_URL not set in .env.local")
  process.exit(1)
}

const stripe = new Stripe(apiKey)
const client = postgres(dbUrl)
const db = drizzle(client, { schema })

async function buildRecord(pi: Stripe.PaymentIntent) {
  let customerEmail: string | null = null
  let customerName: string | null = null
  let productName: string | null = null
  let productId: string | null = null
  let priceId: string | null = null

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
    // no checkout session for this PI
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
    stripeCustomerId:
      typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? null),
    metadata: pi.metadata as Record<string, string>,
    paymentDate: new Date(pi.created * 1000),
  }
}

async function main() {
  console.log("Starting backfill of succeeded payment intents...")

  let upserted = 0
  let skippedNonSucceeded = 0
  let skippedExisting = 0
  let page: Stripe.ApiList<Stripe.PaymentIntent> | null = null
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    page = await stripe.paymentIntents.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    const succeeded = page.data.filter((pi) => pi.status === "succeeded")
    const succeededIds = succeeded.map((pi) => pi.id)

    let existingIds = new Set<string>()
    if (succeededIds.length > 0) {
      const existingRows = await db
        .select({ stripePaymentIntentId: schema.payments.stripePaymentIntentId })
        .from(schema.payments)
        .where(inArray(schema.payments.stripePaymentIntentId, succeededIds))
      existingIds = new Set(existingRows.map((row) => row.stripePaymentIntentId))
    }

    const newSucceeded = succeeded.filter((pi) => !existingIds.has(pi.id))
    skippedExisting += succeeded.length - newSucceeded.length

    console.log(
      `  Fetched ${page.data.length} PIs (${succeeded.length} succeeded, ${newSucceeded.length} new) — processing...`,
    )

    for (const pi of newSucceeded) {
      const record = await buildRecord(pi)

      await db
        .insert(schema.payments)
        .values(record)
        .onConflictDoUpdate({
          target: schema.payments.stripePaymentIntentId,
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

      upserted++
      console.log(`    ✓ ${pi.id} — ${(pi.amount_received / 100).toFixed(2)} ${pi.currency.toUpperCase()}`)
    }

    skippedNonSucceeded += page.data.length - succeeded.length
    hasMore = page.has_more
    if (hasMore && page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id
    }
  }

  console.log(
    `\nDone. Upserted: ${upserted}, Skipped existing: ${skippedExisting}, Skipped non-succeeded: ${skippedNonSucceeded}`,
  )
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
