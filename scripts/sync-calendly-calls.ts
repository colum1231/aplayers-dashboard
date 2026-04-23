/* eslint-disable no-console */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "../lib/db/schema.js"

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

async function calendlyFetch<T>(token: string, pathName: string): Promise<T> {
  const res = await fetch(`${API_BASE}${pathName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new Error(`Calendly ${res.status}: ${JSON.stringify(json)}`)
  }
  return json as T
}

function normalizeName(s?: string | null) {
  if (!s) return ""
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

type ProfileRow = typeof schema.profiles.$inferSelect

function matchSetter(utmContent: string | null | undefined, profiles: ProfileRow[]) {
  const raw = utmContent?.trim()
  if (!raw) return { setterUserId: null, setterNameSnapshot: null, setterEmailSnapshot: null }
  const normalized = normalizeName(raw)
  const match = profiles.find((p) => normalizeName(p.fullName) === normalized)
  return {
    setterUserId: match?.id ?? null,
    setterNameSnapshot: match?.fullName ?? raw,
    setterEmailSnapshot: match?.email ?? null,
  }
}

type ScheduledEvent = {
  uri: string
  name: string
  start_time: string
  end_time: string
  event_type: string
}

type Invitee = {
  uri: string
  name: string
  email: string
  canceled: boolean
  cancellation?: { canceled_at?: string } | null
  tracking?: Record<string, string>
  questions_and_answers?: unknown[]
}

async function listScheduledEvents(
  token: string,
  organizationUri: string,
  minStart: string,
  maxStart: string,
) {
  const events: ScheduledEvent[] = []
  let nextPageToken: string | null = null

  do {
    const params = new URLSearchParams({
      organization: organizationUri,
      min_start_time: minStart,
      max_start_time: maxStart,
      count: "100",
      sort: "start_time:asc",
    })
    if (nextPageToken) params.set("page_token", nextPageToken)

    const response = await calendlyFetch<{
      collection: ScheduledEvent[]
      pagination?: { next_page_token?: string | null }
    }>(token, `/scheduled_events?${params.toString()}`)

    events.push(...(response.collection ?? []))
    nextPageToken = response.pagination?.next_page_token ?? null
  } while (nextPageToken)

  return events
}

async function listInvitees(token: string, eventUri: string) {
  const invitees: Invitee[] = []
  const eventUuid = eventUri.split("/").pop()
  if (!eventUuid) return invitees

  let nextPageToken: string | null = null
  do {
    const params = new URLSearchParams({ count: "100" })
    if (nextPageToken) params.set("page_token", nextPageToken)
    const response = await calendlyFetch<{
      collection: Invitee[]
      pagination?: { next_page_token?: string | null }
    }>(token, `/scheduled_events/${eventUuid}/invitees?${params.toString()}`)

    invitees.push(...(response.collection ?? []))
    nextPageToken = response.pagination?.next_page_token ?? null
  } while (nextPageToken)

  return invitees
}

function inferStatus(invitee: Invitee, event: ScheduledEvent) {
  if (invitee.canceled) return "canceled" as const
  const now = Date.now()
  const eventEnd = new Date(event.end_time).getTime()
  if (eventEnd < now) return "completed" as const
  return "scheduled" as const
}

async function main() {
  const args = parseArgs()
  const apiKey = required("CALENDLY_API_KEY")
  const dbUrl = required("DATABASE_URL")
  const organizationUri = required("CALENDLY_ORGANIZATION_URI")

  const from = args.from ?? "2025-01-01T00:00:00Z"
  const to = args.to ?? new Date().toISOString()

  const client = postgres(dbUrl)
  const db = drizzle(client, { schema })

  try {
    console.log(`Syncing Calendly calls from ${from} to ${to}...`)
    const [events, profiles] = await Promise.all([
      listScheduledEvents(apiKey, organizationUri, from, to),
      db.select().from(schema.profiles),
    ])

    let upserted = 0
    for (const event of events) {
      const invitees = await listInvitees(apiKey, event.uri)
      for (const invitee of invitees) {
        const setter = matchSetter(invitee.tracking?.utm_content ?? null, profiles)
        const status = inferStatus(invitee, event)
        await db
          .insert(schema.calls)
          .values({
            calendlyEventUri: event.uri,
            calendlyInviteeUri: invitee.uri,
            eventTypeUri: event.event_type,
            eventTypeName: event.name,
            scheduledStartAt: new Date(event.start_time),
            scheduledEndAt: new Date(event.end_time),
            canceledAt:
              invitee.canceled && invitee.cancellation?.canceled_at
                ? new Date(invitee.cancellation.canceled_at)
                : null,
            status,
            inviteeName: invitee.name,
            inviteeEmail: invitee.email,
            utm: (invitee.tracking ?? null) as never,
            setterUserId: setter.setterUserId,
            setterNameSnapshot: setter.setterNameSnapshot,
            setterEmailSnapshot: setter.setterEmailSnapshot,
            answers: (invitee.questions_and_answers ?? null) as never,
            rawEvent: { event, invitee } as never,
          })
          .onConflictDoUpdate({
            target: schema.calls.calendlyInviteeUri,
            set: {
              eventTypeUri: event.event_type,
              eventTypeName: event.name,
              scheduledStartAt: new Date(event.start_time),
              scheduledEndAt: new Date(event.end_time),
              canceledAt:
                invitee.canceled && invitee.cancellation?.canceled_at
                  ? new Date(invitee.cancellation.canceled_at)
                  : null,
              status,
              inviteeName: invitee.name,
              inviteeEmail: invitee.email,
              utm: (invitee.tracking ?? null) as never,
              setterUserId: setter.setterUserId,
              setterNameSnapshot: setter.setterNameSnapshot,
              setterEmailSnapshot: setter.setterEmailSnapshot,
              answers: (invitee.questions_and_answers ?? null) as never,
              rawEvent: { event, invitee } as never,
              updatedAt: new Date(),
            },
          })
        upserted++
      }
    }

    console.log(`Done. Events: ${events.length}, Call rows upserted: ${upserted}`)
    console.log("No webhook logs are written by this script (webhook endpoint does that).")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
