import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import {
  getCallMetrics,
  listCallsPaginated,
  type CallDateFilter,
  type CallStatusFilter,
} from "@/lib/data/calls"
import type { PaymentDatePreset } from "@/lib/data/payments"
import { outcomeLabel } from "@/lib/calls/outcomes"
import { createClient } from "@/lib/supabase/server"
import { DateFilterDropdown } from "@/components/date-filter-dropdown"
import { CallRowActions } from "@/components/calls/call-row-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

const PRESETS: { label: string; value: PaymentDatePreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Quarter", value: "this_quarter" },
  { label: "Last Quarter", value: "last_quarter" },
  { label: "This Year", value: "this_year" },
  { label: "Last Year", value: "last_year" },
  { label: "All Time", value: "all_time" },
]

const PRESET_SET = new Set<PaymentDatePreset>(PRESETS.map((p) => p.value))

const STATUS_OPTIONS: { label: string; value: CallStatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Canceled", value: "canceled" },
  { label: "No-Show", value: "no_show" },
  { label: "Completed", value: "completed" },
]
const STATUS_SET = new Set<CallStatusFilter>(STATUS_OPTIONS.map((s) => s.value))

function parseISODateInput(value?: string) {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

function displayDate(value?: string) {
  if (!value) return "..."
  return value
}

function fmtDate(d: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d))
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "scheduled":
      return "outline"
    case "canceled":
      return "destructive"
    case "no_show":
      return "secondary"
    case "completed":
      return "default"
    default:
      return "outline"
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "scheduled":
      return "Scheduled"
    case "canceled":
      return "Canceled"
    case "no_show":
      return "No-Show"
    case "completed":
      return "Completed"
    default:
      return status
  }
}

