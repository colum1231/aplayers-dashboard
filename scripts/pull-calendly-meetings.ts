/* eslint-disable no-console */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "../lib/db/schema.js"
import { MANUAL_UTM_CONTENT_TO_EMAIL } from "../lib/calendly/constants.js"

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
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${JSON.stringify(json)}`)
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

function normalizeUtmContentKey(s?: string | null) {
  if (!s) return ""
  return s.trim().toLowerCase()
}

type ProfileRow = typeof schema.profiles.$inferSelect

function matchSetter(utmContent: string | null | undefined, profiles: ProfileRow[]) {
  const raw = utmContent?.trim()
  if (!raw) return null
  const manualMappedEmail = MANUAL_UTM_CONTENT_TO_EMAIL[normalizeUtmContentKey(raw)]?.toLowerCase()
  if (manualMappedEmail) {
    const manualMatch = profiles.find((p) => p.email?.toLowerCase() === manualMappedEmail)
    if (manualMatch) return manualMatch
  }

  const normalized = normalizeName(raw)
  return profiles.find((p) => normalizeName(p.fullName) === normalized) ?? null
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
  tracking?: Record<string, string>
}

async function listScheduledEvents(
  token: string,
  organizationUri: string,
  minStart: string,
  maxStart: string,
) {
  const events: ScheduledEvent[] = []
  let nextPageToken: string | null = null
  let currentMinStart = minStart
  const seenPageTokens = new Set<string>()

  while (true) {
    const params = new URLSearchParams({
      organization: organizationUri,
      min_start_time: currentMinStart,
      max_start_time: maxStart,
      count: "100",
      sort: "start_time:asc",
    })
    if (nextPageToken) params.set("page_token", nextPageToken)

    let response: {
      collection: ScheduledEvent[]
      pagination?: { next_page_token?: string | null }
    }
    try {
      response = await calendlyFetch<typeof response>(
        token,
        `/scheduled_events?${params.toString()}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (nextPageToken && message.includes(`"parameter":"page_token"`)) {
        const lastEvent = events[events.length - 1]
        if (!lastEvent?.start_time) break
        const nextMin = new Date(new Date(lastEvent.start_time).getTime() + 1).toISOString()
        console.warn(`Invalid page_token; recovering with min_start_time=${nextMin}`)
        currentMinStart = nextMin
        nextPageToken = null
        seenPageTokens.clear()
        continue
      }
      throw error
    }

    const batch = response.collection ?? []
    if (batch.length === 0) break
    events.push(...batch)
    const candidate = response.pagination?.next_page_token?.trim() || null
    if (!candidate || seenPageTokens.has(candidate)) break
    seenPageTokens.add(candidate)
    nextPageToken = candidate
  }

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

async function main() {
  const args = parseArgs()
  const apiKey = required("CALENDLY_API_KEY")
  const organizationUri = required("CALENDLY_ORGANIZATION_URI")
  const dbUrl = required("DATABASE_URL")

  const from = args.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = args.to ?? new Date().toISOString()

  console.log(`Fetching Calendly meetings from ${from} to ${to}...\n`)

  const client = postgres(dbUrl)
  const db = drizzle(client, { schema })

  try {
    const [events, profiles] = await Promise.all([
      listScheduledEvents(apiKey, organizationUri, from, to),
      db.select().from(schema.profiles),
    ])

    console.log(`Found ${events.length} events, ${profiles.length} profiles in DB\n`)

    // Collect all unique utm_content values and their match results
    const utmSummary = new Map<
      string,
      { count: number; matched: boolean; matchedName?: string; matchedEmail?: string }
    >()

    let totalInvitees = 0
    let withUtm = 0
    let matched = 0
    let unmatched = 0

    for (const event of events) {
      const invitees = await listInvitees(apiKey, event.uri)
      totalInvitees += invitees.length

      for (const invitee of invitees) {
        const utmContent = invitee.tracking?.utm_content ?? null
        const allTracking = invitee.tracking ?? {}

        if (utmContent) {
          withUtm++
          const profile = matchSetter(utmContent, profiles)
          const key = utmContent

          if (!utmSummary.has(key)) {
            utmSummary.set(key, {
              count: 0,
              matched: !!profile,
              matchedName: profile?.fullName ?? undefined,
              matchedEmail: profile?.email ?? undefined,
            })
          }
          utmSummary.get(key)!.count++

          if (profile) {
            matched++
          } else {
            unmatched++
          }
        }

        // Print each invitee row
        const utmDisplay = utmContent ?? "(none)"
        const profile = utmContent ? matchSetter(utmContent, profiles) : null
        const matchLabel = utmContent
          ? profile
            ? `✓ ${profile.fullName} <${profile.email}>`
            : "✗ NO MATCH"
          : "-"

        const otherTracking = Object.entries(allTracking)
          .filter(([k]) => k !== "utm_content")
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")

        console.log(
          `[${event.start_time.slice(0, 10)}] ${invitee.name} <${invitee.email}>` +
            (invitee.canceled ? " [CANCELED]" : ""),
        )
        console.log(`  utm_content: ${utmDisplay}  →  ${matchLabel}`)
        if (otherTracking) console.log(`  other utm:   ${otherTracking}`)
        console.log()
      }
    }

    // Summary table
    console.log("─".repeat(70))
    console.log("UTM CONTENT SUMMARY")
    console.log("─".repeat(70))

    const sorted = [...utmSummary.entries()].sort((a, b) => b[1].count - a[1].count)
    for (const [value, info] of sorted) {
      const status = info.matched ? `✓ ${info.matchedName} <${info.matchedEmail}>` : "✗ NO MATCH"
      console.log(`  "${value}"  (${info.count}x)  →  ${status}`)
    }

    if (utmSummary.size === 0) {
      console.log("  No utm_content values found in this date range.")
    }

    console.log()
    console.log(`Total invitees: ${totalInvitees}`)
    console.log(`With utm_content: ${withUtm}`)
    console.log(`Matched: ${matched}  |  Unmatched: ${unmatched}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
