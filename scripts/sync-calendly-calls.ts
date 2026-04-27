/* eslint-disable no-console */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import postgres from "postgres"

import * as schema from "../lib/db/schema.js"
import {
  ALLOWED_CALENDLY_EVENT_TYPE_URIS,
  MANUAL_UTM_CONTENT_TO_EMAIL,
} from "../lib/calendly/constants.js"

const API_BASE = "https://api.calendly.com"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!raw) return { setterUserId: null, setterNameSnapshot: null, setterEmailSnapshot: null }

  const manualMappedEmail =
    MANUAL_UTM_CONTENT_TO_EMAIL[normalizeUtmContentKey(raw)]?.toLowerCase()
  if (manualMappedEmail) {
    const manualMatch = profiles.find((p) => p.email?.toLowerCase() === manualMappedEmail)
    return {
      setterUserId: manualMatch?.id ?? null,
      setterNameSnapshot: manualMatch?.fullName ?? raw,
      setterEmailSnapshot: manualMatch?.email ?? manualMappedEmail,
    }
  }

  const normalized = normalizeName(raw)
  const match = profiles.find((p) => p.fullName && normalizeName(p.fullName) === normalized)
  return {
    setterUserId: match?.id ?? null,
    setterNameSnapshot: match?.fullName ?? raw,
    setterEmailSnapshot: match?.email ?? null,
  }
}

// ─── Calendly API ─────────────────────────────────────────────────────────────

type ScheduledEvent = {
  uri: string
  name: string
  status: string
  start_time: string
  end_time: string
  event_type: string
}

