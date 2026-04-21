"use client"

import Link from "next/link"
import { CalendarDays, Check } from "lucide-react"

import type { PaymentDatePreset } from "@/lib/data/payments"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

type PresetOption = { label: string; value: PaymentDatePreset }

type DateFilterDropdownProps = {
  pathname: string
  presets: PresetOption[]
  activePreset: PaymentDatePreset
  activeLabel: string
  from?: string
  to?: string
  pageSize?: number
}

export function DateFilterDropdown({
  pathname,
  presets,
  activePreset,
  activeLabel,
  from,
  to,
  pageSize,
}: DateFilterDropdownProps) {
  function hrefFor(next: {
    preset?: PaymentDatePreset
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) {
    const params = new URLSearchParams()
    if (next.preset && next.preset !== "all_time") params.set("preset", next.preset)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.page && next.page > 1) params.set("page", String(next.page))
    if (next.pageSize && next.pageSize !== 25) params.set("pageSize", String(next.pageSize))
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 min-w-44 justify-between">
          <span className="inline-flex items-center gap-2 truncate">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="truncate">{activeLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px]">
        <DropdownMenuLabel>Payment Date</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-1 pb-1">
          {presets.map((datePreset) => {
            const selected = !from && !to && activePreset === datePreset.value
            return (
              <DropdownMenuItem
                key={datePreset.value}
                asChild
                className={selected ? "bg-accent text-accent-foreground" : undefined}
              >
                <Link href={hrefFor({ preset: datePreset.value, page: 1, pageSize })}>
                  <span className="truncate">{datePreset.label}</span>
                  {selected && <Check className="ml-auto h-4 w-4" />}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </div>

        <DropdownMenuSeparator />
        <form method="get" action={pathname} className="space-y-2 p-1">
          <p className="px-1 text-xs uppercase tracking-wide text-muted-foreground">Custom Range</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" name="from" defaultValue={from ?? ""} />
            <Input type="date" name="to" defaultValue={to ?? ""} />
          </div>
          <input type="hidden" name="page" value="1" />
          {pageSize ? <input type="hidden" name="pageSize" value={String(pageSize)} /> : null}
          <Button type="submit" size="sm" className="w-full">
            Apply Range
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
