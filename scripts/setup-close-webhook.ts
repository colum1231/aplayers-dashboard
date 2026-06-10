/* eslint-disable no-console */
/**
 * Ensures an active Close webhook points at the dashboard for opportunity.updated.
 * Prints signature_key — store as CLOSE_WEBHOOK_SIGNING_KEY in .env.local + Vercel.
 *
 * Usage:
 *   CLOSE_WEBHOOK_URL=https://aplayers-dashboard.vercel.app/api/webhooks/close pnpm setup:webhook:close
 */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const API_BASE = "https://api.close.com/api/v1"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

async function closeFetch<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  const apiKey = required("CLOSE_API_KEY")
  const res = await fetch(`${API_BASE}${pathName}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`Close ${res.status}: ${JSON.stringify(json)}`)
  return json as T
}

type Webhook = {
  id: string
  url: string
  status: string
  signature_key: string
  events: { object_type: string; action: string }[]
}

async function main() {
  const webhookUrl =
    process.env.CLOSE_WEBHOOK_URL ??
    "https://aplayers-dashboard.vercel.app/api/webhooks/close"

  const list = await closeFetch<{ data: Webhook[] }>("/webhook/")
  const existing = (list.data ?? []).filter((w) => w.url === webhookUrl)
  const active = existing.find((w) => w.status === "active")

  if (active) {
    console.log("Active dashboard Close webhook already exists:")
    console.log(JSON.stringify({ id: active.id, url: active.url, events: active.events }, null, 2))
    console.log(`\nCLOSE_WEBHOOK_SIGNING_KEY=${active.signature_key}`)
    return
  }

  for (const hook of existing) {
    console.log(`Deleting ${hook.status} webhook ${hook.id}...`)
    await closeFetch(`/webhook/${hook.id}/`, { method: "DELETE" })
  }

  console.log(`Creating Close webhook → ${webhookUrl}`)
  const created = await closeFetch<Webhook>("/webhook/", {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      events: [{ object_type: "opportunity", action: "updated" }],
      verify_ssl: true,
    }),
  })

  console.log("Created:\n", JSON.stringify(created, null, 2))
  console.log(`\nAdd to .env.local and Vercel:`)
  console.log(`CLOSE_WEBHOOK_SIGNING_KEY=${created.signature_key}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