type Invitee = {
  uri: string
  name: string
  email: string
  canceled: boolean
  cancellation?: { canceled_at?: string }
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

// ─── Sync logic ───────────────────────────────────────────────────────────────

type SyncAction = "insert" | "update" | "skip"

type SyncRecord = {
  action: SyncAction
  inviteeUri: string
  inviteeName: string | null
  inviteeEmail: string | null
  eventDate: string
  eventTypeName: string | null
  status: "scheduled" | "canceled"
  setterNameSnapshot: string | null
  setterEmailSnapshot: string | null
  setterUserId: string | null
  utmContent: string | null
  skipReason?: string
  // only for update
  existingCallId?: string
  changedFields?: string[]
}

async function main() {
  const args = parseArgs()
  const mock = args.mock === true || args.mock === "true"
  const apiKey = required("CALENDLY_API_KEY")
  const organizationUri = required("CALENDLY_ORGANIZATION_URI")
  const dbUrl = required("DATABASE_URL")

  const from =
    typeof args.from === "string"
      ? args.from
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = typeof args.to === "string" ? args.to : new Date().toISOString()

  console.log(mock ? "🔍 MOCK MODE — no DB writes\n" : "🚀 SYNC MODE — writing to DB\n")
  console.log(`Date range: ${from}  →  ${to}\n`)

  const client = postgres(dbUrl)
  const db = drizzle(client, { schema })

  try {
    const [events, profiles, existingCalls] = await Promise.all([
      listScheduledEvents(apiKey, organizationUri, from, to),
      db.select().from(schema.profiles),
      db.select().from(schema.calls),
    ])

    console.log(
      `Fetched ${events.length} Calendly events | ${profiles.length} profiles | ${existingCalls.length} existing calls in DB\n`,
    )

    // Index existing calls by calendlyInviteeUri for O(1) lookups
    const existingByInviteeUri = new Map(
      existingCalls
        .filter((c) => c.calendlyInviteeUri)
        .map((c) => [c.calendlyInviteeUri!, c]),
    )

    const records: SyncRecord[] = []

    for (const event of events) {
      // Filter by allowed event type URIs (same logic as webhook handler)
      if (
        ALLOWED_CALENDLY_EVENT_TYPE_URIS.length > 0 &&
        !ALLOWED_CALENDLY_EVENT_TYPE_URIS.includes(event.event_type)
      ) {
        continue
      }

      const invitees = await listInvitees(apiKey, event.uri)

      for (const invitee of invitees) {
        const utmContent = invitee.tracking?.utm_content ?? null
        const utm = {
          utm_source: invitee.tracking?.utm_source ?? null,
          utm_medium: invitee.tracking?.utm_medium ?? null,
          utm_campaign: invitee.tracking?.utm_campaign ?? null,
          utm_content: utmContent,
          utm_term: invitee.tracking?.utm_term ?? null,
        }

        const setter = matchSetter(utmContent, profiles)
        const status: "scheduled" | "canceled" = invitee.canceled ? "canceled" : "scheduled"
        const canceledAt =
          invitee.canceled && invitee.cancellation?.canceled_at
            ? new Date(invitee.cancellation.canceled_at)
            : null

        const existing = existingByInviteeUri.get(invitee.uri)

        if (!existing) {
          records.push({
            action: "insert",
            inviteeUri: invitee.uri,
            inviteeName: invitee.name ?? null,
            inviteeEmail: invitee.email ?? null,
            eventDate: event.start_time.slice(0, 10),
            eventTypeName: event.name ?? null,
            status,
            setterNameSnapshot: setter.setterNameSnapshot,
            setterEmailSnapshot: setter.setterEmailSnapshot,
            setterUserId: setter.setterUserId,
            utmContent,
          })

          if (!mock) {
            await db
              .insert(schema.calls)
              .values({
                calendlyEventUri: event.uri,
                calendlyInviteeUri: invitee.uri,
                eventTypeUri: event.event_type,
                eventTypeName: event.name,
                scheduledStartAt: new Date(event.start_time),
                scheduledEndAt: new Date(event.end_time),
                canceledAt: canceledAt ?? undefined,
                status,
                inviteeName: invitee.name ?? null,
                inviteeEmail: invitee.email ?? null,
                utm: utm as never,
                setterUserId: setter.setterUserId ?? undefined,
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
                  canceledAt: canceledAt ?? undefined,
                  status,
                  inviteeName: invitee.name ?? null,
                  inviteeEmail: invitee.email ?? null,
                  utm: utm as never,
                  setterUserId: setter.setterUserId ?? undefined,
                  setterNameSnapshot: setter.setterNameSnapshot,
                  setterEmailSnapshot: setter.setterEmailSnapshot,
                  answers: (invitee.questions_and_answers ?? null) as never,
                  rawEvent: { event, invitee } as never,
                  updatedAt: new Date(),
                },
              })
          }
        } else {
          // Detect changed fields worth reporting
          const changedFields: string[] = []

          if (existing.status !== status) changedFields.push(`status: ${existing.status} → ${status}`)
          if (existing.inviteeName !== (invitee.name ?? null))
            changedFields.push(`inviteeName: "${existing.inviteeName}" → "${invitee.name}"`)
          if (existing.setterUserId !== setter.setterUserId)
            changedFields.push(
              `setter: "${existing.setterNameSnapshot}" → "${setter.setterNameSnapshot}"`,
            )
          if (existing.scheduledStartAt?.toISOString() !== new Date(event.start_time).toISOString())
            changedFields.push(`startAt: ${existing.scheduledStartAt?.toISOString()} → ${event.start_time}`)

          if (changedFields.length === 0) {
            records.push({
              action: "skip",
              inviteeUri: invitee.uri,
              inviteeName: invitee.name ?? null,
              inviteeEmail: invitee.email ?? null,
              eventDate: event.start_time.slice(0, 10),
              eventTypeName: event.name ?? null,
              status,
              setterNameSnapshot: setter.setterNameSnapshot,
              setterEmailSnapshot: setter.setterEmailSnapshot,
              setterUserId: setter.setterUserId,
              utmContent,
              existingCallId: existing.id,
              skipReason: "no changes",
            })
          } else {
            records.push({
              action: "update",
              inviteeUri: invitee.uri,
              inviteeName: invitee.name ?? null,
              inviteeEmail: invitee.email ?? null,
              eventDate: event.start_time.slice(0, 10),
              eventTypeName: event.name ?? null,
              status,
              setterNameSnapshot: setter.setterNameSnapshot,
              setterEmailSnapshot: setter.setterEmailSnapshot,
              setterUserId: setter.setterUserId,
              utmContent,
              existingCallId: existing.id,
              changedFields,
            })

            if (!mock) {
              await db
                .update(schema.calls)
                .set({
                  eventTypeUri: event.event_type,
                  eventTypeName: event.name,
                  scheduledStartAt: new Date(event.start_time),
                  scheduledEndAt: new Date(event.end_time),
                  canceledAt: canceledAt ?? undefined,
                  status,
                  inviteeName: invitee.name ?? null,
                  inviteeEmail: invitee.email ?? null,
                  utm: utm as never,
                  setterUserId: setter.setterUserId ?? undefined,
                  setterNameSnapshot: setter.setterNameSnapshot,
                  setterEmailSnapshot: setter.setterEmailSnapshot,
                  answers: (invitee.questions_and_answers ?? null) as never,
                  rawEvent: { event, invitee } as never,
                  updatedAt: new Date(),
                })
                .where(eq(schema.calls.id, existing.id))
            }
          }
        }
      }
    }

    // ─── Print results ───────────────────────────────────────────────────────

    const inserts = records.filter((r) => r.action === "insert")
    const updates = records.filter((r) => r.action === "update")
    const skips = records.filter((r) => r.action === "skip")

    if (inserts.length > 0) {
      console.log("─".repeat(70))
      console.log(`INSERT  (${inserts.length} new calls)`)
      console.log("─".repeat(70))
      for (const r of inserts) {
        const setter = r.setterNameSnapshot
          ? r.setterUserId
            ? `✓ ${r.setterNameSnapshot} <${r.setterEmailSnapshot}>`
            : `✗ unmatched (utm: "${r.utmContent}")`
          : "(no utm)"
        console.log(`  [${r.eventDate}] ${r.inviteeName} <${r.inviteeEmail}>  [${r.status}]`)
        console.log(`    setter: ${setter}`)
        console.log(`    event:  ${r.eventTypeName}`)
        console.log()
      }
    }

    if (updates.length > 0) {
      console.log("─".repeat(70))
      console.log(`UPDATE  (${updates.length} calls with changes)`)
      console.log("─".repeat(70))
      for (const r of updates) {
        console.log(`  [${r.eventDate}] ${r.inviteeName} <${r.inviteeEmail}>  [id: ${r.existingCallId}]`)
        for (const change of r.changedFields ?? []) {
          console.log(`    • ${change}`)
        }
        console.log()
      }
    }

    if (skips.length > 0) {
      console.log("─".repeat(70))
      console.log(`SKIP  (${skips.length} already up-to-date)`)
      console.log("─".repeat(70))
      for (const r of skips) {
        console.log(`  [${r.eventDate}] ${r.inviteeName} <${r.inviteeEmail}>`)
      }
      console.log()
    }

    console.log("─".repeat(70))
    console.log("SUMMARY")
    console.log("─".repeat(70))
    console.log(`  Total processed : ${records.length}`)
    console.log(`  Inserted        : ${inserts.length}`)
    console.log(`  Updated         : ${updates.length}`)
    console.log(`  Skipped (no-op) : ${skips.length}`)
    if (mock) {
      console.log("\n  ⚠️  Mock mode — nothing was written to the DB.")
      console.log("  Run without --mock to apply changes.")
    }
    console.log()
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
