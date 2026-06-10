import { and, desc, eq, or } from "drizzle-orm"

import { db } from "@/lib/db"
import { calls, type Call } from "@/lib/db/schema"
import {
  CLOSE_PIPELINES,
  closeStatusToPipeline,
  isCallBookedStatus,
  isNoShowStatus,
  isTrackedCloseStatus,
  pipelineStatusIds,
  resolveClosePipeline,
  type ClosePipeline,
} from "@/lib/close/constants"
import {
  getLead,
  getOpportunitiesForLead,
  getOpportunity,
  leadPrimaryEmail,
  searchContactByEmail,
  updateOpportunityStatus,
  type CloseOpportunity,
} from "@/lib/close/client"

export type CloseSyncResult =
  | { ok: true; action: "updated" | "linked" | "unchanged"; message: string }
  | { ok: false; skipped: true; message: string }
  | { ok: false; skipped?: false; message: string }

type CallRow = Pick<
  Call,
  | "id"
  | "inviteeEmail"
  | "inviteeName"
  | "eventTypeUri"
  | "status"
  | "outcome"
  | "closeOpportunityId"
  | "closeLeadId"
  | "closeStatusId"
>

function dashboardToCloseStatus(
  pipeline: ClosePipeline,
  call: Pick<CallRow, "status" | "outcome">,
): string | null {
  const p = CLOSE_PIPELINES[pipeline]
  if (call.status === "no_show" || call.outcome === "no_show") return p.noShow
  if (call.status === "scheduled") return p.callBooked
  return null
}

function closeStatusToDashboardPatch(statusId: string): {
  status?: "scheduled" | "no_show"
  outcome?: string | null
} | null {
  const pipeline = closeStatusToPipeline(statusId)
  if (!pipeline) return null

  if (isNoShowStatus(statusId, pipeline)) {
    return { status: "no_show", outcome: "no_show" }
  }
  if (isCallBookedStatus(statusId, pipeline)) {
    return { status: "scheduled", outcome: null }
  }
  return null
}

function pickOpportunity(
  opportunities: CloseOpportunity[],
  pipeline: ClosePipeline,
  contactId?: string | null,
): CloseOpportunity | null {
  if (opportunities.length === 0) return null

  const allowed = new Set(pipelineStatusIds(pipeline))
  const inPipeline = opportunities.filter((o) => allowed.has(o.status_id))
  const pool = inPipeline.length > 0 ? inPipeline : opportunities

  return pool.find((o) => o.contact_id === contactId) ?? pool[0] ?? null
}

async function resolveOpportunityForCall(call: CallRow): Promise<CloseOpportunity | null> {
  if (!process.env.CLOSE_API_KEY) return null

  if (call.closeOpportunityId) {
    try {
      return await getOpportunity(call.closeOpportunityId)
    } catch {
      // stale link — fall through to email search
    }
  }

  const email = call.inviteeEmail?.trim().toLowerCase()
  if (!email) return null

  const contact = await searchContactByEmail(email)
  if (!contact) return null

  const opportunities = await getOpportunitiesForLead(contact.lead_id)
  const pipeline = resolveClosePipeline(call.eventTypeUri)
  return pickOpportunity(opportunities, pipeline, contact.id)
}

