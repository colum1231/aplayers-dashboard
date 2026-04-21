import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const apiKey = process.env.STRIPE_READ_ONLY_API_KEY;
if (!apiKey) {
  console.error("STRIPE_READ_ONLY_API_KEY not set in .env.local");
  process.exit(1);
}

const stripe = new Stripe(apiKey);
const money = (amount: number, currency: string) =>
  `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

async function main() {
  console.log("=== Payment Intents (last 5) ===");
  const paymentIntents = await stripe.paymentIntents.list({
    limit: 5,
    expand: ["data.latest_charge", "data.payment_method"],
  });

  for (const pi of paymentIntents.data) {
    const latestCharge =
      pi.latest_charge && typeof pi.latest_charge !== "string"
        ? pi.latest_charge
        : null;
    const paymentMethod =
      pi.payment_method && typeof pi.payment_method !== "string"
        ? pi.payment_method
        : null;
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: pi.id,
      limit: 1,
    });
    const checkoutSession = sessions.data[0] ?? null;
    const lineItems = checkoutSession
      ? await stripe.checkout.sessions.listLineItems(checkoutSession.id, {
          limit: 10,
          expand: ["data.price.product"],
        })
      : null;
    const products =
      lineItems?.data.map((item) => {
        const price = item.price;
        const product =
          price?.product &&
          typeof price.product !== "string" &&
          !price.product.deleted
            ? price.product
            : null;
        return {
          description: item.description,
          quantity: item.quantity,
          amount_subtotal:
            item.amount_subtotal != null ? money(item.amount_subtotal, item.currency) : null,
          amount_total: item.amount_total != null ? money(item.amount_total, item.currency) : null,
          currency: item.currency.toUpperCase(),
          price_id: price?.id ?? null,
          unit_amount: price?.unit_amount != null ? money(price.unit_amount, price.currency) : null,
          product_id: typeof price?.product === "string" ? price.product : product?.id ?? null,
          product_name: product?.name ?? null,
          product_description: product?.description ?? null,
          product_active: product?.active ?? null,
          product_metadata: product?.metadata ?? {},
        };
      }) ?? [];

    console.log({
      id: pi.id,
      status: pi.status,
      created: new Date(pi.created * 1000).toISOString(),
      amount: money(pi.amount, pi.currency),
      amount_received: money(pi.amount_received, pi.currency),
      amount_capturable: money(pi.amount_capturable, pi.currency),
      currency: pi.currency.toUpperCase(),
      capture_method: pi.capture_method,
      confirmation_method: pi.confirmation_method,
      payment_method_types: pi.payment_method_types,
      customer: pi.customer,
      payment_method_id:
        typeof pi.payment_method === "string"
          ? pi.payment_method
          : pi.payment_method?.id ?? null,
      payment_method_type: paymentMethod?.type ?? null,
      payment_method_brand:
        paymentMethod?.type === "card" ? paymentMethod.card?.brand : null,
      payment_method_last4:
        paymentMethod?.type === "card" ? paymentMethod.card?.last4 : null,
      latest_charge_id:
        typeof pi.latest_charge === "string" ? pi.latest_charge : latestCharge?.id ?? null,
      latest_charge_status: latestCharge?.status ?? null,
      latest_charge_paid: latestCharge?.paid ?? null,
      latest_charge_receipt_url: latestCharge?.receipt_url ?? null,
      latest_charge_failure_code: latestCharge?.failure_code ?? null,
      latest_charge_failure_message: latestCharge?.failure_message ?? null,
      latest_charge_refunded: latestCharge?.refunded ?? null,
      latest_charge_amount_refunded:
        latestCharge ? money(latestCharge.amount_refunded, latestCharge.currency) : null,
      checkout_session_id: checkoutSession?.id ?? null,
      checkout_mode: checkoutSession?.mode ?? null,
      checkout_customer_email: checkoutSession?.customer_details?.email ?? null,
      checkout_invoice: checkoutSession?.invoice ?? null,
      checkout_subscription: checkoutSession?.subscription ?? null,
      products,
      metadata: pi.metadata,
      description: pi.description,
      canceled_at: pi.canceled_at
        ? new Date(pi.canceled_at * 1000).toISOString()
        : null,
      cancellation_reason: pi.cancellation_reason,
      last_payment_error: pi.last_payment_error
        ? {
            type: pi.last_payment_error.type,
            code: pi.last_payment_error.code,
            message: pi.last_payment_error.message,
            decline_code: pi.last_payment_error.decline_code,
          }
        : null,
    });
  }

  console.log(`\nShown: ${paymentIntents.data.length} payment intents`);
}

main().catch(console.error);
