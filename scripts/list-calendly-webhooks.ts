/* eslint-disable no-console */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"

const API_BASE = "https://api.calendly.com"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

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

async function main() {
  const org = required("CALENDLY_ORGANIZATION_URI")
  const targetUrl = process.env.CALENDLY_WEBHOOK_URL

  const me = await calendlyFetch<{ resource: { email: string; name: string } }>("/users/me")
  console.log(`Org: ${org}`)
  console.log(`User: ${me.resource.name} <${me.resource.email}>`)
  if (targetUrl) console.log(`Expected dashboard URL: ${targetUrl}`)
  console.log()

  const response = await calendlyFetch<{
    collection: Array<{
      uri: string
      callback_url: string
      state: string
      events: string[]
      scope: string
      created_at: string
      retry_started_at: string | null
    }>
  }>(
    `/webhook_subscriptions?organization=${encodeURIComponent(org)}&scope=organization&count=100`,
  )

  const hooks = response.collection ?? []
  const dashboardHooks = targetUrl
    ? hooks.filter((h) => h.callback_url === targetUrl)
    : hooks.filter((h) => h.callback_url.includes("aplayers-dashboard"))

  console.log(`Total org webhooks: ${hooks.length}`)
  console.log(`Dashboard webhooks: ${dashboardHooks.length}\n`)

  for (const hook of dashboardHooks.length > 0 ? dashboardHooks : hooks) {
    console.log(`${hook.state.toUpperCase().padEnd(8)} ${hook.callback_url}`)
    console.log(`         events: ${hook.events.join(", ")}`)
    console.log(`         created: ${hook.created_at}`)
    if (hook.retry_started_at) console.log(`         retry_started_at: ${hook.retry_started_at}`)
    console.log(`         uri: ${hook.uri}`)
    console.log()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
