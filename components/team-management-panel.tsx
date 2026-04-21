"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  MoreHorizontal,
  Pencil,
  RefreshCw,
  KeyRound,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  deleteTeamMember,
  updateMember,
  resendInvite,
  sendPasswordReset,
} from "@/lib/actions/team-management"
import { isUserRole, roleLabel, USER_ROLES, type UserRole } from "@/lib/roles"
import type { TeamMemberRow } from "@/lib/data/team"

interface TeamManagementPanelProps {
  members: TeamMemberRow[]
  currentUserId: string
}

type ActionStatus =
  | { type: "idle" }
  | { type: "error"; message: string }
  | { type: "success"; message: string }

// ─── Per-row actions dropdown ────────────────────────────────────────────────

interface MemberActionsProps {
  member: TeamMemberRow
  isSelf: boolean
  disabled: boolean
  onEdit: () => void
  onResendInvite: () => void
  onPasswordReset: () => void
  onDelete: () => void
}

function MemberActions({
  member,
  isSelf,
  disabled,
  onEdit,
  onResendInvite,
  onPasswordReset,
  onDelete,
}: MemberActionsProps) {
  // Pending = invited but never confirmed → resend invite makes sense, password reset doesn't
  // Active  = confirmed → resend invite is pointless, password reset makes sense
  const canResendInvite = member.isPending
  const canPasswordReset = !member.isPending
  const canDelete = !isSelf

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Actions for ${member.email}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>

        {canResendInvite && (
          <DropdownMenuItem onClick={onResendInvite}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Resend invite
          </DropdownMenuItem>
        )}

        {canPasswordReset && (
          <DropdownMenuItem onClick={onPasswordReset}>
            <KeyRound className="mr-2 h-4 w-4" />
            Send password reset
          </DropdownMenuItem>
        )}

        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove user
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function TeamManagementPanel({
  members,
  currentUserId,
}: TeamManagementPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [actionStatus, setActionStatus] = useState<ActionStatus>({
    type: "idle",
  })

  // Edit dialog state
  const [editMember, setEditMember] = useState<TeamMemberRow | null>(null)
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState<UserRole>("setter")
  const [editStatus, setEditStatus] = useState<ActionStatus>({ type: "idle" })

  function openEdit(m: TeamMemberRow) {
    setEditMember(m)
    setEditName(m.fullName ?? "")
    setEditRole(m.role)
    setEditStatus({ type: "idle" })
  }

  function closeEdit() {
    setEditMember(null)
    setEditStatus({ type: "idle" })
  }

  function handleEdit() {
    if (!editMember) return
    setEditStatus({ type: "idle" })

    startTransition(async () => {
      const res = await updateMember(editMember.id, {
        name: editName,
        role: editRole,
      })
      if ("error" in res) {
        setEditStatus({ type: "error", message: res.error })
        return
      }
      closeEdit()
      router.refresh()
    })
  }

  function handleResendInvite(m: TeamMemberRow) {
    if (!m.isPending) return // guard: already active
    setActionStatus({ type: "idle" })

    startTransition(async () => {
      const res = await resendInvite(m.email)
      if ("error" in res) {
        setActionStatus({ type: "error", message: res.error })
        return
      }
      setActionStatus({
        type: "success",
        message: `Invite resent to ${m.email}.`,
      })
    })
  }

  function handlePasswordReset(m: TeamMemberRow) {
    if (m.isPending) return // guard: no password set yet
    setActionStatus({ type: "idle" })

    startTransition(async () => {
      const res = await sendPasswordReset(m.email)
      if ("error" in res) {
        setActionStatus({ type: "error", message: res.error })
        return
      }
      setActionStatus({
        type: "success",
        message: `Password reset email sent to ${m.email}.`,
      })
    })
  }

  function handleDelete(m: TeamMemberRow) {
    if (m.id === currentUserId) return // guard: can't delete yourself
    if (!confirm(`Remove ${m.email}? They won't be able to sign in.`)) return
    setActionStatus({ type: "idle" })

    startTransition(async () => {
      const res = await deleteTeamMember(m.id)
      if ("error" in res) {
        setActionStatus({ type: "error", message: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Team members</h2>

      {actionStatus.type === "error" && (
        <p className="text-sm text-destructive">{actionStatus.message}</p>
      )}
      {actionStatus.type === "success" && (
        <p className="text-sm text-emerald-600">{actionStatus.message}</p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.fullName ?? "—"}
                </td>
                <td className="px-4 py-3">{roleLabel(m.role)}</td>
                <td className="px-4 py-3">
                  {m.isPending ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <MemberActions
                    member={m}
                    isSelf={m.id === currentUserId}
                    disabled={pending}
                    onEdit={() => openEdit(m)}
                    onResendInvite={() => handleResendInvite(m)}
                    onPasswordReset={() => handlePasswordReset(m)}
                    onDelete={() => handleDelete(m)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {members.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No users yet — use{" "}
          <span className="font-medium text-foreground">Add user</span> to get
          started.
        </p>
      )}

      {/* Edit member dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>{editMember?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-member-name">Name</Label>
              <Input
                id="edit-member-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editRole}
                onValueChange={(v) => {
                  if (isUserRole(v)) setEditRole(v)
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
            {editStatus.type === "error" && (
              <p className="text-sm text-destructive">{editStatus.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={handleEdit}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
