// Exact outcome values from reference project (onepercentclub)
export const CALL_OUTCOMES = [
  "cancelled",
  "rescheduled",
  "no_show",
  "no_close_hot",
  "no_close_offer_made",
  "no_close_no_offer",
  "full_pay",
  "split_pay",
  "deposit",
] as const

export type CallOutcome = (typeof CALL_OUTCOMES)[number]

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No Show",
  no_close_hot: "No Close | HOT (15 days or less)",
  no_close_offer_made: "No Close | Offer Made (LTFU)",
  no_close_no_offer: "No Close | No Offer",
  full_pay: "Full Pay",
  split_pay: "Split Pay",
  deposit: "Deposit",
}

export const CLOSED_OUTCOMES = ["full_pay", "split_pay", "deposit"] as const

export function isCallOutcome(value: string): value is CallOutcome {
  return (CALL_OUTCOMES as readonly string[]).includes(value)
}

export function outcomeLabel(value: string | null | undefined): string {
  if (!value) return "—"
  return OUTCOME_LABELS[value as CallOutcome] ?? value
}
