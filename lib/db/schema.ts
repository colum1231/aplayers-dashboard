import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", ["admin", "closer", "setter"])
export const paymentSourceEnum = pgEnum("payment_source", ["stripe", "bank", "manual", "other"])
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
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  amount: integer("amount").notNull(), // in cents
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  source: paymentSourceEnum("source").notNull().default("stripe"),
  paymentType: paymentTypeEnum("payment_type"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  productName: text("product_name"),
  productId: text("product_id"),
  priceId: text("price_id"),
  stripeCustomerId: text("stripe_customer_id"),
  metadata: jsonb("metadata"),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
