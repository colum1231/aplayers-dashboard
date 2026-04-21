import { and, count, desc, eq, gte, isNotNull, lt, sql, sum } from "drizzle-orm"

import { db } from "@/lib/db"
import { payments } from "@/lib/db/schema"

export type DateRange = 7 | 30 | 90

function rangeStart(days: DateRange) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getPaymentMetrics(range: DateRange = 30) {
  const currentStart = rangeStart(range)
  const priorStart = new Date(currentStart)
  priorStart.setDate(priorStart.getDate() - range)

  const [current, prior] = await Promise.all([
    db
      .select({
        totalAmount: sum(payments.amount),
        totalCount: count(),
      })
      .from(payments)
      .where(
        and(
          gte(payments.paymentDate, currentStart),
          eq(payments.status, "succeeded"),
        ),
      ),
    db
      .select({
        totalAmount: sum(payments.amount),
        totalCount: count(),
      })
      .from(payments)
      .where(
        and(
          gte(payments.paymentDate, priorStart),
          lt(payments.paymentDate, currentStart),
          eq(payments.status, "succeeded"),
        ),
      ),
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

  const [customerStats] = await Promise.all([
    db
      .select({
        uniqueCustomers: sql<number>`count(distinct ${payments.customerEmail})`,
      })
      .from(payments)
      .where(
        and(
          gte(payments.paymentDate, currentStart),
          eq(payments.status, "succeeded"),
        ),
      ),
  ])

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

export async function getProductRevenueBreakdown(range: DateRange = 30, limit = 5) {
  const start = rangeStart(range)
  const rows = await db
    .select({
      productName: payments.productName,
      revenue: sum(payments.amount),
    })
    .from(payments)
    .where(
      and(
        gte(payments.paymentDate, start),
        eq(payments.status, "succeeded"),
        isNotNull(payments.productName),
      ),
    )
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
  range,
  page,
  pageSize,
}: {
  range?: DateRange
  page: number
  pageSize: number
}) {
  const conditions = [eq(payments.status, "succeeded")]
  if (range) conditions.push(gte(payments.paymentDate, rangeStart(range)))

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
