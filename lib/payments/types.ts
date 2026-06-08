export const PAYMENT_TYPE_OPTIONS = ["membership", "sponsorship", "partnership"] as const

export type PaymentType = (typeof PAYMENT_TYPE_OPTIONS)[number]

const PAYMENT_TYPE_BY_KEYWORD: Record<PaymentType, RegExp> = {
  membership: /membership/i,
  sponsorship: /sponsorship/i,
  partnership: /partnership/i,
}

export function inferPaymentTypeFromProductName(productName?: string | null): PaymentType | null {
  if (!productName) return null

  for (const [type, pattern] of Object.entries(PAYMENT_TYPE_BY_KEYWORD) as [
    PaymentType,
    RegExp,
  ][]) {
    if (pattern.test(productName)) {
      return type
    }
  }

  return null
}

function normalizeTypeCandidate(value?: string | null): PaymentType | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized.includes("membership")) return "membership"
  if (normalized.includes("sponsorship")) return "sponsorship"
  if (normalized.includes("partnership")) return "partnership"
  return null
}

export function inferPaymentType({
  productName,
  metadata,
}: {
  productName?: string | null
  metadata?: Record<string, string> | null
}): PaymentType {
  const metadataCandidates = [
    metadata?.payment_type,
    metadata?.type,
    metadata?.product_type,
    metadata?.productType,
    metadata?.category,
  ]

  for (const candidate of metadataCandidates) {
    const parsed = normalizeTypeCandidate(candidate)
    if (parsed) return parsed
  }

  const byProductName = inferPaymentTypeFromProductName(productName)
  if (byProductName) return byProductName

  // Keep the column populated even when provider metadata is missing.
  return "membership"
}

export function paymentTypeLabel(type: PaymentType): string {
  switch (type) {
    case "membership":
      return "Membership"
    case "sponsorship":
      return "Sponsorship"
    case "partnership":
      return "Partnership"
  }
}
