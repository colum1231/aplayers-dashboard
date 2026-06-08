-- Migrate payment source stripe → whop and rename Stripe columns
ALTER TYPE "public"."payment_source" RENAME VALUE 'stripe' TO 'whop';--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripe_payment_intent_id" TO "whop_invoice_id";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "stripe_customer_id" TO "whop_user_id";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "source" SET DEFAULT 'whop';--> statement-breakpoint

-- Manual call entry support
CREATE TYPE "public"."call_source" AS ENUM('calendly', 'manual');--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "source" "call_source" DEFAULT 'calendly' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ALTER COLUMN "calendly_event_uri" DROP NOT NULL;--> statement-breakpoint

-- Whop webhook logging
ALTER TYPE "public"."webhook_provider" ADD VALUE 'whop';
