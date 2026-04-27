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

function parseArgs() {
  const args = process.argv.slice(2)
  const values: Record<string, string> = {}
  for (const arg of args) {
    if (!arg.startsWith("--")) continue
    const [key, value] = arg.slice(2).split("=")
    if (key && value) values[key] = value
  }
  return values
}

type EventType = {
  uri: string
  name: string
  slug?: string
  scheduling_url?: string
  active?: boolean
  kind?: string
  duration?: number
}

async function calendlyFetch<T>(token: string, pathName: string): Promise<T> {
  const res = await fetch(`${API_BASE}${pathName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${JSON.stringify(json)}`)
  return json as T
}

async function listEventTypes(token: string, organizationUri: string) {
  const eventTypes: EventType[] = []
  let nextPageToken: string | null = null

  do {
    const params = new URLSearchParams({
      organization: organizationUri,
      count: "100",
    })
    if (nextPageToken) params.set("page_token", nextPageToken)

    const response = await calendlyFetch<{
      collection: EventType[]
      pagination?: { next_page_token?: string | null }
    }>(token, `/event_types?${params.toString()}`)

    eventTypes.push(...(response.collection ?? []))
    nextPageToken = response.pagination?.next_page_token ?? null
  } while (nextPageToken)

  return eventTypes
}

async function main() {
  const args = parseArgs()
  const apiKey = required("CALENDLY_API_KEY")
  const organizationUri = required("CALENDLY_ORGANIZATION_URI")

  const onlyActive = args.active === "true"
  const nameContains = args.nameContains?.toLowerCase().trim()
  const outputJson = args.json === "true"

  const eventTypes = await listEventTypes(apiKey, organizationUri)
  const filtered = eventTypes.filter((eventType) => {
    if (onlyActive && !eventType.active) return false
    if (nameContains && !eventType.name.toLowerCase().includes(nameContains)) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  if (outputJson) {
    console.log(JSON.stringify(sorted, null, 2))
    return
  }

  console.log(`Total event types: ${eventTypes.length}`)
  console.log(`After filters: ${sorted.length}`)
  console.log()

  for (const eventType of sorted) {
    console.log(eventType.name)
    console.log(`  uri: ${eventType.uri}`)
    if (eventType.slug) console.log(`  slug: ${eventType.slug}`)
    if (eventType.scheduling_url) console.log(`  scheduling_url: ${eventType.scheduling_url}`)
    if (typeof eventType.duration === "number") console.log(`  duration: ${eventType.duration} mins`)
    if (typeof eventType.active === "boolean") console.log(`  active: ${eventType.active}`)
    if (eventType.kind) console.log(`  kind: ${eventType.kind}`)
    console.log()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
