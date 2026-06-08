import Link from "next/link"

import { createManualCall } from "./actions"

import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default async function ManualCallsInputPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const { success, error } = await searchParams
  const setters = await db.select().from(profiles).orderBy(profiles.fullName)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Input: Calls</h1>
          <p className="text-sm text-muted-foreground">
            Log calls booked outside Calendly (phone, DMs, referrals, etc.).
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/calls">View all calls</Link>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add call</CardTitle>
          <CardDescription>
            Creates a scheduled call record with source set to manual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createManualCall} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="inviteeName">Lead name</Label>
              <Input id="inviteeName" name="inviteeName" required placeholder="Jane Smith" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="inviteeEmail">Lead email</Label>
              <Input
                id="inviteeEmail"
                name="inviteeEmail"
                type="email"
                required
                placeholder="jane@company.com"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="scheduledDate">Call date</Label>
                <Input id="scheduledDate" name="scheduledDate" type="date" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scheduledTime">Call time</Label>
                <Input id="scheduledTime" name="scheduledTime" type="time" required />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="setterUserId">Setter (optional)</Label>
              <select
                id="setterUserId"
                name="setterUserId"
                defaultValue=""
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Unassigned</option>
                {setters.map((setter) => (
                  <option key={setter.id} value={setter.id}>
                    {setter.fullName?.trim() || setter.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                name="notes"
                placeholder="Booked via Instagram DM"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit">Save call</Button>
              <span className="text-xs text-muted-foreground">Source: manual</span>
            </div>
          </form>

          {success === "1" && (
            <p className="mt-4 text-sm text-green-600 dark:text-green-400">
              Call saved successfully.
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-destructive">
              {error === "missing_fields" && "Please fill all required fields."}
              {error === "invalid_datetime" && "Call date/time is invalid."}
              {error === "invalid_setter" && "Selected setter was not found."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
