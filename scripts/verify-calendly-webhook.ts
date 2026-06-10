/* eslint-disable no-console */
/**
 * POST a signed test payload to the dashboard Calendly webhook endpoint.
 */
import crypto from "crypto"
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

async function main() {
  const url =
    process.env.CALENDLY_WEBHOOK_URL ??
    "https://aplayers-dashboard.vercel.app/api/webhooks/calendly"
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY
  if (!signingKey) throw new Error("Missing CALENDLY_WEBHOOK_SIGNING_KEY")

  const body = JSON.stringify({
    event: "invitee.created",
    payload: {
      uri: "https://api.calendly.com/scheduled_events/test/invitees/verify-webhook",
      name: "Webhook Verify",
      email: "verify@example.com",
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/test",
        name: "A Players Application Call",
        start_time: "2026-12-01T10:00:00.000000Z",
        end_time: "2026-12-01T10:30:00.000000Z",
        event_type: "https://api.calendly.com/event_types/22191c24-27e1-47e3-82a7-5f94c081b4f3",
      },
      tracking: {
        utm_source: "webhook-verify",
        utm_medium: "script",
        utm_content: "matthew",
      },
    },
  })

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  console.log(`POST ${url}`)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Calendly-Webhook-Signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  })

  const text = await res.text()
  console.log(`Status: ${res.status}`)
  console.log(text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
