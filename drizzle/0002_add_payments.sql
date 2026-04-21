CREATE TABLE "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_payment_intent_id" text NOT NULL UNIQUE,
  "amount" integer NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "customer_email" text,
  "customer_name" text,
  "product_name" text,
  "product_id" text,
  "price_id" text,
  "stripe_customer_id" text,
  "metadata" jsonb,
  "payment_date" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
