"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

export function ChartContainer({
  id,
  className,
  children,
  config,
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-layer]:outline-none",
          className,
        )}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: Object.entries(config)
              .map(
                ([key, item]) =>
                  `[data-chart=${chartId}] .color-${key} { fill: ${item.color}; stroke: ${item.color}; }`,
              )
              .join("\n"),
          }}
        />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

export function ChartTooltip({
  active,
  payload,
  className,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
  className?: string
}) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div className={cn("rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm", className)}>
      {payload.map((item) => {
        const key = String(item.name ?? item.dataKey ?? "")
        const label = config[key]?.label ?? key
        return (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{item.value?.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

