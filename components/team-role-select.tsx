"use client"

import { useTransition } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { USER_ROLES, type UserRole } from "@/lib/roles"
import { updateMemberRole } from "@/lib/actions/team-management"

interface TeamRoleSelectProps {
  memberId: string
  value: UserRole
}

export function TeamRoleSelect({ memberId, value }: TeamRoleSelectProps) {
  const [pending, startTransition] = useTransition()

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        startTransition(async () => {
          await updateMemberRole(memberId, next)
        })
      }}
    >
      <SelectTrigger className="w-[140px]">
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
  )
}
