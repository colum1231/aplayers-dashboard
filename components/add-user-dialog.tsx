"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

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
import { isUserRole, roleLabel, USER_ROLES, type UserRole } from "@/lib/roles"

type InviteStatus =
  | { type: "idle" }
  | { type: "error"; message: string }
  | { type: "success"; message: string }

export function AddUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<UserRole>("setter")
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ type: "idle" })

  function resetForms() {
    setInviteEmail("")
    setInviteRole("setter")
    setInviteStatus({ type: "idle" })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      resetForms()
    }
  }

  function handleInvite() {
    setInviteStatus({ type: "idle" })

    startTransition(async () => {
      const res = await inviteTeamMember(inviteEmail, inviteRole)
      if ("error" in res) {
        setInviteStatus({ type: "error", message: res.error })
        return
      }

      setInviteStatus({
        type: "success",
        message: res.existing
          ? "That email is already registered. A password reset link has been sent."
          : "Invite sent. They will receive an email to set their password.",
      })
      setInviteEmail("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">Add user</Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[min(90vh,640px)] flex-col">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Invite someone to your team via email.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4">
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
                <Select
                  value={inviteRole}
                  onValueChange={(nextRole) => {
                    if (isUserRole(nextRole)) {
                      setInviteRole(nextRole)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {inviteStatus.type === "error" && (
                <p className="text-sm text-destructive">{inviteStatus.message}</p>
              )}
              {inviteStatus.type === "success" && (
                <p className="text-sm text-emerald-600">{inviteStatus.message}</p>
              )}
              <Button className="w-full" disabled={pending} onClick={handleInvite}>
                Send invite
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
