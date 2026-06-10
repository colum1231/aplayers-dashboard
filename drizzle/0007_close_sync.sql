ALTER TABLE "calls" ADD COLUMN "close_opportunity_id" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "close_lead_id" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "close_status_id" text;--> statement-breakpoint
ALTER TYPE "public"."webhook_provider" ADD VALUE 'close';
