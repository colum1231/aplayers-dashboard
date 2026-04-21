"use client"

import { Cell, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type Item = {
  productName: string
  revenue: number
}

function fmt(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function ProductRevenuePie({
  items,
  totalRevenue,
}: {
  items: Item[]
  totalRevenue: number
}) {
  const chartData = items.map((item, index) => ({
    name: item.productName,
    value: item.revenue,
    key: `slice${index}`,
    color: COLORS[index % COLORS.length],
  }))

  const config: ChartConfig = Object.fromEntries(
    chartData.map((item) => [
      item.key,
      {
        label: item.name,
        color: item.color,
      },
    ]),
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <ChartContainer config={config} className="mx-auto h-[260px] w-full max-w-[340px]">
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96}>
            {chartData.map((entry) => (
              <Cell key={entry.key} className={`color-${entry.key}`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="space-y-2">
        {chartData.map((item) => {
          const share = totalRevenue > 0 ? (item.value / totalRevenue) * 100 : 0
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 rounded-md border p-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-sm">{item.name}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{fmt(item.value)}</p>
                <p className="text-xs text-muted-foreground">{share.toFixed(1)}%</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

