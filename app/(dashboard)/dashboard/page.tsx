import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { getPaymentMetrics, getProductRevenueBreakdown, type DateRange } from "@/lib/data/payments"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProductRevenuePie } from "@/components/dashboard/product-revenue-pie"

const RANGES: { label: string; value: DateRange }[] = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
]

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
  searchParams: Promise<{ range?: string }>
}) {
  const { range: rawRange } = await searchParams
  const range: DateRange =
    rawRange === "7" ? 7 : rawRange === "90" ? 90 : 30

  const [supabase, metrics, productBreakdown] = await Promise.all([
    createClient(),
    getPaymentMetrics(range),
    getProductRevenueBreakdown(range, 5),
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

        <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/dashboard?range=${r.value}`}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                range === r.value
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
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
    </div>
  )
}
