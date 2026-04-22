CREATE TYPE "public"."payment_source" AS ENUM('stripe', 'bank', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('membership', 'sponsorship', 'partnership');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source" "payment_source" DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_type" "payment_type";
