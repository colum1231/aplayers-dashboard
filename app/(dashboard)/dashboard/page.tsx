import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import {
  getPaymentMetrics,
  getProductRevenueBreakdown,
  type PaymentDateFilter,
  type PaymentDatePreset,
} from "@/lib/data/payments"
import {
  getCallMetrics,
  getCallStatusBreakdown,
  getCallVolumeSeries,
} from "@/lib/data/calls"
import { createClient } from "@/lib/supabase/server"
import { DateFilterDropdown } from "@/components/date-filter-dropdown"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProductRevenuePie } from "@/components/dashboard/product-revenue-pie"
import { CallStatusPie } from "@/components/dashboard/call-status-pie"
import { CallVolumeChart } from "@/components/dashboard/call-volume-chart"

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

function Trend({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> —</span>
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>
}) {
  const { preset: rawPreset, from: rawFrom, to: rawTo } = await searchParams
  const preset: PaymentDatePreset =
    rawPreset && PRESET_SET.has(rawPreset as PaymentDatePreset)
      ? (rawPreset as PaymentDatePreset)
      : "this_month"
  const fromDate = parseISODateInput(rawFrom)
  const toDate = parseISODateInput(rawTo)
  const hasCustomRange = Boolean(fromDate || toDate)
  const activeFilter: PaymentDateFilter = hasCustomRange ? { from: fromDate, to: toDate } : { preset }
  const activeFilterLabel = hasCustomRange
    ? `Custom ${displayDate(rawFrom)} to ${displayDate(rawTo)}`
    : PRESETS.find((p) => p.value === preset)?.label ?? "This Month"

  const [supabase, metrics, productBreakdown, callMetrics, callStatusBreakdown, callVolumeSeries] = await Promise.all([
    createClient(),
    getPaymentMetrics(activeFilter),
    getProductRevenueBreakdown(activeFilter, 5),
    getCallMetrics(activeFilter),
    getCallStatusBreakdown(activeFilter),
    getCallVolumeSeries(activeFilter),
  ])

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{user?.email ? `, ${user.email}` : ""}
          </p>
        </div>

        <DateFilterDropdown
          pathname="/dashboard"
          presets={PRESETS}
          activePreset={preset}
          activeLabel={activeFilterLabel}
          from={rawFrom}
          to={rawTo}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{fmt(metrics.revenue)}</p>
            <Trend pct={metrics.revenueChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {metrics.count.toLocaleString()}
            </p>
            <Trend pct={metrics.countChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Order Value
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{fmt(metrics.aov)}</p>
            <Trend pct={metrics.aovChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {metrics.uniqueCustomers.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">distinct payer emails</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Calls Booked
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{callMetrics.booked.toLocaleString()}</p>
            <Trend pct={callMetrics.bookedChange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Shows
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{callMetrics.showCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">completed + past attended calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              No-Shows
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">{callMetrics.noShow.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">from Calendly no-show events</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Show Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-tight">
              {callMetrics.showRate !== null ? `${(callMetrics.showRate * 100).toFixed(1)}%` : "—"}
            </p>
            <Trend pct={callMetrics.showRateChange} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Product</CardTitle>
          </CardHeader>
          <CardContent>
            {productBreakdown.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No product revenue yet.</p>
            ) : (
              <ProductRevenuePie
                items={productBreakdown.items}
                totalRevenue={productBreakdown.totalRevenue}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <CallStatusPie items={callStatusBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call Volume Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {callVolumeSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No call data for this period.</p>
          ) : (
            <CallVolumeChart items={callVolumeSeries} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
