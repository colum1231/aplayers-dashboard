UPDATE "payments"
SET "payment_type" = CASE
  WHEN coalesce("product_name", '') ILIKE '%sponsorship%' THEN 'sponsorship'::"payment_type"
  WHEN coalesce("product_name", '') ILIKE '%partnership%' THEN 'partnership'::"payment_type"
  ELSE 'membership'::"payment_type"
END
WHERE "payment_type" IS NULL;
