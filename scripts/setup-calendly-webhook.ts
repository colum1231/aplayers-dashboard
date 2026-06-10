/* eslint-disable no-console */
/**
 * Ensures an active Calendly org webhook points at the dashboard.
 * Disabled hooks cannot be re-enabled — they are deleted and recreated.
 *
 * Usage:
 *   CALENDLY_WEBHOOK_URL=https://aplayers-dashboard.vercel.app/api/webhooks/calendly pnpm setup:webhook:calendly
 */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"

const API_BASE = "https://api.calendly.com"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DEFAULT_EVENTS = [
  "invitee.created",
  "invitee.canceled",
  "invitee_no_show.created",
  "invitee_no_show.deleted",
]

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

async function calendlyFetch<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  const token = required("CALENDLY_API_KEY")
  const res = await fetch(`${API_BASE}${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${JSON.stringify(json)}`)
  return json as T
}

function webhookUuid(uri: string) {
  return uri.split("/").pop()
}

async function listDashboardHooks(webhookUrl: string, organization: string) {
  const response = await calendlyFetch<{
    collection: Array<{
      uri: string
      callback_url: string
      state: string
      events: string[]
    }>
  }>(
    `/webhook_subscriptions?organization=${encodeURIComponent(organization)}&scope=organization&count=100`,
  )

  return (response.collection ?? []).filter((hook) => hook.callback_url === webhookUrl)
}

async function main() {
  const webhookUrl =
    process.env.CALENDLY_WEBHOOK_URL ??
    "https://aplayers-dashboard.vercel.app/api/webhooks/calendly"
  const organization = required("CALENDLY_ORGANIZATION_URI")
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY

  const existing = await listDashboardHooks(webhookUrl, organization)
  const active = existing.find((hook) => hook.state === "active")

  if (active) {
    console.log("Active dashboard webhook already exists:")
    console.log(JSON.stringify(active, null, 2))
    return
  }

  for (const hook of existing) {
    const id = webhookUuid(hook.uri)
    if (!id) continue
    console.log(`Deleting ${hook.state} webhook ${id}...`)
    await calendlyFetch(`/webhook_subscriptions/${id}`, { method: "DELETE" })
  }

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    events: DEFAULT_EVENTS,
    organization,
    scope: "organization",
  }
  if (signingKey) payload.signing_key = signingKey

  console.log(`Creating webhook → ${webhookUrl}`)
  const created = await calendlyFetch<{ resource: unknown }>("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  console.log("Created:\n", JSON.stringify(created, null, 2))
  console.log("\nEnsure CALENDLY_WEBHOOK_SIGNING_KEY in Vercel matches .env.local")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
