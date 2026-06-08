/* eslint-disable no-console */
/**
 * One-time backfill: pull Whop checkout payments (default) or paid invoices.
 *
 * Usage:
 *   pnpm sync:payments:whop              # checkout payments, last 365 days
 *   pnpm sync:payments:whop:mock         # dry run
 *   pnpm sync:payments:whop -- --days=90
 *   pnpm sync:payments:whop -- --all
 *   pnpm sync:payments:whop -- --invoices
 */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import { Whop } from "@whop/sdk"
import postgres from "postgres"

import * as schema from "../lib/db/schema.js"
import {
  buildPaymentFromWhopInvoice,
  buildPaymentFromWhopPayment,
  type WhopInvoice,
  type WhopPayment,
} from "../lib/whop/normalize.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

type SyncSource = "payments" | "invoices"
type PaymentRecord =
  | ReturnType<typeof buildPaymentFromWhopPayment>
  | ReturnType<typeof buildPaymentFromWhopInvoice>

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

function parseArgs() {
  const args = process.argv.slice(2)
  const values: Record<string, string | boolean> = {}
  for (const arg of args) {
    if (!arg.startsWith("--")) continue
    const eqIdx = arg.indexOf("=")
    if (eqIdx === -1) {
      values[arg.slice(2)] = true
    } else {
      values[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
    }
  }
  return values
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function resolveSource(args: Record<string, string | boolean>): SyncSource {
  if (args.invoices === true) return "invoices"
  if (args.payments === true) return "payments"
  return "payments"
}

async function resolveCompanyId(client: Whop, explicit?: string) {
  if (explicit) return explicit
  if (process.env.WHOP_COMPANY_ID) return process.env.WHOP_COMPANY_ID

  const page = await client.companies.list({ first: 1 })
  const company = page.data[0]
  if (!company?.id) {
    throw new Error(
      "Could not resolve company_id. Set WHOP_COMPANY_ID or pass --company-id=biz_xxx",
    )
  }
  console.log(`Using company: ${company.title ?? company.id} (${company.id})`)
  return company.id
}

async function fetchPayments(
  client: Whop,
  companyId: string,
  createdAfter?: string,
): Promise<WhopPayment[]> {
  const rows: WhopPayment[] = []
  for await (const payment of client.payments.list({
    company_id: companyId,
    statuses: ["paid"],
    substatuses: ["succeeded"],
    created_after: createdAfter,
    first: 50,
    order: "paid_at",
    direction: "desc",
  })) {
    rows.push(payment as WhopPayment)
  }
  return rows
}

async function fetchInvoices(
  client: Whop,
  companyId: string,
  createdAfter?: string,
): Promise<WhopInvoice[]> {
  const rows: WhopInvoice[] = []
  for await (const invoice of client.invoices.list({
    company_id: companyId,
    statuses: ["paid"],
    created_after: createdAfter,
    first: 50,
    order: "created_at",
    direction: "desc",
  })) {
    rows.push(invoice as WhopInvoice)
  }
  return rows
}

async function upsertRecords({
  records,
  mock,
  databaseUrl,
  backfillSource,
}: {
  records: PaymentRecord[]
  mock: boolean
  databaseUrl: string
  backfillSource: string
}) {
  let inserted = 0
  let updated = 0
  let failed = 0

  const sql = mock ? null : postgres(databaseUrl)
  const db = mock ? null : drizzle(sql!)

  const existingIds = new Set<string>()
  if (db) {
    const rows = await db
      .select({ whopInvoiceId: schema.payments.whopInvoiceId })
      .from(schema.payments)
    for (const row of rows) {
      if (row.whopInvoiceId) existingIds.add(row.whopInvoiceId)
    }
  }

  for (const baseRecord of records) {
    try {
      const record = {
        ...baseRecord,
        metadata: {
          ...(baseRecord.metadata as Record<string, unknown>),
          backfillSource,
        },
      }

      if (mock) {
        console.log(
          `  [mock] ${record.whopInvoiceId} ${record.customerEmail ?? "—"} ${(record.amount / 100).toFixed(2)} ${record.currency} · ${record.productName}`,
        )
        inserted++
        continue
      }

      const existed = existingIds.has(record.whopInvoiceId)

      await db!
        .insert(schema.payments)
        .values(record)
        .onConflictDoUpdate({
          target: schema.payments.whopInvoiceId,
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

      if (existed) updated++
      else inserted++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  failed ${baseRecord.whopInvoiceId}: ${msg}`)
    }
  }

  if (sql) await sql.end()

  return { inserted, updated, failed }
}

async function main() {
  const args = parseArgs()
  const mock = args.mock === true
  const source = resolveSource(args)
  const days = Number(args.days ?? 365)
  const companyIdArg = typeof args["company-id"] === "string" ? args["company-id"] : undefined
  const createdAfter =
    args.all === true || Number.isNaN(days) || days <= 0 ? undefined : isoDaysAgo(days)

  const apiKey = required("WHOP_API_KEY")
  const databaseUrl = required("DATABASE_URL")

  const client = new Whop({ apiKey })
  const companyId = await resolveCompanyId(client, companyIdArg)

  console.log(`Fetching Whop ${source}...`)
  if (createdAfter) console.log(`  created_after: ${createdAfter}`)
  console.log(`  company_id: ${companyId}`)
  if (mock) console.log("  mode: mock (no DB writes)")

  const records =
    source === "payments"
      ? (await fetchPayments(client, companyId, createdAfter)).map(buildPaymentFromWhopPayment)
      : (await fetchInvoices(client, companyId, createdAfter)).map(buildPaymentFromWhopInvoice)

  console.log(`Found ${records.length} ${source === "payments" ? "succeeded payment(s)" : "paid invoice(s)"}`)

  if (records.length === 0) {
    console.log("Nothing to sync. Try --all or a larger --days=N window.")
    return
  }

  const { inserted, updated, failed } = await upsertRecords({
    records,
    mock,
    databaseUrl,
    backfillSource: `sync-whop-${source}`,
  })

  console.log("\nDone.")
  console.log(`  inserted: ${inserted}`)
  console.log(`  updated: ${updated}`)
  console.log(`  failed: ${failed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
