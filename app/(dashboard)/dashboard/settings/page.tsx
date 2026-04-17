import { AddUserDialog } from "@/components/add-user-dialog"
import { TeamManagementPanel } from "@/components/team-management-panel"
import { getTeamMembersForAdmin } from "@/lib/data/team"

export default async function SettingsPage() {
  const members = await getTeamMembersForAdmin()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Workspace and team configuration</p>
        </div>
        <AddUserDialog />
      </div>
      <TeamManagementPanel members={members} />
    </div>
  )
}
