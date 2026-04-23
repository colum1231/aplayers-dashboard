function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export function getCalendlyConfig() {
  return {
    apiKey: required("CALENDLY_API_KEY"),
    webhookSigningKey: required("CALENDLY_WEBHOOK_SIGNING_KEY"),
    organizationUri: process.env.CALENDLY_ORGANIZATION_URI ?? null,
  }
}
