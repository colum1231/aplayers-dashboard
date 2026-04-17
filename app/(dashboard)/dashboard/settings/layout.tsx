import { redirect } from "next/navigation"

import { getProfileByUserId } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const profile = await getProfileByUserId(user.id)
  if (profile?.role !== "admin") {
    redirect("/dashboard")
  }

  return children
}
