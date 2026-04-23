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
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <ChartContainer config={config} className="mx-auto h-[220px] w-full max-w-[280px]">
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82}>
            {chartData.map((entry) => (
              <Cell key={entry.key} className={`color-${entry.key}`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="space-y-1.5">
        {chartData.map((item) => {
          const share = totalRevenue > 0 ? (item.value / totalRevenue) * 100 : 0
          return (
            <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-xs">{item.name}</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium whitespace-nowrap">{fmt(item.value)}</p>
                <p className="text-xs text-muted-foreground">{share.toFixed(1)}%</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

