CREATE TYPE "public"."user_role" AS ENUM('admin', 'closer', 'setter');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "role" "user_role" DEFAULT 'setter' NOT NULL;