import Link from "next/link"

import { getProfileByUserId } from "@/lib/auth/profile"
import {
  listPaymentsPaginated,
  type PaymentDateFilter,
  type PaymentDatePreset,
  type PaymentSourceFilter,
} from "@/lib/data/payments"
import { createClient } from "@/lib/supabase/server"
import { DateFilterDropdown } from "@/components/date-filter-dropdown"
import { PaymentRowActions } from "@/components/payment-row-actions"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
const SOURCE_OPTIONS: { label: string; value: PaymentSourceFilter }[] = [
  { label: "All Sources", value: "all" },
  { label: "Whop", value: "whop" },
  { label: "Bank", value: "bank" },
  { label: "Manual", value: "manual" },
  { label: "Other", value: "other" },
]
const SOURCE_SET = new Set<PaymentSourceFilter>(SOURCE_OPTIONS.map((s) => s.value))

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

function fmt(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d))
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string
    from?: string
    to?: string
    source?: string
    page?: string
    pageSize?: string
  }>
}) {
  const {
    preset: rawPreset,
    from: rawFrom,
    to: rawTo,
    source: rawSource,
    page: rawPage,
    pageSize: rawPageSize,
  } = await searchParams
  const preset: PaymentDatePreset =
    rawPreset && PRESET_SET.has(rawPreset as PaymentDatePreset)
      ? (rawPreset as PaymentDatePreset)
      : "all_time"
  const source: PaymentSourceFilter =
    rawSource && SOURCE_SET.has(rawSource as PaymentSourceFilter)
      ? (rawSource as PaymentSourceFilter)
      : "all"
  const fromDate = parseISODateInput(rawFrom)
  const toDate = parseISODateInput(rawTo)
  const hasCustomRange = Boolean(fromDate || toDate)
  const activeFilter: PaymentDateFilter = hasCustomRange
    ? { from: fromDate, to: toDate, source }
    : { preset, source }
  const activeFilterLabel = hasCustomRange
    ? `Custom ${displayDate(rawFrom)} to ${displayDate(rawTo)}`
    : PRESETS.find((p) => p.value === preset)?.label ?? "All Time"

  const page = Math.max(1, Number(rawPage) || 1)
  const allowedPageSizes = new Set([25, 50, 100])
  const parsedPageSize = Number(rawPageSize) || 25
  const pageSize = allowedPageSizes.has(parsedPageSize) ? parsedPageSize : 25

  const { rows, total, totalPages } = await listPaymentsPaginated({
    filter: activeFilter,
    page,
    pageSize,
  })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user ? await getProfileByUserId(user.id) : undefined
  const isAdmin = profile?.role === "admin"
  const safePage = Math.min(page, totalPages)
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endRow = Math.min(safePage * pageSize, total)

  function hrefFor(next: {
    preset?: PaymentDatePreset
    from?: string
    to?: string
    source?: PaymentSourceFilter
    page?: number
    pageSize?: number
  }) {
    const params = new URLSearchParams()
    if (next.preset && next.preset !== "all_time") params.set("preset", next.preset)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.source && next.source !== "all") params.set("source", next.source)
    if (next.page && next.page > 1) params.set("page", String(next.page))
    if (next.pageSize && next.pageSize !== 25) params.set("pageSize", String(next.pageSize))
    const query = params.toString()
    return query ? `/dashboard/payments?${query}` : "/dashboard/payments"
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length.toLocaleString()} succeeded payment
            {rows.length !== 1 ? "s" : ""}
            {` (${activeFilterLabel})`}
          </p>
        </div>

        <DateFilterDropdown
          pathname="/dashboard/payments"
          presets={PRESETS}
          activePreset={preset}
          activeLabel={activeFilterLabel}
          from={rawFrom}
          to={rawTo}
          pageSize={pageSize}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SOURCE_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              source: option.value,
              page: 1,
              pageSize,
            })}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              source === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="w-full overflow-x-auto rounded-lg border">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Currency</TableHead>
              {isAdmin && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="h-24 text-center text-muted-foreground">
                  No payments found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {fmtDate(row.paymentDate)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {row.customerName && (
                        <span className="text-xs font-medium">{row.customerName}</span>
                      )}
                      {row.customerEmail ? (
                        <span className="text-xs text-muted-foreground">
                          {row.customerEmail}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.paymentType ? (
                      <span className="text-xs capitalize">{row.paymentType}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-xs">
                      {row.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.productName ? (
                      <span className="font-medium">{row.productName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {fmt(row.amount, row.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-xs">
                      {row.currency}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="w-12">
                      <PaymentRowActions paymentId={row.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of{" "}
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
                  source,
                  page: 1,
                  pageSize: size,
                })}
                className={`px-2 py-1 text-xs rounded ${
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
              source,
              page: Math.max(1, safePage - 1),
              pageSize,
            })}
            aria-disabled={safePage <= 1}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              safePage <= 1
                ? "pointer-events-none opacity-50"
                : "hover:bg-muted"
            }`}
          >
            Prev
          </Link>
          <span className="text-sm text-muted-foreground px-1">
            Page {safePage} / {totalPages}
          </span>
          <Link
            href={hrefFor({
              preset: hasCustomRange ? undefined : preset,
              from: hasCustomRange ? rawFrom : undefined,
              to: hasCustomRange ? rawTo : undefined,
              source,
              page: Math.min(totalPages, safePage + 1),
              pageSize,
            })}
            aria-disabled={safePage >= totalPages}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              safePage >= totalPages
                ? "pointer-events-none opacity-50"
                : "hover:bg-muted"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  )
}
