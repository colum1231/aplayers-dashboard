"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowLeft, Mail, UserPlus } from "lucide-react"

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
import { createTeamMember, inviteTeamMember } from "@/lib/actions/team-management"
import { USER_ROLES } from "@/lib/roles"

type Flow = "choose" | "invite" | "create"

export function AddUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<Flow>("choose")
  const [pending, startTransition] = useTransition()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("setter")
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState("setter")
  const [createError, setCreateError] = useState<string | null>(null)

  function resetForms() {
    setFlow("choose")
    setInviteEmail("")
    setInviteRole("setter")
    setInviteError(null)
    setCreateEmail("")
    setCreatePassword("")
    setCreateRole("setter")
    setCreateError(null)
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
                className="-ml-2 mb-1 w-fit gap-1 px-2 text-muted-foreground"
                onClick={() => {
                  setFlow("choose")
                  setInviteError(null)
                  setCreateError(null)
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <DialogTitle>
              {flow === "choose" && "Add user"}
              {flow === "invite" && "Send email invite"}
              {flow === "create" && "Create account"}
            </DialogTitle>
            <DialogDescription>
              {flow === "choose" && "Choose how you want to add someone to the team."}
              {flow === "invite" &&
                "They’ll get an email to set a password and sign in."}
              {flow === "create" &&
                "Creates the account immediately with a temporary password you share with them."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4">
            {flow === "choose" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setFlow("invite")}
                  className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 hover:border-accent-foreground/20"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="font-medium">Email invite</span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    Send a link so they can set their own password.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlow("create")}
                  className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 hover:border-accent-foreground/20"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <span className="font-medium">Create account</span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    Set email and password for them now.
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
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                <Button
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    setInviteError(null)
                    startTransition(async () => {
                      const res = await inviteTeamMember(inviteEmail, inviteRole)
                      if ("error" in res && res.error) {
                        setInviteError(res.error)
                        return
                      }
                      handleOpenChange(false)
                      router.refresh()
                    })
                  }}
                >
                  Send invite
                </Button>
              </div>
            )}

            {flow === "create" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-create-email">Email</Label>
                  <Input
                    id="add-create-email"
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="coach@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-create-password">Temporary password</Label>
                  <Input
                    id="add-create-password"
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={createRole} onValueChange={setCreateRole}>
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
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <Button
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    setCreateError(null)
                    startTransition(async () => {
                      const res = await createTeamMember(createEmail, createPassword, createRole)
                      if ("error" in res && res.error) {
                        setCreateError(res.error)
                        return
                      }
                      handleOpenChange(false)
                      router.refresh()
                    })
                  }}
                >
                  Create user
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
