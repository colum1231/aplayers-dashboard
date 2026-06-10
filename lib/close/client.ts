const CLOSE_API_BASE = "https://api.close.com/api/v1"

function getApiKey(): string {
  const key = process.env.CLOSE_API_KEY
  if (!key) throw new Error("CLOSE_API_KEY not configured")
  return key
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`
}

async function closeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey()
  const res = await fetch(`${CLOSE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new Error(`Close API ${res.status}: ${JSON.stringify(json)}`)
  }
  return json as T
}

export type CloseContact = {
  id: string
  lead_id: string
  emails: { email: string; type: string }[]
  name: string
}

export type CloseOpportunity = {
  id: string
  lead_id: string
  status_id: string
  status_label: string
  contact_id: string | null
  pipeline_id?: string
}

export type CloseLead = {
  id: string
  contacts?: CloseContact[]
  emails?: { email: string; type: string }[]
}

export type CloseWebhookSubscription = {
  id: string
  url: string
  status: string
  signature_key: string
  events: { object_type: string; action: string }[]
}

export async function searchContactByEmail(email: string): Promise<CloseContact | null> {
  const query = encodeURIComponent(`email:"${email}"`)
  const data = await closeFetch<{ data: CloseContact[] }>(`/contact/?query=${query}`)
  return data.data?.[0] ?? null
}

export async function getOpportunitiesForLead(leadId: string): Promise<CloseOpportunity[]> {
  const data = await closeFetch<{ data: CloseOpportunity[] }>(
    `/opportunity/?lead_id=${encodeURIComponent(leadId)}&_limit=100`,
  )
  return data.data ?? []
}

export async function getLead(leadId: string): Promise<CloseLead> {
  return closeFetch<CloseLead>(`/lead/${encodeURIComponent(leadId)}/`)
}

export async function getOpportunity(opportunityId: string): Promise<CloseOpportunity> {
  return closeFetch<CloseOpportunity>(`/opportunity/${encodeURIComponent(opportunityId)}/`)
}

export async function updateOpportunityStatus(
  opportunityId: string,
  statusId: string,
): Promise<CloseOpportunity> {
  return closeFetch<CloseOpportunity>(`/opportunity/${encodeURIComponent(opportunityId)}/`, {
    method: "PUT",
    body: JSON.stringify({ status_id: statusId }),
  })
}

export async function listWebhooks(): Promise<CloseWebhookSubscription[]> {
  const data = await closeFetch<{ data: CloseWebhookSubscription[] }>("/webhook/")
  return data.data ?? []
}

export async function createWebhook(url: string): Promise<CloseWebhookSubscription> {
  return closeFetch<CloseWebhookSubscription>("/webhook/", {
    method: "POST",
    body: JSON.stringify({
      url,
      events: [{ object_type: "opportunity", action: "updated" }],
      verify_ssl: true,
    }),
  })
}

export async function deleteWebhook(id: string): Promise<void> {
  await closeFetch(`/webhook/${encodeURIComponent(id)}/`, { method: "DELETE" })
}

export function leadPrimaryEmail(lead: CloseLead): string | null {
  const fromContacts = lead.contacts?.flatMap((c) => c.emails ?? []) ?? []
  const emails = [...fromContacts, ...(lead.emails ?? [])]
  const work = emails.find((e) => e.type === "office" || e.type === "work")
  return work?.email ?? emails[0]?.email ?? null
}
