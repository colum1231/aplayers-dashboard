"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"

import { CALL_OUTCOMES, outcomeLabel } from "@/lib/calls/outcomes"
import { updateCallOutcome, updateCallSetter } from "@/app/(dashboard)/dashboard/calls/actions"

interface SetterOption {
  id: string
  fullName: string | null
  email: string
}

interface CallRowActionsProps {
  callId: string
  currentOutcome: string | null
  currentSetterId: string | null
  currentSetterSnapshot: string | null
  setters: SetterOption[]
}

export function CallRowActions({
  callId,
  currentOutcome,
  currentSetterId,
  currentSetterSnapshot,
  setters,
}: CallRowActionsProps) {
  const [outcomePending, startOutcomeTransition] = useTransition()
  const [setterPending, startSetterTransition] = useTransition()

  function handleOutcomeChange(value: string) {
    const outcome = value === "" ? null : value
    startOutcomeTransition(async () => {
      await updateCallOutcome(callId, outcome)
    })
  }

  function handleSetterChange(value: string) {
    const setterId = value === "" ? null : value
    startSetterTransition(async () => {
      await updateCallSetter(callId, setterId)
    })
  }

  const selectClass =
    "h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"

  return (
    <div className="flex items-center gap-2">
      {/* Setter select */}
      <div className="relative flex items-center">
        <select
          defaultValue={currentSetterId ?? ""}
          onChange={(e) => handleSetterChange(e.target.value)}
          disabled={setterPending}
          className={`${selectClass} min-w-[120px] max-w-[160px]`}
          aria-label="Setter"
        >
          <option value="">No setter</option>
          {setters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName ?? s.email}
            </option>
          ))}
        </select>
        {setterPending && (
          <Loader2 className="pointer-events-none absolute right-2 h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Outcome select */}
      <div className="relative flex items-center">
        <select
          defaultValue={currentOutcome ?? ""}
          onChange={(e) => handleOutcomeChange(e.target.value)}
          disabled={outcomePending}
          className={`${selectClass} min-w-[140px] max-w-[200px]`}
          aria-label="Outcome"
        >
          <option value="">— outcome —</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {outcomeLabel(o)}
            </option>
          ))}
        </select>
        {outcomePending && (
          <Loader2 className="pointer-events-none absolute right-2 h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
