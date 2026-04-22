"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, CreditCard, Database, LayoutDashboard, LogOut, Settings, Trophy } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface AppSidebarProps {
  email: string | null | undefined
  fullName: string | null | undefined
  isAdmin: boolean
}

export function AppSidebar({
  email,
  fullName,
  isAdmin,
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isDataInputRoute = useMemo(
    () => isNavActive(pathname, "/dashboard/data-input"),
    [pathname]
  )
  const [isDataInputOpen, setIsDataInputOpen] = useState(isDataInputRoute)
  useEffect(() => {
    if (isDataInputRoute) {
      setIsDataInputOpen(true)
    }
  }, [isDataInputRoute])

  const display = fullName?.trim() || email || "User"
  const initials =
    display
      .split(/[@\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "U"

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex h-14 shrink-0 items-center justify-start border-b px-4">
        <div className="flex w-full min-w-0 items-center justify-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-bold tracking-tight">
              A Players Club
            </span>
            <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
              Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isNavActive(pathname, "/dashboard")}
                >
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavActive(pathname, "/dashboard/payments")}
                    >
                      <Link href="/dashboard/payments">
                        <CreditCard />
                        <span>Payments</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setIsDataInputOpen((prev) => !prev)}
                      isActive={isDataInputRoute}
                    >
                      <Database />
                      <span>Data Input</span>
                      <ChevronDown
                        className={`ml-auto transition-transform ${isDataInputOpen ? "rotate-180" : ""}`}
                      />
                    </SidebarMenuButton>
                    {isDataInputOpen && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isNavActive(pathname, "/dashboard/data-input/payments")}
                          >
                            <Link href="/dashboard/data-input/payments">Payments</Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavActive(pathname, "/dashboard/settings")}
                    >
                      <Link href="/dashboard/settings">
                        <Settings />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{display}</p>
                {email && display !== email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {email}
                  </p>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
