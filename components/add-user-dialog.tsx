"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowLeft, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { inviteTeamMember } from "@/lib/actions/team-management"
import { USER_ROLES } from "@/lib/roles"

type Flow = "choose" | "invite"

export function AddUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<Flow>("choose")
  const [pending, startTransition] = useTransition()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("setter")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  function resetForms() {
    setFlow("choose")
    setInviteEmail("")
    setInviteRole("setter")
    setInviteError(null)
    setInviteSuccess(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      resetForms()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">Add user</Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[min(90vh,640px)] flex-col">
          <DialogHeader className="border-b px-6 py-4 text-left">
            {flow !== "choose" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mb-1 -ml-2 w-fit gap-1 px-2 text-muted-foreground"
                onClick={() => {
                  setFlow("choose")
                  setInviteError(null)
                  setInviteSuccess(null)
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <DialogTitle>
              {flow === "choose" && "Add user"}
              {flow === "invite" && "Send email invite"}
            </DialogTitle>
            <DialogDescription>
              {flow === "choose" && "Invite someone to your team via email."}
              {flow === "invite" &&
                "They’ll get an email to set a password and sign in."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4">
            {flow === "choose" && (
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInviteError(null)
                    setInviteSuccess(null)
                    setFlow("invite")
                  }}
                  className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-accent-foreground/20 hover:bg-accent/50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="font-medium">Email invite</span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    Send a link so they can set their own password.
                  </span>
                </button>
              </div>
            )}

            {flow === "invite" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-invite-email">Email</Label>
                  <Input
                    id="add-invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="coach@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {inviteError && (
                  <p className="text-sm text-destructive">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="text-sm text-emerald-600">{inviteSuccess}</p>
                )}
                <Button
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    setInviteError(null)
                    setInviteSuccess(null)
                    startTransition(async () => {
                      const res = await inviteTeamMember(
                        inviteEmail,
                        inviteRole
                      )
                      if ("error" in res && res.error) {
                        setInviteError(res.error)
                        return
                      }

                      setInviteSuccess(
                        res.existing
                          ? "That email is already registered. A password reset link has been sent."
                          : "Invite sent. They will receive an email to set their password."
                      )
                      setInviteEmail("")
                      router.refresh()
                    })
                  }}
                >
                  Send invite
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
