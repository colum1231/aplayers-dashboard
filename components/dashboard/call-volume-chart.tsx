"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"

type Item = {
  day: string
  booked: number
  completed: number
  noShow: number
  canceled: number
}

const config: ChartConfig = {
  booked: { label: "Booked", color: "var(--chart-1)" },
  completed: { label: "Completed", color: "var(--chart-2)" },
  noShow: { label: "No-Show", color: "var(--chart-4)" },
  canceled: { label: "Canceled", color: "var(--chart-5)" },
}

function shortDayLabel(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
}

export function CallVolumeChart({ items }: { items: Item[] }) {
  return (
    <ChartContainer config={config} className="h-[280px] w-full">
      <LineChart data={items} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" tickFormatter={shortDayLabel} minTickGap={24} />
        <YAxis allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />

        <Line type="monotone" dataKey="booked" name="booked" strokeWidth={2} dot={false} className="color-booked" />
        <Line
          type="monotone"
          dataKey="completed"
          name="completed"
          strokeWidth={2}
          dot={false}
          className="color-completed"
        />
        <Line
          type="monotone"
          dataKey="noShow"
          name="noShow"
          strokeWidth={2}
          dot={false}
          className="color-noShow"
        />
        <Line
          type="monotone"
          dataKey="canceled"
          name="canceled"
          strokeWidth={2}
          dot={false}
          className="color-canceled"
        />
      </LineChart>
    </ChartContainer>
  )
}
