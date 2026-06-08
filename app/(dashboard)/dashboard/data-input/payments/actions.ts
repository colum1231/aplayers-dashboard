"use server"

import { redirect } from "next/navigation"

import { getProfileByUserId } from "@/lib/auth/profile"
import { db } from "@/lib/db"
import { payments } from "@/lib/db/schema"
import { PAYMENT_TYPE_OPTIONS, type PaymentType, paymentTypeLabel } from "@/lib/payments/types"
import { createClient } from "@/lib/supabase/server"

function isPaymentType(value: string): value is PaymentType {
  return (PAYMENT_TYPE_OPTIONS as readonly string[]).includes(value)
}

function toCents(amountRaw: string) {
  const normalized = amountRaw.replace(",", ".").trim()
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100)
}

export async function createManualPayment(formData: FormData) {
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

  const customerName = String(formData.get("customerName") ?? "").trim()
  const customerEmail = String(formData.get("customerEmail") ?? "").trim().toLowerCase()
  const amountRaw = String(formData.get("amount") ?? "").trim()
  const paymentDateRaw = String(formData.get("paymentDate") ?? "").trim()
  const paymentTypeRaw = String(formData.get("paymentType") ?? "").trim().toLowerCase()

  if (!customerName || !customerEmail || !amountRaw || !paymentDateRaw || !isPaymentType(paymentTypeRaw)) {
    redirect("/dashboard/data-input/payments?error=missing_fields")
  }

  const amountInCents = toCents(amountRaw)
  if (!amountInCents) {
    redirect("/dashboard/data-input/payments?error=invalid_amount")
  }

  const paymentDate = new Date(`${paymentDateRaw}T12:00:00Z`)
  if (Number.isNaN(paymentDate.getTime())) {
    redirect("/dashboard/data-input/payments?error=invalid_date")
  }

  await db.insert(payments).values({
    whopInvoiceId: null,
    amount: amountInCents,
    currency: "eur",
    status: "succeeded",
    source: "bank",
    paymentType: paymentTypeRaw,
    productName: paymentTypeLabel(paymentTypeRaw),
    productId: paymentTypeRaw,
    customerName,
    customerEmail,
    paymentDate,
    metadata: {
      manualInput: "true",
      capturedByUserId: user.id,
    },
  })

  redirect("/dashboard/data-input/payments?success=1")
}
