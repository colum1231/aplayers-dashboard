"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { payments } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"

export async function deletePayment(formData: FormData) {
  const paymentId = String(formData.get("paymentId") ?? "").trim()
  if (!paymentId) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getProfileByUserId(user.id)
  if (profile?.role !== "admin") {
    redirect("/dashboard")
  }

  await db.delete(payments).where(eq(payments.id, paymentId))
  revalidatePath("/dashboard/payments")
}
