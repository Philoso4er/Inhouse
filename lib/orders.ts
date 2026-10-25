// Order bookkeeping without a database: the Stripe PaymentIntent's metadata
// is the source of truth for the Stripe <-> Printify mapping and status.
//   printify_order_id  – Printify order id (Printify's external_id/label = Stripe session id)
//   checkout_session_id
//   inhouse_status     – paid | submitted | in_production | shipped | cancelled
//   inhouse_reason     – customer-facing reason when cancelled
import type Stripe from "stripe";
import { getStripe } from "./stripe.js";

export type OrderStatus = "paid" | "submitted" | "in_production" | "shipped" | "cancelled";

export async function setOrderMeta(paymentIntentId: string, meta: Record<string, string>) {
  // Stripe metadata values are capped at 500 chars.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) clean[k] = String(v).slice(0, 490);
  await getStripe().paymentIntents.update(paymentIntentId, { metadata: clean });
}

/**
 * Full refund, idempotent: skips if the charge is already refunded, and uses
 * a Stripe idempotency key so retried webhooks can't double-refund.
 */
export async function refundOrder(paymentIntentId: string, reason: string): Promise<"refunded" | "already_refunded"> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  let result: "refunded" | "already_refunded" = "already_refunded";
  if (charge && !charge.refunded) {
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: { inhouse_reason: reason.slice(0, 490) },
      },
      { idempotencyKey: `inhouse-refund-${paymentIntentId}` }
    );
    result = "refunded";
  }
  await setOrderMeta(paymentIntentId, {
    inhouse_status: "cancelled",
    inhouse_reason: reason,
    inhouse_refunded_at: new Date().toISOString(),
  });
  return result;
}

export async function findPaymentIntentForPrintifyOrder(order: any, printifyOrderId: string): Promise<string | null> {
  const stripe = getStripe();
  // 1) Printify order carries our Stripe checkout session id (external_id / label).
  const candidates = [
    order?.external_id,
    order?.label,
    order?.metadata?.shop_order_label,
    order?.metadata?.shop_order_id,
  ].filter((v) => typeof v === "string" && v.startsWith("cs_"));
  for (const sessionId of candidates) {
    try {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (typeof s.payment_intent === "string") return s.payment_intent;
    } catch {
      /* try next */
    }
  }
  // 2) Fallback: search PaymentIntents by metadata (Stripe Search API).
  const found = await stripe.paymentIntents.search({
    query: `metadata['printify_order_id']:'${printifyOrderId.replace(/'/g, "")}'`,
    limit: 1,
  });
  return found.data[0]?.id || null;
}
