import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", ["admin", "closer", "setter"])
export const paymentSourceEnum = pgEnum("payment_source", ["whop", "bank", "manual", "other"])
export const paymentTypeEnum = pgEnum("payment_type", ["membership", "sponsorship", "partnership"])

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("setter"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  whopInvoiceId: text("whop_invoice_id").unique(),
  amount: integer("amount").notNull(), // in cents
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  source: paymentSourceEnum("source").notNull().default("whop"),
  paymentType: paymentTypeEnum("payment_type"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  productName: text("product_name"),
  productId: text("product_id"),
  priceId: text("price_id"),
  whopUserId: text("whop_user_id"),
  metadata: jsonb("metadata"),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert

// ─── Calls ────────────────────────────────────────────────────────────────────

export const callSourceEnum = pgEnum("call_source", ["calendly", "manual"])

export const callStatusEnum = pgEnum("call_status", [
  "scheduled",
  "canceled",
  "completed",
  "no_show",
])

export const calls = pgTable("calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: callSourceEnum("source").notNull().default("calendly"),
  // Calendly identifiers (null for manual entries)
  calendlyEventUri: text("calendly_event_uri"),
  calendlyInviteeUri: text("calendly_invitee_uri").unique(),
  eventTypeUri: text("event_type_uri"),
  eventTypeName: text("event_type_name"),
  // Scheduling
  scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }).notNull(),
  scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  // Status
  status: callStatusEnum("status").notNull().default("scheduled"),
  // Lead info
  inviteeName: text("invitee_name"),
  inviteeEmail: text("invitee_email"),
  // UTMs (full bundle from Calendly tracking)
  utm: jsonb("utm"),
  // Setter (soft FK – snapshots survive profile deletion)
  setterUserId: uuid("setter_user_id"),
  setterNameSnapshot: text("setter_name_snapshot"),
  setterEmailSnapshot: text("setter_email_snapshot"),
  // Outcome (manually edited by team)
  outcome: text("outcome"),
  outcomeNotes: text("outcome_notes"),
  outcomeUpdatedBy: uuid("outcome_updated_by"),
  outcomeUpdatedAt: timestamp("outcome_updated_at", { withTimezone: true }),
  // Close CRM link (synced both ways when opportunity found)
  closeOpportunityId: text("close_opportunity_id"),
  closeLeadId: text("close_lead_id"),
  closeStatusId: text("close_status_id"),
  // Raw payload blobs
  answers: jsonb("answers"),
  rawEvent: jsonb("raw_event"),
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export type Call = typeof calls.$inferSelect
export type NewCall = typeof calls.$inferInsert

// ─── Webhook logs ─────────────────────────────────────────────────────────────

export const webhookProviderEnum = pgEnum("webhook_provider", ["calendly", "whop", "close"])
export const webhookProcessingStatusEnum = pgEnum("webhook_processing_status", [
  "received",
  "ignored",
  "success",
  "failed",
])

export const webhookLogs = pgTable("webhook_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: webhookProviderEnum("provider").notNull(),
  eventType: text("event_type").notNull(),
  processingStatus: webhookProcessingStatusEnum("processing_status")
    .notNull()
    .default("received"),
  signatureValid: boolean("signature_valid"),
  httpStatus: integer("http_status"),
  errorMessage: text("error_message"),
  // Soft reference to calls (nullable – log persists even if call is deleted)
  callId: uuid("call_id"),
  requestHeaders: jsonb("request_headers"),
  requestBody: jsonb("request_body"),
  normalizedPayload: jsonb("normalized_payload"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export type WebhookLog = typeof webhookLogs.$inferSelect
export type NewWebhookLog = typeof webhookLogs.$inferInsert
