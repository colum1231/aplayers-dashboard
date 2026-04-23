import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { calls } from "@/lib/db/schema"
import type { PaymentDatePreset } from "@/lib/data/payments"

// Re-export so callers can use one import
export type { PaymentDatePreset as CallDatePreset }

export type CallStatusFilter = "all" | "scheduled" | "canceled" | "no_show" | "completed"

export type CallDateFilter = {
  preset?: PaymentDatePreset
  from?: Date
  to?: Date
  status?: CallStatusFilter
  setterId?: string
}

// ─── Date bounds (mirrors payments.ts logic exactly) ──────────────────────────

function startOfDay(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(value: Date, days: number) {
  const d = new Date(value)
  d.setDate(d.getDate() + days)
  return d
}

function getQuarter(date: Date) {
  return Math.floor(date.getMonth() / 3)
}

function presetBounds(preset: PaymentDatePreset): { from?: Date; to?: Date } {
  if (preset === "all_time") return {}

  const now = new Date()
  const today = startOfDay(now)
  const dayOfWeek = (today.getDay() + 6) % 7 // monday=0

  switch (preset) {
    case "today":
      return { from: today, to: addDays(today, 1) }
    case "yesterday":
      return { from: addDays(today, -1), to: today }
    case "this_week": {
      const from = addDays(today, -dayOfWeek)
      return { from, to: addDays(from, 7) }
    }
    case "last_week": {
      const from = addDays(today, -dayOfWeek - 7)
      return { from, to: addDays(from, 7) }
    }
    case "this_month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to: new Date(today.getFullYear(), today.getMonth() + 1, 1) }
    }
    case "last_month": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { from, to: new Date(today.getFullYear(), today.getMonth(), 1) }
    }
    case "this_quarter": {
      const q = getQuarter(today) * 3
      const from = new Date(today.getFullYear(), q, 1)
      return { from, to: new Date(today.getFullYear(), q + 3, 1) }
    }
    case "last_quarter": {
      const q = getQuarter(today) * 3
      const from = new Date(today.getFullYear(), q - 3, 1)
      return { from, to: new Date(today.getFullYear(), q, 1) }
    }
    case "this_year": {
      const from = new Date(today.getFullYear(), 0, 1)
      return { from, to: new Date(today.getFullYear() + 1, 0, 1) }
    }
    case "last_year": {
      const from = new Date(today.getFullYear() - 1, 0, 1)
      return { from, to: new Date(today.getFullYear(), 0, 1) }
    }
  }
}

function resolveBounds(filter?: CallDateFilter): { from?: Date; to?: Date } {
  const hasCustom = Boolean(filter?.from || filter?.to)
  if (hasCustom) {
    return {
      from: filter?.from ? startOfDay(filter.from) : undefined,
      to: filter?.to ? addDays(startOfDay(filter.to), 1) : undefined,
    }
  }
  return presetBounds(filter?.preset ?? "all_time")
}

