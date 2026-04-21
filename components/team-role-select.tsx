"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { roleLabel, USER_ROLES, type UserRole } from "@/lib/roles"
import { updateMemberRole } from "@/lib/actions/team-management"

interface TeamRoleSelectProps {
  memberId: string
  value: UserRole
}

export function TeamRoleSelect({ memberId, value }: TeamRoleSelectProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedRole, setSelectedRole] = useState<UserRole>(value)

  useEffect(() => {
    setSelectedRole(value)
  }, [value])

  function handleRoleChange(nextRole: string) {
    const previousRole = selectedRole
    setSelectedRole(nextRole as UserRole)

    startTransition(async () => {
      const result = await updateMemberRole(memberId, nextRole)
      if (result.error) {
        setSelectedRole(previousRole)
        alert(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <Select
      value={selectedRole}
      disabled={pending}
      onValueChange={handleRoleChange}
    >
      <SelectTrigger className="w-[140px]">
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
  )
}
