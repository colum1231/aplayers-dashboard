import { redirect } from "next/navigation"

import { ensureProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await ensureProfile(user)

  return (
    <SidebarProvider>
      <AppSidebar
        email={user.email}
        fullName={profile.fullName}
        isAdmin={profile.role === "admin"}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </SidebarProvider>
  )
}
