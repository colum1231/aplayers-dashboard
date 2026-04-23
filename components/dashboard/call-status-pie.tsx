"use client"

import { Cell, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"

const COLORS = {
  scheduled: "var(--chart-1)",
  completed: "var(--chart-2)",
  no_show: "var(--chart-4)",
  canceled: "var(--chart-5)",
}

const LABELS = {
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No-Show",
  canceled: "Canceled",
}

type Item = {
  status: "scheduled" | "completed" | "no_show" | "canceled"
  count: number
}

export function CallStatusPie({ items }: { items: readonly Item[] }) {
  const total = items.reduce((acc, item) => acc + item.count, 0)
  const chartData = items.map((item) => ({
    key: item.status,
    name: LABELS[item.status],
    value: item.count,
    color: COLORS[item.status],
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
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <ChartContainer config={config} className="mx-auto h-[240px] w-full max-w-[300px]">
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie data={chartData} dataKey="value" nameKey="key" innerRadius={54} outerRadius={90}>
            {chartData.map((entry) => (
              <Cell key={entry.key} className={`color-${entry.key}`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="space-y-1.5">
        {chartData.map((item) => {
          const share = total > 0 ? (item.value / total) * 100 : 0
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-md border p-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-xs">{item.name}</span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium">{item.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{share.toFixed(1)}%</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