function buildConditions(filter?: CallDateFilter) {
  const bounds = resolveBounds(filter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  if (bounds.from) conditions.push(gte(calls.scheduledStartAt, bounds.from))
  if (bounds.to) conditions.push(lt(calls.scheduledStartAt, bounds.to))

  if (filter?.status && filter.status !== "all") {
    conditions.push(eq(calls.status, filter.status))
  }
  if (filter?.setterId) {
    conditions.push(eq(calls.setterUserId, filter.setterId))
  }

  return conditions
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export type CallMetrics = {
  booked: number
  canceled: number
  noShow: number
  // show = past calls that have status scheduled or completed
  showCount: number
  showRate: number | null
  // prior-period deltas
  bookedChange: number | null
  showRateChange: number | null
}

async function computeMetrics(bounds: { from?: Date; to?: Date }) {
  const conds = []
  if (bounds.from) conds.push(gte(calls.scheduledStartAt, bounds.from))
  if (bounds.to) conds.push(lt(calls.scheduledStartAt, bounds.to))

  const where = conds.length > 0 ? and(...conds) : undefined

  const rows = await db
    .select({
      status: calls.status,
      cnt: count(),
    })
    .from(calls)
    .where(where)
    .groupBy(calls.status)

  const now = new Date()
  const statusCounts = Object.fromEntries(rows.map((r) => [r.status, Number(r.cnt)]))

  // "show" = past scheduled/completed calls
  // We need scheduledStartAt < now AND status IN (scheduled, completed)
  // Run a separate query for this
  const showConds = [...conds, lt(calls.scheduledStartAt, now)]
  showConds.push(or(eq(calls.status, "scheduled"), eq(calls.status, "completed"))!)

  const [showRow] = await db
    .select({ cnt: count() })
    .from(calls)
    .where(and(...showConds))

  const booked = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const canceled = statusCounts["canceled"] ?? 0
  const noShow = statusCounts["no_show"] ?? 0
  const showCount = Number(showRow?.cnt ?? 0)
  const showDenominator = showCount + noShow
  const showRate = showDenominator > 0 ? showCount / showDenominator : null

  return { booked, canceled, noShow, showCount, showRate }
}

export async function getCallMetrics(filter?: CallDateFilter): Promise<CallMetrics> {
  const bounds = resolveBounds(filter)
  const hasClosedRange =
    Boolean(bounds.from && bounds.to) && Number(bounds.to) > Number(bounds.from)
  const rangeMs = hasClosedRange
    ? Number(bounds.to?.getTime()) - Number(bounds.from?.getTime())
    : null
  const priorBounds =
    hasClosedRange && rangeMs
      ? {
          from: new Date(Number(bounds.from?.getTime()) - rangeMs),
          to: bounds.from!,
        }
      : null

  const [current, prior] = await Promise.all([
    computeMetrics(bounds),
    priorBounds ? computeMetrics(priorBounds) : null,
  ])

  const bookedChange =
    prior && prior.booked > 0
      ? ((current.booked - prior.booked) / prior.booked) * 100
      : null

  const showRateChange =
    prior && prior.showRate !== null && prior.showRate > 0 && current.showRate !== null
      ? ((current.showRate - prior.showRate) / prior.showRate) * 100
      : null

  return {
    ...current,
    bookedChange,
    showRateChange,
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCallsPaginated({
  filter,
  page,
  pageSize,
}: {
  filter?: CallDateFilter
  page: number
  pageSize: number
}) {
  const conditions = buildConditions(filter)
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (page - 1) * pageSize

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(calls)
      .where(whereClause)
      .orderBy(desc(calls.scheduledStartAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(calls).where(whereClause),
  ])

  const total = Number(totalResult[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { rows, total, totalPages, page, pageSize }
}

// ─── Setter leaderboard (for setter filter dropdown) ─────────────────────────

export async function getSetterStats(filter?: CallDateFilter) {
  const conditions = buildConditions(filter)
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  return db
    .select({
      setterUserId: calls.setterUserId,
      setterNameSnapshot: calls.setterNameSnapshot,
      count: sql<number>`count(*)::int`,
    })
    .from(calls)
    .where(whereClause)
    .groupBy(calls.setterUserId, calls.setterNameSnapshot)
    .orderBy(desc(sql`count(*)`))
}

export async function getCallStatusBreakdown(filter?: CallDateFilter) {
  const conditions = buildConditions(filter)
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      status: calls.status,
      count: count(),
    })
    .from(calls)
    .where(whereClause)
    .groupBy(calls.status)

  const map = new Map(rows.map((r) => [r.status, Number(r.count)]))
  return [
    { status: "scheduled", count: map.get("scheduled") ?? 0 },
    { status: "completed", count: map.get("completed") ?? 0 },
    { status: "no_show", count: map.get("no_show") ?? 0 },
    { status: "canceled", count: map.get("canceled") ?? 0 },
  ] as const
}

export async function getCallVolumeSeries(filter?: CallDateFilter) {
  const conditions = buildConditions(filter)
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${calls.scheduledStartAt})::date::text`,
      status: calls.status,
      count: count(),
    })
    .from(calls)
    .where(whereClause)
    .groupBy(
      sql`date_trunc('day', ${calls.scheduledStartAt})::date`,
      calls.status,
    )
    .orderBy(sql`date_trunc('day', ${calls.scheduledStartAt})::date`)

  const byDay = new Map<
    string,
    {
      day: string
      booked: number
      completed: number
      noShow: number
      canceled: number
    }
  >()

  for (const row of rows) {
    const current = byDay.get(row.day) ?? {
      day: row.day,
      booked: 0,
      completed: 0,
      noShow: 0,
      canceled: 0,
    }
    const value = Number(row.count)
    current.booked += value
    if (row.status === "completed") current.completed += value
    if (row.status === "no_show") current.noShow += value
    if (row.status === "canceled") current.canceled += value
    byDay.set(row.day, current)
  }

  return Array.from(byDay.values())
}
