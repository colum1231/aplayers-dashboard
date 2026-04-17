"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="-mr-1 shrink-0" disabled aria-label="Toggle theme" />
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-mr-1 shrink-0"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <span className="text-sm font-medium text-muted-foreground">A Players Club</span>
      <span className="min-w-0 flex-1" aria-hidden="true" />
      <ThemeToggle />
    </header>
  )
}