/** Push dashboard call state → Close opportunity status. */
export async function syncCallToClose(callId: string): Promise<CloseSyncResult> {
  if (!process.env.CLOSE_API_KEY) {
    return { ok: false, skipped: true, message: "CLOSE_API_KEY not configured" }
  }

  const [call] = await db
    .select({
      id: calls.id,
      inviteeEmail: calls.inviteeEmail,
      inviteeName: calls.inviteeName,
      eventTypeUri: calls.eventTypeUri,
      status: calls.status,
      outcome: calls.outcome,
      closeOpportunityId: calls.closeOpportunityId,
      closeLeadId: calls.closeLeadId,
      closeStatusId: calls.closeStatusId,
    })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1)

  if (!call) return { ok: false, skipped: true, message: "Call not found" }
  if (!call.inviteeEmail) return { ok: false, skipped: true, message: "Call has no invitee email" }

  const pipeline = resolveClosePipeline(call.eventTypeUri)
  const targetStatusId = dashboardToCloseStatus(pipeline, call)
  if (!targetStatusId) {
    return { ok: false, skipped: true, message: `No Close mapping for call status ${call.status}` }
  }

  const opportunity = await resolveOpportunityForCall(call)
  if (!opportunity) {
    return { ok: false, skipped: true, message: "No Close opportunity found for invitee" }
  }

  if (opportunity.status_id === targetStatusId) {
    await db
      .update(calls)
      .set({
        closeOpportunityId: opportunity.id,
        closeLeadId: opportunity.lead_id,
        closeStatusId: opportunity.status_id,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId))

    return { ok: true, action: "unchanged", message: "Close status already matches" }
  }

  const updated = await updateOpportunityStatus(opportunity.id, targetStatusId)

  await db
    .update(calls)
    .set({
      closeOpportunityId: updated.id,
      closeLeadId: updated.lead_id,
      closeStatusId: updated.status_id,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, callId))

  return {
    ok: true,
    action: call.closeOpportunityId ? "updated" : "linked",
    message: `Close opportunity → ${updated.status_label}`,
  }
}

/** Pull Close opportunity status → dashboard call. */
export async function syncCloseOpportunityToCall(params: {
  opportunityId: string
  statusId: string
  leadId: string
}): Promise<CloseSyncResult> {
  const { opportunityId, statusId, leadId } = params

  if (!isTrackedCloseStatus(statusId)) {
    return { ok: false, skipped: true, message: "Untracked Close status" }
  }

  const patch = closeStatusToDashboardPatch(statusId)
  if (!patch) {
    return { ok: false, skipped: true, message: "No dashboard mapping for Close status" }
  }

  let email: string | null = null
  try {
    const lead = await getLead(leadId)
    email = leadPrimaryEmail(lead)?.toLowerCase() ?? null
  } catch {
    return { ok: false, message: "Failed to load Close lead" }
  }

  const [linkedCall] = await db
    .select({ id: calls.id, status: calls.status, outcome: calls.outcome })
    .from(calls)
    .where(eq(calls.closeOpportunityId, opportunityId))
    .limit(1)

  let targetCall = linkedCall

  if (!targetCall && email) {
    const [byEmail] = await db
      .select({ id: calls.id, status: calls.status, outcome: calls.outcome })
      .from(calls)
      .where(
        and(
          eq(calls.inviteeEmail, email),
          or(eq(calls.status, "scheduled"), eq(calls.status, "no_show")),
        ),
      )
      .orderBy(desc(calls.scheduledStartAt))
      .limit(1)

    targetCall = byEmail
  }

  if (!targetCall) {
    return { ok: false, skipped: true, message: "No matching dashboard call" }
  }

  const alreadyMatches =
    targetCall.status === patch.status &&
    (patch.outcome === undefined || (targetCall.outcome ?? null) === patch.outcome)

  if (alreadyMatches) {
    await db
      .update(calls)
      .set({
        closeOpportunityId: opportunityId,
        closeLeadId: leadId,
        closeStatusId: statusId,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, targetCall.id))

    return { ok: true, action: "unchanged", message: "Dashboard already matches Close" }
  }

  await db
    .update(calls)
    .set({
      closeOpportunityId: opportunityId,
      closeLeadId: leadId,
      closeStatusId: statusId,
      status: patch.status ?? targetCall.status,
      ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
      updatedAt: new Date(),
    })
    .where(eq(calls.id, targetCall.id))

  return { ok: true, action: "updated", message: "Dashboard call updated from Close" }
}

/** Fire-and-forget outbound sync — never throws to caller. */
export function enqueueCallToCloseSync(callId: string | null | undefined) {
  if (!callId || !process.env.CLOSE_API_KEY) return
  void syncCallToClose(callId).catch((err) => {
    console.error("[Close sync] outbound failed:", callId, err)
  })
}
