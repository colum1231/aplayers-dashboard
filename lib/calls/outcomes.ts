export const CALL_OUTCOMES = [
  "closed",
  "no_close",
  "no_show",
  "rescheduled",
  "cancelled",
] as const

export type CallOutcome = (typeof CALL_OUTCOMES)[number]

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  closed: "Closed",
  no_close: "No Close",
  no_show: "No Show",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
}

export const CLOSED_OUTCOMES: readonly CallOutcome[] = ["closed"]

export function isCallOutcome(value: string): value is CallOutcome {
  return (CALL_OUTCOMES as readonly string[]).includes(value)
}

export function outcomeLabel(value: string | null | undefined): string {
  if (!value) return "—"
  return OUTCOME_LABELS[value as CallOutcome] ?? value
}
