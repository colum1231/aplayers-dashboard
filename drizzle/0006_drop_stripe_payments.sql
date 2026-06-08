-- Remove legacy Stripe payment rows (Stripe PI ids start with pi_)
DELETE FROM "payments" WHERE "whop_invoice_id" LIKE 'pi_%';
