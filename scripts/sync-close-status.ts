/* eslint-disable no-console */
/**
 * Backfill Close ↔ dashboard status for existing calls (outbound push).
 *
 * Usage:
 *   pnpm sync:close                    # all scheduled/no_show calls
 *   pnpm sync:close -- --email=x@y.com # single invitee
 *   pnpm sync:close -- --mock          # dry run (no Close writes)
 */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { and, eq, or } from "drizzle-orm"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

async function main() {
  const { syncCallToClose } = await import("../lib/close/sync.js")
  const { db } = await import("../lib/db/index.js")
  const { calls } = await import("../lib/db/schema.js")
  if (!process.env.CLOSE_API_KEY) throw new Error("Missing CLOSE_API_KEY")

  const args = process.argv.slice(2)
  const mock = args.includes("--mock")
  const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1]

  const rows = await db
    .select({ id: calls.id, inviteeEmail: calls.inviteeEmail, status: calls.status })
    .from(calls)
    .where(
      emailArg
        ? eq(calls.inviteeEmail, emailArg)
        : and(or(eq(calls.status, "scheduled"), eq(calls.status, "no_show"))),
    )

  console.log(`Syncing ${rows.length} call(s)${mock ? " (mock — listing only)" : ""}...`)

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    if (mock) {
      console.log(`- ${row.inviteeEmail} (${row.status})`)
      continue
    }

    const result = await syncCallToClose(row.id)
    if (result.ok) {
      ok++
      console.log(`✓ ${row.inviteeEmail}: ${result.message}`)
    } else if (result.skipped) {
      skipped++
      console.log(`○ ${row.inviteeEmail}: ${result.message}`)
    } else {
      failed++
      console.log(`✗ ${row.inviteeEmail}: ${result.message}`)
    }
  }

  if (!mock) {
    console.log(`\nDone: ${ok} synced, ${skipped} skipped, ${failed} failed`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
