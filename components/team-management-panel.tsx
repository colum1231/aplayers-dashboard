"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TeamRoleSelect } from "@/components/team-role-select"
import { deleteTeamMember } from "@/lib/actions/team-management"
import type { TeamMemberRow } from "@/lib/data/team"

interface TeamManagementPanelProps {
  members: TeamMemberRow[]
}

export function TeamManagementPanel({ members }: TeamManagementPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Team members</h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <TeamRoleSelect memberId={m.id} value={m.role} />
                </td>
                <td className="px-4 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={pending}
                    aria-label={`Remove ${m.email}`}
                    onClick={() => {
                      if (!confirm(`Remove ${m.email}? They won't be able to sign in.`)) return
                      startTransition(async () => {
                        const res = await deleteTeamMember(m.id)
                        if (res.error) {
                          alert(res.error)
                          return
                        }
                        router.refresh()
                      })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {members.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No users yet — use <span className="font-medium text-foreground">Add user</span> to get started.
        </p>
      )}
    </div>
  )
}