function Trend({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    )
  const up = pct >= 0
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-500" : "text-red-500"}`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% vs prior period
    </span>
  )
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string
    from?: string
    to?: string
    status?: string
    setter?: string
    page?: string
    pageSize?: string
  }>
}) {
  const {
    preset: rawPreset,
    from: rawFrom,
    to: rawTo,
    status: rawStatus,
    setter: rawSetter,
    page: rawPage,
    pageSize: rawPageSize,
  } = await searchParams

  const preset: PaymentDatePreset =
    rawPreset && PRESET_SET.has(rawPreset as PaymentDatePreset)
      ? (rawPreset as PaymentDatePreset)
      : "this_month"

  const status: CallStatusFilter =
    rawStatus && STATUS_SET.has(rawStatus as CallStatusFilter)
      ? (rawStatus as CallStatusFilter)
      : "all"

  const fromDate = parseISODateInput(rawFrom)
  const toDate = parseISODateInput(rawTo)
  const hasCustomRange = Boolean(fromDate || toDate)

  const activeFilter: CallDateFilter = {
    ...(hasCustomRange ? { from: fromDate, to: toDate } : { preset }),
    status: status !== "all" ? status : undefined,
    setterId: rawSetter || undefined,
  }

  const activeFilterLabel = hasCustomRange
    ? `Custom ${displayDate(rawFrom)} to ${displayDate(rawTo)}`
    : PRESETS.find((p) => p.value === preset)?.label ?? "This Month"

  const page = Math.max(1, Number(rawPage) || 1)
  const allowedPageSizes = new Set([25, 50, 100])
  const parsedPageSize = Number(rawPageSize) || 25
  const pageSize = allowedPageSizes.has(parsedPageSize) ? parsedPageSize : 25

  const [supabase, metrics, { rows, total, totalPages }, allProfiles] = await Promise.all([
    createClient(),
    getCallMetrics(activeFilter),
    listCallsPaginated({ filter: activeFilter, page, pageSize }),
    db.select().from(profiles).orderBy(profiles.fullName),
  ])

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user ? await getProfileByUserId(user.id) : undefined

  const safePage = Math.min(page, totalPages)
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endRow = Math.min(safePage * pageSize, total)

  function hrefFor(next: {
    preset?: PaymentDatePreset
    from?: string
    to?: string
    status?: CallStatusFilter
    setter?: string
    page?: number
    pageSize?: number
  }) {
    const params = new URLSearchParams()
    if (next.preset && next.preset !== "this_month") params.set("preset", next.preset)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.status && next.status !== "all") params.set("status", next.status)
    if (next.setter) params.set("setter", next.setter)
    if (next.page && next.page > 1) params.set("page", String(next.page))
    if (next.pageSize && next.pageSize !== 25) params.set("pageSize", String(next.pageSize))
    const query = params.toString()
    return query ? `/dashboard/calls?${query}` : "/dashboard/calls"
  }

  const showRatePct =
    metrics.showRate !== null ? `${(metrics.showRate * 100).toFixed(1)}%` : "—"

  const setters = allProfiles.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    email: p.email,
  }))

  const canEdit = profile && ["admin", "closer", "setter"].includes(profile.role)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} call{total !== 1 ? "s" : ""}{" "}
            {`(${activeFilterLabel})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href="/dashboard/data-input/calls">Add call</Link>
            </Button>
          )}
          <DateFilterDropdown
            pathname="/dashboard/calls"
            presets={PRESETS}
            activePreset={preset}
            activeLabel={activeFilterLabel}
            from={rawFrom}
            to={rawTo}
            pageSize={pageSize}
            label="Call Date"
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Booked
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {metrics.booked.toLocaleString()}
            </p>
            <Trend pct={metrics.bookedChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canceled
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {metrics.canceled.toLocaleString()}
            </p>
            <span className="text-xs text-muted-foreground">of booked calls</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              No-Shows
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {metrics.noShow.toLocaleString()}
            </p>
            <span className="text-xs text-muted-foreground">marked by Calendly</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Show Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{showRatePct}</p>
            <Trend pct={metrics.showRateChange} />
          </CardContent>
        </Card>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              status: option.value,
              setter: rawSetter,
              page: 1,
              pageSize,
            })}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              status === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </Link>
        ))}

        {/* Setter filter */}
        {rawSetter && (
          <Link
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              status,
              setter: undefined,
              page: 1,
              pageSize,
            })}
            className="rounded-md border px-2.5 py-1 text-xs bg-primary text-primary-foreground"
          >
            {allProfiles.find((p) => p.id === rawSetter)?.fullName ?? "Setter"} ✕
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-lg border">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>UTM Source</TableHead>
              {canEdit ? (
                <TableHead>Setter / Outcome</TableHead>
              ) : (
                <>
                  <TableHead>Setter</TableHead>
                  <TableHead>Outcome</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 6} className="h-24 text-center text-muted-foreground">
                  No calls found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(row.scheduledStartAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {row.inviteeName && (
                        <span className="text-xs font-medium">{row.inviteeName}</span>
                      )}
                      {row.inviteeEmail ? (
                        <span className="text-xs text-muted-foreground">{row.inviteeEmail}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status)} className="text-xs capitalize">
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    {row.source === "manual" ? (
                      <Badge variant="outline" className="text-xs">
                        Manual
                      </Badge>
                    ) : row.utm ? (
                      <div className="flex flex-col gap-0.5">
                        {(row.utm as Record<string, string>).utm_source && (
                          <span className="text-xs text-muted-foreground">
                            {(row.utm as Record<string, string>).utm_source}
                          </span>
                        )}
                        {(row.utm as Record<string, string>).utm_content && (
                          <span className="text-xs font-medium">
                            {(row.utm as Record<string, string>).utm_content}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {canEdit ? (
                    <TableCell>
                      <CallRowActions
                        callId={row.id}
                        currentOutcome={row.outcome}
                        currentSetterId={row.setterUserId}
                        currentSetterSnapshot={row.setterNameSnapshot}
                        setters={setters}
                      />
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        {row.setterNameSnapshot ? (
                          <Link
                            href={hrefFor({
                              preset: hasCustomRange ? undefined : preset,
                              from: hasCustomRange ? rawFrom : undefined,
                              to: hasCustomRange ? rawTo : undefined,
                              status,
                              setter: row.setterUserId ?? undefined,
                              page: 1,
                              pageSize,
                            })}
                            className="text-xs hover:underline"
                          >
                            {row.setterNameSnapshot}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.outcome ? (
                          <span className="text-xs">{outcomeLabel(row.outcome)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startRow.toLocaleString()}–{endRow.toLocaleString()} of{" "}
          {total.toLocaleString()}
        </p>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border p-1">
            {[25, 50, 100].map((size) => (
              <Link
                key={size}
                href={hrefFor({
                  preset: hasCustomRange ? undefined : preset,
                  from: hasCustomRange ? rawFrom : undefined,
                  to: hasCustomRange ? rawTo : undefined,
                  status,
                  setter: rawSetter,
                  page: 1,
                  pageSize: size,
                })}
                className={`rounded px-2 py-1 text-xs ${
                  pageSize === size
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {size}
              </Link>
            ))}
          </div>

          <Link
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              status,
              setter: rawSetter,
              page: Math.max(1, safePage - 1),
              pageSize,
            })}
            aria-disabled={safePage <= 1}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              safePage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-muted"
            }`}
          >
            Prev
          </Link>
          <span className="px-1 text-sm text-muted-foreground">
            Page {safePage} / {totalPages}
          </span>
          <Link
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              status,
              setter: rawSetter,
              page: Math.min(totalPages, safePage + 1),
              pageSize,
            })}
            aria-disabled={safePage >= totalPages}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              safePage >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-muted"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  )
}
