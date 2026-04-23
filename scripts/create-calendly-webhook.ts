/* eslint-disable no-console */
const API_BASE = "https://api.calendly.com"

type Scope = "organization" | "user"

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

async function calendlyFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = required("CALENDLY_API_KEY")
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // ignore parse error
  }

  if (!res.ok) {
    throw new Error(
      `Calendly API ${res.status} ${res.statusText}\n${typeof json === "object" ? JSON.stringify(json, null, 2) : text}`
    )
  }

  return json as T
}

async function getMe() {
  // GET /users/me includes current_organization + user URI
  return calendlyFetch<{
    resource: {
      uri: string
      current_organization: string
      email: string
      name: string
    }
  }>("/users/me")
}

async function createWebhook() {
  const webhookUrl = required("CALENDLY_WEBHOOK_URL")
  const scope = (process.env.CALENDLY_WEBHOOK_SCOPE as Scope) || "organization"

  const me = await getMe()
  const organization = me.resource.current_organization
  const user = me.resource.uri

  const includeNoShow = process.env.CALENDLY_INCLUDE_NO_SHOW === "true"

  const baseEvents = ["invitee.created", "invitee.canceled"]
  const noShowEvents = ["invitee_no_show.created", "invitee_no_show.deleted"]
  const events = includeNoShow ? [...baseEvents, ...noShowEvents] : baseEvents

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    events,
    organization,
    scope,
  }

  if (scope === "user") payload.user = user

  // Optional: if you already have a desired signing key
  if (process.env.CALENDLY_WEBHOOK_SIGNING_KEY) {
    payload.signing_key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY
  }

  const created = await calendlyFetch<unknown>("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  console.log("Webhook created:\n", JSON.stringify(created, null, 2))
  console.log(
    "\nIf response includes signing_key, store it in CALENDLY_WEBHOOK_SIGNING_KEY."
  )
}

createWebhook().catch((err) => {
  console.error(err)
  process.exit(1)
})
