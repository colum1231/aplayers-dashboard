import { inferPaymentType } from "@/lib/payments/types"

export type WhopInvoice = {
  id: string
  created_at: string
  status: string
  number?: string | null
  email_address?: string | null
  current_plan?: {
    id: string
    formatted_price: string
    currency: string
  } | null
  user?: {
    id: string
    name?: string | null
    username?: string
  } | null
}

export type WhopWebhookEnvelope =
  | {
      id: string
      type: "invoice.paid"
      timestamp: string
      data: WhopInvoice
    }
  | {
      id: string
      type: "payment.succeeded"
      timestamp: string
      data: WhopPayment
    }

export type WhopPayment = {
  id: string
  created_at: string
  paid_at?: string | null
  status?: string | null
  substatus?: string | null
  total?: number | null
  subtotal?: number | null
  amount_after_fees?: number | null
  currency?: string | null
  metadata?: Record<string, unknown> | null
  billing_reason?: string | null
  user?: {
    id: string
    email?: string | null
    name?: string | null
    username?: string
  } | null
  product?: {
    id: string
    title: string
  } | null
  plan?: {
    id: string
  } | null
}

/** Parse "$1,234.56" / "€10.00" into cents. */
export function parseFormattedPriceToCents(formatted: string): number | null {
  const cleaned = formatted.replace(/[^0-9.,-]/g, "")
  if (!cleaned) return null

  // Handle European vs US decimal separators heuristically.
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(",", ".")

  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

/** Whop API amounts are dollars (e.g. 99.0 = $99.00). DB stores cents. */
export function whopDollarsToCents(amount: number): number {
  return Math.round(amount * 100)
}

function parseWhopPaymentDate(payment: Pick<WhopPayment, "paid_at" | "created_at">) {
  if (payment.paid_at) {
    const asNumber = Number(payment.paid_at)
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber * 1000)
    }
    const parsed = new Date(payment.paid_at)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(payment.created_at)
}

export function buildPaymentFromWhopPayment(payment: WhopPayment) {
  const dollarAmount = payment.total ?? payment.subtotal ?? payment.amount_after_fees
  if (dollarAmount == null || !Number.isFinite(dollarAmount) || dollarAmount <= 0) {
    throw new Error(
      `Could not parse payment amount for ${payment.id}: total/subtotal/amount_after_fees missing`,
    )
  }

  const productName =
    payment.product?.title ??
    (payment.plan?.id ? `Plan ${payment.plan.id}` : "Whop checkout")

  const metadata = {
    whopPaymentId: payment.id,
    whopPlanId: payment.plan?.id ?? null,
    whopProductId: payment.product?.id ?? null,
    whopPaymentStatus: payment.status ?? null,
    whopPaymentSubstatus: payment.substatus ?? null,
    whopBillingReason: payment.billing_reason ?? null,
    ...(payment.metadata ?? {}),
  }

  const metadataForType = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>

  return {
    whopInvoiceId: payment.id,
    amount: whopDollarsToCents(dollarAmount),
    currency: (payment.currency ?? "usd").toLowerCase(),
    status: "succeeded",
    source: "whop" as const,
    paymentType: inferPaymentType({ productName, metadata: metadataForType }),
    customerEmail: payment.user?.email?.trim().toLowerCase() ?? null,
    customerName: payment.user?.name?.trim() ?? null,
    productName,
    productId: payment.product?.id ?? null,
    priceId: payment.plan?.id ?? null,
    whopUserId: payment.user?.id ?? null,
    metadata,
    paymentDate: parseWhopPaymentDate(payment),
  }
}

export function buildPaymentFromWhopInvoice(invoice: WhopInvoice) {
  const plan = invoice.current_plan
  const amount = plan?.formatted_price
    ? parseFormattedPriceToCents(plan.formatted_price)
    : null

  if (!amount) {
    throw new Error(`Could not parse invoice amount from plan price: ${plan?.formatted_price ?? "missing"}`)
  }

  const productName = invoice.number
    ? `Invoice ${invoice.number}`
    : plan?.id
      ? `Plan ${plan.id}`
      : "Whop invoice"

  const metadata = {
    whopInvoiceId: invoice.id,
    whopInvoiceNumber: invoice.number ?? null,
    whopPlanId: plan?.id ?? null,
    whopInvoiceStatus: invoice.status,
  }

  return {
    whopInvoiceId: invoice.id,
    amount,
    currency: (plan?.currency ?? "usd").toLowerCase(),
    status: "succeeded",
    source: "whop" as const,
    paymentType: inferPaymentType({ productName, metadata: null }),
    customerEmail: invoice.email_address?.trim().toLowerCase() ?? null,
    customerName: invoice.user?.name?.trim() ?? null,
    productName,
    productId: plan?.id ?? null,
    priceId: plan?.id ?? null,
    whopUserId: invoice.user?.id ?? null,
    metadata,
    paymentDate: new Date(invoice.created_at),
  }
}
