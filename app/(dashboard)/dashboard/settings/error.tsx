"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const missingKey =
    error.message.includes("SUPABASE_SERVICE_ROLE_KEY") ||
    error.message.includes("NEXT_PUBLIC_SUPABASE_URL")

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace and team configuration</p>
      </div>
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            {missingKey ? "Missing server configuration" : "Failed to load team"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {missingKey
            ? "Add SUPABASE_SERVICE_ROLE_KEY to your server environment and restart the dev server."
            : error.message}
        </p>
        {!missingKey && (
          <Button variant="outline" size="sm" className="w-fit" onClick={reset}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
