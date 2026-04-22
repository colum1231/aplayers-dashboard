import { and, count, desc, eq, gte, isNotNull, lt, sql, sum } from "drizzle-orm"

import { db } from "@/lib/db"
import { payments } from "@/lib/db/schema"

export type DateRange = 7 | 30 | 90
export type PaymentDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "all_time"

export type PaymentDateFilter = {
  preset?: PaymentDatePreset
  from?: Date
  to?: Date
  source?: PaymentSourceFilter
}

export type PaymentSourceFilter = "all" | "stripe" | "bank" | "manual" | "other"

function rangeStart(days: DateRange) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

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
      const quarterStartMonth = getQuarter(today) * 3
      const from = new Date(today.getFullYear(), quarterStartMonth, 1)
      return { from, to: new Date(today.getFullYear(), quarterStartMonth + 3, 1) }
    }
    case "last_quarter": {
      const quarterStartMonth = getQuarter(today) * 3
      const from = new Date(today.getFullYear(), quarterStartMonth - 3, 1)
      return { from, to: new Date(today.getFullYear(), quarterStartMonth, 1) }
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

function paymentDateConditions(filter?: PaymentDateFilter) {
  const conditions = [eq(payments.status, "succeeded")]
  const hasCustomBounds = Boolean(filter?.from || filter?.to)
  const bounds = hasCustomBounds
    ? {
        from: filter?.from ? startOfDay(filter.from) : undefined,
        to: filter?.to ? addDays(startOfDay(filter.to), 1) : undefined,
      }
    : presetBounds(filter?.preset ?? "all_time")

  if (bounds.from) conditions.push(gte(payments.paymentDate, bounds.from))
  if (bounds.to) conditions.push(lt(payments.paymentDate, bounds.to))
  if (filter?.source && filter.source !== "all") {
    conditions.push(eq(payments.source, filter.source))
  }

  return conditions
}

function resolvePaymentFilter(filterOrRange?: PaymentDateFilter | DateRange) {
  if (typeof filterOrRange === "number") {
    return { from: rangeStart(filterOrRange), to: undefined as Date | undefined }
  }

  const hasCustomBounds = Boolean(filterOrRange?.from || filterOrRange?.to)
  if (hasCustomBounds) {
    return {
      from: filterOrRange?.from ? startOfDay(filterOrRange.from) : undefined,
      to: filterOrRange?.to ? addDays(startOfDay(filterOrRange.to), 1) : undefined,
    }
  }

  return presetBounds(filterOrRange?.preset ?? "all_time")
}

function metricsConditions(bounds: { from?: Date; to?: Date }) {
  const conditions = [eq(payments.status, "succeeded")]
  if (bounds.from) conditions.push(gte(payments.paymentDate, bounds.from))
  if (bounds.to) conditions.push(lt(payments.paymentDate, bounds.to))
  return and(...conditions)
}

export async function getPaymentMetrics(filterOrRange: PaymentDateFilter | DateRange = 30) {
  const bounds = resolvePaymentFilter(filterOrRange)
  const hasClosedRange =
    Boolean(bounds.from && bounds.to) && Number(bounds.to) > Number(bounds.from)
  const rangeMs = hasClosedRange
    ? Number(bounds.to?.getTime()) - Number(bounds.from?.getTime())
    : null
  const priorBounds =
    hasClosedRange && rangeMs
      ? {
          from: new Date(Number(bounds.from?.getTime()) - rangeMs),
          to: bounds.from,
        }
      : null

  const [current, prior, customerStats] = await Promise.all([
    db
      .select({
        totalAmount: sum(payments.amount),
        totalCount: count(),
      })
      .from(payments)
      .where(metricsConditions(bounds)),
    priorBounds
      ? db
          .select({
            totalAmount: sum(payments.amount),
            totalCount: count(),
          })
          .from(payments)
          .where(metricsConditions(priorBounds))
      : Promise.resolve([{ totalAmount: 0, totalCount: 0 }]),
    db
      .select({
        uniqueCustomers: sql<number>`count(distinct ${payments.customerEmail})`,
      })
      .from(payments)
      .where(metricsConditions(bounds)),
  ])

  const curAmount = Number(current[0]?.totalAmount ?? 0)
  const curCount = Number(current[0]?.totalCount ?? 0)
  const priorAmount = Number(prior[0]?.totalAmount ?? 0)
  const priorCount = Number(prior[0]?.totalCount ?? 0)

  const revenueChange =
    priorAmount > 0 ? ((curAmount - priorAmount) / priorAmount) * 100 : null
  const countChange =
    priorCount > 0 ? ((curCount - priorCount) / priorCount) * 100 : null

  const aov = curCount > 0 ? curAmount / curCount : 0
  const priorAov = priorCount > 0 ? priorAmount / priorCount : 0
  const aovChange = priorAov > 0 ? ((aov - priorAov) / priorAov) * 100 : null

  return {
    revenue: curAmount,
    revenueChange,
    count: curCount,
    countChange,
    aov,
    aovChange,
    uniqueCustomers: Number(customerStats[0]?.uniqueCustomers ?? 0),
  }
}

export async function getProductRevenueBreakdown(
  filterOrRange: PaymentDateFilter | DateRange = 30,
  limit = 5,
) {
  const bounds = resolvePaymentFilter(filterOrRange)
  const conditions = [eq(payments.status, "succeeded"), isNotNull(payments.productName)]
  if (bounds.from) conditions.push(gte(payments.paymentDate, bounds.from))
  if (bounds.to) conditions.push(lt(payments.paymentDate, bounds.to))

  const rows = await db
    .select({
      productName: payments.productName,
      revenue: sum(payments.amount),
    })
    .from(payments)
    .where(and(...conditions))
    .groupBy(payments.productName)
    .orderBy(desc(sum(payments.amount)))

  const normalized = rows.map((row) => ({
    productName: row.productName ?? "Unknown",
    revenue: Number(row.revenue ?? 0),
  }))

  const top = normalized.slice(0, limit)
  const otherRevenue = normalized.slice(limit).reduce((acc, row) => acc + row.revenue, 0)
  if (otherRevenue > 0) {
    top.push({ productName: "Other", revenue: otherRevenue })
  }

  const totalRevenue = normalized.reduce((acc, row) => acc + row.revenue, 0)
  return {
    items: top,
    totalRevenue,
  }
}

export async function listPayments(range?: DateRange) {
  const conditions = [eq(payments.status, "succeeded")]
  if (range) conditions.push(gte(payments.paymentDate, rangeStart(range)))

  return db
    .select()
    .from(payments)
    .where(and(...conditions))
    .orderBy(desc(payments.paymentDate))
    .limit(500)
}

export async function listPaymentsPaginated({
  filter,
  page,
  pageSize,
}: {
  filter?: PaymentDateFilter
  page: number
  pageSize: number
}) {
  const conditions = paymentDateConditions(filter)

  const whereClause = and(...conditions)
  const offset = (page - 1) * pageSize

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(whereClause)
      .orderBy(desc(payments.paymentDate))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        total: count(),
      })
      .from(payments)
      .where(whereClause),
  ])

  const total = Number(totalResult[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    rows,
    total,
    totalPages,
    page,
    pageSize,
  }
}
