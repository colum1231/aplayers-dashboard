import Link from "next/link"

import { listPaymentsPaginated, type DateRange } from "@/lib/data/payments"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  searchParams: Promise<{ range?: string; page?: string; pageSize?: string }>
}) {
  const { range: rawRange, page: rawPage, pageSize: rawPageSize } = await searchParams
  const range: DateRange | undefined =
    rawRange === "7" ? 7 : rawRange === "30" ? 30 : rawRange === "90" ? 90 : undefined

  const page = Math.max(1, Number(rawPage) || 1)
  const allowedPageSizes = new Set([25, 50, 100])
  const parsedPageSize = Number(rawPageSize) || 25
  const pageSize = allowedPageSizes.has(parsedPageSize) ? parsedPageSize : 25

  const { rows, total, totalPages } = await listPaymentsPaginated({
    range,
    page,
    pageSize,
  })
  const safePage = Math.min(page, totalPages)
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endRow = Math.min(safePage * pageSize, total)

  function hrefFor(next: { range?: DateRange; page?: number; pageSize?: number }) {
    const params = new URLSearchParams()
    if (next.range) params.set("range", String(next.range))
    if (next.page && next.page > 1) params.set("page", String(next.page))
    if (next.pageSize && next.pageSize !== 25) params.set("pageSize", String(next.pageSize))
    const query = params.toString()
    return query ? `/dashboard/payments?${query}` : "/dashboard/payments"
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length.toLocaleString()} succeeded payment
            {rows.length !== 1 ? "s" : ""}
            {range ? ` in the last ${range} days` : " (all time)"}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
          <Link
            href={hrefFor({ page: 1, pageSize })}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              !range
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            All
          </Link>
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={hrefFor({ range: r.value, page: 1, pageSize })}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>PI ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
                    {row.productName ? (
                      <span className="font-medium">{row.productName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                  <TableCell className="font-medium">
                    {fmt(row.amount, row.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-xs">
                      {row.currency}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">
                      {row.stripePaymentIntentId}
                    </code>
                  </TableCell>
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
                href={hrefFor({ range, page: 1, pageSize: size })}
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
            href={hrefFor({ range, page: Math.max(1, safePage - 1), pageSize })}
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
            href={hrefFor({ range, page: Math.min(totalPages, safePage + 1), pageSize })}
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
